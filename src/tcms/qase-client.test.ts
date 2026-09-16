import { test, expect } from '@playwright/test';
import { QaseClient } from './qase-client';
import type { QaseConfig } from '../utils/qase-env';
import type { TcmsCase } from './types';

const cfg: QaseConfig = {
  apiToken: 'tok',
  projectCode: 'SAUCE',
  apiHost: 'https://api.qase.io/v1',
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function stubFetch(responder: (call: Call) => unknown): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      url: String(url),
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => responder(call),
    } as Response;
  }) as typeof fetch;
  return calls;
}

const baseCase: TcmsCase = {
  suitePath: ['login', 'no auth', 'Positive'],
  title: 'standard_user logs in',
  steps: [
    { action: 'Navigate to the login page', expected: '' },
    { action: 'Submit credentials', expected: 'Lands on inventory' },
  ],
  description: 'd',
  preconditions: 'No authentication',
  tags: [],
  bucket: 'Positive',
  jira: [{ key: 'SW-1', url: 'u' }],
  status: 'passed',
};

test('upsertCase creates when none matches: Token auth, classic steps, suite_id', async () => {
  const calls = stubFetch((c) =>
    c.method === 'GET' ? { result: { entities: [] } } : { result: { id: 42 } },
  );
  const id = await new QaseClient(cfg).upsertCase(7, baseCase);
  expect(id).toBe(42);
  const post = calls.find((c) => c.method === 'POST')!;
  expect(post.url).toBe('https://api.qase.io/v1/case/SAUCE');
  expect(post.headers.Token).toBe('tok');
  expect(post.body!.steps_type).toBe('classic');
  expect(post.body!.suite_id).toBe(7);
  expect((post.body!.steps as { expected_result: string }[])[1].expected_result).toBe(
    'Lands on inventory',
  );
});

test('upsertCase updates (PATCH) when a same-title/suite case exists', async () => {
  const calls = stubFetch((c) =>
    c.method === 'GET'
      ? { result: { entities: [{ id: 99, title: 'standard_user logs in', suite_id: 7 }] } }
      : { result: { id: 99 } },
  );
  const id = await new QaseClient(cfg).upsertCase(7, baseCase);
  expect(id).toBe(99);
  const patch = calls.find((c) => c.method === 'PATCH')!;
  expect(patch.url.endsWith('/case/SAUCE/99')).toBe(true);
  expect(patch.body!.steps_type).toBe('classic');
  expect(patch.body!.suite_id).toBe(7);
  expect((patch.body!.steps as { action: string }[])[0].action).toBe('Navigate to the login page');
});

test('recordResults creates a run then posts each result with a valid status', async () => {
  const calls = stubFetch((c) =>
    c.url.includes('/run/') ? { result: { id: 5 } } : { result: { id: 1 } },
  );
  await new QaseClient(cfg).recordResults([{ caseId: 42, status: 'passed' }], {
    jiraKey: 'SW-1',
    sourceUrl: 'u',
    runTitle: 'from-issue SW-1 — 2026-05-28',
  });
  const run = calls.find((c) => c.url.endsWith('/run/SAUCE'))!;
  expect(run.body!.is_autotest).toBe(true);
  const result = calls.find((c) => c.url === 'https://api.qase.io/v1/result/SAUCE/5/bulk')!;
  expect(result.body).toEqual({ results: [{ case_id: 42, status: 'passed' }] });
});

test('upsertCase marks the case automated', async () => {
  const calls = stubFetch((c) =>
    c.method === 'GET' ? { result: { entities: [] } } : { result: { id: 7 } },
  );
  await new QaseClient(cfg).upsertCase(3, baseCase);
  const post = calls.find((c) => c.method === 'POST')!;
  expect(post.body!.automation).toBe(2); // 2 = "automated"
});

test('archiveCase issues the archive call for the id', async () => {
  const calls = stubFetch(() => ({ result: { id: 1 } }));
  await new QaseClient(cfg).archiveCase(55);
  expect(calls.some((c) => c.url.endsWith('/case/SAUCE/55') && c.method === 'DELETE')).toBe(true);
});

test('recordResults forwards a per-result comment when present', async () => {
  const calls = stubFetch((c) =>
    c.url.includes('/run/') ? { result: { id: 9 } } : { result: { id: 1 } },
  );
  const runId = await new QaseClient(cfg).recordResults(
    [{ caseId: 7, status: 'failed', comment: 'failed on: problem' }],
    { jiraKey: 'SW-1', sourceUrl: 'u', runTitle: 'r' },
  );
  expect(runId).toBe(9);
  const result = calls.find((c) => c.url === 'https://api.qase.io/v1/result/SAUCE/9/bulk')!;
  expect(result.body).toEqual({
    results: [{ case_id: 7, status: 'failed', comment: 'failed on: problem' }],
  });
});

// ---- Rate limiting (Qase allows 200 requests/minute) ------------------------------------

// The defect these guard: one request per result made 246 calls for an `all` regression and
// tripped the limit on its own, and the client had no retry, so the first rejection lost the
// whole recording.

test('results go out in bulk, not one request each', async () => {
  const calls = stubFetch((c) =>
    c.url.includes('/run/') ? { result: { id: 5 } } : { result: {} },
  );
  const results = Array.from({ length: 150 }, (_, i) => ({ caseId: i, status: 'passed' as const }));

  await new QaseClient(cfg).recordResults(results, { jiraKey: '', sourceUrl: '', runTitle: 'r' });

  // One to open the run, one to post all 150 results. Not 151.
  expect(calls).toHaveLength(2);
  expect(calls[1].body!.results as unknown[]).toHaveLength(150);
});

