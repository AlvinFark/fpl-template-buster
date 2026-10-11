import { api, mapLimit } from './fpl.js';

const BONUS_THRESHOLD = 4; // player GW points must be strictly greater
const BONUS_MAX = 4;
const BONUS_FLAT_UNTIL = 2; // % — full bonus at/below this ownership
const BONUS_ZERO_AT = 10; // % — decay reaches 0 here
const BONUS_P = 1; // decay exponent: 1 = linear, <1 generous, >1 punishing
export const BONUS_RULE = {
  scoreAbove: BONUS_THRESHOLD,
  max: BONUS_MAX,
  flatUntil: BONUS_FLAT_UNTIL,
  zeroAt: BONUS_ZERO_AT,
};

// Flat +4 up to 2% ownership, then smooth decay to 0 at 10% — no cliff.
// Rounded to nearest 0.5; halves stay exact so displayed sums stay clean.
function bonusFor(ownershipPct) {
  if (ownershipPct >= BONUS_ZERO_AT) return 0;
  if (ownershipPct <= BONUS_FLAT_UNTIL) return BONUS_MAX;
  const t = (BONUS_ZERO_AT - ownershipPct) / (BONUS_ZERO_AT - BONUS_FLAT_UNTIL);
  return Math.round(BONUS_MAX * Math.pow(t, BONUS_P) * 2) / 2;
}

// Ownership % at the moment of the transfer: linear interpolation between the
// deadline snapshots bracketing the transfer window, weighted by transfer time.
// Initial-squad players (no transfer record) use the GW1 snapshot.
function ownershipAtBuy(buy, buyGw, rounds, events, denom) {
  const selAt = (gw) => rounds?.get(gw)?.selected;
  // Initial squad (no transfer record) uses the snapshot of the GW the team
  // joined — GW1 for most, later for entries created mid-season.
  if (!buy || buyGw === 1) {
    const s = selAt(buyGw);
    return s == null ? null : (s / denom(buyGw)) * 100;
  }
  const selN = selAt(buy.event);
  const selPrev = selAt(buy.event - 1);
  const dN = Date.parse(events.get(buy.event)?.deadline_time ?? '');
  const dPrev = Date.parse(events.get(buy.event - 1)?.deadline_time ?? '');
  const t = Date.parse(buy.time ?? '');
  let selected = selN ?? selPrev;
  if (selN != null && selPrev != null && dN > dPrev && Number.isFinite(t)) {
    const frac = Math.min(1, Math.max(0, (t - dPrev) / (dN - dPrev)));
    selected = selPrev + frac * (selN - selPrev);
  }
  return selected == null ? null : (selected / denom(buyGw)) * 100;
}

