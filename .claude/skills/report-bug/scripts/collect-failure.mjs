#!/usr/bin/env node
//
// Gather everything a bug report needs from the last run, as structured JSON.
//
// Deterministic on purpose: finding the failure, its evidence, the acceptance criterion it
// traces to and the observations recorded during it is lookup, not judgment. The skill turns
// this into prose; it should never have to hunt for the facts. Plain Node, no dependencies,
// no build step.
//
// Usage:  node collect-failure.mjs [--grep <substring of the test title>]
// Exit:   0 with JSON on stdout · 3 when the run had no failures · 4 when no results file

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RESULTS = join('test-results', 'results.json');
const OBSERVATIONS = join('.observations', 'observations.json');
const TCMS_DIR = '.tcms/records';

const ANSI = new RegExp('\\u001b\\[[0-9;]*m', 'g');
const stripAnsi = (s = '') => s.replace(ANSI, '');

/** Playwright nests specs under arbitrarily deep suites. */
function* eachSpec(node) {
  for (const spec of node.specs ?? []) yield spec;
  for (const suite of node.suites ?? []) yield* eachSpec(suite);
}

function expectedAndReceived(message) {
  const expected = message.match(/^\s*Expected:\s*(.+)$/m)?.[1]?.trim();
  const received = message.match(/^\s*Received:\s*(.+)$/m)?.[1]?.trim();
  return expected || received ? { expected, received } : undefined;
}

/**
 * The acceptance criterion this test traces to, from the committed TCMS record.
 *
 * Returns `{ acText }` when resolved, or `{ missing: <reason> }` — never a bare undefined.
 * The reason matters: `no-matching-record` is the expected state after a run blocked by
 * ADR-0020, which writes no records artifact at all, and that is the very situation
 * /report-bug exists for. A draft that silently falls back to restating the failed
 * assertion tells a triager nothing about what the system was supposed to do, and worse,
 * gives no hint that the absence is by design rather than an oversight.
 */
function acceptanceCriterion(feature, title) {
  const path = join(TCMS_DIR, `${feature}.json`);
  if (!existsSync(path)) return { missing: 'no-records-file' };
  let records;
  try {
    ({ records = [] } = JSON.parse(readFileSync(path, 'utf-8')));
  } catch {
    return { missing: 'unreadable-records-file' };
  }
  const acText = records.find((r) => r.title === title)?.acText;
  return acText ? { acText } : { missing: 'no-matching-record' };
}

function observationsFor(attachment) {
  if (!attachment?.body) return [];
  try {
    return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf-8'));
  } catch {
    return [];
  }
}

function main() {
  const grepIndex = process.argv.indexOf('--grep');
  const grep = grepIndex === -1 ? undefined : process.argv[grepIndex + 1];

  if (!existsSync(RESULTS)) {
    console.error(`collect-failure: ${RESULTS} not found — run the suite first.`);
    process.exit(4);
  }
  const report = JSON.parse(readFileSync(RESULTS, 'utf-8'));

  const failures = [];
  for (const spec of eachSpec({ suites: report.suites ?? [] })) {
    if (grep && !spec.title.includes(grep)) continue;
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        if (result.status !== 'failed' && result.status !== 'timedOut') continue;
        const message = stripAnsi(result.error?.message ?? '');
        const byName = Object.fromEntries((result.attachments ?? []).map((a) => [a.name, a]));
        const feature = spec.file.split('/')[0];

        // results.json outlives the spec that produced it, so a stale run can describe a
        // test that has since been renamed or deleted. Say so rather than letting a reader
        // chase a file that is not there.
        const specPath = join('tests', spec.file);
        const staleRun = !existsSync(specPath);

        failures.push({
          title: spec.title,
          file: spec.file,
          line: spec.line,
          ...(staleRun
            ? {
                staleRun:
                  `${specPath} no longer exists — these results are from an earlier run. ` +
                  'Re-run the suite before filing anything from them.',
              }
            : {}),
          project: test.projectName ?? 'unknown',
          feature,
          status: result.status,
          // The Page Objects wrap each action in test.step, so these ARE the repro steps.
          reproSteps: (result.steps ?? []).map((s) => s.title),
          ...acceptanceCriterion(feature, spec.title),
          error: { message, ...expectedAndReceived(message) },
          observations: observationsFor(byName.observations),
          evidence: {
            screenshot: byName.screenshot?.path,
            video: byName.video?.path,
            trace: byName.trace?.path,
            errorContext: byName['error-context']?.path,
          },
        });
      }
    }
  }

  if (failures.length === 0) {
    console.error('collect-failure: the last run had no failures.');
    process.exit(3);
  }

  console.log(
    JSON.stringify(
      { generatedAt: new Date().toISOString().slice(0, 10), failures, knownObservations: OBSERVATIONS },
      null,
      2,
    ),
  );
}

main();
