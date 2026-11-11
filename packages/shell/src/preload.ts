import type { PtyExit } from '@dck/core'
import { type HostApi, hostChannels } from '@dck/core/host-api'
import { contextBridge, ipcRenderer } from 'electron'

function subscribe<Args extends unknown[]>(channel: string, listener: (...args: Args) => void) {
  const handler = (_event: unknown, ...args: Args) => listener(...args)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: HostApi = {
  pty: {
    create: (options) => ipcRenderer.invoke(hostChannels.ptyCreate, options),
    write: (id, data) => ipcRenderer.send(hostChannels.ptyWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(hostChannels.ptyResize, id, cols, rows),
    kill: (id) => ipcRenderer.send(hostChannels.ptyKill, id),
    onData: (listener) => subscribe<[number, string]>(hostChannels.ptyData, listener),
    onExit: (listener) => subscribe<[number, PtyExit]>(hostChannels.ptyExit, listener),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(hostChannels.clipboardRead),
    writeText: (text) => ipcRenderer.invoke(hostChannels.clipboardWrite, text),
  },
  projects: {
    list: () => ipcRenderer.invoke(hostChannels.projectsList),
  },
  window: {
    toggleFullHeight: () => ipcRenderer.send(hostChannels.windowToggleFullHeight),
    onShown: (listener) => subscribe<[]>(hostChannels.windowShown, listener),
    onFullHeightChange: (listener) => subscribe<[boolean]>(hostChannels.windowFullHeight, listener),
  },
}

contextBridge.exposeInMainWorld('dck', api)
