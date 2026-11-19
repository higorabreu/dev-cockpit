import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createComposeInspector } from '@dck/adapter-docker-cli'
import { createGitHubReleaseSource } from '@dck/adapter-github'
import { createJsoncSettingsText } from '@dck/adapter-jsonc'
import { createFetchHttpClient } from '@dck/adapter-node-fetch'
import { createNodeFileStore } from '@dck/adapter-node-fs'
import {
  createGitDiffSource,
  createGitFiles,
  createGitIgnoreCheck,
  createGitInspector,
  createGitReviewNotes,
} from '@dck/adapter-node-git'
import { connectTo, defaultConfigDir, defaultEndpoint, defaultLogDir } from '@dck/adapter-node-net'
import { createNodePtyHost } from '@dck/adapter-node-pty'
import { createFolderWalk } from '@dck/adapter-node-walk'
import {
  type ConnectionFields,
  checkProfile,
  connectorCatalog,
  createConnections,
  createDockController,
  createFileFinder,
  createJsonLogger,
  createTranslator,
  createUpdater,
  errorBody,
  FILE_SCHEME,
  fail,
  hostChannels,
  localeFor,
  pastedText,
  type Settings,
  storedAccount,
  type Translate,
} from '@dck/core'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  shell as electronShell,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  protocol,
  screen,
  session,
  Tray,
} from 'electron'
import { createConnectorConnections } from './connections/connector-connections.ts'
import { launchDaemon } from './daemon/daemon-launcher.ts'
import { type DaemonLink, startDaemonLink } from './daemon/daemon-link.ts'
import { createViewsGateway } from './daemon/views-gateway.ts'
import { logDockWindow, logScreen } from './electron/dock-log.ts'
import { createElectronDockWindow } from './electron/dock-window.ts'
import { registerHostBridge } from './electron/host-bridge.ts'
import { createElectronIpc } from './electron/ipc.ts'
import { createElectronNotifier } from './electron/notifier.ts'
import { createElectronScreen } from './electron/screen.ts'
import { createElectronShortcuts } from './electron/shortcuts.ts'
import { createElectronStatusIcon } from './electron/status-icon.ts'
import { createToggleKeyBinder } from './electron/toggle-key-binder.ts'
import { buildTrayMenu } from './electron/tray-menu.ts'
import { createWindowSender } from './electron/window-sender.ts'
import { registerFileSearchBridge } from './file-search/file-search-bridge.ts'
import { createFileProtocol } from './files/file-protocol.ts'
import { registerFilesBridge } from './files/files-bridge.ts'
import { agentProfiles } from './inspectors/agent-profiles.ts'
import { createEnvironmentInspector } from './inspectors/environment-inspector.ts'
import { createSessionInspector } from './inspectors/session-inspector.ts'
import { createDockActions } from './platform/dock-actions.ts'
import {
  boundedScreen,
  createWaylandArea,
  readWaylandBounds,
  waylandSocket,
} from './platform/linux/wayland-bounds.ts'
import { createGtkWorkareas } from './platform/linux/x11-workareas.ts'
import { nativeWayland, selectPlatform, usesGpu } from './platform/select-platform.ts'
import { createWindowRequests } from './platform/window-requests.ts'
import { createFavoritesStore } from './projects/favorites-store.ts'
import { createProjectCatalog } from './projects/project-catalog.ts'
import { createRecencyStore } from './projects/recency-store.ts'
import { createCloseGuard } from './quit/close-guard.ts'
import { registerQuitBridge } from './quit/quit-bridge.ts'
import { createQuitFiles } from './quit/quit-files.ts'
import { createQuitGuard } from './quit/quit-guard.ts'
import { createSettingsStore } from './settings/settings-store.ts'
import { watchSettingsFile } from './settings/settings-watch.ts'
import { createSavedTabsFile } from './tabs/saved-tabs-file.ts'
import { registerAboutBridge } from './updates/about-bridge.ts'
import { loadDismissedFile } from './updates/dismissed-file.ts'
import { registerUpdateBridge } from './updates/update-bridge.ts'

