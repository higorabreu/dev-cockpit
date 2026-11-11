import { spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { connectTo, defaultEndpoint } from '@dck/adapter-node-net'
import { createNodePtyHost } from '@dck/adapter-node-pty'
import { createDockController, createJsonLogger, hostChannels } from '@dck/core'
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, screen } from 'electron'
import { launchDaemon } from './daemon-launcher.ts'
import { startDaemonLink } from './daemon-link.ts'
import { logDockWindow, logScreen } from './dock-log.ts'
import { createElectronDockWindow } from './electron-dock-window.ts'
import { createElectronIpc } from './electron-ipc.ts'
import { createElectronScreen } from './electron-screen.ts'
import { createElectronShortcuts } from './electron-shortcuts.ts'
import { registerHostBridge } from './host-bridge.ts'
import { createProjectScanner } from './project-scan.ts'

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

  const bridge = registerHostBridge({
    ipcMain: createElectronIpc(ipcMain),
    ptyHost: createNodePtyHost(),
    clipboard: {
      readText: async () => clipboard.readText(),
      writeText: async (text) => clipboard.writeText(text),
    },
    projects: createProjectScanner(process.env.DCK_PROJECTS_ROOT ?? join(homedir(), 'projetos')),
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

  const link = startDaemonLink({
    connect: () => connectTo(endpoint, logger),
    scheduler: {
      after(milliseconds, task) {
        const timer = setTimeout(task, milliseconds)
        return () => clearTimeout(timer)
      },
    },
    logger,
    onUnavailable: () => {
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
          script: join(__dirname, 'daemon.cjs'),
          env: process.env,
          logFd: openSync(join(dirname(endpoint), 'daemon.log'), 'a'),
        },
        logger,
      )
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
        await Promise.race([run, sleep(20000)])
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

  app.on('before-quit', () => {
    link.stop()
    bridge.killAll()
    shortcuts.unregister(shortcutKey)
  })
})

app.on('window-all-closed', () => app.quit())
