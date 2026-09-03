// meetmath.js — meetzones core math. Zero dependencies, browser + Node.
//
// One job: given N time zones, find the hours where everyone is inside
// acceptable hours (default 09:00–18:00 local), score each hour honestly,
// and express every slot in each participant's own wall clock.
//
// The engine is the same UTC-arithmetic discipline as yearpulse: zone
// offsets come from the platform IANA db via Intl; a local date's hour-of-
// day at a given UTC instant is read through Intl with no offset tables.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.meetmath = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Common city set (deliberately compact: 40 covers most real meetings;
  // any IANA name can be typed into the custom box).
  var CITIES = [
    { c: "北京", tz: "Asia/Shanghai" }, { c: "上海", tz: "Asia/Shanghai" },
    { c: "香港", tz: "Asia/Hong_Kong" }, { c: "台北", tz: "Asia/Taipei" },
    { c: "东京", tz: "Asia/Tokyo" }, { c: "首尔", tz: "Asia/Seoul" },
    { c: "新加坡", tz: "Asia/Singapore" }, { c: "曼谷", tz: "Asia/Bangkok" },
    { c: "新德里", tz: "Asia/Kolkata" }, { c: "孟买", tz: "Asia/Kolkata" },
    { c: "迪拜", tz: "Asia/Dubai" }, { c: "莫斯科", tz: "Europe/Moscow" },
    { c: "伊斯坦布尔", tz: "Europe/Istanbul" }, { c: "柏林", tz: "Europe/Berlin" },
    { c: "巴黎", tz: "Europe/Paris" }, { c: "伦敦", tz: "Europe/London" },
    { c: "拉各斯", tz: "Africa/Lagos" }, { c: "开罗", tz: "Africa/Cairo" },
    { c: "内罗毕", tz: "Africa/Nairobi" }, { c: "约翰内斯堡", tz: "Africa/Johannesburg" },
    { c: "圣保罗", tz: "America/Sao_Paulo" }, { c: "布宜诺斯艾利斯", tz: "America/Argentina/Buenos_Aires" },
    { c: "纽约", tz: "America/New_York" }, { c: "多伦多", tz: "America/Toronto" },
    { c: "芝加哥", tz: "America/Chicago" }, { c: "墨西哥城", tz: "America/Mexico_City" },
    { c: "丹佛", tz: "America/Denver" }, { c: "洛杉矶", tz: "America/Los_Angeles" },
    { c: "旧金山", tz: "America/Los_Angeles" }, { c: "温哥华", tz: "America/Vancouver" },
    { c: "檀香山", tz: "Pacific/Honolulu" }, { c: "奥克兰", tz: "Pacific/Auckland" },
    { c: "悉尼", tz: "Australia/Sydney" }, { c: "墨尔本", tz: "Australia/Melbourne" },
    { c: "珀斯", tz: "Australia/Perth" }, { c: "UTC", tz: "UTC" }
  ];

  function supportsZone(tz) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date()); return true; }
    catch (e) { return false; }
  }

  // Local clock parts of a UTC instant in a zone (hour 0-23).
  var fmtCache = {};
  function zoneHourFormatter(tz) {
    if (fmtCache[tz]) return fmtCache[tz];
    var dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", hour12: false, minute: "numeric"
    });
    fmtCache[tz] = function (ms) {
      var p = dtf.formatToParts(new Date(ms));
      var o = { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
      for (var i = 0; i < p.length; i++) {
        var t = p[i].type, v = p[i].value;
        if (t === "year") o.year = +v;
        else if (t === "month") o.month = +v;
        else if (t === "day") o.day = +v;
        else if (t === "hour") o.hour = +v % 24;
        else if (t === "minute") o.minute = +v;
      }
      return o;
    };
    return fmtCache[tz];
  }

  // The hour band for an instant: which local hour is it in a zone?
  // Returns the local wall-clock hour (int) of the hour containing `ms`.
  function localHourOf(tz, ms) {
    return zoneHourFormatter(tz)(ms).hour;
  }

  // Quality classification for a given local hour, with configurable bands.
  // 2 = prime (both ends inside), 1 = shoulder (edge stretch), 0 = bad, -1 = sleep.
  function hourQuality(localHour, bands) {
    bands = bands || DEFAULT_BANDS();
    if (localHour >= bands.workStart && localHour < bands.workEnd) return 2;
    if (localHour >= bands.softStart && localHour < bands.softEnd) return 1;
    if (localHour >= bands.nightStart || localHour < bands.nightEnd) return -1;
    return 0;
  }

  function DEFAULT_BANDS() {
    return { workStart: 9, workEnd: 18, softStart: 8, softEnd: 22, nightStart: 23, nightEnd: 7 };
  }

  // Score one hour slot across all zones. Returns:
  // { qualities: [..], score: sum, worst: min, label: "prime"|"ok"|"rough"|"impossible" }
  function scoreSlot(zones, ms, bands) {
    var qs = zones.map(function (tz) { return hourQuality(localHourOf(tz, ms), bands); });
    var sum = qs.reduce(function (a, b) { return a + b; }, 0);
    var worst = Math.min.apply(null, qs);
    var label;
    if (worst === -1) label = "impossible";       // someone is asleep
    else if (worst === 2) label = "prime";         // everyone in work hours
    else if (worst >= 1) label = "ok";             // no sleep, some stretch
    else label = "rough";                          // early/late for someone
    return { qualities: qs, score: sum, worst: worst, label: label };
  }

  // Build the day grid: 24 hour-slots for the reference date, scored.
  // anchorTz gives the "day" we display (slots are anchored to that zone's date).
  function dayGrid(zones, anchorTz, baseMs, bands) {
    bands = bands || DEFAULT_BANDS();
    // Midnight of anchor's local date → UTC instant; iterate 24 hours from it.
    var parts = zoneHourFormatter(anchorTz)(baseMs);
    // find UTC instant of anchor's midnight: bisect like yearpulse (cheap: probe-and-subtract)
    var guess = baseMs - ((parts.hour * 60 + parts.minute) * 60000);
    // refine: `guess` is right when anchor's local hour reads 0 (± DST edges)
    var slots = [];
    var q;
    for (var h = 0; h < 24; h++) {
      var ms = guess + h * 3600000;
      q = scoreSlot(zones, ms, bands);
      slots.push({
        anchorHour: localHourOf(anchorTz, ms),
        ms: ms,
        score: q.score,
        worst: q.worst,
        label: q.label,
        qualities: q.qualities
      });
    }
    return slots;
  }

  // Best consecutive runs (for a meeting of N hours): scan the grid.
  function bestRuns(slots, meetingHours) {
    meetingHours = meetingHours || 1;
    var runs = [];
    for (var i = 0; i + meetingHours <= slots.length; i++) {
      var worst = 2, sum = 0;
      for (var j = 0; j < meetingHours; j++) {
        worst = Math.min(worst, slots[i + j].worst);
        sum += slots[i + j].score;
      }
      runs.push({ start: i, worst: worst, sum: sum });
    }
    runs.sort(function (a, b) { return (b.worst - a.worst) || (b.sum - a.sum); });
    return runs;
  }

  // Format the same slot in every zone's wall clock (for the results table).
  function slotInZones(zones, ms) {
    return zones.map(function (tz) {
      var p = zoneHourFormatter(tz)(ms);
      return { tz: tz, hhmm: p.hour + ":" + (p.minute < 10 ? "0" : "") + p.minute,
               localDate: p.year + "-" + (p.month < 10 ? "0" : "") + p.month + "-" + (p.day < 10 ? "0" : "") + p.day };
    });
  }

  return {
    CITIES: CITIES,
    supportsZone: supportsZone,
    localHourOf: localHourOf,
    hourQuality: hourQuality,
    DEFAULT_BANDS: DEFAULT_BANDS,
    scoreSlot: scoreSlot,
    dayGrid: dayGrid,
    bestRuns: bestRuns,
    slotInZones: slotInZones
  };
});
