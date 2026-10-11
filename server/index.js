import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from './report.js';
import { buildLeague } from './league.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/league/:leagueId', async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isInteger(leagueId) || leagueId <= 0) {
    return res.status(400).json({ error: 'Invalid league ID' });
  }
  try {
    res.json(await buildLeague(leagueId));
  } catch (err) {
    const status = err.status === 404 ? 404 : err.status === 400 ? 400 : 502;
    res.status(status).json({
      error: status === 404 ? 'League not found' : err.status === 400 ? err.message : 'Failed to fetch FPL data',
      detail: err.message,
    });
  }
});

app.get('/api/report/:teamId', async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ error: 'Invalid team ID' });
  }
  try {
    res.json(await buildReport(teamId));
  } catch (err) {
    const status = err.status === 404 ? 404 : 502;
    res.status(status).json({
      error: status === 404 ? 'Team not found' : 'Failed to fetch FPL data',
      detail: err.message,
    });
  }
});

// Serve the built client in production.
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) =>
  res.sendFile(path.join(dist, 'index.html'))
);

app.listen(PORT, () => console.log(`template-buster on http://localhost:${PORT}`));
