#!/bin/bash
# Builds the example projects in a fixture home, its shell profile and the wrappers the recordings use.
# Usage: setup.sh <work dir> <repository>. Everything is neutral example data under the work dir.
set -e
W="$1"
REPO="$2"
M="$(cd "$(dirname "$0")" && pwd)"
# Under /home/<name> the cockpit shows paths as ~/..., as on a real machine
A="${MEDIA_HOME:-/home/ana}"
P="$A/projects"
# The fixture home is rebuilt on every run, so it must be one this script made
if [ -e "$A" ] && [ ! -e "$A/.dck-media-fixture" ]; then
  echo "$A exists and is not a fixture home made by this script; set MEDIA_HOME to another folder" >&2
  exit 1
fi
rm -rf "$A" "$W/remotes" "$W/src" "$W/bin"
mkdir -p "$P" "$W/remotes" "$W/src" "$W/bin"
touch "$A/.dck-media-fixture"
cp "$M/bin/secret-tool" "$M/bin/xdg-open" "$W/bin/"
export GIT_AUTHOR_NAME=Ana GIT_AUTHOR_EMAIL=ana@example.com GIT_COMMITTER_NAME=Ana GIT_COMMITTER_EMAIL=ana@example.com
export GIT_AUTHOR_DATE='2026-11-16T10:00:00' GIT_COMMITTER_DATE='2026-11-16T10:00:00'
g() { git -c init.defaultBranch=main -c commit.gpgsign=false -c protocol.file.allow=always "$@"; }

# acme-billing: a library that acme-api pulls in as a submodule
mkdir -p "$W/src/acme-billing/src" && cd "$W/src/acme-billing" && g init -q
cat > src/invoice.js <<'J'
export function total(lines) {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
}
J
cat > src/currency.js <<'J'
export function format(cents) {
  return `$${(cents / 100).toFixed(2)}`
}
J
g add -A && g commit -qm 'feat: invoice totals'
g clone -q --bare . "$W/remotes/acme-billing.git"

# acme-api: the project the agent works on
mkdir -p "$P/acme-api/src" "$P/acme-api/test" && cd "$P/acme-api" && g init -q
cat > package.json <<'J'
{
  "name": "acme-api",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
J
cat > src/users.js <<'J'
const users = new Map()

export function findUser(email) {
  return users.get(email)
}

export function saveUser(user) {
  users.set(user.email, user)
  return user
}
J
cat > src/signup.js <<'J'
import { findUser, saveUser } from './users.js'

export function signup(body) {
  if (findUser(body.email)) {
    return { status: 409, error: 'Email already registered' }
  }
  const user = saveUser({ email: body.email, password: body.password })
  return { status: 201, user: { email: user.email } }
}
J
cat > test/signup.test.js <<'J'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { signup } from '../src/signup.js'

test('creates a user', () => {
  const result = signup({ email: 'ana@example.com', password: 'correct horse battery' })
  assert.equal(result.status, 201)
})
J
printf '# acme-api\n\nThe Acme accounts API.\n' > README.md
g submodule -q add "$W/remotes/acme-billing.git" libs/billing
g add -A && g commit -qm 'feat: sign up users'
g clone -q --bare . "$W/remotes/acme-api.git" && g remote add origin "$W/remotes/acme-api.git" && g fetch -q origin
g branch -q -u origin/main
g checkout -qb feat/signup-validation && g push -q -u origin feat/signup-validation

# acme-web: the other project, where the developer runs the tests
mkdir -p "$P/acme-web/src" "$P/acme-web/test" && cd "$P/acme-web" && g init -q
printf '{ "name": "acme-web", "private": true, "type": "module", "scripts": { "test": "node --test" } }\n' > package.json
printf 'export const header = (user) => (user ? `Hello, ${user.name}` : "Sign in")\n' > src/header.js
cat > test/header.test.js <<'J'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { header } from '../src/header.js'

test('greets a signed in user', () => assert.equal(header({ name: 'Ana' }), 'Hello, Ana'))
test('asks a visitor to sign in', () => assert.equal(header(undefined), 'Sign in'))
test('keeps the name as written', () => assert.equal(header({ name: 'bruno' }), 'Hello, bruno'))
J
g add -A && g commit -qm 'feat: greet the user in the header'
g clone -q --bare . "$W/remotes/acme-web.git" && g remote add origin "$W/remotes/acme-web.git" && g fetch -q origin
g branch -q -u origin/main

# The shell profile: a short prompt with the branch
cat > "$A/.bashrc" <<'J'
branch() { git symbolic-ref --short HEAD 2>/dev/null; }
prompt() {
  local b; b=$(branch)
  PS1='\[\e[1;33m\]ana\[\e[0m\] in \[\e[1;36m\]\W\[\e[0m\]'
  [ -n "$b" ] && PS1+=" on \[\e[1;35m\]$b\[\e[0m\]"
  PS1+='\n\[\e[1;32m\]>\[\e[0m\] '
}
PROMPT_COMMAND=prompt
export PATH="$MEDIA_BIN:$PATH"
J

# claude runs in the fixture home with the repository's plugin; the variables it needs to reach the API
# are passed through from the environment at run time and never written here
claude_bin="$(command -v claude || true)"
cat > "$W/bin/claude" <<J
#!/bin/sh
[ -n "$claude_bin" ] || { echo 'claude is not installed' >&2; exit 1; }
for name in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL CLAUDE_CONFIG_DIR HTTPS_PROXY https_proxy NO_PROXY no_proxy NODE_EXTRA_CA_CERTS SSL_CERT_FILE; do
  value="\$(printenv "MEDIA_PASS_\$name")"
  [ -n "\$value" ] && export "\$name=\$value"
done
export HOME="$A" DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
exec "$claude_bin" --plugin-dir "$REPO/integrations/claude-code" --permission-mode acceptEdits "\$@"
J
cat > "$W/bin/dck" <<J
#!/bin/sh
exec node "$REPO/packages/cli/src/main.ts" "\$@"
J
chmod +x "$W/bin/"*
# Claude Code's first run questions already answered, and the project trusted
cat > "$A/.claude.json" <<J
{ "hasCompletedOnboarding": true, "theme": "dark", "numStartups": 5, "hasSeenTasksHint": true, "tipsHistory": {},
  "projects": {
    "$P/acme-api": { "hasTrustDialogAccepted": true, "hasCompletedProjectOnboarding": true },
    "$P/acme-web": { "hasTrustDialogAccepted": true, "hasCompletedProjectOnboarding": true } } }
J
python3 "$M/desktop.py" "$W"
echo setup ok
