// Run with: node tests/test_core.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const D = require("../core.js");
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };

const AS_OF = "2026-11-02";
const day = n => new Date(Date.parse(AS_OF) - n * 86400000).toISOString().slice(0, 10);
const every = (gap, lastAgo, count, acct = "Shop") => Array.from({ length: count }, (_, i) => ({ order_id: acct + i, order_date: day(lastAgo + gap * i), account: acct, product: "Thing", quantity: 6, line_total: 100 }));
const status = lines => D.scoreAll(lines, AS_OF)[0].status;

t("on track", () => assert.equal(status(every(14, 10, 5)), "On track"));
t("due now on the day", () => assert.equal(status(every(14, 14, 5)), "Due now"));
t("due now at 7 days late", () => assert.equal(status(every(14, 21, 5)), "Due now"));
t("overdue at 8 days late", () => assert.equal(status(every(14, 22, 5)), "Overdue"));
t("lapsed after 120 days", () => assert.equal(status(every(30, 140, 5)), "Lapsed"));
t("3x gap wins when longer than 120", () => { assert.equal(status(every(60, 150, 4)), "Overdue"); assert.equal(status(every(60, 180, 4)), "Lapsed"); });
t("one order is new", () => assert.equal(status(every(0, 12, 1)), "New"));
t("one order long ago is lapsed", () => assert.equal(status(every(0, 130, 1)), "Lapsed"));
t("lines on the same order count as one order", () => {
  const l = every(14, 10, 3); l.push({ ...l[0], product: "Other" });
  const a = D.scoreAll(l, AS_OF)[0]; assert.equal(a.orders, 3); assert.equal(a.usualGap, 14);
});
t("csv with quotes, $ and US dates", () => {
  const r = D.loadOrders('Date,Customer,Item,Qty,Total\n10/01/2026,"Smith, Co",Jam,6,"$1,200.50"\n');
  assert.deepEqual(r.problems, []); assert.equal(r.lines[0].account, "Smith, Co"); assert.equal(r.lines[0].line_total, 1200.5); assert.equal(r.lines[0].order_date, "2026-10-01");
});
t("missing columns are named", () => assert.match(D.loadOrders("foo,bar\n1,2").problems.join(" "), /order_date/));

// The sample file was built so every status shows up. If these change, a rule changed.
const sample = D.loadOrders(fs.readFileSync(path.join(__dirname, "..", "data", "sample_orders.csv"), "utf8"));
const rows = D.scoreAll(sample.lines, AS_OF);
t("sample statuses", () => assert.deepEqual(Object.fromEntries(rows.map(r => [r.account, r.status])), {
  "Harbor Light Co-op": "Overdue", "Granite State Goods": "Overdue", "Old Mill Mercantile": "Overdue", "Riverbend Supply": "Overdue",
  "North Fork Provisions": "Due now", "Blue Ridge Grocers": "Lapsed", "Summit Farm Stand": "New",
  "Cedar Street Shop": "On track", "Tidewater Kitchen": "On track", "Pine Hollow Market": "On track" }));
t("overdue ranked biggest account first", () => assert.deepEqual(rows.filter(r => r.status === "Overdue").map(r => r.account), ["Harbor Light Co-op", "Granite State Goods", "Old Mill Mercantile", "Riverbend Supply"]));
t("one-time trial product shows 0% reorder", () => { const p = D.productReorders(sample.lines, AS_OF).find(x => x.product === "Lavender Honey 8oz"); assert.equal(p.reorderRate, 0); assert.equal(p.buyers, 4); });
t("sample.js matches the CSV", () => {
  const win = {}; new Function("window", fs.readFileSync(path.join(__dirname, "..", "sample.js"), "utf8"))(win);
  assert.equal(win.SAMPLE_CSV, fs.readFileSync(path.join(__dirname, "..", "data", "sample_orders.csv"), "utf8"));
});
console.log(`\n${passed} tests passed`);
