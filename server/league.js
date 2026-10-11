import { api, mapLimit } from './fpl.js';
import { buildReport, BONUS_RULE } from './report.js';

const MAX_TEAMS = 25;
const LEAGUE_TTL = 60 * 1000;
const leagueCache = new Map(); // id -> {at, data}

export async function buildLeague(leagueId) {
  const hit = leagueCache.get(leagueId);
  if (hit && Date.now() - hit.at < LEAGUE_TTL) return hit.data;
  const data = await buildLeagueUncached(leagueId);
  leagueCache.set(leagueId, { at: Date.now(), data });
  return data;
}

async function buildLeagueUncached(leagueId) {
  const standings = await api.leagueStandings(leagueId);
  const results = standings.standings?.results ?? [];

  if (results.length === 0) {
    const err = new Error('League is empty');
    err.status = 404;
    throw err;
  }
  if (results.length > MAX_TEAMS) {
    const err = new Error(`League has ${results.length}+ teams (max ${MAX_TEAMS})`);
    err.status = 400;
    throw err;
  }

  const teams = await mapLimit(results, 3, async (r) => {
    const base = {
      entry: r.entry,
      entryName: r.entry_name,
      manager: r.player_name,
      rank: r.rank,
      official: r.total,
    };
    try {
      return { ...base, report: await buildReport(r.entry) };
    } catch (e) {
      return { ...base, error: e.message };
    }
  });

  // Alternate standings: sort by alternate points, fall back to official.
  const ranked = [...teams].sort(
    (a, b) => (b.report?.totals.altPoints ?? b.official) - (a.report?.totals.altPoints ?? a.official)
  );
  ranked.forEach((t, i) => {
    t.altRank = i + 1;
  });

  return {
    league: { id: standings.league.id, name: standings.league.name },
    bonusRule: BONUS_RULE,
    teams: ranked,
  };
}
