// Pieces of the Windows package that do not need Windows to build, so a test on any system can check them
import { Buffer } from 'node:buffer'
import { bundleVersion } from './mac-bundle.mjs'

// An .ico of PNG images, which Windows reads since Vista: a header, one entry per image, then the images.
// A side of 256 is written as 0, as the format has one byte for it
export function icoFromPngs(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)])
}

// The executable's version resource takes four integers; a prerelease keeps its x.y.z, as on the Mac
export const fileVersion = (version) => `${bundleVersion(version)}.0`

// resources\bin\dck.cmd: runs the CLI inside the packaged Electron, as VS Code's code.cmd does. The app folder
// holds the CLI, so it finds the native bindings in app\node_modules. CRLF, as cmd expects
export function dckCommand(product) {
  return [
    '@echo off',
    'setlocal',
    'set ELECTRON_RUN_AS_NODE=1',
    'set DCK_PACKAGED=1',
    `"%~dp0..\\..\\${product}.exe" "%~dp0..\\app\\dck.mjs" %*`,
    '',
  ].join('\r\n')
}
