import type {
  AgentSignal,
  PtyExit,
  Settings,
  SettingsFileState,
  UpdateState,
  ViewSnapshot,
} from '@dck/core'
import { type HostApi, hostChannels } from '@dck/core/host-api'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

function subscribe<Args extends unknown[]>(channel: string, listener: (...args: Args) => void) {
  const handler = (_event: unknown, ...args: Args) => listener(...args)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

// One IPC listener per channel, routed by the terminal's id: a listener per tab made Electron warn past ten
// tabs and handed every chunk of every terminal to every tab
function byTerminal<Arg>(channel: string) {
  const listeners = new Map<number, (arg: Arg) => void>()
  ipcRenderer.on(channel, (_event, id: number, arg: Arg) => listeners.get(id)?.(arg))
  return (id: number, listener: (arg: Arg) => void) => {
    listeners.set(id, listener)
    return () => {
      if (listeners.get(id) === listener) listeners.delete(id)
    }
  }
}

const ptyData = byTerminal<string>(hostChannels.ptyData)
const ptyExit = byTerminal<PtyExit>(hostChannels.ptyExit)

const api: HostApi = {
  pty: {
    create: (options) => ipcRenderer.invoke(hostChannels.ptyCreate, options),
    write: (id, data) => ipcRenderer.send(hostChannels.ptyWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(hostChannels.ptyResize, id, cols, rows),
    kill: (id) => ipcRenderer.send(hostChannels.ptyKill, id),
    onData: ptyData,
    onExit: ptyExit,
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(hostChannels.clipboardRead),
    writeText: (text) => ipcRenderer.invoke(hostChannels.clipboardWrite, text),
  },
  files: {
    pathOf: (file) => webUtils.getPathForFile(file as File),
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
    onFile: (listener) => subscribe<[SettingsFileState]>(hostChannels.settingsFile, listener),
    openFile: () => ipcRenderer.invoke(hostChannels.settingsOpenFile),
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
  review: {
    diff: (request) => ipcRenderer.invoke(hostChannels.reviewDiff, request),
    untrackedFile: (root, path, ignoreWhitespace) =>
      ipcRenderer.invoke(hostChannels.reviewUntracked, { root, path, ignoreWhitespace }),
    fileLines: (root, path) => ipcRenderer.invoke(hostChannels.reviewFile, { root, path }),
    fingerprint: (cwd) => ipcRenderer.invoke(hostChannels.reviewFingerprint, cwd),
    saveNotes: (root, markdown) => ipcRenderer.invoke(hostChannels.reviewNotes, { root, markdown }),
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
  fileSearch: {
    list: (cwd) => ipcRenderer.invoke(hostChannels.fileSearchList, cwd),
    others: (root) => ipcRenderer.invoke(hostChannels.fileSearchOthers, root),
    expand: (root, folder) => ipcRenderer.invoke(hostChannels.fileSearchExpand, { root, folder }),
  },
  projects: {
    list: () => ipcRenderer.invoke(hostChannels.projectsList),
    touch: (path) => ipcRenderer.send(hostChannels.projectsTouch, path),
    toggleFavorite: (path) => ipcRenderer.invoke(hostChannels.projectsToggleFavorite, path),
    chooseRoot: () => ipcRenderer.invoke(hostChannels.projectsChooseRoot),
  },
  fonts: {
    system: () => ipcRenderer.invoke(hostChannels.fontsSystem),
  },
  tabs: {
    saved: () => ipcRenderer.invoke(hostChannels.tabsSaved),
    save: (tabs) => ipcRenderer.send(hostChannels.tabsSave, tabs),
  },
  about: {
    version: () => ipcRenderer.invoke(hostChannels.aboutVersion),
    open: (link) => ipcRenderer.send(hostChannels.aboutOpen, link),
  },
  updates: {
    state: () => ipcRenderer.invoke(hostChannels.updatesState),
    check: () => ipcRenderer.invoke(hostChannels.updatesCheck),
    install: () => ipcRenderer.send(hostChannels.updatesInstall),
    dismiss: () => ipcRenderer.send(hostChannels.updatesDismiss),
    openRelease: () => ipcRenderer.send(hostChannels.updatesOpenRelease),
    restart: () => ipcRenderer.send(hostChannels.updatesRestart),
    onChange: (listener) => subscribe<[UpdateState]>(hostChannels.updatesChanged, listener),
  },
  quit: {
    onAsk: (listener) => subscribe<[number]>(hostChannels.quitAsk, listener),
    answer: (quit) => ipcRenderer.send(hostChannels.quitAnswer, quit),
  },
  window: {
    toggleFullHeight: () => ipcRenderer.send(hostChannels.windowToggleFullHeight),
    resize: (height) => ipcRenderer.invoke(hostChannels.windowResize, height),
    endResize: (keep) => ipcRenderer.send(hostChannels.windowResizeEnd, keep),
    onShown: (listener) => subscribe<[]>(hostChannels.windowShown, listener),
    onOpenSettings: (listener) => subscribe<[]>(hostChannels.windowOpenSettings, listener),
    onFullHeightChange: (listener) => subscribe<[boolean]>(hostChannels.windowFullHeight, listener),
  },
}

contextBridge.exposeInMainWorld('dck', api)
