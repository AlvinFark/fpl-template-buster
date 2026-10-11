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

function TeamModal({ team, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const report = team.report
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <header className="team-header">
          <h2>
            {team.entryName}
            <small>{team.manager}</small>
          </h2>
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
  const push = (title, kind, rows, desc, emptyText) => {
    if (!rows.length) return
    const stat = { title, kind, rows, desc }
    if (emptyText && rows[0].sort <= 0) stat.empty = emptyText
    stats.push(stat)
  }

  // Highest average buy-time ownership across the latest squad.
  push(
    'Most Template',
    'shame',
    ok
      .map((t) => {
        const owned = t.report.gws.at(-1).picks.filter((p) => p.ownershipPct != null)
        if (!owned.length) return null
        const avg = owned.reduce((s, p) => s + p.ownershipPct, 0) / owned.length
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
        sort: t.report.gws.reduce(
          (s, g) => s + g.picks.filter((p) => p.counted && p.eligible).length,
          0
        ),
      }))
      .sort((a, b) => b.sort - a.sort)
      .map((r) => ({ ...r, value: `${r.sort} diff starts` })),
    'Most low-owned (<10% at buy) players actually played — trying differentials counts, even when they blank.'
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
              p.buyGw > 1 &&
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

  // Most bonus earned through the captain multiplier.
  push(
    'Boldest Armband',
    'good',
    ok
      .map((t) => ({
        label: t.entryName,
        sort: t.report.gws.reduce(
          (s, g) =>
            s + g.picks.filter((p) => p.multiplier > 1).reduce((s2, p) => s2 + p.bonus, 0),
          0
        ),
      }))
      .sort((a, b) => b.sort - a.sort)
      .map((r) => ({ ...r, value: `+${r.sort}` })),
    'Most bonus points earned through captain multipliers — bravest armband choices.',
    'everyone captained a template player'
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
      .map((o) => ({
        label: o.name,
        sort: o.teams.size,
        value: `${o.teams.size}/${ok.length} teams`,
      }))
      .sort((a, b) => b.sort - a.sort || a.label.localeCompare(b.label))
      .slice(0, 15),
    'Most-owned player across league squads — the template everyone copied.'
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
      .map((w) => ({ label: w.name, sort: w.bonus, value: `+${w.bonus} · ${w.team}` }))
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 15),
    'Best bonus earner while uniquely held — bonus only counts for GWs where one team owned the player.',
    'no unique gems — everyone shops at the same store'
  )

  // Rode the Wave: biggest ownership rise between buy-in and now (counted picks).
  const waveBest = new Map() // elementId -> {name, gap, buy, now, team}
  ok.forEach((t) => {
    for (const g of t.report.gws)
      for (const p of g.picks) {
        if (!p.counted || p.ownershipPct == null || p.nowOwn == null) continue
        const gap = p.nowOwn - p.ownershipPct
        const cur = waveBest.get(p.id)
        if (gap > 0 && (!cur || gap > cur.gap))
          waveBest.set(p.id, {
            name: p.name,
            gap,
            buy: p.ownershipPct,
            now: p.nowOwn,
            team: t.entryName,
          })
      }
  })
  push(
    'Rode the Wave',
    'player',
    [...waveBest.values()]
      .map((w) => ({
        label: w.name,
        sort: w.gap,
        value: `${w.buy}% → ${w.now}% · ${w.team}`,
      }))
      .sort((a, b) => b.sort - a.sort)
      .slice(0, 15),
    'Biggest ownership rise since buy-in — spotted before the bandwagon.',
    'no bandwagons caught — everyone bought late'
  )

  return stats
}

function StatModal({ stat, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
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
              <th>Team</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stat.rows.map((r, i) => (
              <tr key={r.label} className={i === 0 ? 'stat-winner' : ''}>
                <td>{i + 1}</td>
                <td>{r.label}</td>
                <td>{r.value}</td>
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

  async function load(e) {
    e?.preventDefault()
    if (!leagueId) return
    setLoading(true)
    setError(null)
    setLeague(null)
    setOpenTeam(null)
    setOpenStat(null)
    try {
      const res = await fetch(`/api/league/${leagueId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setLeague(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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
                <div className="stat-team">{s.empty ? 'Nobody' : s.rows[0].label}</div>
                <div className="stat-detail">{s.empty ?? s.rows[0].value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {openStat && <StatModal stat={openStat} onClose={() => setOpenStat(null)} />}

      {openTeam && <TeamModal team={openTeam} onClose={() => setOpenTeam(null)} />}

      <details className="methodology">
        <summary>How it's calculated</summary>
        <ul>
          <li>
            <strong>Scouting bonus (tiered):</strong> for every GW a player scores &gt;4 pts
            while on your team — +4 if bought at &lt;2% ownership, +3 at &lt;5%, +2 at
            &lt;10%. Multiplied by the captain multiplier.
          </li>
          <li>
            <strong>Ownership at buy:</strong> the FPL API only snapshots ownership at each GW
            deadline. We interpolate between the snapshots bracketing your transfer window,
            weighted by the exact transfer timestamp. Initial squad uses the GW1 snapshot.
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
