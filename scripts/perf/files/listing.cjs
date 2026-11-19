// Times the file search's lists on a repository: git's tracked and untracked files, its ignored files with
// wholly ignored folders closed, and ripgrep's `rg --files` as VS Code's reference. Writes the tracked and
// untracked list beside the results, for the ranking in measure.cjs.
// Usage: node listing.cjs <repository> <paths file> [runs]
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const { median, round } = require('../common.cjs')

const [repository, out, runs = '7'] = process.argv.slice(2)

const commands = {
  'tracked + untracked': ['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
  'tracked + untracked, -z': [
    'git',
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ],
  'tracked, submodules': ['git', 'ls-files', '--recurse-submodules'],
  'ignored, folders closed': [
    'git',
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--directory',
  ],
  'ignored, every file': ['git', 'ls-files', '--others', '--ignored', '--exclude-standard'],
  'rg --files': ['rg', '--files'],
  'rg --files --hidden': ['rg', '--files', '--hidden', '-g', '!.git'],
  'rg --files --no-ignore --hidden': ['rg', '--files', '--no-ignore', '--hidden', '-g', '!.git'],
}

function time([command, ...args]) {
  const started = process.hrtime.bigint()
  const done = spawnSync(command, args, {
    cwd: repository,
    maxBuffer: 1 << 30,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  if (done.error) return { ms: Number.NaN, error: done.error.code }
  const separator = args.includes('-z') ? '\0' : '\n'
  const entries = done.stdout.toString().split(separator).filter(Boolean)
  return { ms, entries: entries.length, bytes: done.stdout.length, output: entries }
}

const rows = []
for (const [name, command] of Object.entries(commands)) {
  // The first run warms the file system cache, as a second search in the same session would find it
  const first = time(command)
  if (first.error) {
    rows.push({ name, missing: first.error })
    continue
  }
  const times = [first.ms]
  for (let i = 1; i < Number(runs); i++) times.push(time(command).ms)
  rows.push({
    name,
    cold: round(first.ms, 0),
    median: round(median(times.slice(1)), 1),
    entries: first.entries,
    kb: round(first.bytes / 1024, 0),
  })
  if (name === 'tracked + untracked') fs.writeFileSync(out, first.output.join('\n'))
}
for (const row of rows) console.log(JSON.stringify(row))
