import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createComposeInspector } from '@dck/adapter-docker-cli'
import { createGitLabClient } from '@dck/adapter-gitlab'
import { createGnomeShortcut } from '@dck/adapter-gnome-shortcuts'
import { createProcessInspector, createProcessScanner } from '@dck/adapter-linux-proc'
import { createFetchHttpClient } from '@dck/adapter-node-fetch'
import { createGitInspector } from '@dck/adapter-node-git'
import { connectTo, defaultConfigDir, defaultEndpoint } from '@dck/adapter-node-net'
import { createNodePtyHost } from '@dck/adapter-node-pty'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import {
  createDockController,
  createJsonLogger,
  createTranslator,
  errorBody,
  fail,
  gitlabTokenKey,
  hostChannels,
  pickLocale,
  type Translate,
} from '@dck/core'
import {
  app,
  BrowserWindow,
  clipboard,
  shell as electronShell,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  screen,
  Tray,
} from 'electron'
import { createGitLabConnection } from './connections/gitlab-connection.ts'
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
import { agentProfiles } from './inspectors/agent-profiles.ts'
import { createEnvironmentInspector } from './inspectors/environment-inspector.ts'
import { createSessionInspector } from './inspectors/session-inspector.ts'
import { createGtkWorkareas } from './platform/linux/x11-workareas.ts'
import { createXdgAutostart, defaultAutostartDirectory } from './platform/linux/xdg-autostart.ts'
import { createFavoritesStore } from './projects/favorites-store.ts'
import { createProjectCatalog } from './projects/project-catalog.ts'
import { createRecencyStore } from './projects/recency-store.ts'
import { createSettingsStore } from './settings/settings-store.ts'

const logger = createJsonLogger((line) => process.stderr.write(line))
const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()

// Set before anything reads it (the single instance lock does): the CLI looks in this same folder
app.setPath('userData', process.env.DCK_CONFIG_DIR ?? defaultConfigDir())

// Without this Electron opens a dialog behind the translucent window; here the error goes to the log
process.on('uncaughtException', (error) => {
  logger.error('uncaught exception in main', { error: String(error), stack: error.stack })
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection in main', { error: String(reason) })
})

