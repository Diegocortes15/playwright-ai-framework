import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { CaseResult, QaseMap } from './types';
import { indexResults, normalizeTitle } from './results-reader';
import { loadMap } from './map-store';
import { QaseClient } from './qase-client';
import { qaseConfig } from '../utils/qase-env';
import {
  runEnvironment,
  formatEnvironmentLine,
  parseEngines,
  type Engine,
} from '../utils/run-environment';

const SEP = ' › '; // matches map-store's logical-key separator
const QASE_WEB_BASE = 'https://app.qase.io'; // cloud web app (run links); self-hosted differs
const SETUP_PREFIX = 'authenticate as'; // tests/auth.setup.ts pseudo-tests — not real cases

// title (normalized) → case id, derived from the map keys' last segment.
function titleIndex(map: QaseMap): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, id] of Object.entries(map)) {
    out.set(normalizeTitle(key.split(SEP).at(-1) ?? ''), id);
  }
  return out;
}

// Pure: match the tests that ran (from the report) to existing cases via the map.
// Auth-setup pseudo-tests are ignored entirely. Unmapped real tests go to `skipped`.
export function selectResults(
  report: unknown,
  map: QaseMap,
): { results: CaseResult[]; skipped: string[] } {
  const byTitle = titleIndex(map);
  const results: CaseResult[] = [];
  const skipped: string[] = [];
  for (const [normTitle, hit] of indexResults(report)) {
    if (normTitle.startsWith(SETUP_PREFIX)) continue; // skip auth.setup steps (not real cases)
    const caseId = byTitle.get(normTitle);
    if (caseId === undefined) {
      skipped.push(normTitle);
      continue;
    }
    // Both can be true at once: failed on one project, flaky on another.
    const notes = [
      hit.failedProjects.length ? `failed on: ${hit.failedProjects.join(', ')}` : '',
      hit.flakyProjects.length ? `flaky — needed a retry on: ${hit.flakyProjects.join(', ')}` : '',
    ].filter(Boolean);
    results.push({
      caseId,
      status: hit.status,
      comment: notes.length ? notes.join(' · ') : undefined,
    });
  }
  return { results, skipped };
}

// Pure: the run title. With a label (e.g. SMOKE / REGRESSION) → "<LABEL> — <when>";
// otherwise "On-demand: <features> — <when>". Always upper-cased.
export function runTitle(
  map: QaseMap,
  results: CaseResult[],
  when: string,
  label?: string,
): string {
  let scope: string;
  if (label && label.trim()) {
    scope = label.trim();
  } else {
    const featureById = new Map<number, string>();
    for (const [key, id] of Object.entries(map)) featureById.set(id, key.split(SEP)[0] ?? '');
    const features = [
      ...new Set(
        results.map((r) => featureById.get(r.caseId)).filter((f): f is string => Boolean(f)),
      ),
    ].sort();
    scope = `On-demand: ${features.length ? features.join(', ') : 'tests'}`;
  }
  return `${scope} — ${when}`.toUpperCase();
}

// CI trigger identifier appended to the run label, from GitHub-provided env vars
// (empty outside Actions). Distinguishes a scheduled (automated) run from a manual
// (workflow_dispatch) one, and names who triggered a manual run.
export function triggerTag(): string {
  const event = process.env.GITHUB_EVENT_NAME;
  if (!event) return '';
  if (event === 'schedule') return ' · Automated';
  if (event === 'workflow_dispatch') {
    const actor = process.env.GITHUB_TRIGGERING_ACTOR || process.env.GITHUB_ACTOR;
    return actor ? ` · Manual (${actor})` : ' · Manual';
  }
  return ` · ${event}`;
}

// Human-readable run duration, e.g. 4200 → '4s', 95000 → '1m 35s'.
export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

// Current date + time in US Eastern Time, e.g. "2026-05-30 14:15 ET".
export function nowET(d: Date = new Date()): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${date} ${time} ET`;
}

// ---- record-only CLI (run via tsx): src/tcms/run-report.ts [LABEL] ----
const PURPLE = '\x1b[38;5;141m'; // Qase-brand-ish purple
const AMBER = '\x1b[38;5;214m'; // warning
const RESET = '\x1b[0m';
const color = (s: string, c: string): string => (process.stdout.isTTY ? `${c}${s}${RESET}` : s);

export async function recordRun(label?: string, engines?: readonly Engine[]): Promise<void> {
  const cfg = qaseConfig();
  if (!cfg) {
    console.log('TCMS off (QASE_API_TOKEN/QASE_PROJECT_CODE unset) — skipping Qase run.');
    return;
  }
  if (!existsSync('test-results/results.json')) {
    console.log('No test-results/results.json — run the tests first, then `npm run tcms:run`.');
    return;
  }
  const report = JSON.parse(readFileSync('test-results/results.json', 'utf-8'));
  const map = loadMap('qase-map.json');
  const { results, skipped } = selectResults(report, map);
  if (results.length === 0) {
    console.log('No matching Qase cases for this run. Run `npm run tcms:sync` to refresh the map.');
    if (skipped.length) console.log(color(`Not in Qase: ${skipped.join('; ')}`, AMBER));
    return;
  }
  const title = runTitle(map, results, nowET(), label ? `${label}${triggerTag()}` : label);
  // Stamp the run with what it executed on + how long it took, so the Qase record
  // stands alone (matches the report metadata + the Slack notification).
  const durationMs = typeof report?.stats?.duration === 'number' ? report.stats.duration : 0;
  const description = `Environment: ${formatEnvironmentLine(runEnvironment(), engines)}\nDuration: ${formatDuration(durationMs)}`;
  const runId = await new QaseClient(cfg).recordResults(results, {
    jiraKey: '',
    sourceUrl: '',
    runTitle: title,
    description,
  });
  const runUrl = `${QASE_WEB_BASE}/run/${cfg.projectCode}/dashboard/${runId}`;
  console.log(color(`Qase run created — ${results.length} result(s) recorded.`, PURPLE));
  console.log(color(`  ${runUrl}`, PURPLE));
  // Surface the run URL to GitHub Actions so the workflow's Slack step can link it.
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `qase_run_url=${runUrl}\n`);
  if (skipped.length) {
    console.log(
      color(`Skipped (not in Qase yet — run \`npm run tcms:sync\`): ${skipped.join('; ')}`, AMBER),
    );
  }
}

if (process.argv[1]?.endsWith('run-report.ts')) {
  recordRun(process.argv[2], parseEngines(process.env.RUN_ENGINES)).catch((err) => {
    console.error(`Qase run failed: ${err}`);
    process.exitCode = 0;
  });
}
