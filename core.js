/* Wholesale Sales Desk: the math. No UI here, so it can be tested in Node.
 * Works on a list of order lines: { order_id, order_date, account, product, quantity, line_total }.
 * Rules (same as Reorder Radar):
 *   Overdue  = more than 7 days past the account's usual gap between orders
 *   Due now  = 0 to 7 days past the usual gap
 *   Lapsed   = 120+ days since the last order, or 3x the usual gap, whichever is longer
 *   New      = only one order so far
 *   On track = not due yet
 * "Usual gap" is the median gap between orders, so one odd gap doesn't throw it off.
 */
(function (root) {
  "use strict";
  const GRACE_DAYS = 7, LAPSED_MIN_DAYS = 120, LAPSED_MULTIPLE = 3;
  const STATUS_ORDER = ["Overdue", "Due now", "Lapsed", "New", "On track"];
  const DAY = 86400000;

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = []; let row = [], field = "", q = false;
    text = String(text || "").replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some(v => v.trim() !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(v => v.trim() !== "")) rows.push(row);
    return rows;
  }

  // Header names people actually use, mapped to ours.
  const ALIASES = {
    order_date: ["order_date", "date", "order date", "invoice date", "created", "created_at", "ship date"],
    account: ["account", "customer", "store", "buyer", "buyer_name", "customer name", "client", "retailer"],
    product: ["product", "product_name", "item", "item name", "sku", "description"],
    quantity: ["quantity", "qty", "units", "order_quantity"],
    line_total: ["line_total", "total", "amount", "line amount", "order_total", "subtotal", "revenue", "sales"],
    order_id: ["order_id", "order id", "order", "invoice", "invoice_number", "invoice #", "order #", "order number"],
  };
  function mapHeaders(header) {
    const h = header.map(x => String(x).trim().toLowerCase());
    const map = {};
    for (const [key, names] of Object.entries(ALIASES)) {
      const i = h.findIndex(x => names.includes(x));
      if (i >= 0) map[key] = i;
    }
    return map;
  }
  const money = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[$,\s]/g, "")); return isNaN(n) ? 0 : n; };
  function parseDate(v) {
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(Date.UTC(y, +m[1] - 1, +m[2])); }
    return null;
  }
  const iso = d => d.toISOString().slice(0, 10);

  // CSV text -> { lines, problems, hasProducts }
  function loadOrders(text) {
    const rows = parseCSV(text);
    if (!rows.length) return { lines: [], problems: ["The file is empty."], hasProducts: false };
    const map = mapHeaders(rows[0]);
    const problems = [];
    for (const k of ["order_date", "account", "line_total"]) if (map[k] == null) problems.push(`Couldn't find a "${k}" column. Rename that column to ${k} and try again.`);
    if (problems.length) return { lines: [], problems, hasProducts: false };
    const lines = []; let skipped = 0;
    rows.slice(1).forEach((r, i) => {
      const d = parseDate(r[map.order_date]);
      const account = String(r[map.account] || "").trim();
      if (!d || !account) { skipped++; return; }
      lines.push({
        order_id: map.order_id != null ? String(r[map.order_id]).trim() : "",
        order_date: iso(d), account,
        product: map.product != null ? String(r[map.product] || "").trim() : "",
        quantity: map.quantity != null ? money(r[map.quantity]) : 0,
        line_total: money(r[map.line_total]),
      });
    });
    if (skipped) problems.push(`${skipped} row${skipped > 1 ? "s" : ""} skipped (missing date or account).`);
    return { lines, problems, hasProducts: map.product != null };
  }

  // ---------- orders per account ----------
  function groupOrders(lines) {
    // order key: order_id if present, else account + date
    const orders = new Map();
    for (const l of lines) {
      const k = l.account + "|" + (l.order_id || l.order_date);
      let o = orders.get(k);
      if (!o) { o = { account: l.account, date: l.order_date, total: 0, items: [] }; orders.set(k, o); }
      if (l.order_date < o.date) o.date = l.order_date;
      o.total += l.line_total; o.items.push(l);
    }
    const byAccount = new Map();
    for (const o of orders.values()) { if (!byAccount.has(o.account)) byAccount.set(o.account, []); byAccount.get(o.account).push(o); }
    for (const list of byAccount.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return byAccount;
  }
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

  function scoreAccount(name, orders, asOf) {
    const days = [...new Set(orders.map(o => o.date))].sort();
    const last = days[days.length - 1];
    const daysSince = daysBetween(last, asOf);
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
    const usualGap = gaps.length ? Math.round(median(gaps)) : null;
    const totals = orders.map(o => o.total);
    const lifetime = totals.reduce((a, b) => a + b, 0);
    let status, daysLate = null;
    if (usualGap == null) status = daysSince >= LAPSED_MIN_DAYS ? "Lapsed" : "New";
    else {
      daysLate = daysSince - usualGap;
      if (daysSince >= Math.max(LAPSED_MIN_DAYS, LAPSED_MULTIPLE * usualGap)) status = "Lapsed";
      else if (daysLate > GRACE_DAYS) status = "Overdue";
      else if (daysLate >= 0) status = "Due now";
      else status = "On track";
    }
    const cutoff = d => iso(new Date(Date.parse(asOf) - d * DAY));
    const spend = (from, to) => orders.filter(o => o.date > from && o.date <= to).reduce((a, o) => a + o.total, 0);
    const last90 = spend(cutoff(90), asOf), prior90 = spend(cutoff(180), cutoff(90));
    // what they usually buy: products in the last 3 orders, average quantity when bought
    const recent = orders.slice(-3), usual = new Map();
    for (const o of recent) for (const it of o.items) {
      if (!it.product) continue;
      const u = usual.get(it.product) || { product: it.product, qty: 0, times: 0 };
      u.qty += it.quantity; u.times++; usual.set(it.product, u);
    }
    const usualOrder = [...usual.values()].map(u => ({ product: u.product, quantity: Math.round(u.qty / u.times), times: u.times }))
      .sort((a, b) => b.times - a.times || b.quantity - a.quantity);
    return {
      account: name, status, lastOrder: last, daysSince, usualGap, daysLate,
      orders: days.length, avgOrder: lifetime / orders.length, lifetime, last90, prior90,
      trend: prior90 > 0 ? Math.round((last90 - prior90) / prior90 * 100) : null,
      nextExpected: usualGap != null ? iso(new Date(Date.parse(last) + usualGap * DAY)) : null,
      usualOrder,
    };
  }

  // Who to call first: by status, then biggest accounts first, then most days late.
  function scoreAll(lines, asOf) {
    const byAccount = groupOrders(lines);
    const rows = [...byAccount.entries()].map(([name, orders]) => scoreAccount(name, orders, asOf));
    rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.avgOrder - a.avgOrder || (b.daysLate || 0) - (a.daysLate || 0));
    return rows;
  }

  // Which products stores come back for. "Reorder rate" = share of accounts that bought it more than once.
  function productReorders(lines, asOf) {
    const byAccount = groupOrders(lines);
    const p = new Map();
    const since90 = iso(new Date(Date.parse(asOf) - 90 * DAY));
    for (const [acct, orders] of byAccount) for (const o of orders) for (const it of o.items) {
      if (!it.product) continue;
      let r = p.get(it.product);
      if (!r) { r = { product: it.product, accounts: new Map(), qty: 0, revenue: 0, qty90: 0, lastSold: "" }; p.set(it.product, r); }
      r.accounts.set(acct, (r.accounts.get(acct) || new Set()).add(o.date));
      r.qty += it.quantity; r.revenue += it.line_total;
      if (o.date > since90) r.qty90 += it.quantity;
      if (o.date > r.lastSold) r.lastSold = o.date;
    }
    return [...p.values()].map(r => {
      const buyers = r.accounts.size, repeat = [...r.accounts.values()].filter(s => s.size > 1).length;
      return { product: r.product, buyers, repeatBuyers: repeat, reorderRate: buyers ? Math.round(repeat / buyers * 100) : 0, quantity: r.qty, revenue: r.revenue, qty90: r.qty90, lastSold: r.lastSold };
    }).sort((a, b) => b.reorderRate - a.reorderRate || b.repeatBuyers - a.repeatBuyers || b.revenue - a.revenue);
  }

  const api = { parseCSV, loadOrders, groupOrders, scoreAccount, scoreAll, productReorders, STATUS_ORDER, GRACE_DAYS, LAPSED_MIN_DAYS, LAPSED_MULTIPLE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SalesDesk = api;
})(typeof window !== "undefined" ? window : globalThis);
