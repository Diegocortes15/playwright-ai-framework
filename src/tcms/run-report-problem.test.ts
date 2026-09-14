import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { reportQaseProblem } from './run-report';

// Captures what reportQaseProblem hands to GitHub Actions, by pointing GITHUB_OUTPUT at a
// real file — which is exactly what the runner does.
function captureOutput(reason: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'qase-')), 'out.txt');
  writeFileSync(file, '');
  const previous = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = file;
  try {
    reportQaseProblem(reason);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = previous;
  }
  return readFileSync(file, 'utf-8');
}

test('the reason reaches the workflow as a qase_problem output', () => {
  expect(captureOutput('403 active-run limit reached')).toBe(
    'qase_problem=403 active-run limit reached\n',
  );
});

// Actions outputs are line-based: a reason containing a newline would write a second line
// the runner reads as a different key, or as nothing. Errors from an HTTP client routinely
// contain newlines, so this is the realistic input, not the exotic one.
test('a multi-line reason is flattened to one line', () => {
  const written = captureOutput('Qase POST failed\n  status: 403\n  body: {"limit":"reached"}');
  expect(written.split('\n').filter(Boolean)).toHaveLength(1);
  expect(written).toBe('qase_problem=Qase POST failed status: 403 body: {"limit":"reached"}\n');
});

test('a very long reason is capped, and still one line', () => {
  const written = captureOutput('x'.repeat(5000));
  expect(written.split('\n').filter(Boolean)).toHaveLength(1);
  expect(written.length).toBeLessThan(350);
});

// Restores whatever GITHUB_OUTPUT held, so the branch lives here rather than inside a test
// (`playwright/no-conditional-in-test`).
function withoutGithubOutput<T>(fn: () => T): T {
  const previous = process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_OUTPUT;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = previous;
  }
}

// Outside CI there is no GITHUB_OUTPUT, and the function must still print rather than throw.
test('no GITHUB_OUTPUT is not an error', () => {
  withoutGithubOutput(() => {
    expect(() => reportQaseProblem('nothing to write to')).not.toThrow();
  });
});
