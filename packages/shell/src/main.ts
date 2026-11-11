import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createClaudeSource } from '@dck/adapter-agent-claude'
import { createComposeInspector } from '@dck/adapter-docker-cli'
import { createProcessInspector, createProcessScanner } from '@dck/adapter-linux-proc'
import { createGitInspector } from '@dck/adapter-node-git'
import { connectTo, defaultEndpoint } from '@dck/adapter-node-net'
import { createNodePtyHost } from '@dck/adapter-node-pty'
import { createDockController, createJsonLogger, hostChannels } from '@dck/core'
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
import { createAgentInspector } from './agent-inspector.ts'
import { createAgentReports } from './agent-reports.ts'
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
import { registerHostBridge } from './host-bridge.ts'
import { createProjectCatalog } from './project-catalog.ts'
import { createRecencyStore } from './recency-store.ts'
import { createSessionInspector } from './session-inspector.ts'
import { buildTrayMenu } from './tray-menu.ts'
import { createXdgAutostart, defaultAutostartDirectory } from './xdg-autostart.ts'

const logger = createJsonLogger((line) => process.stderr.write(line))
const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
const shortcutKey = process.env.DCK_KEY ?? 'F12'
const heightRatio = Number(process.env.DCK_HEIGHT) || 0.5

if (!app.requestSingleInstanceLock()) app.quit()

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
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

  const electronScreen = createElectronScreen(screen)
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
    heightRatio,
  })

  // Para aceitar outro agente basta acrescentar a fonte dele aqui
  const agentSources = [createClaudeSource()]
  const agentReports = createAgentReports(agentSources)

  logger.info('notifications available', { supported: Notification.isSupported() })

  const bridge = registerHostBridge({
    ipcMain: createElectronIpc(ipcMain),
    ptyHost: createNodePtyHost(),
    clipboard: {
      readText: async () => clipboard.readText(),
      writeText: async (text) => clipboard.writeText(text),
    },
    projects: createProjectCatalog(
      process.env.DCK_PROJECTS_ROOT ?? join(homedir(), 'projetos'),
      createRecencyStore(join(app.getPath('userData'), 'recent-projects.json'), logger),
    ),
    sessions: createSessionInspector({
      processes: createProcessInspector(),
      git: createGitInspector(),
      agents: agentSources.map((source) => source.profile),
    }),
    agents: createAgentInspector({
      processes: createProcessInspector(),
      sources: agentSources,
      report: (ptyId, agentId) => agentReports.latest(ptyId, agentId),
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

  const shortcuts = createElectronShortcuts(globalShortcut)
  if (shortcuts.register(shortcutKey, () => dock.toggle())) {
    logger.info('shortcut registered', { key: shortcutKey })
  } else {
    logger.warn('shortcut refused, another program owns it', { key: shortcutKey })
  }

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
        for (const pid of pids) process.kill(pid, 'SIGTERM')
        logger.warn('stale daemon stopped', { pids })
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
      startDaemonProcess()
    },
    onAgentReport: (message) => {
      if (!agentReports.accept(message)) logger.warn('agent report ignored')
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
    const autostart = createXdgAutostart({
      directory: process.env.DCK_AUTOSTART_DIR ?? defaultAutostartDirectory(process.env, homedir()),
      name: 'Dev Cockpit',
      command: app.isPackaged
        ? [process.execPath, '--no-sandbox']
        : [process.execPath, app.getAppPath(), '--no-sandbox'],
      env: { DCK_START_HIDDEN: '1' },
    })
    const statusIcons = createElectronStatusIcon(
      {
        createTray: (iconPath) => new Tray(iconPath),
        buildMenu: (template) => Menu.buildFromTemplate(template),
      },
      join(__dirname, 'assets', 'icon.png'),
    )
    const menuDeps = {
      toggleWindow: () => dock.toggle(),
      autostart,
      quit: () => app.quit(),
      onChange: () => void refreshTrayMenu(),
    }
    const trayIcon = statusIcons.create({ tooltip: 'Dev Cockpit', menu: [] })
    const refreshTrayMenu = async () => trayIcon.setMenu(await buildTrayMenu(menuDeps))
    void refreshTrayMenu()
    app.on('before-quit', () => trayIcon.dispose())
    logger.info('tray icon created')
  }

  app.on('before-quit', () => {
    link.stop()
    bridge.killAll()
    shortcuts.unregister(shortcutKey)
  })
})

app.on('window-all-closed', () => app.quit())
