// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  FRAMEWORK INSTRUMENTATION — NOT APPLICATION TESTS. DO NOT DELETE (see below)  ⚠️
//
// These tests do NOT test the application. They test the framework's own runtime
// instrumentation: the `_observations` fixture from ADR-0021.
//
// Why they exist: of the four observation detectors, only `failed-request` had ever
// fired against a real run. `console-error`, `page-error` and `dialog` were shipped
// unverified. These four tests are the proof they work.
//
// NOT removable as of 2026-09-07: ADR-0021's `Enforced by:` field names this directory as
// what exercises all four detectors including the failure path. Deleting it would falsify
// that field, and an ADR is superseded rather than edited — so removal needs a new ADR that
// downgrades the enforcement. The earlier note here claimed nothing else referenced these
// tests; that was wrong. Tracked in `docs/jira-restore-checklist.md` under "validation tests".
//
// Deliberate exception to CLAUDE.md composition rule #4 ("tests know about Pages and
// Data only"): tests 1 and 2 reach for `page` directly because a console error and an
// uncaught exception cannot be produced through a Page Object — there is no app button
// that throws on demand. The exception is scoped to this file and dies with it.
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@fixtures/test';
import { env } from '@utils/env';

test.describe('framework validation — observation detectors', { tag: '@no-auth' }, () => {
  test('console-error detector records a console error raised by the page', async ({
    page,
    loginPage,
    _observations,
  }) => {
    await loginPage.goto();
    await page.evaluate(() => console.error('OBSERVATION_PROBE console failure'));

    await expect
      .poll(() => _observations.filter((e) => e.kind === 'console-error').length)
      .toBeGreaterThan(0);

    const recorded = _observations.find((e) => e.kind === 'console-error');
    expect(recorded?.message).toContain('OBSERVATION_PROBE console failure');
  });

  test('page-error detector records an uncaught exception in page context', async ({
    page,
    loginPage,
    _observations,
  }) => {
    await loginPage.goto();
    // Thrown from a timer so it escapes as an uncaught page error rather than
    // propagating back through evaluate() into the test.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('OBSERVATION_PROBE uncaught failure');
      }, 0);
    });

    await expect
      .poll(() => _observations.filter((e) => e.kind === 'page-error').length)
      .toBeGreaterThan(0);

    const recorded = _observations.find((e) => e.kind === 'page-error');
    expect(recorded?.message).toContain('OBSERVATION_PROBE uncaught failure');
  });

  test('dialog detector records a real alert, and dismissing it keeps the test running', async ({
    loginPage,
    inventoryPage,
    _observations,
  }) => {
    // Real app behaviour, not a probe: error_user's sort dropdown raises a native
    // alert("Sorting is broken! ..."). Logging in here rather than via storageState
    // keeps error_user out of AUTH_USERS — no harness growth (ADR-0014).
    await loginPage.goto();
    await loginPage.loginAs('error_user', env.password);
    await inventoryPage.sortBy('za');

    await expect
      .poll(() => _observations.filter((e) => e.kind === 'dialog').length)
      .toBeGreaterThan(0);

    const dialog = _observations.find((e) => e.kind === 'dialog');
    expect(dialog?.dialogType).toBe('alert');
    expect(dialog?.message).toContain('Sorting is broken');
    // The fixture dismissed it, so the page is still usable afterwards.
    await expect.poll(() => inventoryPage.getTitle()).toBe('Products');
  });

  // `test.fail()` means "this is EXPECTED to fail" — Playwright reports it green when it
  // does, so CI stays honest while the failure path actually executes. It proves the
  // fixture still attaches its events during teardown after a failed assertion, which is
  // the case that matters most: a failure plus a correlated 5xx is the entire premise of
  // failure triage.
  //
  // Self-verification is impossible here — the observations file is written by the
  // reporter in onEnd, after every test. Verify by running the suite and confirming
  // `.observations/_framework_validation.json` contains an entry whose
  // `sample.test` is this test's title.
  test.fail(
    'a failing test still records its observations (expected to fail, reported green)',
    async ({ page, loginPage, _observations }) => {
      await loginPage.goto();
      // Deterministic: a probe the fixture is guaranteed to see, so if this signature is
      // missing from the file afterwards, the attach-on-failure path is genuinely broken
      // rather than the test simply not having produced anything.
      await page.evaluate(() => console.error('OBSERVATION_PROBE from a failing test'));
      await expect
        .poll(() => _observations.some((e) => e.message.includes('from a failing test')))
        .toBe(true);

      // Deliberately wrong — the failure this test exists to produce.
      expect('the app under test').toBe('THIS ASSERTION IS MEANT TO FAIL');
    },
  );
});
