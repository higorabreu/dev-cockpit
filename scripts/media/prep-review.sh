#!/bin/bash
# Before the review clip: libs/billing moves two commits past the one acme-api recorded and has an edit
# of its own, so the review shows the submodule's group with its commits and a file to comment on.
# Usage: prep-review.sh (after setup.sh, with the same MEDIA_HOME)
set -e
export GIT_AUTHOR_NAME=Ana GIT_AUTHOR_EMAIL=ana@example.com GIT_COMMITTER_NAME=Ana GIT_COMMITTER_EMAIL=ana@example.com
g() { git -c commit.gpgsign=false "$@"; }
cd "${MEDIA_HOME:-/home/ana}/projects/acme-api/libs/billing"
g checkout -q -b feat/tax
cat > src/tax.js <<'J'
export function withTax(cents, rate) {
  return Math.round(cents * (1 + rate))
}
J
g add -A && g commit -qm 'feat: add sales tax to invoices'
cat > src/currency.js <<'J'
export function format(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}
J
g add -A && g commit -qm 'feat: format amounts in the invoice currency'
cat > src/invoice.js <<'J'
import { withTax } from './tax.js'

export function total(lines, rate = 0) {
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  return withTax(subtotal, rate)
}
J
echo review state ok
