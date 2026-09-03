// test/meetmath.test.js — meetzones core tests (Node built-in runner).
//   node --test test/meetmath.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const m = require(path.join(__dirname, "..", "meetmath.js"));

test("cities: 30+ preset zones all valid in Intl", () => {
  assert.ok(m.CITIES.length >= 30);
  for (const { c, tz } of m.CITIES) {
    assert.ok(m.supportsZone(tz), `${c} → ${tz} must be a valid IANA zone`);
  }
});

test("supportsZone rejects garbage, accepts UTC+14/-11 extremes", () => {
  assert.equal(m.supportsZone("Mars/Olympus"), false);
  assert.equal(m.supportsZone("Pacific/Kiritimati"), true);
  assert.equal(m.supportsZone("Pacific/Pago_Pago"), true);
  assert.equal(m.supportsZone("UTC"), true);
});

test("localHourOf: known instants in known zones", () => {
  // 2026-09-03 12:00 UTC:
  assert.equal(m.localHourOf("UTC", Date.parse("2026-09-03T12:00:00Z")), 12);
  assert.equal(m.localHourOf("Asia/Shanghai", Date.parse("2026-09-03T12:00:00Z")), 20);
  assert.equal(m.localHourOf("America/New_York", Date.parse("2026-09-03T12:00:00Z")), 8);
  assert.equal(m.localHourOf("Pacific/Kiritimati", Date.parse("2026-09-03T12:00:00Z")), 2, "+14 → next day 02:00");
  assert.equal(m.localHourOf("Pacific/Pago_Pago", Date.parse("2026-09-03T12:00:00Z")), 1, "-11 → same day 01:00");
});

test("hourQuality: bands classify correctly", () => {
  const b = m.DEFAULT_BANDS();
  assert.equal(m.hourQuality(10, b), 2);   // inside work
  assert.equal(m.hourQuality(9, b), 2);
  assert.equal(m.hourQuality(17, b), 2);
  assert.equal(m.hourQuality(18, b), 1);   // soft end exclusive
  assert.equal(m.hourQuality(8, b), 1);    // shoulder
  assert.equal(m.hourQuality(21, b), 1);
  assert.equal(m.hourQuality(23, b), -1);  // asleep
  assert.equal(m.hourQuality(3, b), -1);
  assert.equal(m.hourQuality(6, b), -1);   // before 7
});

test("scoreSlot: prime when everyone in work hours", () => {
  // Shanghai 16:00 = London 09:00 = New York 04:00… pick 09 UTC → all in-band?
  // 09:00 UTC = Shanghai 17:00 (2), London 10:00 (2), NY 05:00 (-1) → impossible
  const zones = ["Asia/Shanghai", "Europe/London", "America/New_York"];
  const q = m.scoreSlot(zones, Date.parse("2026-09-03T09:00:00Z"));
  assert.equal(q.worst, -1);
  assert.equal(q.label, "impossible");
  // Shanghai-London pair at 09:00 UTC: 17 & 10 → both 2 → prime
  const q2 = m.scoreSlot(["Asia/Shanghai", "Europe/London"], Date.parse("2026-09-03T09:00:00Z"));
  assert.equal(q2.worst, 2);
  assert.equal(q2.label, "prime");
});

test("dayGrid: 24 slots, anchor hours 0..23, ordered", () => {
  const zones = ["Asia/Shanghai", "Europe/London", "America/New_York"];
  const grid = m.dayGrid(zones, "Asia/Shanghai", Date.parse("2026-09-03T12:00:00Z"));
  assert.equal(grid.length, 24);
  for (let i = 0; i < 24; i++) assert.equal(grid[i].anchorHour, i);
  // every slot must be classifiable
  for (const s of grid) assert.ok(["prime", "ok", "rough", "impossible"].includes(s.label));
});

test("dayGrid: Shanghai+London has at least one prime hour (17:00 = 10:00)", () => {
  const grid = m.dayGrid(["Asia/Shanghai", "Europe/London"], "Asia/Shanghai", Date.parse("2026-09-03T12:00:00Z"));
  const primes = grid.filter((s) => s.label === "prime");
  assert.ok(primes.length >= 2, "expected several overlapping work hours");
  assert.ok(primes.some((s) => s.anchorHour === 17));
});

test("dayGrid: Shanghai+NewYork never prime (no shared work window)", () => {
  const grid = m.dayGrid(["Asia/Shanghai", "America/New_York"], "Asia/Shanghai", Date.parse("2026-09-03T12:00:00Z"));
  assert.equal(grid.filter((s) => s.label === "prime").length, 0,
    "12h apart with 9h work bands cannot overlap");
  // but 'ok' hours exist: Shanghai evening 20-21 = NY morning 8-9
  assert.ok(grid.some((s) => s.label === "ok"), "shoulder hours exist");
});

test("bestRuns: 2-hour meeting ranks the strongest window first", () => {
  const zones = ["Asia/Shanghai", "Europe/London"];
  const grid = m.dayGrid(zones, "Asia/Shanghai", Date.parse("2026-09-03T12:00:00Z"));
  const runs = m.bestRuns(grid, 2);
  assert.equal(runs.length, 23); // 24 - 2 + 1
  assert.ok(runs[0].worst >= runs[runs.length - 1].worst, "sorted by worst desc");
  assert.ok(runs[0].sum >= runs[1].sum, "sum breaks ties");
  // the best 2h window must contain 17:00-18:00 Shanghai (=10-11 London)
  assert.ok([16, 17].includes(runs[0].start), "best window covers 17:00 anchor");
});

test("slotInZones: same instant rendered in every participant's wall clock", () => {
  const ms = Date.parse("2026-09-03T09:00:00Z");
  const inZ = m.slotInZones(["Asia/Shanghai", "Europe/London", "America/New_York"], ms);
  assert.equal(inZ[0].hhmm, "17:00");
  assert.equal(inZ[1].hhmm, "10:00");
  assert.equal(inZ[2].hhmm, "5:00");
  // Kiritimati (+14): 09:00 UTC → 23:00 SAME day? No: 9+14=23 → 23:00 same day
  const kir = m.slotInZones(["Pacific/Kiritimati"], ms)[0];
  assert.equal(kir.hhmm, "23:00");
  assert.equal(kir.localDate, "2026-09-03", "9+14=23, still Sep 3");
});

test("slotInZones: date rolls back for UTC-11", () => {
  const ms = Date.parse("2026-09-03T12:00:00Z");
  const pago = m.slotInZones(["Pacific/Pago_Pago"], ms)[0];
  assert.equal(pago.localDate, "2026-09-03");
  assert.equal(pago.hhmm, "1:00");
});