if (!app.requestSingleInstanceLock()) app.quit()

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  let activeKey = ''
  const toggleWindow = () => dock.toggle()

  const onGnome = (process.env.XDG_CURRENT_DESKTOP ?? '').split(':').includes('GNOME')
  const toggleKey = createToggleKeyBinder({
    // O atalho do sistema chama o CLI empacotado; em modo dev o Electron registra a tecla
    desktop:
      app.isPackaged && onGnome
        ? createGnomeShortcut({
            command: [
              'env',
              'ELECTRON_RUN_AS_NODE=1',
              'DCK_PACKAGED=1',
              process.execPath,
              join(process.resourcesPath, 'dck.mjs'),
              'toggle',
            ],
            name: 'Dev Cockpit',
            logger,
          })
        : undefined,
    electron: createElectronShortcuts(globalShortcut),
    onToggle: toggleWindow,
    onInvalid: (key, error) => logger.warn('shortcut is not valid', { key, error: String(error) }),
  })

  // Changing the window key only holds if the system accepts the new one; otherwise the old one returns
  const settingsStore = createSettingsStore({
    file: join(app.getPath('userData'), 'settings.json'),
    logger,
    env: process.env,
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

  const autostart = createXdgAutostart({
    directory: process.env.DCK_AUTOSTART_DIR ?? defaultAutostartDirectory(process.env, homedir()),
    name: 'Dev Cockpit',
    command: app.isPackaged
      ? [process.execPath, '--no-sandbox']
      : [process.execPath, app.getAppPath(), '--no-sandbox'],
    env: { DCK_START_HIDDEN: '1' },
  })
  const window = new BrowserWindow({
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
  window.setVisibleOnAllWorkspaces(true)
  // Page content never opens an Electron window nor leaves the app; links go to the browser through the host
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const electronScreen = createElectronScreen(
    screen,
    process.platform === 'linux' ? createGtkWorkareas() : undefined,
  )
  const dockWindow = createElectronDockWindow(window, {
    onShown: () => window.webContents.send(hostChannels.windowShown),
  })
  const traceDock = process.env.DCK_LOG_DOCK === '1'

  const dock = createDockController({
    screen: traceDock ? logScreen(electronScreen, logger) : electronScreen,
    window: traceDock ? logDockWindow(dockWindow, logger) : dockWindow,
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    heightRatio: () => settingsStore.get().settings.window.heightRatio,
    clock: { now: () => Date.now() },
  })

  // Opening the app again from the application menu shows the window of the one already running
  app.on('second-instance', () => dock.show())

  logger.info('notifications available', { supported: Notification.isSupported() })

  const http = createFetchHttpClient()
  const gitlab = createGitLabConnection({
    secrets: createSecretToolStore(),
    tokenKey: gitlabTokenKey(process.env.DCK_PROFILE),
    createSource: (url, token) => createGitLabClient({ http, baseUrl: url, token }),
    address: {
      get: () => settingsStore.get().settings.connections.gitlab.url,
      set: (url) => settingsStore.update({ connections: { gitlab: { url } } }),
    },
    logger,
  })

  let daemonLink: DaemonLink | undefined
  const views = createViewsGateway({
    request: async (method, params) =>
      daemonLink ? daemonLink.request(method, params) : fail(errorBody('DCK-DMN-002')),
    logger,
  })
  const configureViews = () =>
    void views.configure(settingsStore.get().settings.connections.gitlab.url)

  const bridge = registerHostBridge({
    ipcMain: createElectronIpc(ipcMain),
    ptyHost: createNodePtyHost(),
    clipboard: {
      readText: async () => clipboard.readText(),
      writeText: async (text) => clipboard.writeText(text),
    },
    settings: settingsStore,
    gitlab,
    views,
    external: {
      open: (url) => void electronShell.openExternal(url),
      allowedOrigin: () => settingsStore.get().settings.connections.gitlab.url,
    },
    autostart,
    projects: createProjectCatalog(
      () => {
        const { projects } = settingsStore.get().settings
        return { root: projects.root ?? join(homedir(), 'projetos'), depth: projects.depth }
      },
      createRecencyStore(join(app.getPath('userData'), 'recent-projects.json'), logger),
      createFavoritesStore(join(app.getPath('userData'), 'favorite-projects.json'), logger),
    ),
    sessions: createSessionInspector({
      processes: createProcessInspector(),
      git: createGitInspector(),
      agents: agentProfiles,
    }),
    agents: agentProfiles,

    environment: createEnvironmentInspector({
      processes: createProcessInspector(),
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
      (tabId) => {
        dock.show()
        window.webContents.send(hostChannels.notificationsClick, tabId)
      },
    ),
    shell: process.env.SHELL ?? '/bin/bash',
    home: homedir(),
    logger,
    send: (channel, ...args) => window.webContents.send(channel, ...args),
    toggleFullHeight: () => {
      dock.toggleFullHeight()
      window.webContents.send(hostChannels.windowFullHeight, dock.isFullHeight())
    },
  })

  activeKey = loaded.settings.shortcuts.toggleWindow
  void toggleKey.bind(activeKey).then((bound) => {
    if (bound) logger.info('shortcut registered', { key: activeKey })
    else logger.warn('shortcut refused, another program owns it', { key: activeKey })
  })

  settingsStore.onChange((settings, changed) => {
    window.webContents.send(hostChannels.settingsChanged, settings, changed)
    if (changed.includes('window.heightRatio')) dock.refresh()
    if (changed.includes('connections.gitlab.url')) {
      configureViews()
      if (!settings.connections.gitlab.url) void gitlab.forgetToken()
    }
  })

  const daemonScript = join(__dirname, 'daemon.cjs')
  const processScanner = createProcessScanner()

  function startDaemonProcess() {
    mkdirSync(dirname(endpoint), { recursive: true, mode: 0o700 })
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
        logFd: openSync(join(dirname(endpoint), 'daemon.log'), 'a'),
      },
      logger,
    )
  }

  const link = startDaemonLink({
    onReady: configureViews,
    onAgentSignal: (signal) => window.webContents.send(hostChannels.agentSignal, signal),
    onViews: (data) => {
      const snapshot = views.parse(data)
      if (snapshot) window.webContents.send(hostChannels.viewsChanged, snapshot)
    },
    connect: () => connectTo(endpoint, logger),
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    logger,
    onUnavailable: startDaemonProcess,
    // A daemon from a previous version survives the update and would refuse the new methods
    replaceDaemon: async (shutdown) => {
      if (!(await shutdown())) {
        // Old daemons do not even know `shutdown`: finds the processes of our own script
        const pids = await processScanner.find({
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
      startDaemonProcess()
    },
    onToggle: () => {
      logger.info('toggle requested by the daemon')
      dock.toggle()
    },
  })

  daemonLink = link

  void window.loadFile(join(__dirname, 'ui', 'index.html'))
  window.webContents.once('did-finish-load', () => {
    if (!process.env.DCK_START_HIDDEN) dock.show()
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
      toggleWindow: () => dock.toggle(),
      openSettings: () => {
        dock.show()
        window.webContents.send(hostChannels.windowOpenSettings)
      },
      autostart,
      // Read on every menu build: the language can change in settings while the app is open
      t: ((key, params) => {
        const { language } = settingsStore.get().settings
        return createTranslator(
          language === 'auto' ? pickLocale(app.getPreferredSystemLanguages()) : language,
        ).t(key, params)
      }) as Translate,
      quit: () => app.quit(),
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
    link.stop()
    bridge.killAll()
    toggleKey.release()
  })
})

app.on('window-all-closed', () => app.quit())
