import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createComposeInspector } from '@dck/adapter-docker-cli'
import { createProcessInspector, createProcessScanner } from '@dck/adapter-linux-proc'
import { createGitInspector } from '@dck/adapter-node-git'
import { connectTo, defaultEndpoint } from '@dck/adapter-node-net'
import { createNodePtyHost } from '@dck/adapter-node-pty'
import {
  createDockController,
  createJsonLogger,
  createTranslator,
  hostChannels,
  pickLocale,
  type Translate,
} from '@dck/core'
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  screen,
  Tray,
} from 'electron'
import { launchDaemon } from './daemon-launcher.ts'
import { startDaemonLink } from './daemon-link.ts'
import { logDockWindow, logScreen } from './dock-log.ts'
import { createElectronDockWindow } from './electron-dock-window.ts'
import { createElectronIpc } from './electron-ipc.ts'
import { createElectronNotifier } from './electron-notifier.ts'
import { createElectronScreen } from './electron-screen.ts'
import { createElectronShortcuts } from './electron-shortcuts.ts'
import { createElectronStatusIcon } from './electron-status-icon.ts'
import { createEnvironmentInspector } from './environment-inspector.ts'
import { createFavoritesStore } from './favorites-store.ts'
import { registerHostBridge } from './host-bridge.ts'
import { createProjectCatalog } from './project-catalog.ts'
import { createRecencyStore } from './recency-store.ts'
import { createSessionInspector } from './session-inspector.ts'
import { createSettingsStore } from './settings-store.ts'
import { buildTrayMenu } from './tray-menu.ts'
import { createGtkWorkareas } from './x11-workareas.ts'
import { createXdgAutostart, defaultAutostartDirectory } from './xdg-autostart.ts'

const logger = createJsonLogger((line) => process.stderr.write(line))
const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()

// Sem isto o Electron abre um diálogo atrás da janela translúcida; aqui o erro vai para o log
process.on('uncaughtException', (error) => {
  logger.error('uncaught exception in main', { error: String(error), stack: error.stack })
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection in main', { reason: String(reason) })
})

if (!app.requestSingleInstanceLock()) app.quit()

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  const shortcuts = createElectronShortcuts(globalShortcut)
  let activeKey = ''
  const toggleWindow = () => dock.toggle()

  const registerKey = (key: string) => {
    try {
      return shortcuts.register(key, toggleWindow)
    } catch (error) {
      // Um acelerador malformado faz o Electron lançar em vez de devolver falso
      logger.warn('shortcut is not valid', { key, error: String(error) })
      return false
    }
  }

  // Trocar a tecla da janela só vale se o sistema aceitar a nova; senão volta a antiga
  const settingsStore = createSettingsStore({
    file: join(app.getPath('userData'), 'settings.json'),
    logger,
    env: process.env,
    veto(next, changed) {
      if (!changed.includes('shortcuts.toggleWindow')) return []
      const key = next.shortcuts.toggleWindow
      if (activeKey) shortcuts.unregister(activeKey)
      if (registerKey(key)) {
        activeKey = key
        logger.info('shortcut registered', { key })
        return []
      }
      if (activeKey) registerKey(activeKey)
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
  })

  // Abrir o app de novo pelo menu de aplicativos mostra a janela do que já está rodando
  app.on('second-instance', () => dock.show())

  logger.info('notifications available', { supported: Notification.isSupported() })

  const bridge = registerHostBridge({
    ipcMain: createElectronIpc(ipcMain),
    ptyHost: createNodePtyHost(),
    clipboard: {
      readText: async () => clipboard.readText(),
      writeText: async (text) => clipboard.writeText(text),
    },
    settings: settingsStore,
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
    }),

    environment: createEnvironmentInspector({
      processes: createProcessInspector(),
      compose: createComposeInspector({ stopAt: homedir() }),
    }),
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
  if (registerKey(activeKey)) {
    logger.info('shortcut registered', { key: activeKey })
  } else {
    logger.warn('shortcut refused, another program owns it', { key: activeKey })
  }

  settingsStore.onChange((settings, changed) => {
    window.webContents.send(hostChannels.settingsChanged, settings, changed)
    if (changed.includes('window.heightRatio')) dock.refresh()
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
    connect: () => connectTo(endpoint, logger),
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    logger,
    onUnavailable: startDaemonProcess,
    // Um daemon de uma versão anterior sobrevive à atualização e recusaria os métodos novos
    replaceDaemon: async (shutdown) => {
      if (!(await shutdown())) {
        // Daemons antigos nem conhecem `shutdown`: acha os processos do nosso próprio script
        const pids = await processScanner.find({
          argument: daemonScript,
          endpoint: process.env.DCK_ENDPOINT,
          exclude: process.pid,
        })
        for (const pid of pids) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch (error) {
            // O processo pode já ter saído entre achar e matar
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

  void window.loadFile(join(__dirname, 'ui', 'index.html'))
  window.webContents.once('did-finish-load', () => {
    if (!process.env.DCK_START_HIDDEN) dock.show()
    logger.info('window ready', { endpoint })
  })

  // Só para conferir a interface sem olhar a tela: roda um script na página, grava uma captura e sai
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

  // DCK_NO_TRAY existe para os testes automáticos não piscarem ícones na barra do usuário
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
      // Lido a cada montagem do menu: a língua pode mudar nas configurações com o app aberto
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
    shortcuts.unregister(activeKey)
  })
})

app.on('window-all-closed', () => app.quit())
