#!/usr/bin/env node
//
// Gather one failure's evidence into a single folder a person can attach to a ticket.
//
// Why this exists: a bug report's Evidence section used to list absolute paths under
// `test-results/`, inside directories named things like
// `inventory-inventory-invent-6da45-products-by-price-ascending-chromium-problem`. Those paths
// are meaningless to anyone but the machine that ran the suite, so the section had, in
// practice, no evidence at all. This turns "hunt through mangled directories" into "attach
// this one folder".
//
// It COPIES; it never moves or deletes. The original run output is left untouched.
//
// Usage:  collect-evidence.mjs [--grep "<substring>"] [--out <dir>]
// Exit:   0   collected — the folder path and its contents are printed
//         3   the last run had no failures
//         4   no test-results/results.json — run the suite first
//         5   the failure was found but carried no evidence files
//
// Plain Node, no dependencies, mirroring collect-failure.mjs.

import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const RESULTS = join('test-results', 'results.json');
const ANSI = new RegExp('\\u001b\\[[0-9;]*m', 'g');
const stripAnsi = (s = '') => s.replace(ANSI, '');

function* eachSpec(node) {
  for (const spec of node.specs ?? []) yield spec;
  for (const suite of node.suites ?? []) yield* eachSpec(suite);
}

/** A filesystem-safe, human-readable folder name for a test. */
function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const grep = valueOf('--grep');
const outRoot = valueOf('--out') ?? 'bug-evidence';

if (!existsSync(RESULTS)) {
  console.error(`collect-evidence: ${RESULTS} not found — run the suite first.`);
  process.exit(4);
}

const report = JSON.parse(readFileSync(RESULTS, 'utf-8'));
const collected = [];

for (const spec of eachSpec({ suites: report.suites ?? [] })) {
  if (grep && !spec.title.includes(grep)) continue;
  for (const test of spec.tests ?? []) {
    for (const result of test.results ?? []) {
      if (result.status !== 'failed' && result.status !== 'timedOut') continue;

      const project = test.projectName ?? 'unknown';
      const dir = join(outRoot, `${slug(spec.title)}--${slug(project)}`);
      rmSync(dir, { recursive: true, force: true }); // a re-run replaces, never accumulates
      mkdirSync(dir, { recursive: true });

      const files = [];
      for (const a of result.attachments ?? []) {
        if (!a.path || !existsSync(a.path)) continue;
        // Readable names: `screenshot.png`, `video.webm`, `trace.zip` — not the run's hashes.
        const name = `${a.name}${extname(a.path) || extname(basename(a.path))}`;
        copyFileSync(a.path, join(dir, name));
        files.push(name);
      }

      const message = stripAnsi(result.error?.message ?? '').trim();
      // A test.fail() test that fails as expected is not a "failure" to Playwright, so
      // `screenshot: 'only-on-failure'` and `video: 'retain-on-failure'` keep neither unless the
      // spec file forces them on. Only say so when they are actually missing — and say how to
      // fix it, because the trace is not a substitute: reading one needs a checkout, which puts
      // an engineer between a non-engineer and the bug.
      const visualsMissing =
        test.status === 'expected' &&
        !files.some((f) => f.startsWith('screenshot') || f.startsWith('video'));
      writeFileSync(
        join(dir, 'README.txt'),
        [
          spec.title,
          '='.repeat(spec.title.length),
          '',
          `Project:   ${project}`,
          `Spec:      ${spec.file}:${spec.line}`,
          `Collected: ${new Date().toISOString().slice(0, 10)}`,
          '',
          'Failure',
          '-------',
          message || '(no error message recorded)',
          '',
          'How to open the trace',
          '---------------------',
          'The trace is the useful one: it replays the run step by step, with the DOM,',
          'the network and the console at every point. From the repository root:',
          '',
          `    npx playwright show-trace ${join(dir, 'trace.zip')}`,
          '',
          'It opens in a browser and needs no setup beyond the repository.',
          '',
          ...(visualsMissing
            ? [
                'No screenshot or video — and that is fixable',
                '-------------------------------------------',
                'This test is marked test.fail(), so Playwright does not treat its failure as',
                "a failure and neither 'only-on-failure' screenshot nor 'retain-on-failure'",
                'video is kept. That is backwards: a test locked to a known defect is exactly',
                'the one whose evidence someone without the repository needs to see.',
                '',
                'Fix it by forcing capture at the top of the spec file (it cannot be scoped to',
                'a describe — video forces a new worker):',
                '',
                "    test.use({ screenshot: 'on', video: 'on' });",
                '',
                'The trace below still works, but it needs a checkout to read.',
                '',
              ]
            : []),
          'Everything here was copied from the run output; the originals are untouched.',
        ].join('\n'),
        'utf-8',
      );
      files.push('README.txt');

      collected.push({ title: spec.title, project, dir, files });
    }
  }
}

if (collected.length === 0) {
  console.error(
    grep
      ? `collect-evidence: no failure matching "${grep}" in the last run.`
      : 'collect-evidence: the last run had no failures — nothing to collect.',
  );
  process.exit(3);
}

const empty = collected.filter((c) => c.files.length <= 1);
for (const c of collected) {
  console.log(`${c.dir}`);
  for (const f of c.files) console.log(`  ${f}`);
  console.log(`  → attach this folder to the ticket, or zip it: zip -r "${c.dir}.zip" "${c.dir}"`);
  console.log('');
}

if (empty.length === collected.length) {
  console.error(
    'collect-evidence: the failure was found in results.json but none of its evidence files\n' +
      'exist on disk. Two causes, and they need opposite fixes:\n' +
      '  - the run never captured them → check the `use` block in playwright.config.ts\n' +
      '    (screenshot / video / trace settings);\n' +
      '  - they were captured and later deleted → results.json outlives test-results/, so\n' +
      '    re-run the suite and collect again.',
  );
  process.exit(5);
}
