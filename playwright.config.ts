import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import { AUTH_USERS } from './tests/users';
import { runEnvironment } from './src/utils/run-environment';

// Captured once at config eval (no browser launch) — surfaces in the HTML report
// header so every downloaded report records the OS/Chromium/Node/Playwright it ran on.
const env = runEnvironment();

// Clean-room config (e2e-jira-from-issues), data-driven from tests/users.ts
// (Phase H / ADR-0014). Projects derive from AUTH_USERS, which /from-issue grows
// one user at a time as tickets require authenticated pages. @sort-functional is dormant:
// nothing greps it, so it routes to no project — see docs/architecture.md before reviving it.

// Cross-browser is present but OPT-IN (ADR-0027, superseding ADR-0004). Firefox and WebKit
// projects only enter the list when asked for, so `npm test` stays chromium and stays fast;
// choosing when to pay for another engine is a project's call, not the framework's.
//
// Asked for = the CROSS_BROWSER env var, and ONLY that. An earlier version also sniffed
// `process.argv` for a --project naming an engine, so the bare command would work without the
// flag. It does not: Playwright re-evaluates this config inside every worker process, and a
// worker's argv does not carry the parent's --project. The projects therefore existed in the
// main process, listed correctly, started running, and then every test died with
// `Project "firefox-no-auth" not found in the worker process`. An env var propagates to
// workers; argv does not. Use the npm scripts, which set it for you.
//
// Only the standard user goes cross-browser, per the guardrail ADR-0004 established and this
// record keeps: engine differences live in OUR interaction code, not in saucedemo's per-user
// bugs, so re-running problem_user on three engines buys nothing. Both of its contexts are
// mirrored, though — a smoke run on Firefox that omitted `@no-auth` would omit logging in,
// which is the single most valuable thing to check on another engine.
const crossBrowserRequested = process.env.CROSS_BROWSER === '1';

const CROSS_BROWSERS = [
  { engine: 'firefox', device: 'Desktop Firefox' },
  { engine: 'webkit', device: 'Desktop Safari' },
] as const;

export default defineConfig({
  testDir: './tests',

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  // Shown as key/value chips in the HTML report header. The engine chips follow what this
  // run CAN use, not which --project was filtered to: the config must not read argv (see
  // the note above `crossBrowserRequested`), so claiming more precision than that would be
  // a lie a worker process could not back up. A chromium-only run therefore lists Chromium
  // alone, and any cross-browser run lists all three.
  metadata: {
    OS: env.os,
    Chromium: env.chromium,
    ...(crossBrowserRequested ? { Firefox: env.firefox, WebKit: env.webkit } : {}),
    Node: env.node,
    Playwright: env.playwright,
  },

  reporter: [
    // On CI, surface failures as inline GitHub annotations on the PR / run summary.
    ...(process.env.CI ? [['github'] as const] : []),
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    // Deduplicates the per-test observation attachments into `.observations/<feature>.json`
    // (ADR-0021). Single writer in the main process, so parallel workers can't corrupt it.
    ['./src/observations/reporter.ts'],
    ['list'],
  ],

  use: {
    baseURL: process.env.SAUCEDEMO_BASE_URL ?? 'https://www.saucedemo.com',
    // Keep a trace for failures only. Measured on the standard project (58 tests, 3 runs each):
    // recording costs no time above the noise floor — trace=off came out SLOWER than trace=on in
    // the second measurement — but `trace: 'on'` left 61 MB across 91 trace files, which every
    // green run uploads as an artifact for nobody. 'retain-on-failure', not 'on-first-retry':
    // retries are 0 locally, so 'on-first-retry' would mean no trace at all on a developer's
    // machine, which is where a trace gets read most.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    // One setup project per user (filtered by the auth.setup test title), so a
    // user project authenticates ONLY its own user — not every AUTH_USER. A
    // project dependency runs the whole dependency project, so per-user setup
    // projects are how we scope auth to what each run actually needs.
    ...AUTH_USERS.map((user) => ({
      name: `setup-${user}`,
      testMatch: /.*\.setup\.ts/,
      grep: new RegExp(`authenticate as ${user}$`),
    })),
    // Projects are `chromium-<context>` so the project chip in the report is
    // distinct from the `@<tag>` chip (both would otherwise read e.g. "standard").
    // Matches the firefox-standard/webkit-standard cross-browser naming.
    {
      name: 'chromium-no-auth',
      testIgnore: /.*\.setup\.ts/,
      grep: /@no-auth/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...AUTH_USERS.map((user) => ({
      name: `chromium-${user}`,
      testIgnore: /.*\.setup\.ts/,
      grep: new RegExp(`@all-users|@${user}`),
      dependencies: [`setup-${user}`],
      use: {
        ...devices['Desktop Chrome'],
        storageState: `auth/${user}.json`,
      },
    })),

    // Opt-in only. Absent from the list entirely unless requested, so they cost nothing —
    // not a run, not a listing, not a line of report — when nobody asks.
    ...(crossBrowserRequested
      ? CROSS_BROWSERS.flatMap(({ engine, device }) => [
          {
            name: `${engine}-no-auth`,
            testIgnore: /.*\.setup\.ts/,
            grep: /@no-auth/,
            use: { ...devices[device] },
          },
          {
            name: `${engine}-standard`,
            testIgnore: /.*\.setup\.ts/,
            grep: /@all-users|@standard/,
            dependencies: ['setup-standard'],
            use: { ...devices[device], storageState: 'auth/standard.json' },
          },
        ])
      : []),
  ],
});
