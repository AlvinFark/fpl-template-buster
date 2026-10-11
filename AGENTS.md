# FPL Template Buster

FPL alternate scoring: tiered "scouting bonus" (+4 <2%, +3 <5%, +2 <10%
ownership at buy-in) whenever a player scores >4 pts in a GW. Bonus is
multiplied by the captain multiplier; bench bonuses are shown separately as
missed points (they count only on Bench Boost GWs).

UI is league-based: input is a classic league ID (`GET /api/league/:id`),
rejected if >15 teams to bound API load. Each team's full report is computed
(`GET /api/report/:teamId`) and shown in a modal on row click. Live player
points come from `event/{gw}/live/` — they must ONLY be applied to the current
GW's rows (element-summary is the source for finished GWs).

## Requirements

- Node >= 18 (use nvm v22+: `export PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH`;
  system default node is v14 and too old for npm)

## Run

```sh
npm install && npm --prefix client install
npm run server   # Express API on :3001
npm run client   # Vite dev on :5173, proxies /api -> :3001
```

Production: `npm start` builds the client and serves it from the Express server.

## FPL API notes

- No official historical ownership endpoint; we approximate "ownership at buy"
  by linear interpolation: `element-summary/{id}` -> `history[].selected`
  snapshots exist only at each GW deadline, so we interpolate between the
  snapshots bracketing the transfer window using the exact `transfers[].time`
  timestamp. Initial-squad players use the GW1 snapshot. Denominator is
  `events[].ranked_count` (fallback `total_players`).
- `entry/{id}/transfers/` gives `element_in` + `event`; the latest transfer-in
  at or before a GW determines the buy GW. Players with no transfer record are
  treated as bought at GW1. Sell-and-rebuy churn is skipped: if a transfer-in
  at GW `e` happens while the player was already in the squad at `e-1`
  (wildcard/freehit reshuffles), the earlier buy record wins instead.
- `element-summary` history has one row per fixture — collapse DGWs by summing
  `total_points` and taking max `selected` per `round`.
- FPL API is rate-limited per-IP; `server/fpl.js` protects it with:
  persistent disk cache in `server/.cache/` (TTL per endpoint — finished-GW
  picks are cached forever, element-summary is time-fresh-checked for the
  current GW round, live is 60s), in-flight request dedup, a global 6-way
  concurrency cap, and 429/5xx retry with exponential backoff. `league.js`
  additionally caches whole league responses for 60s.
