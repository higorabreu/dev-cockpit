// Preload that hook.cjs adds to the cockpit's page, in an isolated world. The bench runs in the page's own
// world (no Node there), so it asks this bridge, through window messages, for a file's content (over IPC,
// as the file view will), for the renderer's heap numbers and to drop Blink's caches (webFrame.clearCache).
const { ipcRenderer, webFrame } = require('electron')

const answer = (id, data) => window.postMessage({ dckFilesReply: id, ...data }, '*')

window.addEventListener('message', async (event) => {
  const request = event.data?.dckFilesAsk
  if (event.source !== window || !request) return
  if (request.kind === 'read') {
    const content = await ipcRenderer.invoke('dck-files-read', request.path, request.encoding)
    answer(request.id, { content })
    return
  }
  if (request.kind === 'clearCache') {
    webFrame.clearCache()
    answer(request.id, {})
    return
  }
  if (request.kind === 'heap') {
    const v8 = process.getHeapStatistics()
    const blink = process.getBlinkMemoryInfo()
    // Both in KB
    answer(request.id, {
      v8Used: v8.usedHeapSize,
      v8Total: v8.totalHeapSize,
      blink: blink.allocated,
    })
  }
})
