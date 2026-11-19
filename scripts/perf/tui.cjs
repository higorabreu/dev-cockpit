// The TUI workload: redraws a four line status block 10 times a second with cursor moves and the
// terminal cursor hidden, as Claude Code's Ink does while it waits
const frames = ['|', '/', '-', '\\']
let count = 0

process.stdout.write('\x1b[?25l\n\n\n\n')
setInterval(() => {
  count += 1
  const lines = [
    `${frames[count % frames.length]} Working on the task`,
    `  tokens ${count * 7}  elapsed ${(count / 10).toFixed(1)} s`,
    '  esc to interrupt',
    '> ',
  ]
  process.stdout.write(`\x1b[4A${lines.map((line) => `\r\x1b[2K${line}`).join('\n')}\n`)
}, 100)
