# meetzones

**三时区会议排期 / Find the best meeting time across time zones / 多時間帯の会議時間** — pick up to five cities, see the whole day colour-coded (who's at work, who's stretching, who's asleep), and get the best meeting windows in everyone's own wall clock. Free, no ads, no tracking, no upload.

> **中文** — 免费跨时区会议排期:选 2-5 个城市,一天 24 小时逐格标色(绿=全员工作时间内/黄=有人早或晚/灰=有人在睡觉),会议时长与工作时段可调,结果按每人本地钟面列出,一键复制分享链接(?tz= 参数,别人打开看到同一张表)。无广告无追踪,全程浏览器本地计算。**[立即使用](https://w1977-0.github.io/meetzones/)**
>
> **English** — An ad-free alternative to timeanddate.com's meeting planner: pick cities (36 presets, any IANA zone), see a 24-hour colour grid scored per participant (prime / acceptable / asleep), adjustable work bands and meeting length, results rendered in every participant's local clock, shareable via URL. Everything runs in your browser — zero requests after load. **[Try it](https://w1977-0.github.io/meetzones/)**
>
> **日本語** — 複数都市の会議時間を色分けグリッドで表示、広告なし・アップロード不要。**[使ってみる](https://w1977-0.github.io/meetzones/)**

## Why

The incumbent (timeanddate.com) is excellent — and ad-supported, tracker-laden, and increasingly hostile to non-browser clients (403). On the open-source side, every "meeting timezone" project we surveyed is a <5-star draft. There was no quality free-as-in-freedom option. Same gap, same recipe as our other tools: one HTML file, zero dependencies, zero post-load requests.

## How it works

```
zones → for each hour of the anchor city's day:
          score every zone's local hour (work 2 / shoulder 1 / edge 0 / sleep −1)
        → colour the grid by the WORST participant (a slot is only as good as its sleepiest person)
        → best consecutive runs for the chosen meeting length, ranked
        → render each slot in every participant's own wall clock
```

The timezone engine reads the platform IANA database through `Intl` (the same UTC-arithmetic discipline as [yearpulse](https://github.com/w1977-0/yearpulse)) — DST and half-hour zones (Kolkata, Adelaide) are absorbed by construction, and UTC+14/−11 extremes are covered by tests.

`meetmath.js` is the pure-function core; `test/meetmath.test.js` pins it with Node's built-in runner:

```
node --test test/meetmath.test.js
```

11 tests: zone validity for all preset cities, known-instant local hours (UTC±14/−11), band classification, pair scoring (Shanghai+London has a prime overlap; Shanghai+New York provably cannot), grid ordering, best-run ranking, and per-zone wall-clock rendering with correct date rolls.

## License

MIT
