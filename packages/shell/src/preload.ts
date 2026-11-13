import type { AgentSignal, PtyExit, Settings, ViewSnapshot } from '@dck/core'
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
  notifications: {
    show: (notification) => ipcRenderer.send(hostChannels.notificationsShow, notification),
    onClick: (listener) => subscribe<[string]>(hostChannels.notificationsClick, listener),
  },
  environment: {
    inspect: (ptyId) => ipcRenderer.invoke(hostChannels.environmentInspect, ptyId),
  },
  settings: {
    get: () => ipcRenderer.invoke(hostChannels.settingsGet),
    update: (patch) => ipcRenderer.invoke(hostChannels.settingsUpdate, patch),
    onChange: (listener) =>
      subscribe<[Settings, readonly string[]]>(hostChannels.settingsChanged, listener),
  },
  connections: {
    list: () => ipcRenderer.invoke(hostChannels.connectionsList),
    disabled: () => ipcRenderer.invoke(hostChannels.connectionsDisabled),
    status: (id) => ipcRenderer.invoke(hostChannels.connectionsStatus, id),
    connect: (id, fields, token) =>
      ipcRenderer.invoke(hostChannels.connectionsConnect, { id, fields, token }),
    disconnect: (id) => ipcRenderer.invoke(hostChannels.connectionsDisconnect, id),
  },
  external: {
    open: (url) => ipcRenderer.send(hostChannels.externalOpen, url),
    openLink: (url) => ipcRenderer.send(hostChannels.externalOpenLink, url),
  },
  paths: {
    resolve: (base, paths) => ipcRenderer.invoke(hostChannels.pathsResolve, { base, paths }),
    openFile: (path) => ipcRenderer.send(hostChannels.pathsOpenFile, path),
    openFolder: (path) => ipcRenderer.send(hostChannels.pathsOpenFolder, path),
  },
  views: {
    snapshot: (view) => ipcRenderer.invoke(hostChannels.viewsSnapshot, view),
    refresh: (view, maxAgeMs) => ipcRenderer.invoke(hostChannels.viewsRefresh, { view, maxAgeMs }),
    onChange: (listener) => subscribe<[ViewSnapshot]>(hostChannels.viewsChanged, listener),
  },
  autostart: {
    isEnabled: () => ipcRenderer.invoke(hostChannels.autostartGet),
    set: (enabled) => ipcRenderer.invoke(hostChannels.autostartSet, enabled),
  },
  session: {
    activity: (ptyId) => ipcRenderer.invoke(hostChannels.sessionActivity, ptyId),
    inspect: (ptyId) => ipcRenderer.invoke(hostChannels.sessionInspect, ptyId),
  },
  agent: {
    onSignal: (listener) => subscribe<[AgentSignal]>(hostChannels.agentSignal, listener),
    profiles: () => ipcRenderer.invoke(hostChannels.agentProfiles),
  },
  projects: {
    list: () => ipcRenderer.invoke(hostChannels.projectsList),
    touch: (path) => ipcRenderer.send(hostChannels.projectsTouch, path),
    toggleFavorite: (path) => ipcRenderer.invoke(hostChannels.projectsToggleFavorite, path),
  },
  window: {
    toggleFullHeight: () => ipcRenderer.send(hostChannels.windowToggleFullHeight),
    onShown: (listener) => subscribe<[]>(hostChannels.windowShown, listener),
    onOpenSettings: (listener) => subscribe<[]>(hostChannels.windowOpenSettings, listener),
    onFullHeightChange: (listener) => subscribe<[boolean]>(hostChannels.windowFullHeight, listener),
  },
}

contextBridge.exposeInMainWorld('dck', api)