test('more than 200 results are split, because Qase rejects a larger payload', async () => {
  const calls = stubFetch((c) =>
    c.url.includes('/run/') ? { result: { id: 5 } } : { result: {} },
  );
  const results = Array.from({ length: 245 }, (_, i) => ({ caseId: i, status: 'passed' as const }));

  await new QaseClient(cfg).recordResults(results, { jiraKey: '', sourceUrl: '', runTitle: 'r' });

  const chunks = calls.filter((c) => c.url.endsWith('/bulk'));
  expect(chunks.map((c) => (c.body!.results as unknown[]).length)).toEqual([200, 45]);
});

test('a suite is looked up once, however many cases share its path', async () => {
  const calls = stubFetch((c) =>
    c.method === 'GET' ? { result: { entities: [] } } : { result: { id: 1 } },
  );
  const client = new QaseClient(cfg);

  await client.ensureSuitePath(['login', 'no auth', 'Positive']);
  await client.ensureSuitePath(['login', 'no auth', 'Positive']);
  await client.ensureSuitePath(['login', 'no auth', 'Negative']);

  // Three levels resolved for the first path, one more for the differing leaf. Without the
  // cache this is nine lookups, and eighty cases across twenty paths cost 240.
  expect(calls.filter((c) => c.method === 'GET')).toHaveLength(4);
});

// Answers 429 once with the given Retry-After, then succeeds. The branch lives here rather
// than inside a test body (`playwright/no-conditional-in-test`).
function stubRateLimitedOnce(retryAfter: string | null): void {
  let first = true;
  globalThis.fetch = (async () => {
    const rejected = first;
    first = false;
    return rejected
      ? ({
          ok: false,
          status: 429,
          headers: { get: (h: string) => (h === 'Retry-After' ? retryAfter : null) },
          text: async () => 'API rate limit exceeded.',
        } as unknown as Response)
      : ({ ok: true, status: 200, json: async () => ({ result: { id: 3 } }) } as Response);
  }) as typeof fetch;
}

test('a 429 is waited out and retried, using the server Retry-After', async () => {
  const slept: number[] = [];
  stubRateLimitedOnce('7');

  const client = new QaseClient(cfg, async (ms) => {
    slept.push(ms);
  });
  expect(await client.archiveCase(1).then(() => 'ok')).toBe('ok');
  expect(slept).toEqual([7000]);
});

// A 401 answers the same however long you wait. Retrying it turns a clear error into a slow
// one, and hides the real cause behind a timeout.
test('a non-429 error is not retried', async () => {
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts++;
    return { ok: false, status: 401, text: async () => 'Unauthenticated.' } as Response;
  }) as typeof fetch;

  await expect(new QaseClient(cfg).archiveCase(1)).rejects.toThrow('401');
  expect(attempts).toBe(1);
});

// ---- Skipping the lookup for a case we already know ------------------------------------

test('a known case id is updated directly, with no search', async () => {
  const calls = stubFetch(() => ({ result: { id: 1 } }));

  const id = await new QaseClient(cfg).upsertCase(3, baseCase, 88);

  expect(id).toBe(88);
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe('PATCH');
  expect(calls[0].url).toBe('https://api.qase.io/v1/case/SAUCE/88');
});

// Answers 404 to the first call (the direct update), then behaves normally. The branch lives
// here rather than in a test body (`playwright/no-conditional-in-test`).
function stubMissingThenFound(): { url: string; method: string }[] {
  const calls: { url: string; method: string }[] = [];
  let first = true;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method });
    const gone = first;
    first = false;
    return gone
      ? ({ ok: false, status: 404, text: async () => 'Case not found' } as Response)
      : ({
          ok: true,
          status: 200,
          json: async () => ({ result: { entities: [], id: 12 } }),
        } as Response);
  }) as typeof fetch;
  return calls;
}

// The risk this covers: someone deletes or archives the case in Qase by hand. The map still
// names an id that no longer exists. Without the fallback the sync would fail; with it, the
// answer is the same one the search-only code gave.
test('a stale id falls back to search-and-create instead of failing', async () => {
  const calls = stubMissingThenFound();

  const id = await new QaseClient(cfg).upsertCase(3, baseCase, 404404);

  expect(id).toBe(12);
  expect(calls.map((c) => c.method)).toEqual(['PATCH', 'GET', 'POST']);
});

// A 500 is not a vanished case. Falling back would hide a real outage behind a second call
// and a created duplicate.
test('a non-404 failure on the direct update is not swallowed', async () => {
  globalThis.fetch = (async () =>
    ({ ok: false, status: 500, text: async () => 'boom' }) as Response) as typeof fetch;

  await expect(new QaseClient(cfg).upsertCase(3, baseCase, 88)).rejects.toThrow('500');
});

test('with no known id the behaviour is unchanged: search, then create', async () => {
  const calls = stubFetch((c) =>
    c.method === 'GET' ? { result: { entities: [] } } : { result: { id: 7 } },
  );

  const id = await new QaseClient(cfg).upsertCase(3, baseCase);

  expect(id).toBe(7);
  expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
});
