import { useEffect, useState } from 'react'
import './App.css'

function chipLabel(chip) {
  return { '3xc': 'TC', bboost: 'BB', freehit: 'FH', wildcard: 'WC' }[chip] ?? chip
}

function GwTable({ gw, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="gw">
      <header className="gw-header" onClick={() => setOpen((o) => !o)}>
        <span className={`chevron ${open ? 'open' : ''}`}>▸</span>
        <h2>GW {gw.event}</h2>
        {gw.live && <span className="chip live">LIVE</span>}
        {gw.chip && <span className="chip">{chipLabel(gw.chip)}</span>}
        <div className="gw-summary">
          <span>Pts {gw.points}</span>
          {gw.transfersCost < 0 && <span className="hit">({gw.transfersCost})</span>}
          <span className="bonus">+{gw.bonusScored} bonus</span>
          {gw.bonusMissed > 0 && <span className="missed">+{gw.bonusMissed} on bench</span>}
          <strong>Alt {gw.altPoints}</strong>
        </div>
      </header>
      {open && (
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Pos</th>
            <th>Pts</th>
            <th>Bought</th>
            <th>Own %@buy</th>
            <th>Now</th>
            <th>Bonus</th>
          </tr>
        </thead>
        <tbody>
          {gw.picks.map((p) => (
            <tr key={p.id} className={p.onBench ? 'bench' : ''}>
              <td>
                {p.name}
                {p.isCaptain && <span className="tag cap">C</span>}
                {p.isViceCaptain && <span className="tag">V</span>}
                {p.onBench && <span className="tag">B{p.position - 11}</span>}
              </td>
              <td>{p.pos}</td>
              <td>{p.points}</td>
              <td>GW{p.buyGw}</td>
              <td className={p.eligible ? 'diff' : ''}>
                {p.ownershipPct == null ? '—' : `${p.ownershipPct}%`}
              </td>
              <td className="now-own">{p.nowOwn == null ? '—' : `${p.nowOwn}%`}</td>
              <td className={p.bonus ? (p.counted ? 'bonus' : 'missed') : ''}>
                {p.bonus ? `+${p.bonus}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </section>
  )
}

// Per-team flavor badge from their differential profile.
function teamTitle(t) {
  const r = t.report
  if (!r) return null
  let diff = 0,
    n = 0
  for (const g of r.gws)
    for (const p of g.picks) {
      if (!p.counted) continue
      n++
      if (p.eligible) diff++
    }
  const ratio = n ? diff / n : 0
  const bonus = r.totals.bonusScored
  if (diff === 0) return { label: 'Photocopier', kind: 'shame' }
  if (ratio >= 0.4) return { label: 'Certified Hipster', kind: 'good' }
  if (ratio >= 0.15) return { label: 'Indie Scout', kind: 'good' }
  if (bonus >= 8) return { label: 'One-Punt Wonder', kind: 'good' }
  if (bonus === 0) return { label: 'Unlucky Punk', kind: 'shame' }
  return { label: 'Template Adjacent', kind: '' }
}

// Avg buy-in ownership of the latest squad — the team's template index.
function templatePct(t) {
  const picks = t.report?.gws.at(-1)?.picks.filter((p) => p.ownershipPct != null)
  if (!picks?.length) return null
  return picks.reduce((s, p) => s + p.ownershipPct, 0) / picks.length
}

// Differential buys actually played (bonus-eligible), across all GWs.
function diffStarts(t) {
  return (
    t.report?.gws.reduce(
      (s, g) => s + g.picks.filter((p) => p.counted && p.eligible).length,
      0
    ) ?? 0
  )
}

// Share of played picks that were differential buys — fairer across teams that
// joined mid-season (fewer GWs = fewer raw starts).
function diffShare(t) {
  const r = t.report
  if (!r) return null
  let n = 0
  for (const g of r.gws) for (const p of g.picks) if (p.counted) n++
  return n ? diffStarts(t) / n : null
}

// Pair of teams sharing the most players in their latest squads. `later` counts
// shared players this team bought in a later GW — the likely copier's trail.
function doppelganger(team, teams) {
  const myMap = new Map(team.report?.gws.at(-1)?.picks.map((p) => [p.id, p]) ?? [])
  if (!myMap.size) return null
  let best = null
  for (const o of teams) {
    if (o === team || !o.report) continue
    const theirMap = new Map(o.report.gws.at(-1)?.picks.map((p) => [p.id, p]) ?? [])
    let shared = 0,
      later = 0,
      earlier = 0
    for (const [id, p] of myMap) {
      const q = theirMap.get(id)
      if (!q) continue
      shared++
      if (p.buyGw > q.buyGw) later++
      else if (p.buyGw < q.buyGw) earlier++
    }
    if (!best || shared > best.shared)
      best = { name: o.entryName, shared, of: myMap.size, later, earlier }
  }
  return best
}

function TeamModal({ team, teams, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const report = team.report
  const twin = doppelganger(team, teams)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <header className="team-header">
          <div>
            <h2>
              {team.entryName}
              <small>{team.manager}</small>
            </h2>
            {twin && (
              <p className="doppel">
                Doppelgänger: {twin.name} — {twin.shared}/{twin.of} players shared
                {twin.later > twin.earlier
                  ? ` · you bought ${twin.later} of them later`
                  : twin.earlier > twin.later
                    ? ` · they bought ${twin.earlier} of them later`
                    : ''}
              </p>
            )}
          </div>
          {report && (
            <div className="totals">
              <span>Official {report.totals.points}</span>
              <span className="bonus">+{report.totals.bonusScored}</span>
              <strong>Alt {report.totals.altPoints}</strong>
              {report.totals.bonusMissed > 0 && (
                <span className="missed">+{report.totals.bonusMissed} missed</span>
              )}
            </div>
          )}
        </header>
        {team.error && <p className="error">Failed to load: {team.error}</p>}
        {report &&
          [...report.gws]
            .reverse()
            .map((gw, i) => <GwTable key={gw.event} gw={gw} defaultOpen={i === 0} />)}
      </div>
    </div>
  )
}

// Each stat is a full sorted leaderboard: rows[0] is the "winner" shown on the
// card; clicking the card opens the full ranking.
function funStats(teams) {
  const ok = teams.filter((t) => t.report?.gws.length)
  if (!ok.length) return []
  const stats = []
  const push = (title, kind, rows, desc, emptyText, headers) => {
    if (!rows.length) return
    const stat = { title, kind, rows, desc, headers }
    if (emptyText && rows[0].sort <= 0) stat.empty = emptyText
    stats.push(stat)
  }

  // Highest average buy-time ownership across the latest squad.
  push(
    'Most Template',
    'shame',
    ok
      .map((t) => {
        const avg = templatePct(t)
        if (avg == null) return null
        return { label: t.entryName, sort: avg, value: `${avg.toFixed(1)}%` }
      })
      .filter(Boolean)
      .sort((a, b) => b.sort - a.sort),
    'Average buy-time ownership across the current squad — highest = biggest herd follower.'
  )

  // Most differential starts: low-owned buys actually played, successful or not.
  push(
    'Template Buster',
    'good',
    ok
      .map((t) => ({
        label: t.entryName,
        sort: diffShare(t) ?? 0,
        value: `${diffStarts(t)} starts · ${Math.round((diffShare(t) ?? 0) * 100)}%`,
      }))
      .sort((a, b) => b.sort - a.sort),
    'Highest share of played picks that were low-owned (<10% at buy) — trying differentials counts, even when they blank.'
  )

  // Most total bonus earned.
  push(
    'Scout Master',
    'good',
    ok
      .map((t) => ({
        label: t.entryName,
        sort: t.report.totals.bonusScored,
        value: `+${t.report.totals.bonusScored}`,
      }))
      .sort((a, b) => b.sort - a.sort),
    'Most scouting bonus points earned from low-owned buys.',
    'nobody scouted a differential — pure template league'
  )

  // Biggest single-GW bonus haul.
  push(
    'Heist of the Season',
    'good',
    ok
      .map((t) => {
        let best = { bonus: 0, gw: null }
        for (const g of t.report.gws)
          if (g.bonusScored > best.bonus) best = { bonus: g.bonusScored, gw: g.event }
        return {
          label: t.entryName,
          sort: best.bonus,
          value: `+${best.bonus}${best.gw ? ` in GW${best.gw}` : ''}`,
        }
      })
      .sort((a, b) => b.sort - a.sort),
    'Biggest bonus haul in a single gameweek — the GW that broke the table.',
    'no heists yet — the differentials are still loading'
  )

  // Bonus earned per differential buy — precision over volume. Requires at
  // least 3 differential buys so one lucky punt on a template team can't win.
  const zeroAt = ok[0]?.report?.bonusRule?.zeroAt ?? 10
  push(
    'Dead-Eye',
    'good',
    ok
      .map((t) => {
        const buys = new Set()
        for (const g of t.report.gws)
          for (const p of g.picks)
            if (p.counted && p.ownershipPct != null && p.ownershipPct < zeroAt)
              buys.add(p.id)
        if (buys.size < 5) return null
        const eff = t.report.totals.bonusScored / buys.size
        return {
          label: t.entryName,
          sort: eff,
          value: `+${eff.toFixed(1)}/buy over ${buys.size}`,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.sort - a.sort),
    'Bonus points per differential buy (min. 5 buys) — scouting consistency, not one lucky punt.',
    'nobody made 5+ differential buys — pure template league'
  )

  // Shame award: biggest bandwagon buy (highest buy-in ownership played).
  push(
    'Template Traitor',
    'shame',
    ok
      .map((t) => {
        let worst = null
        for (const g of t.report.gws)
          for (const p of g.picks)
            if (
              p.counted &&
              !p.isInitial &&
              p.ownershipPct != null &&
              (!worst || p.ownershipPct > worst.ownershipPct)
            )
              worst = p
        return worst
          ? { label: t.entryName, sort: worst.ownershipPct, value: `${worst.name} ${worst.ownershipPct}%` }
          : null
      })
      .filter(Boolean)
      .sort((a, b) => b.sort - a.sort),
    'Highest-ownership transfer actually played — the biggest bandwagon anyone bought into (initial squad excluded).'
  )

  // Each team's lowest-ownership buy among players who actually played.
  push(
    'Deepest Cut',
    'good',
    ok
      .map((t) => {
        let best = null
        for (const g of t.report.gws)
          for (const p of g.picks)
            if (p.counted && p.ownershipPct != null && (!best || p.ownershipPct < best.ownershipPct))
              best = p
        return best
          ? {
              label: t.entryName,
              sort: best.ownershipPct,
              value: `${best.name} ${best.ownershipPct}%`,
            }
          : null
      })
      .filter(Boolean)
      .sort((a, b) => a.sort - b.sort),
    'Lowest buy-time ownership among players who actually featured — the deepest differential.'
  )

  // Most bonus left on the bench.
  push(
    'Bench Regret',
    'shame',
    ok
      .map((t) => ({
        label: t.entryName,
        sort: t.report.totals.bonusMissed,
        value: `+${t.report.totals.bonusMissed}`,
      }))
      .sort((a, b) => b.sort - a.sort),
    'Most bonus points left on the bench — good finds, bad lineup.',
    'either perfect lineups… or nobody owns a differential worth benching'
  )

  // Most bonus earned through the captain multiplier — with the actual calls.
  push(
    'Boldest Armband',
    'good',
    ok
      .map((t) => {
        const calls = []
        for (const g of t.report.gws)
          for (const p of g.picks)
            if (p.multiplier > 1 && p.bonus > 0)
              calls.push({ name: p.name, gw: g.event, bonus: p.bonus })
        const callsDesc = calls.sort((a, b) => b.bonus - a.bonus)
        return {
          label: t.entryName,
          sort: calls.reduce((s, c) => s + c.bonus, 0),
          cardValue: callsDesc[0]
            ? `${callsDesc[0].name} GW${callsDesc[0].gw} (+${callsDesc[0].bonus})`
            : undefined,
          extra: callsDesc
            .map((c) => `${c.name} GW${c.gw} (+${c.bonus})`)
            .join(', '),
        }
      })
      .sort((a, b) => b.sort - a.sort)
      .map((r) => ({ ...r, value: `+${r.sort}` })),
    'Most bonus points earned through captain multipliers — bravest armband choices.',
    'everyone captained a template player',
    { extra: 'Armband calls' }
  )

  // --- player stats: build league-wide ownership from latest squads ---
  const owners = new Map() // elementId -> {name, teams:Set}
  ok.forEach((t, i) => {
    for (const p of t.report.gws.at(-1).picks) {
      const o = owners.get(p.id) ?? { name: p.name, teams: new Set() }
      o.teams.add(i)
      owners.set(p.id, o)
    }
  })

  // Most-owned player across league squads.
  push(
    'League Template',
    'player',
    [...owners.values()]
      .map((o) => {
        const hipsters = ok
          .filter((_, i) => !o.teams.has(i))
          .map((t) => t.entryName)
        return {
          label: o.name,
          sort: o.teams.size,
          value: `${o.teams.size}/${ok.length} teams`,
          extra:
            hipsters.length === 0
              ? '—'
              : hipsters.length < 4
                ? hipsters.join(', ')
                : `${hipsters.length} teams`,
        }
      })
      .sort((a, b) => b.sort - a.sort || a.label.localeCompare(b.label))
      .slice(0, 15),
    'Most-owned player across league squads — the template everyone copied.',
    undefined,
    { extra: 'Not owned by' }
  )

  // Lone Wolf: per-GW uniqueness — a player's bonus counts only for GWs where
  // exactly one team in the league held them (regardless of current ownership).
  const gwOwners = new Map() // event -> Map<elementId, Set<teamIdx>>
  ok.forEach((t, i) => {
    for (const g of t.report.gws) {
      const m = gwOwners.get(g.event) ?? new Map()
      for (const p of g.picks) {
        const s = m.get(p.id) ?? new Set()
        s.add(i)
        m.set(p.id, s)
      }
      gwOwners.set(g.event, m)
    }
  })
  const wolfBonus = new Map() // elementId -> {name, bonus, team}
  ok.forEach((t, i) => {
    for (const g of t.report.gws) {
      const m = gwOwners.get(g.event)
      for (const p of g.picks) {
        if (!p.counted || !p.bonus || m.get(p.id)?.size !== 1) continue
        const cur = wolfBonus.get(p.id) ?? { name: p.name, bonus: 0, team: t.entryName }
        cur.bonus += p.bonus
        wolfBonus.set(p.id, cur)
      }
    }
  })
  push(
    'Lone Wolf',
    'player',
    [...wolfBonus.values()]
      .map((w) => ({ label: w.team, sort: w.bonus, value: `${w.name} +${w.bonus}` }))
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 15),
    'Best bonus earner while uniquely held — bonus only counts for GWs where one team owned the player.',
    'no unique gems — everyone shops at the same store'
  )

  // Rode the Wave: biggest ownership rise between buy-in and now (counted picks).
  // Keyed per team so two teams that both bought a riser each get their own row.
  const waveBest = new Map() // `${teamIdx}-${elementId}` -> {name, gap, buy, now, team}
  ok.forEach((t, ti) => {
    for (const g of t.report.gws)
      for (const p of g.picks) {
        if (!p.counted || p.ownershipPct == null || p.nowOwn == null) continue
        const gap = p.nowOwn - p.ownershipPct
        const key = `${ti}-${p.id}`
        const cur = waveBest.get(key)
        if (gap > 0 && (!cur || gap > cur.gap))
          waveBest.set(key, {
            name: p.name,
            gap,
            buy: p.ownershipPct,
            now: p.nowOwn,
            team: t.entryName,
          })
      }
  })
  // Merge identical rows: same player bought at the same price by several
  // teams (e.g. GW1 draft picks) collapses into one row listing them all.
  const mergeWaves = (map) =>
    Object.values(
      [...map.values()].reduce((acc, w) => {
        const k = `${w.name}|${w.buy}|${w.now}`
        const cur = acc[k] ?? { ...w, teams: [] }
        cur.teams.push(w.team)
        acc[k] = cur
        return acc
      }, {})
    )
  push(
    'Rode the Wave',
    'good',
    mergeWaves(waveBest)
      .map((w) => ({
        label: w.name,
        sort: w.buy > 0 ? w.now / w.buy : w.now,
        value:
          w.teams.length > 1
            ? `${w.teams[0]} and ${w.teams.length - 1} others`
            : w.teams[0],
        valueTip: w.teams.length > 1 ? w.teams : null,
        extra: `${w.buy}% → ${w.now}%`,
        cardLabel: w.teams[0],
        cardValue: `${w.name} ${w.buy}% → ${w.now}%`,
      }))
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 15),
    'Biggest ownership rise since buy-in — spotted before the bandwagon.',
    'no bandwagons caught — everyone bought late',
    { label: 'Player', value: 'Teams', extra: 'Rise' }
  )

  // Bag Holder: biggest ownership drop since buy-in — bought the hype,
  // watched everyone else sell.
  const holderBest = new Map() // `${teamIdx}-${elementId}` -> {name, drop, buy, now, team}
  ok.forEach((t, ti) => {
    for (const g of t.report.gws)
      for (const p of g.picks) {
        if (!p.counted || p.ownershipPct == null || p.nowOwn == null) continue
        const drop = p.ownershipPct - p.nowOwn
        const key = `${ti}-${p.id}`
        const cur = holderBest.get(key)
        if (drop > 0 && (!cur || drop > cur.drop))
          holderBest.set(key, {
            name: p.name,
            drop,
            buy: p.ownershipPct,
            now: p.nowOwn,
            team: t.entryName,
          })
      }
  })
  push(
    'Bag Holder',
    'shame',
    mergeWaves(holderBest)
      .map((w) => ({
        label: w.name,
        sort: w.now > 0 ? w.buy / w.now : w.buy,
        value:
          w.teams.length > 1
            ? `${w.teams[0]} and ${w.teams.length - 1} others`
            : w.teams[0],
        valueTip: w.teams.length > 1 ? w.teams : null,
        extra: `${w.buy}% → ${w.now}%`,
        cardLabel: w.teams[0],
        cardValue: `${w.name} ${w.buy}% → ${w.now}%`,
      }))
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 15),
    'Biggest ownership drop since buy-in — bought the hype, left holding the bag.',
    'everyone held through the hype — for better or worse',
    { label: 'Player', value: 'Teams', extra: 'Fall' }
  )

  // Bandwagon Jumper: bought a player the GW right after his big haul,
  // grouped per team — who chased, which players, how many and when.
  push(
    'Bandwagon Jumper',
    'shame',
    ok
      .map((t) => {
        const jumps = []
        for (const g of t.report.gws)
          for (const p of g.picks)
            if (p.justBought && p.prevPts != null && p.prevPts >= 10)
              jumps.push({ name: p.name, gw: g.event, prevPts: p.prevPts })
        if (!jumps.length) return null
        return {
          label: t.entryName,
          sort: jumps.length,
          value: jumps.map((j) => j.name).join(', '),
          valueTip: jumps.map(
            (j) => `${j.name} — ${j.prevPts} pts in GW${j.gw - 1}, bought GW${j.gw}`
          ),
          cardValue: `${jumps.length} chased buys`,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 15),
    'Bought a player the week right after his big haul — chasing yesterday\'s points.',
    'nobody chased last week\'s haul — disciplined or lucky',
    { label: 'Team', value: 'Chased buys' }
  )

  // Sold Too Early: sold a differential who then hauled while still low-owned.
  push(
    'Sold Too Early',
    'shame',
    ok
      .flatMap((t) =>
        (t.report.soldEarly ?? []).map((s) => ({
          label: t.entryName,
          sort: s.points,
          value: `${s.name} · ${s.points} pts in GW${s.hauled} after sale`,
        }))
      )
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 15),
    'Sold a differential right before he hauled — his buy-in ownership still qualified.',
    'nobody sold a future hauler — diamond hands'
  )

  // Doppelgängers: rank the likely copiers — whoever bought more of the shared
  // players later than the other team.
  const pairs = []
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const twin = doppelganger(ok[i], [ok[j]])
      if (!twin) continue
      const copier =
        twin.later > twin.earlier ? ok[i] : twin.earlier > twin.later ? ok[j] : null
      const copyee = copier === ok[i] ? ok[j] : copier === ok[j] ? ok[i] : null
      pairs.push({
        label: copier?.entryName ?? `${ok[i].entryName} & ${ok[j].entryName}`,
        sort: twin.shared,
        value: `${twin.shared}/${twin.of} shared`,
        extra: copyee
          ? `${copyee.entryName} · ${Math.max(twin.later, twin.earlier)} bought later`
          : 'mutual — same timing',
      })
    }
  }
  push(
    'Doppelgängers',
    'shame',
    pairs.sort((a, b) => b.sort - a.sort).slice(0, 15),
    'Teams with near-identical squads — whoever bought shared players later is the likely copier.',
    undefined,
    { extra: 'Copied from' }
  )

  // Wall of shame first, then honours, then neutral player stats.
  const kindOrder = { shame: 0, good: 1, player: 2 }
  return stats.sort((a, b) => (kindOrder[a.kind] ?? 3) - (kindOrder[b.kind] ?? 3))
}

// Fixed-position tooltip — escapes the modal's scroll container, flips up when
// near the viewport bottom.
function Tip({ text, lines }) {
  const [pos, setPos] = useState(null)
  return (
    <span
      className="tip"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const h = lines.length * 18 + 14
        const w = 220
        setPos({
          left: Math.min(r.left, window.innerWidth - w - 8),
          top: r.bottom + 4 + h < window.innerHeight ? r.bottom + 4 : r.top - h - 4,
        })
      }}
      onMouseLeave={() => setPos(null)}
    >
      {text}
      {pos && (
        <span className="tip-body" style={{ top: pos.top, left: pos.left }}>
          {lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </span>
      )}
    </span>
  )
}

function StatModal({ stat, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${stat.headers ? 'modal-wide' : 'modal-narrow'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="stat-modal-title">{stat.title}</h2>
        <p className="stat-desc">{stat.desc}</p>
        {stat.empty ? (
          <p className="stat-empty">{stat.empty}</p>
        ) : (
        <table className="league-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{stat.headers?.label ?? 'Team'}</th>
              <th>{stat.headers?.value ?? ''}</th>
              {stat.headers?.extra && <th>{stat.headers.extra}</th>}
            </tr>
          </thead>
          <tbody>
            {stat.rows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className={i === 0 ? 'stat-winner' : ''}>
                <td>{i + 1}</td>
                <td>{r.label}</td>
                <td>
                  {r.valueTip?.length ? <Tip text={r.value} lines={r.valueTip} /> : r.value}
                </td>
                {stat.headers?.extra && <td>{r.extra}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  )
}

function rankDelta(team) {
  const d = team.rank - team.altRank // positive = climbed
  if (d > 0) return <span className="delta up">▲{d}</span>
  if (d < 0) return <span className="delta down">▼{-d}</span>
  return <span className="delta">–</span>
}

function App() {
  const [leagueId, setLeagueId] = useState('')
  const [league, setLeague] = useState(null)
  const [openTeam, setOpenTeam] = useState(null)
  const [openStat, setOpenStat] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function load(e, id = leagueId) {
    e?.preventDefault()
    if (!id) return
    setLoading(true)
    setError(null)
    setLeague(null)
    setOpenTeam(null)
    setOpenStat(null)
    try {
      const res = await fetch(`/api/league/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setLeague(data)
      history.pushState(null, '', `?league=${id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ?league=<id> deep link — auto-load on open and on back/forward.
  useEffect(() => {
    const fromUrl = () => {
      const id = new URLSearchParams(location.search).get('league')
      if (id) {
        setLeagueId(id)
        load(null, id)
      } else {
        setLeague(null)
      }
    }
    fromUrl()
    window.addEventListener('popstate', fromUrl)
    return () => window.removeEventListener('popstate', fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main>
      <h1>FPL Template Buster</h1>
      <p className="tagline">
      </p>
      <form onSubmit={load}>
        <input
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value.replace(/\D/g, ''))}
          placeholder="League ID (e.g. 5515)"
          inputMode="numeric"
        />
        <button disabled={loading || !leagueId}>
          {loading ? 'Loading…' : 'Calculate'}
        </button>
        <p className="rule">
          Classic league ID, max 25 teams — re-ranks by official pts + scouting
          bonuses for low-owned buys. Click a team for its per-GW breakdown.
        </p>
      </form>

      {error && <p className="error">{error}</p>}

      {league && (
        <>
          <header className="team-header">
            <h2>
              {league.league.name}
              <small>classic league · {league.teams.length} teams</small>
            </h2>
          </header>
          <table className="league-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th title="Avg buy-in ownership of current squad">Template %</th>
                <th title="Differential buys actually played">Diffs</th>
                <th>Official</th>
                <th>Bonus</th>
                <th>Alt Pts</th>
                <th>Top Scout</th>
                <th>Δ Rank</th>
              </tr>
            </thead>
            <tbody>
              {league.teams.map((t) => (
                <tr key={t.entry} className="league-row" onClick={() => setOpenTeam(t)}>
                  <td>
                    {t.altRank}
                    <small className="old-rank"> (was {t.rank})</small>
                  </td>
                  <td>
                    <strong>{t.entryName}</strong>
                    <small className="old-rank"> {t.manager}</small>
                    {teamTitle(t) && (
                      <span className={`title-badge ${teamTitle(t).kind}`}>
                        {teamTitle(t).label}
                      </span>
                    )}
                  </td>
                  <td>{templatePct(t)?.toFixed(1) ?? '—'}%</td>
                  <td title="Share of played picks that were low-owned buys">
                    {t.report ? `${diffStarts(t)} (${Math.round((diffShare(t) ?? 0) * 100)}%)` : '—'}
                  </td>
                  <td>{t.official}</td>
                  <td className="bonus">
                    {t.report ? `+${t.report.totals.bonusScored}` : '—'}
                  </td>
                  <td>
                    <strong>{t.report?.totals.altPoints ?? t.official}</strong>
                    {t.error && <span className="error"> err</span>}
                  </td>
                  <td className="diff">
                    {t.report?.topPick
                      ? `${t.report.topPick.name} (+${t.report.topPick.bonus})`
                      : '—'}
                  </td>
                  <td>{rankDelta(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fun-stats">
            {funStats(league.teams).map((s) => (
              <div
                className={`stat-card clickable ${s.kind}`}
                key={s.title}
                title={s.desc}
                onClick={() => setOpenStat(s)}
              >
                <div className="stat-title">{s.title}</div>
                <div className="stat-team">
                  {s.empty ? 'Nobody' : (s.rows[0].cardLabel ?? s.rows[0].label)}
                </div>
                <div className="stat-detail">
                  {s.empty ?? s.rows[0].cardValue ?? s.rows[0].value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {openStat && <StatModal stat={openStat} onClose={() => setOpenStat(null)} />}

      {openTeam && (
        <TeamModal team={openTeam} teams={league.teams} onClose={() => setOpenTeam(null)} />
      )}

      <details className="methodology">
        <summary>How it's calculated</summary>
        <ul>
          <li>
            <strong>Scouting bonus (curve):</strong> for every GW a player scores &gt;4 pts
            while on your team — +4 if bought at ≤2% ownership, then decays linearly
            to 0 at 10%. Multiplied by the captain multiplier.
          </li>
          <li>
            <strong>Ownership at buy:</strong> the FPL API only snapshots ownership at each GW
            deadline. We interpolate between the snapshots bracketing your transfer window,
            weighted by the exact transfer timestamp. Initial squad uses the
            snapshot of the GW the team joined.
          </li>
          <li>
            <strong>Ownership %</strong> = selected ÷ teams ranked in that GW.
          </li>
          <li>
            <strong>Bonus counting:</strong> only players whose points counted (starting XI +
            auto-subs) add to the alternate score. Bench bonuses are shown separately as
            "missed" points.
          </li>
          <li>
            <strong>Live GWs:</strong> player points come from the live endpoint; ownership and
            totals update as matches play.
          </li>
        </ul>
        <ul>
          <li>
            <strong>Wildcard / Free Hit:</strong> each signing is evaluated at its own transfer
            timestamp, same as normal transfers. Free Hit buys only last one GW — they get the
            bonus that GW, then revert (returning players keep their original buy ownership).
          </li>
          <li>
            <strong>Bench Boost:</strong> bench points count, so bench bonuses count toward the
            alternate score instead of showing as missed.
          </li>
          <li>
            <strong>Triple Captain:</strong> the +2 bonus triples to +6, same as the points
            multiplier.
          </li>
          <li>
            <strong>Auto-subs:</strong> a subbed-on player's bonus counts (their points count).
          </li>
          <li>
            <strong>Data:</strong> unofficial FPL API (fantasy.premierleague.com). Approximate —
            real buy-time ownership isn't published.
          </li>
        </ul>
      </details>
    </main>
  )
}

export default App
