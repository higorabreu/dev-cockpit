// A Jira Cloud API stand-in on localhost with example tasks, for the recordings.
// Usage: node fake-jira.cjs <port>; the account and token it accepts are the fixture's fake ones
const http = require('node:http')

const port = Number(process.argv[2])
const auth = `Basic ${Buffer.from('ana@example.com:jira-fixture').toString('base64')}`
const now = Date.now()
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString().replace('Z', '+0000')
const categories = { todo: 'new', progress: 'indeterminate' }
const issue = (key, summary, type, status, category, minutes) => ({
  id: String(10000 + Number(key.split('-')[1])),
  key,
  self: `http://localhost:${port}/rest/api/3/issue/${key}`,
  fields: {
    summary,
    status: { name: status, statusCategory: { id: 4, key: categories[category], name: status } },
    issuetype: { name: type },
    project: { key: key.split('-')[0], name: key.split('-')[0] },
    updated: ago(minutes),
  },
})
const issues = [
  issue(
    'ACME-142',
    'Validate the sign-up email and password',
    'Story',
    'In Progress',
    'progress',
    12,
  ),
  issue(
    'ACME-139',
    'Login redirect loops when the session expires',
    'Bug',
    'In Review',
    'progress',
    48,
  ),
  issue('WEB-77', 'Dark mode contrast on the pricing page', 'Bug', 'In Review', 'progress', 320),
  issue('OPS-31', 'Rotate the staging TLS certificates', 'Task', 'To Do', 'todo', 95),
  issue(
    'ACME-131',
    'Move the user settings to the new storage layer',
    'Story',
    'To Do',
    'todo',
    180,
  ),
  issue('ACME-128', 'Document the webhook retry policy', 'Task', 'To Do', 'todo', 600),
]

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== auth) {
      send(401, { errorMessages: ['Client must be authenticated to access this resource.'] })
      return
    }
    if (url.pathname === '/rest/api/3/myself') {
      send(200, {
        accountId: 'fixture-account',
        displayName: 'Ana',
        emailAddress: 'ana@example.com',
      })
      return
    }
    if (url.pathname === '/rest/api/3/search/jql') {
      send(200, { issues, isLast: true })
      return
    }
    send(404, { errorMessages: ['Not found'] })
  })
  .listen(port, '127.0.0.1')
