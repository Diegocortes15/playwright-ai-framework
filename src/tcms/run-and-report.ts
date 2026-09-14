import { spawnSync } from 'node:child_process';
import { recordRun } from './run-report';
import { parseEngines } from '../utils/run-environment';

// Usage (via tsx): run-and-report.ts <LABEL> [playwright args...]
// Runs `npx playwright test <args>`, records a Qase run titled <LABEL>, and EXITS WITH THE
// TEST RUN'S OWN STATUS.
//
// Records regardless of test pass/fail — you want failures in Qase too — which is why the
// recording happens before the exit code is applied rather than being skipped on red.
//
// RUN_ENGINES (comma-separated: chromium,firefox,webkit) names what this run executed on,
// so the Qase record reports the real engine instead of assuming Chromium. Set by
// `scripts/run-suite.sh`; unset means chromium. This is an entry point, so reading the
// environment here is deliberate — `run-environment.ts` itself stays free of it.

// Playwright's status, turned into this process's. `null` means the child never returned
// one — killed by a signal, or it failed to spawn at all — and neither is a passing run.
//
// This is the whole bug this file once had. `spawnSync`'s result was discarded, so a suite
// with real failures exited 0, GitHub marked the run green, and Slack announced "Passed"
// while the counts line two rows below it said otherwise. Measured on a WebKit regression
// that failed one test through two retries and reported success.
export function exitCodeFor(status: number | null): number {
  return status ?? 1;
}

async function main(): Promise<number> {
  const label = process.argv[2];
  const pwArgs = process.argv.slice(3);
  const run = spawnSync('npx', ['playwright', 'test', ...pwArgs], {
    stdio: 'inherit',
    shell: true,
  });

  // A Qase outage must not turn a green suite red, and must not turn a red suite green
  // either — so it is caught here, where it can do neither, instead of around the whole
  // function where it used to swallow the test result with it.
  try {
    await recordRun(label, parseEngines(process.env.RUN_ENGINES));
  } catch (err) {
    console.error(`Qase run failed: ${err}`);
  }

  return exitCodeFor(run.status);
}

if (process.argv[1]?.endsWith('run-and-report.ts')) {
  main().then((code) => {
    process.exitCode = code;
  });
}
