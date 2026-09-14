import { test, expect } from '@playwright/test';
import { exitCodeFor } from './run-and-report';

// The bug this guards: `spawnSync`'s status was discarded, so a suite with real failures
// exited 0. GitHub marked the run green and Slack announced "Passed" while the counts line
// two rows below said "1 failed". Measured on a WebKit regression that failed one test
// through two retries and still reported success.
test('a failing test run exits non-zero', () => {
  expect(exitCodeFor(1)).toBe(1);
});

test('a passing test run exits zero', () => {
  expect(exitCodeFor(0)).toBe(0);
});

// null means the child never returned a status — killed by a signal, or it never spawned.
// Neither is a passing run, and treating "I do not know" as success is exactly how the
// original defect behaved.
test('an unknown outcome is a failure, never a pass', () => {
  expect(exitCodeFor(null)).toBe(1);
});

// Playwright uses other non-zero codes too, e.g. for a config error or --forbid-only.
// Whatever it reports is passed through rather than flattened to 1.
test('any other non-zero status is passed through unchanged', () => {
  expect(exitCodeFor(2)).toBe(2);
  expect(exitCodeFor(130)).toBe(130);
});
