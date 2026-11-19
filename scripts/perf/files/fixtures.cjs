// Builds the files the spike opens: TypeScript and Python texts of fixed sizes, the two snippets of the
// screenshots, a long README, two large images, a 50-page PDF and a small repository for the file search.
// Usage: node fixtures.cjs <folder>
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repository = path.join(__dirname, '..', '..', '..')
const folder = path.resolve(process.argv[2] ?? '/tmp/dck-f0/fixtures')

function filesUnder(root, test) {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => !/(^|\/)(node_modules|dist)(\/|$)/.test(name) && test(name))
    .sort()
    .map((name) => path.join(root, name))
}

// Real code, repeated if needed, cut at a line end at the size asked
function textOf(sources, bytes) {
  let text = ''
  while (text.length < bytes) {
    for (const file of sources) {
      text += `${fs.readFileSync(file, 'utf8')}\n`
      if (text.length >= bytes) break
    }
  }
  return text.slice(0, text.lastIndexOf('\n', bytes) + 1)
}

const SNIPPET_TS = `import { readFile } from 'node:fs/promises'
import type { Logger } from './logger'

// Lines longer than this are cut in the preview
const MAX_WIDTH = 120

export interface Entry<T = string> {
  readonly path: string
  readonly value?: T
}

export class Recent<T> {
  private readonly items = new Map<string, Entry<T>>()

  constructor(private readonly logger: Logger, private limit = 20) {}

  async add(path: string): Promise<boolean> {
    if (!/\\.(ts|md)$/i.test(path)) return false
    const text = await readFile(path, 'utf8')
    this.items.set(path, { path, value: text.slice(0, MAX_WIDTH) as T })
    this.logger.info(\`added \${path} (\${this.items.size} of \${this.limit})\`)
    return this.items.size <= this.limit && text.length > 0x10
  }
}
`

const SNIPPET_PY = `import re
from dataclasses import dataclass, field
from pathlib import Path

# Lines longer than this are cut in the preview
MAX_WIDTH = 120


@dataclass
class Entry:
    path: Path
    value: str | None = None
    tags: list[str] = field(default_factory=list)


class Recent:
    def __init__(self, logger, limit: int = 20) -> None:
        self.items: dict[str, Entry] = {}
        self.logger, self.limit = logger, limit

    async def add(self, path: str) -> bool:
        if not re.search(r"\\.(py|md)$", path, re.I):
            return False
        text = Path(path).read_text(encoding="utf-8")
        self.items[path] = Entry(Path(path), text[:MAX_WIDTH])
        self.logger.info(f"added {path} ({len(self.items)} of {self.limit})")
        return len(self.items) <= self.limit and len(text) > 0x10
`

// A small project: tracked sources, an ignored dependency folder and build, an ignored .env
function smallRepository(root) {
  fs.rmSync(root, { recursive: true, force: true })
  const file = (name, text = `export const name = '${name}'\n`) => {
    fs.mkdirSync(path.join(root, path.dirname(name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), text)
  }
  for (let i = 0; i < 120; i++) file(`src/feature-${i % 12}/part-${i}.ts`)
  for (let i = 0; i < 30; i++) file(`test/part-${i}.test.ts`)
  file('README.md', '# acme\n')
  file('package.json', '{ "name": "acme" }\n')
  file('.gitignore', 'node_modules/\ndist/\n.env\n')
  for (let i = 0; i < 600; i++) file(`node_modules/lib-${i % 40}/file-${i}.js`)
  for (let i = 0; i < 40; i++) file(`dist/chunk-${i}.js`)
  file('.env', 'TOKEN=example\n')
  const git = (...args) => run('git', '-C', root, ...args)
  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=acme', '-c', 'user.email=acme@example.com', 'commit', '-qm', 'start')
  file('src/feature-0/new-part.ts')
}

function run(command, ...args) {
  const done = spawnSync(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (done.status !== 0) throw new Error(`${command}: ${done.stderr}`)
}

function main() {
  fs.mkdirSync(folder, { recursive: true })
  const typescript = filesUnder(path.join(repository, 'packages'), (name) => name.endsWith('.ts'))
  const pythonRoot = ['3.13', '3.12', '3.11']
    .map((version) => `/usr/local/lib/python${version}`)
    .find((root) => fs.existsSync(root))
  const python = filesUnder(pythonRoot, (name) => !name.includes('/') && name.endsWith('.py'))
  const write = (name, text) => fs.writeFileSync(path.join(folder, name), text)
  write('small.ts', textOf(typescript, 10 * 1024))
  write('medium.ts', textOf(typescript, 1024 * 1024))
  write('large.ts', textOf(typescript, 5 * 1024 * 1024))
  write('medium.py', textOf(python, 1024 * 1024))
  write('snippet.ts', SNIPPET_TS)
  write('snippet.py', SNIPPET_PY)
  smallRepository(path.join(folder, 'acme'))
  const readmes = filesUnder(path.join(__dirname, 'node_modules'), (name) =>
    /(^|\/)readme\.md$/i.test(name),
  )
  write('readme.md', textOf(readmes, 1024 * 1024))
  write('readme-100k.md', textOf(readmes, 100 * 1024))
  // 8 bits per channel: ImageMagick's default of 16 doubles the file and is rare in real images
  const image = (size, name, ...extra) =>
    run(
      'convert',
      '-size',
      size,
      'plasma:#3a6ea5-#f2c14e',
      '-blur',
      '0x1',
      '-depth',
      '8',
      ...extra,
      name,
    )
  image('4000x3000', path.join(folder, 'photo.png'))
  image('6000x4000', path.join(folder, 'photo.jpg'), '-quality', '90')
  image('1600x1000', path.join(folder, 'figure.jpg'), '-quality', '85')
  run(
    'python3',
    '-I',
    path.join(__dirname, 'make-pdf.py'),
    path.join(folder, 'book.pdf'),
    path.join(folder, 'figure.jpg'),
  )
  for (const name of fs.readdirSync(folder).sort()) {
    if (name === 'acme') continue
    const size = fs.statSync(path.join(folder, name)).size
    console.log(`${name.padEnd(12)} ${(size / 1024).toFixed(0).padStart(8)} KB`)
  }
}

main()
