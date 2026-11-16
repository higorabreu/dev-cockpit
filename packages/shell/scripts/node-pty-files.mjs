import { join, sep } from 'node:path'

// What the packaged app loads from node-pty. An allowlist and not a list of exclusions, since its build
// folder also holds the Makefiles, config.gypi and .deps with the builder's home path, and a copy of
// node-addon-api, which only the build needs
const files = new Set([
  '',
  'package.json',
  'LICENSE',
  'build',
  join('build', 'Release'),
  join('build', 'Release', 'pty.node'),
  // Only the macOS build has it: the binary that sets up the child before it runs the shell
  join('build', 'Release', 'spawn-helper'),
  'lib',
])

// path is relative to node-pty's folder; a folder must pass for cpSync to look inside it
export function shipsNodePtyFile(path) {
  if (files.has(path)) return true
  return path.startsWith(`lib${sep}`) && !path.endsWith('.test.js')
}