export async function buildReport(teamId) {
  const [bootstrap, entry, transfers] = await Promise.all([
    api.bootstrap(),
    api.entry(teamId),
    api.transfers(teamId),
  ]);

  const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const events = new Map(bootstrap.events.map((e) => [e.id, e]));

  // GWs the team could have picks for: finished + currently-live events.
  const playedGws = bootstrap.events
    .filter((e) => e.finished || e.is_current)
    .map((e) => e.id);
  const currentGw = bootstrap.events.find((e) => e.is_current)?.id;

  // Live player points for the in-progress GW (element-summary lags).
  const livePoints = new Map();
  if (currentGw) {
    try {
      const live = await api.live(currentGw);
      for (const el of live.elements) livePoints.set(el.id, el.stats.total_points);
    } catch {
      /* live data unavailable */
    }
  }

  // Picks per played GW (skip GWs where picks are unavailable).
  const picksByGw = new Map();
  await mapLimit(playedGws, 4, async (gw) => {
    try {
      picksByGw.set(gw, await api.picks(teamId, gw, { finished: events.get(gw)?.finished }));
    } catch {
      /* GW not playable for this entry */
    }
  });

  // All transfer-ins per element, ascending by event. Each entry's `time` sits
  // inside the (deadline[event-1], deadline[event]] window, letting us
  // interpolate ownership between the two deadline snapshots.
  const transferIns = new Map();
  for (const t of transfers) {
    const list = transferIns.get(t.element_in) ?? [];
    list.push({ event: t.event, time: t.time });
    transferIns.set(t.element_in, list);
  }
  for (const list of transferIns.values()) list.sort((a, b) => a.event - b.event);

  const squadSets = new Map(
    [...picksByGw.entries()].map(([gw, d]) => [
      gw,
      new Set(d.picks.map((p) => p.element)),
    ])
  );
  const squadAt = (gw) => squadSets.get(gw);

  // Effective buy record for a pick: latest transfer-in <= gw, skipping
  // same-window sell-and-rebuy churn — if the player was already in the squad
  // the GW before the transfer (wildcard/freehit reshuffles), keep the earlier
  // buy instead of resetting ownership.
  function buyRecordFor(el, gw) {
    const list = transferIns.get(el);
    if (!list) return null;
    let idx = list.findLastIndex((t) => t.event <= gw);
    while (idx >= 0 && squadAt(list[idx].event - 1)?.has(el)) idx--;
    return idx >= 0 ? list[idx] : null;
  }

  // Unique players ever owned -> element summaries (per-round stats + ownership).
  const ownedIds = new Set(transfers.flatMap((t) => [t.element_in]));
  for (const p of picksByGw.values()) for (const pick of p.picks) ownedIds.add(pick.element);

  const summaries = new Map();
  await mapLimit([...ownedIds], 5, async (id) => {
    try {
      const s = await api.elementSummary(id, { currentGw });
      // Collapse per-fixture rows (DGWs) into per-round: sum points, keep selected.
      const byRound = new Map();
      for (const h of s.history) {
        const r = byRound.get(h.round) ?? { points: 0, selected: 0 };
        r.points += h.total_points;
        r.selected = Math.max(r.selected, h.selected ?? 0);
        byRound.set(h.round, r);
      }
      summaries.set(id, byRound);
    } catch {
      summaries.set(id, new Map());
    }
  });

  const denom = (gw) => events.get(gw)?.ranked_count || bootstrap.total_players;

  const gws = [...picksByGw.keys()].sort((a, b) => a - b).map((gw) => {
    const data = picksByGw.get(gw);
    const picks = data.picks.map((pick) => {
      const el = elements.get(pick.element);
      const round = summaries.get(pick.element)?.get(gw) ?? { points: 0, selected: 0 };
      const playerPoints =
        gw === currentGw ? (livePoints.get(pick.element) ?? round.points) : round.points;
      const buy = buyRecordFor(pick.element, gw);
      const buyGw = buy?.event ?? entry.started_event ?? 1;
      const buyRounds = summaries.get(pick.element);
      const ownershipPct = ownershipAtBuy(buy, buyGw, buyRounds, events, denom);
      const eligible = ownershipPct != null && bonusFor(ownershipPct) > 0;
      const onBench = pick.position > 11;
      // Bench Boost GWs: bench points count, so bench bonuses score too.
      const counted = pick.multiplier > 0 || data.active_chip === 'bboost';
      const mult = Math.max(pick.multiplier, 1); // bench bonus still gets flat x1
      const bonus =
        eligible && playerPoints > BONUS_THRESHOLD ? bonusFor(ownershipPct) * mult : 0;

      return {
        id: pick.element,
        name: el?.web_name ?? `#${pick.element}`,
        team: teams.get(el?.team)?.short_name ?? '',
        pos: ['', 'GKP', 'DEF', 'MID', 'FWD'][el?.element_type] ?? '',
        position: pick.position,
        onBench,
        counted,
        isCaptain: pick.is_captain,
        isViceCaptain: pick.is_vice_captain,
        multiplier: pick.multiplier,
        points: playerPoints,
        buyGw,
        isInitial: buy == null,
        justBought: buy != null && buy.event === gw,
        prevPts: summaries.get(pick.element)?.get(gw - 1)?.points ?? null,
        ownershipPct: ownershipPct == null ? null : +ownershipPct.toFixed(1),
        nowOwn: el ? +el.selected_by_percent : null,
        eligible,
        bonus,
      };
    });

    const bonusScored = picks.filter((p) => p.counted).reduce((s, p) => s + p.bonus, 0);
    const bonusMissed = picks.filter((p) => !p.counted).reduce((s, p) => s + p.bonus, 0);

    return {
      event: gw,
      chip: data.active_chip,
      live: !events.get(gw)?.finished,
      points: data.entry_history?.points ?? 0,
      transfersCost: data.entry_history?.event_transfers_cost ?? 0,
      pointsOnBench: data.entry_history?.points_on_bench ?? 0,
      bonusScored,
      bonusMissed,
      altPoints: (data.entry_history?.points ?? 0) + bonusScored,
      picks: picks.sort((a, b) => a.position - b.position),
    };
  });

  // Highest bonus-earning buy (counted bonuses only — bench-missed excluded).
  const bonusByPlayer = new Map();
  for (const g of gws) {
    for (const p of g.picks) {
      if (!p.bonus || !p.counted) continue;
      const cur = bonusByPlayer.get(p.id) ?? { name: p.name, bonus: 0 };
      cur.bonus += p.bonus;
      bonusByPlayer.set(p.id, cur);
    }
  }
  const topPick =
    [...bonusByPlayer.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.bonus - a.bonus)[0] ?? null;

  // Sold too early: players who left the squad, then hauled in a later GW while
  // their buy-in ownership was still low enough to have earned a bonus.
  const lastGwByEl = new Map(); // id -> {gw, own, name}
  for (const g of gws)
    for (const p of g.picks)
      lastGwByEl.set(p.id, { gw: g.event, own: p.ownershipPct, name: p.name });
  const soldEarly = [];
  for (const [id, info] of lastGwByEl) {
    const rounds = summaries.get(id);
    if (!rounds || info.own == null || bonusFor(info.own) <= 0) continue;
    // Free Hit rental: last squad GW was the FH and he wasn't owned before it —
    // he was never staying, so leaving isn't a sale.
    if (
      picksByGw.get(info.gw)?.active_chip === 'freehit' &&
      !squadAt(info.gw - 1)?.has(id)
    )
      continue;
    const later = [...rounds.entries()].sort((a, b) => a[0] - b[0]);
    for (const [round, r] of later) {
      // A haul during a FH GW doesn't count if the player was in the squad the
      // GW before — that absence is the FH blip, not a real sale. (Permanently
      // sold players are absent the prior GW too, so they still flag.)
      const fhBlip =
        picksByGw.get(round)?.active_chip === 'freehit' && squadAt(round - 1)?.has(id);
      if (round > info.gw && !fhBlip && r.points > BONUS_THRESHOLD) {
        soldEarly.push({
          id,
          name: info.name,
          soldAfter: info.gw,
          hauled: round,
          points: r.points,
          own: info.own,
        });
        break;
      }
    }
  }

  return {
    topPick,
    soldEarly,
    team: {
      id: entry.id,
      name: entry.name,
      manager: `${entry.player_first_name} ${entry.player_last_name}`,
      startedEvent: entry.started_event,
    },
    bonusRule: BONUS_RULE,
    totals: {
      points: gws.reduce((s, g) => s + g.points, 0),
      bonusScored: gws.reduce((s, g) => s + g.bonusScored, 0),
      bonusMissed: gws.reduce((s, g) => s + g.bonusMissed, 0),
      altPoints: gws.reduce((s, g) => s + g.altPoints, 0),
    },
    gws,
  };
}
