// Tool-agnostic TCMS contracts. case-mapper + qase-client both depend on these;
// no Qase specifics leak here, so a future Xray/Zephyr/Kiwi client implements the
// same TcmsSeam (per the Phase K design — the "thin seam").

export type TcmsStatus = 'passed' | 'failed' | 'skipped';
export type TcmsBucket = 'Positive' | 'Negative' | 'Edge';

// A Jira ticket a case traces back to. A case can cover MORE THAN ONE ticket over
// its lifetime (born in one ticket, amended by a later edit/update ticket), so
// provenance is an array — and it lives per-RECORD, not per records-file, so one
// feature file (e.g. inventory.json) can hold tests from several tickets.
export interface JiraRef {
  key: string; // e.g. 'SW-4'
  url: string; // e.g. 'https://…/browse/SW-4'
}

export interface TcmsStep {
  action: string;
  expected: string; // '' when the step has no specific expected result
}

export interface TcmsCase {
  suitePath: string[]; // e.g. ['login', 'no auth', 'Positive'] — the suite tree
  title: string; // prose test title — the case title within the leaf suite
  steps: TcmsStep[];
  description: string; // provenance + AC text
  preconditions: string; // user/context, e.g. 'Session: standard_user'
  tags: string[];
  bucket: TcmsBucket;
  // Structured provenance — some seams (Xray/Zephyr) link test↔requirement by Jira key.
  jira: JiraRef[];
  status: TcmsStatus; // run outcome; carried for seams that can set case status (e.g. Xray). sync.ts records run status via CaseResult.
}

// One per-test record from /from-issue's Step 6 semantic model, written to the
// records file the skill hands the sync CLI (Step 11.5).
export interface TestRecord {
  title: string; // prose title (matches the spec test title)
  acText: string; // normalized AC text → the human-readable expected outcome
  user: string; // 'standard_user' | 'problem_user' | … | 'no-auth'
  tags: string[];
  bucket: TcmsBucket;
  feature: string; // suite root, e.g. 'login'
  contextLabel: string; // e.g. 'no auth', 'problem_user'
  jira: JiraRef[]; // ticket(s) this test traces to — per-record so a feature file spans tickets
  // Present only on a test marked `test.fail()` because the application, not the test, is
  // wrong (ADR-0024). It is what lets the Playwright report explain the expected failure in
  // words instead of showing a bare "expected" status, and it is the machine-readable half of
  // ADR-0024's rule that the annotation must name the defect — an unattributed test.fail() is
  // indistinguishable from a test somebody gave up on.
  expectedFailure?: ExpectedFailure;
}

// The defect a `test.fail()` test is locked to.
export interface ExpectedFailure {
  key: string; // e.g. 'SW-14'
  url: string;
  reason: string; // one plain sentence: what the application does that it should not
}

export interface SyncMeta {
  jiraKey: string;
  sourceUrl: string;
  runTitle: string; // e.g. 'from-issue SW-1 — 2026-05-28'
  description?: string; // optional run description, e.g. environment + duration
}

export interface CaseResult {
  caseId: number;
  status: TcmsStatus;
  comment?: string; // e.g. which projects failed (multi-project aggregation)
}

// The seam every TCMS backend implements. qase-client.ts is the first impl.
export interface TcmsSeam {
  ensureSuitePath(path: string[]): Promise<number>; // create-as-needed → leaf suite id
  // `knownId` comes from the committed qase-map.json. When given, the case is updated
  // directly and the find-by-title search is skipped — that search was 80 of the 182 calls a
  // sync made. A stale id falls back to the search, so the result is identical either way.
  upsertCase(suiteId: number, c: TcmsCase, knownId?: number): Promise<number>;
  recordResults(results: CaseResult[], meta: SyncMeta): Promise<number>; // create run + results → run id
  archiveCase(caseId: number): Promise<void>; // deprecate/archive a case whose test was removed
}

// qase-map.json shape: logical test key → Qase case id. Auto-written by suite-sync;
// read by humans as a test↔case lookup index. Never hand-edited.
export type QaseMap = Record<string, number>;
