import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { connectTo, defaultEndpoint } from '@dck/adapter-node-net'
import { createNodePtyHost } from '@dck/adapter-node-pty'
import { createDockController, createJsonLogger, hostChannels } from '@dck/core'
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, screen } from 'electron'
import { startDaemonLink } from './daemon-link.ts'
import { createElectronDockWindow } from './electron-dock-window.ts'
import { createElectronIpc } from './electron-ipc.ts'
import { createElectronScreen } from './electron-screen.ts'
import { createElectronShortcuts } from './electron-shortcuts.ts'
import { registerHostBridge } from './host-bridge.ts'

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

  const dock = createDockController({
    screen: createElectronScreen(screen),
    window: createElectronDockWindow(window, {
      onShown: () => window.webContents.send(hostChannels.windowShown),
    }),
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
    shell: process.env.SHELL ?? '/bin/bash',
    home: homedir(),
    logger,
    send: (channel, ...args) => window.webContents.send(channel, ...args),
    toggleFullHeight: () => dock.toggleFullHeight(),
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

  // Só para conferir a interface sem olhar a tela: grava uma captura e sai
  const screenshotPath = process.env.DCK_SCREENSHOT
  if (screenshotPath) {
    window.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG())
        app.quit()
      }, 2500),
    )
  }

  app.on('before-quit', () => {
    link.stop()
    bridge.killAll()
    shortcuts.unregister(shortcutKey)
  })
})

app.on('window-all-closed', () => app.quit())
