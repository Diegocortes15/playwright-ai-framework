import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { test, expect } from '@playwright/test';
import { reportAnnotations } from './report-annotations';

// These read the committed `.tcms/records/` files rather than a fixture, on purpose: the point
// of the annotations is that a reader opening the Playwright report sees the real provenance,
// so the thing worth protecting is the real data resolving. The inventory records used here are
// the SW-13 tests locked to defect SW-14 under ADR-0024.

const RECORDS_DIR = '.tcms/records';
const SORT_TEST = 'problem_user sorts products by name descending';

test('a test with no matching record is annotated with nothing', () => {
  expect(reportAnnotations('inventory', 'a title no record carries')).toEqual([]);
  expect(reportAnnotations('feature_that_does_not_exist', SORT_TEST)).toEqual([]);
});

test('every test gets its issue links and the criterion it covers', () => {
  const annotations = reportAnnotations('inventory', SORT_TEST);
  const types = annotations.map((a) => a.type);

  expect(types.filter((t) => t === 'issue').length).toBeGreaterThan(0);
  expect(types).toContain('covers');
  // The AC, not the assertion — what a person agreed the system should do.
  expect(annotations.find((a) => a.type === 'covers')?.description).toContain('descending');
});

test('a passing test carries no expected-failure annotation', () => {
  const types = reportAnnotations('inventory', SORT_TEST).map((a) => a.type);
  expect(types).not.toContain('known defect');
  expect(types.some((t) => t.includes('unattributed'))).toBe(false);
});

test('a test.fail() test explains the defect it is locked to', () => {
  const annotations = reportAnnotations('inventory', SORT_TEST, { expectedToFail: true });
  const defect = annotations.find((a) => a.type === 'known defect');

  expect(defect, 'the record carries expectedFailure, so the report must explain it').toBeTruthy();
  // ADR-0024: the annotation must name the defect — an unattributed test.fail() is
  // indistinguishable from a test somebody gave up on.
  expect(defect?.description).toContain('SW-14');
  expect(defect?.description).toContain('browse/SW-14');
  // And it must say what happens when the defect is fixed, or nobody removes the marker.
  expect(defect?.description).toContain('Expected to fail, but passed.');
});

// Any committed record without an `expectedFailure` is the shape this test needs: a marker
// somebody added without filing anything. Found rather than named, because naming one couples
// the test to a title that can be renamed — which is exactly what happened. SW-18 renamed
// `footer Twitter link points to its Sauce Labs URL` to `footer X link …`, this test's only
// fixture vanished, and it failed for a reason that had nothing to do with annotations.
//
// Still real data, per the note at the top of this file. The change is that it asks the
// catalogue for the shape instead of assuming which record still has it.
function anyRecordWithoutAnExpectedFailure(): { feature: string; title: string } {
  for (const file of readdirSync(RECORDS_DIR)) {
    const { records } = JSON.parse(readFileSync(join(RECORDS_DIR, file), 'utf-8'));
    const record = records.find((r: { expectedFailure?: unknown }) => !r.expectedFailure);
    if (record) return { feature: basename(file, '.json'), title: record.title };
  }
  throw new Error(
    'No committed record lacks an expectedFailure, so the unattributed case cannot be ' +
      'exercised against real data. If every record now carries one, this test has outlived ' +
      'its premise and should be deleted rather than made to pass.',
  );
}

test('a test.fail() test whose record names no defect is flagged, not silently accepted', () => {
  const { feature, title } = anyRecordWithoutAnExpectedFailure();
  const annotations = reportAnnotations(feature, title, { expectedToFail: true });
  const warning = annotations.find((a) => a.type.includes('unattributed'));

  expect(warning, 'an unattributed expected failure must be visible in the report').toBeTruthy();
  expect(warning?.description).toContain('ADR-0024');
  // Detection, never prevention: this must not be able to fail a run.
  expect(annotations.find((a) => a.type === 'known defect')).toBeUndefined();
});
