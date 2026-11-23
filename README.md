# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/weilejing923/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/weilejing923/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads the sealed DefiLlama snapshot, ranks every
rankable pre-token protocol by implied launch value, and renders a dark,
filterable dashboard with a detail view and a concrete 5-step farm plan
(capital, gas, time and hold period) for every protocol.

The model (radar-peer-4, in `lib/model.ts`) prices each protocol against
its own category: implied = TVL x peer multiple (the median market-cap/TVL
of live protocols in the same category, computed from the snapshot itself)
x growth (7-day TVL change, clamped, 0.55 weight) x maturity (years tracked
with no token on record, 3-year cap) x breadth (multi-chain reach, +15%
max). No protocol name is hard-coded. The peer pool holds live operating
protocols only — exchanges, bridges and staking wrappers never price
anyone, the same classes the board refuses to rank — and a category with
too few live peers falls back to the pool median; every row records which
basis priced it. The board covers all 40 watchlist protocols plus every
other rankable pre-token protocol (198 rows on the sealed snapshot);
live-token protocols are shown separately at market value and never
ranked. Press `/` to jump to search, `Esc` to close a detail view.

The dashboard has three views. The ranked board is the main one. The
**Movers** view re-sorts the same board by the snapshot's 7-day TVL move —
fastest inflow and fastest outflow side by side — and clicking a mover
opens it on the board with its full maths and farm plan. The **Airdrop
shortlist** view is the working top 20: the highest implied values, tagged
when a protocol is seasoned (a year or more tracked with no token on
record) or growing fast right now, each row opening the same five-step
farm plan inline.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

It writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to the output directory. Node 22.18+, standard library only,
no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=vbzqgky1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