// The compositor answers in a few milliseconds; past this the window opens with the last size it knew
const WAYLAND_BOUNDS_MS = 150
// The first update check waits for the window to settle; it is not on the path to the first frame
const UPDATE_START_MS = 5000
// Where the cockpit's own releases are published
const RELEASES_REPOSITORY = 'higorabreu/dev-cockpit'

const logger = createJsonLogger((line) => process.stderr.write(line))
const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
const profile = checkProfile(process.env.DCK_PROFILE, logger)

// Set before anything reads it (the single instance lock does): the CLI looks in this same folder
app.setPath('userData', process.env.DCK_CONFIG_DIR ?? defaultConfigDir())

// Without this Electron opens a dialog behind the translucent window; here the error goes to the log
process.on('uncaughtException', (error) => {
  logger.error('uncaught exception in main', { error: String(error), stack: error.stack })
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection in main', { error: String(reason) })
})

// Before the app is ready, or Chromium has already started the GPU process
if (!usesGpu(process.platform)) app.disableHardwareAcceleration()

if (!app.requestSingleInstanceLock()) app.quit()

// Before the app is ready, as Electron requires: images and PDFs the user opened reach the page through it
protocol.registerSchemesAsPrivileged([
  { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, stream: true } },
])

app.whenReady().then(async () => {
  // checkProfile already logged why; app.exit is reliable only once the app is ready
  if (profile.kind === 'invalid') {
    app.exit(1)
    return
  }
  Menu.setApplicationMenu(null)
  // No input spell checks, yet Chromium would fetch a dictionary from Google at boot for nothing
  session.defaultSession.setSpellCheckerLanguages([])

  let activeKey = ''
  // Native Wayland hides the pointer: the compositor tells, before each show, the size the window may take
  const waylandPath = nativeWayland(process.platform, process.env, app.commandLine)
    ? waylandSocket(process.env)
    : undefined
  const waylandArea = waylandPath
    ? createWaylandArea(async () => {
        const started = Date.now()
        const area = await readWaylandBounds(waylandPath, WAYLAND_BOUNDS_MS)
        if (process.env.DCK_LOG_DOCK === '1') {
          logger.info('wayland bounds', { ...area, ms: Date.now() - started })
        }
        return area
      })
    : undefined
  const toggleWindow = () => void dockActions.toggle()
  const showWindow = () => void dockActions.show()

  const platform = selectPlatform({
    platform: process.platform,
    env: process.env,
    home: homedir(),
    packaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    appVersion: app.getVersion(),
    logger,
    app,
  })
  // Off the boot path: the tabs open a login shell and need nothing; only the daemon waits for it
  const loginPath = platform.loginPath().then((path) => {
    if (path) process.env.PATH = path
  })
  const toggleKey = createToggleKeyBinder({
    desktop: platform.desktopShortcut,
    electron: createElectronShortcuts(globalShortcut),
    onToggle: toggleWindow,
    onInvalid: (key, error) => logger.warn('shortcut is not valid', { key, error: String(error) }),
  })

  // Changing the window key only holds if the system accepts the new one; otherwise the old one returns
  const settingsFile = join(app.getPath('userData'), 'settings.json')
  const settingsStore = createSettingsStore({
    file: settingsFile,
    logger,
    env: process.env,
    text: createJsoncSettingsText(),
    isFolder: (path) =>
      stat(path).then(
        (stats) => stats.isDirectory(),
        () => false,
      ),
    async veto(next, changed) {
      if (!changed.includes('shortcuts.toggleWindow')) return []
      const key = next.shortcuts.toggleWindow
      if (await toggleKey.bind(key)) {
        activeKey = key
        logger.info('shortcut registered', { key })
        return []
      }
      logger.warn('shortcut refused, keeping the previous one', { key })
      return ['shortcuts.toggleWindow']
    },
  })
  const loaded = await settingsStore.load()
  logger.info('settings loaded', { fresh: loaded.fresh, locked: loaded.locked })

  const window = new BrowserWindow({
    ...platform.window.options,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  platform.window.place(window)
  // Page content never opens an Electron window nor leaves the app; links go to the browser through the host
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  const send = createWindowSender(window)

  const systemScreen = createElectronScreen(
    screen,
    process.platform === 'linux' ? createGtkWorkareas() : undefined,
  )
  const electronScreen = waylandArea
    ? boundedScreen(systemScreen, () => waylandArea.current())
    : systemScreen
  const dockWindow = createElectronDockWindow(window, {
    onShown: () => send(hostChannels.windowShown),
  })
  const focusedDockWindow = platform.window.dock(dockWindow, window.webContents)
  const traceDock = process.env.DCK_LOG_DOCK === '1'

  const dock = createDockController({
    screen: traceDock ? logScreen(electronScreen, logger) : electronScreen,
    window: traceDock ? logDockWindow(focusedDockWindow, logger) : focusedDockWindow,
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    heightRatio: () => settingsStore.get().settings.window.heightRatio,
    clock: { now: () => Date.now() },
  })
  const dockActions = createDockActions(dock, waylandArea)
  const windowRequests = createWindowRequests(dockActions, send)
  // The window lays out for the whole screen (tab bar on top) whenever it takes the whole height: at full
  // height or at 100%. Sent only when that changes
  let layoutFull = false
  const showLayout = (full: boolean) => {
    if (full === layoutFull) return
    layoutFull = full
    send(hostChannels.windowFullHeight, full)
  }
  const syncLayout = () => showLayout(dock.fillsHeight())

  // Opening the app again from the application menu shows the window of the one already running
  app.on('second-instance', windowRequests.reopen)

  logger.info('notifications available', { supported: Notification.isSupported() })

  const http = createFetchHttpClient()
  const implementations = createConnectorConnections({
    secrets: platform.secrets,
    http,
    profile: profile.profile,
    account: (id) => ({
      get: () => storedAccount(settingsStore.get().settings, id),
      // The settings model drops an empty e-mail, so erasing the account leaves no e-mail behind
      set: (fields) =>
        settingsStore.update({
          connections: { [id]: { url: fields?.url ?? null, email: fields?.email ?? '' } },
        }),
    }),
    logger,
  })
  // Which connectors are enabled follows `extensions.disabled`; it is read again when that list changes
  const readCatalog = () => {
    const found = connectorCatalog({
      appVersion: app.getVersion(),
      disabled: new Set(settingsStore.get().settings.extensions.disabled),
      implemented: new Set(implementations.keys()),
    })
    for (const connector of found.missing)
      logger.warn('connector declared without an implementation, left out', { id: connector.id })
    return found
  }
  let catalog = readCatalog()
  const connections = createConnections({
    connectors: () => catalog.ready,
    disabled: () => catalog.disabled,
    implementation: (id) => implementations.get(id),
    logger,
  })
  const accountOf = (settings: Settings, id: string): ConnectionFields | null =>
    catalog.ready.some((connector) => connector.id === id) ? storedAccount(settings, id) : null

  let daemonLink: DaemonLink | undefined
  const views = createViewsGateway({
    request: async (method, params) =>
      daemonLink ? daemonLink.request(method, params) : fail(errorBody('DCK-DMN-002')),
    logger,
  })
  // A disabled connector is configured with no account: its views empty out, its token and address stay
  const configureViews = () => {
    const { settings } = settingsStore.get()
    for (const id of implementations.keys()) void views.configure(id, accountOf(settings, id))
  }

  const ipc = createElectronIpc(ipcMain)
  const sessionInspector = createSessionInspector({
    processes: platform.processes,
    git: createGitInspector(),
    agents: agentProfiles,
  })
  const savedTabs = createSavedTabsFile(join(app.getPath('userData'), 'open-tabs.json'), logger)
  const bridge = registerHostBridge({
    ipcMain: ipc,
    ptyHost: createNodePtyHost(),
    clipboard: {
      // Files copied in a file manager paste as their paths, as in VTE
      readText: async () => {
        const [item] = await clipboard.read()
        const uriList = item?.types.includes('text/uri-list')
          ? await (await item.getType('text/uri-list')).text()
          : ''
        return pastedText({ uriList, text: await clipboard.readText() })
      },
      writeText: async (text) => clipboard.writeText(text),
    },
    settings: {
      get: settingsStore.get,
      update: settingsStore.update,
      // Only this file: the window asks for it and never names a path
      async openFile() {
        if (!(await settingsStore.ensureFile())) return false
        const error = await electronShell.openPath(settingsFile)
        if (error) logger.warn('could not open the settings file', { file: settingsFile, error })
        return error === ''
      },
    },
    connections,
    views,
    external: {
      open: (url) => void electronShell.openExternal(url),
      allowedOrigins: () => {
        const { settings } = settingsStore.get()
        return catalog.ready.flatMap(({ id }) => accountOf(settings, id)?.url ?? [])
      },
    },
    autostart: platform.autostart,
    projects: createProjectCatalog(
      () => {
        const { projects } = settingsStore.get().settings
        return { root: projects.root, depth: projects.depth }
      },
      createRecencyStore(join(app.getPath('userData'), 'recent-projects.json'), logger),
      createFavoritesStore(join(app.getPath('userData'), 'favorite-projects.json'), logger),
    ),
    fonts: platform.fonts,
    savedTabs,
    // Modal to the window: it stays on top of everything, so a free dialog would open behind it
    async pickFolder() {
      const { canceled, filePaths } = await dialog.showOpenDialog(window, {
        title: t('projects.chooseRoot'),
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: homedir(),
      })
      return canceled ? undefined : filePaths[0]
    },
    review: createGitDiffSource(),
    reviewNotes: createGitReviewNotes(),
    sessions: sessionInspector,
    agents: agentProfiles,

    environment: createEnvironmentInspector({
      processes: platform.processes,
      compose: createComposeInspector({ stopAt: homedir() }),
    }),
    files: {
      stat: (path) => stat(path),
      realpath: (path) => realpath(path),
      openPath: (path) => electronShell.openPath(path),
      showItemInFolder: (path) => electronShell.showItemInFolder(path),
    },
    notifier: createElectronNotifier(
      {
        isSupported: () => Notification.isSupported(),
        create(options) {
          const notification = new Notification(options)
          return {
            on(event, listener) {
              if (event === 'click') notification.on('click', listener)
              else notification.on('close', listener)
            },
            show: () => notification.show(),
          }
        },
      },
      windowRequests.notificationClick,
    ),
    shell: platform.terminal,
    home: homedir(),
    logger,
    send,
    toggleFullHeight: () =>
      void dockActions.toggleFullHeight().then((ratio) => {
        // DCK_HEIGHT pins the saved height: the window still leaves full height, the file keeps its value
        if (ratio === undefined || settingsStore.get().locked.includes('window.heightRatio'))
          syncLayout()
        else void settingsStore.update({ window: { heightRatio: ratio } }).then(syncLayout)
      }),
    // DCK_HEIGHT pins the height, so the edge moves nothing
    resizeWindow(height) {
      if (settingsStore.get().locked.includes('window.heightRatio')) return undefined
      const ratio = dock.resizeTo(height)
      // While the edge moves the tab bar stays under the terminals, by the label and the edge in hand
      showLayout(false)
      return ratio
    },
    endResizeWindow(keep) {
      const ratio = dock.endResize(keep)
      if (ratio === undefined) syncLayout()
      else void settingsStore.update({ window: { heightRatio: ratio } }).then(syncLayout)
    },
  })

  const fileStore = createNodeFileStore({ logger })
  const files = registerFilesBridge({
    ipcMain: ipc,
    store: fileStore,
    ignore: createGitIgnoreCheck(),
    logger,
    send,
  })
  protocol.handle(
    FILE_SCHEME,
    createFileProtocol({ pathOf: files.mediaPath, store: fileStore, logger }),
  )

  // A development run may read a local test feed; the packaged app always reads GitHub (D71)
  const updateFeed = app.isPackaged ? undefined : process.env.DCK_UPDATE_FEED
  const updater = createUpdater({
    source: createGitHubReleaseSource({
      http,
      repository: RELEASES_REPOSITORY,
      appVersion: app.getVersion(),
      ...(updateFeed ? { apiRoot: updateFeed, webRoot: updateFeed } : {}),
    }),
    installer: platform.updateInstaller,
    currentVersion: app.getVersion(),
    arch: process.arch,
    mode: () => settingsStore.get().settings.system.updates,
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    dismissed: await loadDismissedFile(join(app.getPath('userData'), 'updates.json'), logger),
    logger,
    onChange: (state) => send(hostChannels.updatesChanged, state),
  })
  registerFileSearchBridge({
    ipcMain: ipc,
    finder: createFileFinder({ git: createGitFiles(), walk: createFolderWalk() }),
    isFolder: (path) =>
      stat(path).then(
        (stats) => stats.isDirectory(),
        () => false,
      ),
    logger,
  })
  registerAboutBridge({
    ipcMain: ipc,
    repository: RELEASES_REPOSITORY,
    version: app.getVersion(),
    openExternal: (url) => void electronShell.openExternal(url),
  })
  registerUpdateBridge({
    ipcMain: ipc,
    updater,
    openExternal: (url) => void electronShell.openExternal(url),
    // The window sent its tabs just before asking; the new process starts once this one has quit
    async restart() {
      await savedTabs.written()
      app.relaunch()
      app.quit()
    },
    logger,
  })

  // Last before any quit from the menus or the quit card: the open files are saved, or the user decides
  const quitFiles = createQuitFiles({
    settle: () => send(hostChannels.quitSettleFiles),
    present: windowRequests.reopen,
    quit: () => app.quit(),
    after(milliseconds, task) {
      const timer = setTimeout(task, milliseconds)
      return () => clearTimeout(timer)
    },
  })
  const quitGuard = createQuitGuard({
    pids: () => bridge.pids(),
    activity: (pid) => sessionInspector.activity(pid),
    // The question is a card in the window, so the window shows first, even from the menu bar icon
    ask: windowRequests.askQuit,
    quit: () => quitFiles.request(),
  })
  registerQuitBridge({ ipcMain: ipc, guard: quitGuard, files: quitFiles })
  const closeGuard = createCloseGuard(() => quitFiles.request())
  window.on('close', (event) => closeGuard.close(event))
  app.on('before-quit', () => closeGuard.quitting())
  // The app menu's Quit (⌘Q) and the menu bar icon's; a logout or shutdown quits without asking
  const quit = platform.asksBeforeQuit ? () => void quitGuard.request() : () => quitFiles.request()

  activeKey = loaded.settings.shortcuts.toggleWindow
  void toggleKey.bind(activeKey).then((bound) => {
    if (bound) logger.info('shortcut registered', { key: activeKey })
    else logger.warn('shortcut refused, another program owns it', { key: activeKey })
  })

  settingsStore.onChange((settings, changed) => {
    send(hostChannels.settingsChanged, settings, changed)
    if (changed.includes('window.heightRatio')) {
      dock.refresh()
      syncLayout()
    }
    if (changed.includes('extensions.disabled')) {
      catalog = readCatalog()
      configureViews()
    }
    if (changed.includes('system.updates')) updater.modeChanged()
    for (const [id, connection] of implementations) {
      const prefix = `connections.${id}`
      if (!changed.some((key) => key === prefix || key.startsWith(`${prefix}.`))) continue
      configureViews()
      if (!settings.connections[id]?.url) void connection.forgetToken()
    }
  })
  settingsStore.onFile((file) => send(hostChannels.settingsFile, file))
  const stopWatchingSettings = watchSettingsFile({
    file: settingsFile,
    watch: (folder, listener) => watch(folder, listener),
    onChange: () => void settingsStore.reload(),
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    logger,
  })

  const daemonScript = join(__dirname, 'daemon.cjs')

  async function startDaemonProcess() {
    await loginPath
    mkdirSync(dirname(endpoint), { recursive: true, mode: 0o700 })
    const logDir = process.env.DCK_LOG_DIR ?? defaultLogDir(endpoint)
    mkdirSync(logDir, { recursive: true, mode: 0o700 })
    launchDaemon(
      {
        spawn: (command, args, options) =>
          spawn(command, [...args], {
            detached: options.detached,
            stdio: [...options.stdio],
            env: options.env,
          }),
        execPath: process.execPath,
        script: daemonScript,
        env: process.env,
        logFd: openSync(join(logDir, 'daemon.log'), 'a'),
      },
      logger,
    )
  }

  const link = startDaemonLink({
    onReady: configureViews,
    onAgentSignal: (signal) => send(hostChannels.agentSignal, signal),
    onViews: (data) => {
      const snapshot = views.parse(data)
      if (snapshot) send(hostChannels.viewsChanged, snapshot)
    },
    connect: () => connectTo(endpoint, logger),
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    logger,
    onUnavailable: () => void startDaemonProcess(),
    // A daemon from a previous version survives the update and would refuse the new methods
    replaceDaemon: async (shutdown) => {
      if (!(await shutdown())) {
        // Old daemons do not even know `shutdown`: finds the processes of our own script
        const pids = await platform.processScanner.find({
          argument: daemonScript,
          endpoint: process.env.DCK_ENDPOINT,
          exclude: process.pid,
        })
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch (error) {
            // The process may have already exited between finding and killing
            logger.warn('could not stop stale daemon', { pid, error: String(error) })
          }
        }
        logger.warn('stale daemon stopped', { pids })
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
      await startDaemonProcess()
    },
    onToggle: () => {
      logger.info('toggle requested by the daemon')
      toggleWindow()
    },
  })

  daemonLink = link

  void window.loadFile(join(__dirname, 'ui', 'index.html'))
  window.webContents.once('did-finish-load', () => {
    if (!process.env.DCK_START_HIDDEN) showWindow()
    // A height of 100% saved last time lays the window out for the whole screen from the start
    syncLayout()
    setTimeout(() => updater.start(), UPDATE_START_MS)
    logger.info('window ready', { endpoint })
  })

  // Only to check the interface without looking at the screen: runs a script in the page, saves a capture and exits
  const evalScript = process.env.DCK_EVAL
  const screenshotPath = process.env.DCK_SCREENSHOT
  if (evalScript || screenshotPath) {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    window.webContents.once('did-finish-load', async () => {
      await sleep(3000)
      if (evalScript) {
        const run = window.webContents.executeJavaScript(readFileSync(evalScript, 'utf8'))
        await Promise.race([run, sleep(Number(process.env.DCK_EVAL_TIMEOUT_MS) || 20000)])
        const result = await window.webContents.executeJavaScript(
          'JSON.stringify(window.__out ?? null)',
        )
        logger.info('eval result', { result: JSON.parse(result) })
      }
      if (screenshotPath)
        writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG())
      app.quit()
    })
  }

  // Read on every menu build: the language can change in settings while the app is open
  const t = ((key, params) => {
    const { language } = settingsStore.get().settings
    return createTranslator(localeFor(language, app.getPreferredSystemLanguages())).t(key, params)
  }) as Translate
  const openSettings = windowRequests.openSettings

  const appMenu = platform.window.menu
  if (appMenu) {
    const refreshAppMenu = () =>
      Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu({ t, openSettings, quit })))
    refreshAppMenu()
    settingsStore.onChange((_settings, changed) => {
      if (changed.includes('language')) refreshAppMenu()
    })
  }

  // DCK_NO_TRAY exists so automated tests do not flash icons in the user's bar
  if (!process.env.DCK_NO_TRAY) {
    const statusIcons = createElectronStatusIcon(
      {
        createTray: (iconPath) => new Tray(iconPath),
        buildMenu: (template) => Menu.buildFromTemplate(template),
      },
      join(__dirname, 'assets', 'icon.png'),
    )
    const menuDeps = {
      toggleWindow,
      openSettings,
      autostart: platform.autostart,
      t,
      quit,
      onChange: () => void refreshTrayMenu(),
    }
    const trayIcon = statusIcons.create({ tooltip: 'Dev Cockpit', menu: [] })
    const refreshTrayMenu = async () => trayIcon.setMenu(await buildTrayMenu(menuDeps))
    void refreshTrayMenu()
    settingsStore.onChange((_settings, changed) => {
      if (changed.includes('language')) void refreshTrayMenu()
    })
    app.on('before-quit', () => trayIcon.dispose())
    logger.info('tray icon created')
  }

  app.on('before-quit', () => {
    updater.stop()
    stopWatchingSettings()
    link.stop()
    bridge.killAll()
    files.closeAll()
    toggleKey.release()
  })
})

app.on('window-all-closed', () => app.quit())
