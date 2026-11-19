#!/bin/bash
# Before the editor clip: acme-api gets TypeScript sources with one type error at src/orders.ts:42:5, a
# README worth a preview, and `tsc` runs the repository's own TypeScript.
# Usage: prep-editor.sh (after setup.sh, with the same MEDIA_HOME, MEDIA_WORK and DCK_REPO)
set -e
export GIT_AUTHOR_NAME=Ana GIT_AUTHOR_EMAIL=ana@example.com GIT_COMMITTER_NAME=Ana GIT_COMMITTER_EMAIL=ana@example.com
g() { git -c commit.gpgsign=false "$@"; }
cat > "$MEDIA_WORK/bin/tsc" <<J
#!/bin/sh
exec node "$DCK_REPO/node_modules/typescript/bin/tsc" "\$@"
J
chmod +x "$MEDIA_WORK/bin/tsc"

cd "${MEDIA_HOME:-/home/ana}/projects/acme-api"
cat > tsconfig.json <<'J'
{
  "compilerOptions": { "strict": true, "noEmit": true, "target": "es2022", "module": "nodenext" },
  "include": ["src/**/*.ts"]
}
J
cat > src/money.ts <<'J'
export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}
J
cat > src/inventory.ts <<'J'
const stock = new Map<string, number>()

export function inStock(sku: string, quantity: number): boolean {
  return (stock.get(sku) ?? 0) >= quantity
}

export function restock(sku: string, quantity: number): void {
  stock.set(sku, (stock.get(sku) ?? 0) + quantity)
}
J
cat > src/orders.ts <<'J'
import { inStock } from './inventory.js'
import { formatCents } from './money.js'

const SHIPPING = 790
const FREE_SHIPPING_FROM = 5000

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled'

export interface OrderLine {
  readonly sku: string
  readonly price: number
  readonly quantity: number
}

export interface Order {
  readonly id: string
  readonly customer: string
  readonly status: OrderStatus
  readonly lines: readonly OrderLine[]
}

export function subtotal(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
}

export function orderTotal(order: Order): number {
  const items = subtotal(order)
  return items >= FREE_SHIPPING_FROM ? items : items + SHIPPING
}

export interface Receipt {
  readonly id: string
  readonly customer: string
  readonly items: number
  readonly total: number
}

export function receipt(order: Order): Receipt {
  return {
    id: order.id,
    customer: order.customer,
    total: formatCents(orderTotal(order)),
    items: order.lines.length,
  }
}

export function canShip(order: Order): boolean {
  if (order.status !== 'paid') return false
  return order.lines.every((line) => inStock(line.sku, line.quantity))
}

export function cancel(order: Order): Order {
  if (order.status === 'shipped') throw new Error(`Order ${order.id} already shipped`)
  return { ...order, status: 'cancelled' }
}
J
cat > README.md <<'J'
# acme-api

The Acme accounts and orders API.

## Run it

```sh
npm install
npm test
tsc
```

## Orders

- `orderTotal` adds shipping below the free shipping threshold.
- `receipt` turns an order into what the customer sees.
- `canShip` checks the stock of every line of a paid order.

| Status | Can ship | Can cancel |
| --- | --- | --- |
| pending | no | yes |
| paid | yes | yes |
| shipped | no | no |
J
g add -A && g commit -qm 'feat: orders and receipts'
echo editor state ok
