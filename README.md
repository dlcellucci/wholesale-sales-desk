# Wholesale Sales Desk

A free sales desk for wholesale producers. Drop in your orders spreadsheet and see who to call, every account at a glance, and which products stores actually come back for.

**Try it:** https://dlcellucci.github.io/wholesale-sales-desk/ (click "Try sample data")

## Why I built this

I run sales for a craft cannabis farm in Maine. I'm on my phone all day between meetings, ops and calls, and I needed one place to see all of my sales and plan my day fast. Big CRMs feel old and slow. Logging a call in one takes about as long as making the call.

Before this I was keeping my day on paper and a pile of spreadsheets, and I'd lose track of who I should really be calling. Half the day went to organizing the day, or to calling the wrong shops. When a store goes quiet, another brand is usually taking my shelf, and a few weeks late turns into months of samples and discounts to get back in.

This is the stripped-down version anyone can use: no account, no setup, just your orders.

— Dan Cellucci

## What you get

**Who to call.** Every account gets a status from its own ordering rhythm:

| Status | Meaning |
|---|---|
| **Overdue** | More than 7 days past its usual time between orders |
| **Due now** | At, or up to 7 days past, its usual time between orders |
| **Lapsed** | No order in 120+ days, or 3x its usual gap, whichever is longer |
| **New** | Only one order so far |
| **On track** | Not due yet |

Late accounts are listed biggest first, with what they usually order and a one-tap check-in text.

**Accounts.** Every account in one sortable table: status, last order, usual gap, average order, last 90 days vs the 90 before, lifetime.

**What they reorder.** For each product, how many stores bought it more than once. High means it sells through. A product nobody reorders usually sat on the shelf.

## Use it

1. Open the page (link above), or download this repo and double-click `index.html`.
2. Click **Open orders CSV** and pick your export.

Your file never leaves your computer. Everything runs in your browser.

### Your CSV

One row per product on an order works best:

```
order_id,order_date,account,product,quantity,line_total
A1001,2026-10-03,Harbor Light Co-op,Raw Honey 1lb,24,216.00
```

- Required: `order_date`, `account`, `line_total`. Common names like `date`, `customer`, `store` and `total` work too.
- Optional: `product`, `quantity`, `order_id`. Without `product`, the reorder screen stays empty but the rest works.
- Dates can be `2026-10-03` or `10/03/2026`. Totals can have `$` and commas.
- Take closed accounts out first, or they'll show as Lapsed forever.

## Where it can be wrong

- Accounts that order on a wild schedule (10 days, then 90) get a usual gap that doesn't mean much.
- It only knows what's in the file. It doesn't know a store closed, changed buyers, or told you they're overstocked.
- It's a call list, not a crystal ball. Use it to decide who to call first, then talk to them.

## Check it works

```bash
node tests/test_core.js
```

15 tests cover every rule edge (7 days late is Due now, 8 is Overdue), CSV quirks, and the sample data coming out exactly right. If you change a rule, a test should fail. That's on purpose.

## Files

- `index.html`: the app
- `core.js`: the math (no UI, so it can be tested)
- `data/sample_orders.csv`: 192 order lines from 10 made-up stores. No real customers.
- `sample.js`: the same sample, built in so the page works offline

Related: [Reorder Radar](https://github.com/dlcellucci/reorder-radar), the command-line version of the "who to call" math.

## License

MIT. Use it, change it, sell with it.
