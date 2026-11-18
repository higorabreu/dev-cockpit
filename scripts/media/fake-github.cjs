// A GitHub Enterprise API stand-in on localhost with example pull requests, for the recordings.
// Usage: node fake-github.cjs <port>; the token it accepts is the fixture's fake one
const http = require('node:http')

const port = Number(process.argv[2])
const now = Date.now()
const api = `http://localhost:${port}/api/v3`
const review = [
  {
    number: 208,
    title: 'Cache the pricing table for five minutes',
    user: 'bruno',
    repo: 'acme/web',
    checks: 'failure',
    mergeable: false,
  },
  {
    number: 212,
    title: 'Retry webhook deliveries with backoff',
    user: 'carla',
    repo: 'acme/platform',
    checks: 'success',
  },
]
const mine = [
  {
    number: 215,
    title: 'Show the tax line on invoices',
    user: 'ana',
    repo: 'acme/web',
    checks: 'success',
  },
]
const all = [...review, ...mine]
const find = (number) => all.find((pr) => String(pr.number) === number)
const item = (pr, i) => ({
  number: pr.number,
  title: pr.title,
  html_url: `http://localhost:${port}/${pr.repo}/pull/${pr.number}`,
  user: { login: pr.user },
  draft: false,
  updated_at: new Date(now - 23 * (i + 1) * 60_000).toISOString(),
  repository_url: `${api}/repos/${pr.repo}`,
  pull_request: {},
})

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const send = (status, body) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-limit': '5000',
        'x-ratelimit-reset': String(Math.floor(now / 1000) + 3600),
        'x-ratelimit-resource': 'core',
      })
      res.end(JSON.stringify(body))
    }
    if (!url.pathname.startsWith('/api/v3')) {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html></html>')
      return
    }
    if (req.headers.authorization !== 'Bearer ghp_fixture') {
      send(401, { message: 'Bad credentials' })
      return
    }
    const path = url.pathname.slice('/api/v3'.length)
    if (path === '/user') {
      send(200, { id: 7, login: 'ana', name: 'Ana' })
      return
    }
    if (path === '/search/issues') {
      const list = (url.searchParams.get('q') ?? '').includes('review-requested') ? review : mine
      send(200, { total_count: list.length, items: list.map(item) })
      return
    }
    const pull = path.match(/^\/repos\/acme\/[a-z]+\/pulls\/(\d+)$/)
    if (pull) {
      send(200, {
        draft: false,
        mergeable: find(pull[1])?.mergeable ?? true,
        head: { ref: `feat/pr-${pull[1]}`, sha: `sha${pull[1]}` },
        base: { ref: 'main' },
      })
      return
    }
    const runs = path.match(/\/commits\/sha(\d+)\/check-runs$/)
    if (runs) {
      const conclusion = find(runs[1])?.checks ?? 'success'
      send(200, { total_count: 1, check_runs: [{ status: 'completed', conclusion }] })
      return
    }
    if (/\/commits\/sha\d+\/status$/.test(path)) {
      send(200, { state: 'pending', total_count: 0 })
      return
    }
    send(404, { message: 'Not Found' })
  })
  .listen(port, '127.0.0.1')
