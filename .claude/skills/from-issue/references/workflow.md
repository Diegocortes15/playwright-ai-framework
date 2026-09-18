# from-issue Workflow

The procedural workflow Claude follows when the `from-issue` skill is invoked. The source ticket is a **Jira** issue (project `SW`), read via the Atlassian MCP — see ADR-0011.

## Inputs

- **Jira issue key** (required, positional) — e.g., `/from-issue SW-123` (project key `SW`).
- **`--from-file <path>`** (optional; replaces the key) — read the ticket from a local file
  instead of Jira, e.g. `/from-issue --from-file tickets/SW-99-login.md`. Jira stays the real
  ticket source (ADR-0011); this exists so the rest of the pipeline can be exercised without
  a live Atlassian connection, and so changes to this skill can be tested without burning a
  real ticket. **Steps 1.5 through 10 are identical; Steps 11, 11.5 and 12 are skipped**
  exactly as under `dry-run` — a file-sourced run is a rehearsal, not a delivery path
  (ADR-0026).
- **`--new-file`** (optional flag) — force CREATE-NEW instead of augmenting an existing feature spec (per ADR-0010, Step 8).
- **`dry-run`** (optional flag) — skip steps 11–12 (branch, push, PR). Files written and tests run locally only.

## Aborting

Many steps abort. From **Step 5 onward, every abort leaves files on disk** — that is where the
run starts writing: a scaffolded Page Object, a generated spec, an in-place edit to a committed
feature file, an appended user in `tests/users.ts`. ADR-0020 means no PR is opened. It does not
mean nothing happened.

**So every abort from Step 5 onward ends by naming what it left behind**, grouped the way
`git status` sees it, because the two cases need opposite treatment:

> Left on disk: `tests/inventory/inventory.spec.ts` (already committed, now modified) and
> `src/pages/ProductDetailPage.ts` (new, untracked). No PR was opened.

Not doing this has a specific, delayed cost. Step 1.5 refuses to run on a dirty tree — so the
wreckage never surfaces on the run that made it. It surfaces on the **next** invocation, as a
clean-tree refusal naming files the user has stopped connecting to the run that wrote them.

Do **not** revert the files yourself, and do not offer to. A failed run is the only evidence of
why it failed and the diff is most of that evidence; deciding whether a half-generated spec is
worth keeping needs a person who has read it.

## Steps

### 1. Validate inputs

**With `--from-file <path>`:** check the file exists and is readable. If not, abort with the
path and the error — don't guess at a nearby filename. Skip the key and MCP checks below; the
key comes from the file's front matter. `gh auth status` is still required unless `dry-run`.

**Otherwise:** check that a Jira issue **key** is present and matches `^[A-Z][A-Z0-9]+-\d+$` (e.g. `SW-123`). If missing or malformed, ask the user — don't guess.

Confirm the **Atlassian MCP** is connected (the skill reads tickets through it). If no Atlassian MCP tool is available, abort with: _"The Atlassian MCP isn't connected. Connect it in Claude Code (OAuth), then re-run — or pass `--from-file <path>` to read a ticket from disk instead."_

Check `gh auth status` exits 0 (needed for the PR in Step 12). If not, abort with: _"`gh` is not authenticated. Run `gh auth login` and re-run."_

### 1.5. Resolve and sync the base branch

```bash
base=$(.claude/skills/from-issue/scripts/sync-base-branch.sh)
```

The script resolves the branch this run will branch from (Step 11 targets it, and the Step 5/8
"does this feature already exist?" checks read its tree), verifies the tree is clean, and
fast-forwards it onto its remote. It never forces and never auto-merges.

| Exit | Meaning |
| ---- | ------- |
| 0 | `$base` holds the resolved branch — continue |
| 10 | You are on a previous ticket's branch. **Ask the user** which branch `<KEY>` should branch from, check it out, re-run. Never guess |
| 11 | Working tree is dirty. Abort with the script's message — it names the dirty paths, splitting modified-but-committed from untracked, and says an earlier aborted run leaves exactly this |
| 12 | The base diverged from its remote. Abort with the script's message |

Exit 10 is the one case that needs a person: the script can tell that the current branch is a
prior run's, but not which base was intended.

### 2. Fetch the ticket

#### With `--from-file <path>`

`Read` the file. It carries the same three fields the MCP returns, so everything after this
step is unchanged:

```markdown
---
key: SW-99
summary: [SW][QA][Login] User login
---

Feature: login

Scenario 1: Successful login
Given a valid standard_user
...
```

- Front matter gives `<KEY>` and `summary`; everything after it is the `description`, verbatim.
- The body is exactly what would go in a Jira description (see `docs/jira-tickets.md`), so a
  file doubles as a draft of a ticket not yet created.
- If the front matter is missing `key` or `summary`, abort naming which — do not invent them.

**Record `ticketSource = file:<path>` for the run.** It changes exactly two things, and
nothing else:

1. **Step 7 provenance header** — the generated spec's `// Source:` line reads
   `local file <path>`, not a Jira browse URL. A spec must never claim a Jira ticket that was
   never read.
2. **The run stops after Step 10.** Steps 11, 11.5 and 12 are skipped: no branch, no commit,
   no push, no PR, **and no TCMS records artifact** (ADR-0026).

Why no artifact: a records entry with no ticket behind it is a catalogue case that traces to
no requirement, which is the thing the Qase mirror exists to prevent — and `suite-sync.ts`
throws on an empty `jira` array, so such a record could never merge anyway. Earlier versions
of this workflow told you to write `"jira": []`; that instruction produced an artifact the
sync was coded to reject, and it is gone.

Report the local file paths and the verification status, exactly as a `dry-run` does. If the
generated tests should actually ship, run the ticket.

#### Otherwise

Read the ticket via the **Atlassian MCP's get-issue tool** for the key (e.g. `SW-123`), requesting the rendered/text form of the description.

> The connected Atlassian MCP server exposes a get-issue tool; confirm its exact name from the available tool list once the MCP is connected (commonly `getJiraIssue` / `jira_get_issue`). Until connected, refer to it generically.

Capture: `<KEY>` (the issue key), `summary` (the title), and `description` (rendered text). If the ticket doesn't exist or you lack access, abort with the MCP error verbatim.

### 4. LLM normalization

Tickets are authored many ways and at any quality (trainee → senior BA). **Normalize whatever the ticket contains — format- AND quality-agnostic** (per ADR-0012): a formal "As a / I want / so that" narrative, Given/When/Then scenarios, a bullet/numbered AC list, plain prose, structured fields, or a partial/mixed blob all reduce to the same internal AC records. Extract from the summary + description:

- **Feature** (single-line slug) — drives `tests/<feature>/`. If not stated, infer it from the summary/subject (and record the inference as an assumption, below).
- **Acceptance Criteria** — one behavior each, derived from whatever form the ticket used.
- **Notes** (optional) — context only.

While normalizing, also capture (used by the PR's "What I understood", Step 7 / `pr-description-template.md`):

- **`requirement_form`** — one of `narrative` / `gwt` / `bullets` / `prose` / `structured` / `mixed`.
- **`requirement_restated`** — a faithful restatement of what the ticket actually says (the narrative if one is present; a scenario summary for GWT; a paraphrase for prose).
- **`assumptions[]`** — every inference or ambiguity resolution **not explicit** in the ticket (e.g. "user unspecified → defaulted to `standard_user`"; "'works correctly' interpreted as lands on inventory"). Empty when the ticket was fully explicit.

(Page Object names are inferred from AC text — see "Page inference from AC text" below.)

For each Acceptance Criterion, build an internal record:

```
{
  id: 1,  // sequential
  text: "<normalized AC text>",
  user: "<inferred saucedemo user, e.g., standard_user; default standard_user if unspecified>",
  worth_automating: true | false,
  rationale: "<LLM justification; required when worth_automating=false>"
}
```

**Skip-signal = LLM judgment from AC text.** Examples of ACs to skip:
- "Visual aesthetic — manual review only"
- "Verify the spelling of the button label" (low automation value)
- "Confirm legal copy matches the marketing-approved version" (data may shift)

**Vague / low-quality tickets** (per ADR-0012): do NOT abort and do NOT pause to ask. Produce a **best-effort** normalization, record every inference in `assumptions[]`, and let the PR's **⚠️ Assumptions & open questions** block surface them for the reviewer (the PR is the review gate). Abort **only** when nothing testable can be extracted at all:

> _"Couldn't extract any testable behavior from ticket `<KEY>`. Ask the reporter to follow `docs/jira-tickets.md`."_

**If `worth_automating=false` for ALL ACs**, abort BEFORE writing files. Report the per-AC rationale to the user, with the recommendation to close ticket `<KEY>` if the assessment is correct or refile with more concrete ACs. No Jira write-back is performed (per ADR-0011) and no PR is opened. Then stop.

#### Free-form / GWT body handling

A well-authored ticket (per `docs/jira-tickets.md`) has a `Feature:` line and one AC per line in the description. If the description uses a looser format (e.g., free-form Given/When/Then scenarios, no headings, partial structure), best-effort parse:

- Extract the **Feature** field from any heading or first line that looks like a feature name
- Look for Acceptance Criteria in any list/bullet form, regardless of `### Acceptance Criteria` heading
- Recognize GWT-style scenarios (`Given... When... Then...`) as ACs, one scenario = one AC candidate
- If parsing fails entirely (no recognizable ACs anywhere), abort with: _"Couldn't extract ACs from ticket `<KEY>`. Ask the reporter to follow `docs/jira-tickets.md`."_

#### Page inference from AC text

Tickets do not carry a Page Name field. Extract Page Names from AC text by:

- Scanning each AC for mentions of UI surfaces ("from the LoginPage", "on the cart page", "checkout overview", etc.)
- Mapping each mention to a PascalCase Page Object name (e.g., "login page" → `LoginPage`, "cart page" → `CartPage`)
- Building a set of unique Page Names referenced across all ACs

If zero pages can be inferred: abort with: _"Couldn't infer any Page Object references from the AC text. Ask the reporter to mention UI surfaces explicitly (e.g., 'from the LoginPage', 'on the checkout overview')."_

#### Wire QA analysis (NEW reference doc)

Before producing the per-test records (Step 6), apply senior QA SDET judgment to the extracted ACs per [`qa-analysis.md`](qa-analysis.md):

- Identify ACs to MERGE (shared setup + parameterized variants)
- Identify ACs to SPLIT (compound behaviors that should be separate tests)
- Identify ACs to SKIP (non-automatable, out of scope, redundant)

Each merge/split/skip decision must be surfaced in the PR body's "What I understood" + AC coverage table + "Notes for reviewer" section (per `pr-description-template.md`).

### 5. Resolve target Page Object

```bash
ls src/pages/<PageName>.ts 2>/dev/null
# If not found at top level, also check the checkout subfolder:
ls src/pages/checkout/<PageName>.ts 2>/dev/null
```

- **Either path exists** → reuse the existing Page Object. Record a collision warning for the PR body. During render (Step 7 / Step 8.5), the Page Object may need changes to support the new tests:
  - **Add** — a new test needs a locator/method the Page Object lacks → **append** it, following the composed-vs-primitive + `test.step` conventions in `scaffold-page-object/references/page-object-template.md`. Existing members are untouched. Record any selector that lands below the preference order (`[data-test]` → `getByRole` → text → CSS) as you write it — Step 13 reports it (ADR-0022). When the new members query many similar elements (cards/rows), choose parallel-array queries vs a discriminator component per `scaffold-page-object/references/component-detection.md` ("Parallel-array queries vs a discriminator component"). **Component-extraction judgment applies on augment, not just at page-scaffold:** if the new members form a **distinct sub-widget** — its own panel/menu/region with several locators + actions (e.g. a header burger menu) — prefer extracting a **nested component** (composed by the target, depth ≤ 2 per rule #11, like `CartBadge` under `Header`) over fattening the target into a multi-widget grab-bag. Apply `component-detection.md`'s "is this a component?" test to the new cluster. (SW-10/SW-11's burger menu accreted onto `Header` member-by-member before it was extracted into `BurgerMenu` — the per-ticket append never stepped back to see the emerging widget; this note is that step-back.)
  - **Modify** — a new test needs an **existing** method to behave differently → modify it in place. Per ADR-0010, modifying a shared method can regress other specs; Step 10 runs the smoke set alongside the target spec, which is where a regression in a shared method shows up; the merge run's full suite is the broad net (ADR-0032).
  - **Irreconcilable** — if a required change would break the existing method's contract in a way you cannot reconcile, **abort**: _"augmenting <KEY> needs `<Method>` to change incompatibly; edit `<PageObject>` manually, then re-run."_ No PR.
- **Neither path exists** → invoke `/scaffold-page-object` with inputs:
  - Page name: `<PageName>`
  - URL: inferred from the AC text (e.g., AC mentions "cart page" → `https://www.saucedemo.com/cart.html`)
  - storageState: `auth/standard.json` by default. Override only if ALL Step 4 AC records share the same non-standard user (the storageState is only used for the snapshot; tests pick their own user via tag→project mapping). The project that actually runs each test is wired in Step 6.5 — see [`references/harness.md`](harness.md).

  If `/scaffold-page-object` fails, abort with the subprocess error verbatim. No PR.

### 6. Analyze ACs

Group the `worth_automating=true` AC records into a set of tests. One test may cover multiple ACs. For each test, record:

```
{
  title: "<behavior-only description, e.g., 'remove single item from cart updates badge'>",
  covers: [1, 3],  // AC IDs
  user: "<saucedemo user>",
  tags: ["<auth-tag>", "<user-tag-if-not-no-auth>"],
  bucket: "Positive" | "Negative" | "Edge",
  smoke: true | false
}
```

Tag selection follows CLAUDE.md "Tag conventions" table. Title format follows [`references/test-template.md`](test-template.md) "Rules". Bucket assignment follows [`references/bucket-classification.md`](bucket-classification.md) — read it before classifying. The bucket lives on the test (not on the AC) because one test can cover multiple ACs; classify by the test's dominant behavior, using the ambiguity rules in bucket-classification.md as the tiebreaker.

**Read the existing `@smoke` set first.** One of the policy's criteria is relational — a test is *not* smoke when "a more critical version of the same error is already smoke" — and that cannot be evaluated without knowing what already carries the tag:

```bash
npx playwright test --grep "@smoke" --list 2>/dev/null | grep "›" | grep -v "auth.setup" | sed 's/.*› //' | sort -u
```

Ignore the `authenticate as <user>` line if it appears: that is the auth-setup pseudo-test, not a smoke case. If the command fails for any reason, assign smoke without it and note in the PR body that the relational criterion went unchecked — do not guess at what is already tagged.

Smoke assignment then follows [`references/smoke-policy.md`](smoke-policy.md) — read it before classifying. Smoke status is orthogonal to bucket: a Negative test can be smoke (critical regression risk) and a Positive test can be NOT-smoke (peripheral happy path). The default per smoke-policy.md is `false` ("when in doubt, NOT smoke").

Data placement follows [`references/data-placement.md`](data-placement.md) — decide, per dataset, whether the test's data is **inline** (the default for small, test-local parameterization) or **externalized** to `data/` (only on a concrete trigger: reused / large / non-engineer-owned / env-specific / named scenario). Most issues keep data inline; if any dataset hits an externalize trigger, note that the spec render (Step 7) and commit (Step 11) must also create + stage the `data/` file(s) and loader.

**Validate bucket values before Step 7.** Each test's `bucket` must be one of `{Positive, Negative, Edge}`. If the LLM emits any other value (e.g., `"Boundary"`), default that test to `Edge` and record a soft warning for the PR body's Verification section: `⚠️ LLM emitted invalid bucket "<value>" for test "<title>" — defaulted to Edge. Reviewer: verify classification.`

**Validate smoke values before Step 7.** Each test's `smoke` must be exactly `true` or `false`. If the LLM emits any other value, default that test to `false` and record a soft warning for the PR body's Verification section: `⚠️ LLM emitted invalid smoke value "<value>" for test "<title>" — defaulted to false. Reviewer: verify classification.`

**If `references/bucket-classification.md` is missing or unreadable**, abort with: _"`.claude/skills/from-issue/references/bucket-classification.md` not found. Re-install the skill or restore from git."_ Do not fall back to inline rules — the doc is the source of truth.

**If `references/smoke-policy.md` is missing or unreadable**, abort with: _"`.claude/skills/from-issue/references/smoke-policy.md` not found. Re-install the skill or restore from git."_ Do not fall back to inline rules.

### 6.5. Resolve & grow the harness

Per [`references/harness.md`](harness.md) (read it before this step). From the Step 6 test records, compute the **required user set**: `@no-auth` tests need no user; user-agnostic tests (`@all-users`/`@standard`) need only `standard`; a test targeting a specific user needs that user.

For each required user **not** wired in `tests/users.ts` `AUTH_USERS`, **append it autonomously** — no mid-run question, no recovering config from git history. The data-driven `playwright.config.ts` + `tests/auth.setup.ts` derive the project + storageState from the array. If `tests/users.ts` / the data-driven config / `auth.setup.ts` don't exist yet, create all three from the canonical shapes in `harness.md`, seeded with the required users.

**Guardrail (ADR-0004):** never pre-create unused users; never add `<browser>-<non-standard>` projects. Cross-browser stays out.

Record a side-effect note for the PR body: `⚙️ Harness grew: wired the <user> project + auth setup (first ticket needing <user>). Reviewer: confirm.`

### 7. Render test file

Apply [`references/test-template.md`](test-template.md). Also consult [`references/test-principles.md`](test-principles.md) (F.I.R.S.T. principles), [`references/playwright-conventions.md`](playwright-conventions.md) (Playwright best practices), and [`references/data-placement.md`](data-placement.md) (inline vs. externalized test data) to ensure the rendered tests comply with project quality standards:

- Top-of-file 5-line provenance block (substitute today's date, Jira key, URL, summary)
- Imports: `@fixtures/test` (always), `@utils/env` (when password needed)
- One `test.describe('<feature> — <context-label>', { tag: '<routing-tag>' }, ...)` per user-context (per ADR-0015) — the routing tag lives in the **`{ tag }` option, not the title** (see test-template.md for the context-label mapping). Multiple contexts in one feature = sibling tagged describes in the same file.
- Inside each context describe, group tests by their `bucket` field into up to three nested `test.describe('Positive' | 'Negative' | 'Edge', ...)` blocks
- Bucket describes appear in fixed order: **Positive → Negative → Edge** (even if Negative tests outnumber Positive)
- **Omit empty buckets entirely** — if no tests were classified into a bucket, don't emit its describe block at all
- Within each bucket describe, tests appear in their Step 6 emission order

Each `test(...)` title is **pure prose** (behavior-only) — NO tags in the title. If `smoke: true`, attach `{ tag: '@smoke' }` as the test's options arg: `test('<behavior>', { tag: '@smoke' }, async (...) => {...})`; if `smoke: false`, omit the options arg entirely. The routing tag is NOT repeated on the test — it's on the context describe. This is the format defined in [`references/test-template.md`](test-template.md) "Rules".

Render to an in-memory string. Do NOT Write yet — Step 8 handles overwrite refusal first.

### 8. Write test file

The test file is named after the **Feature**, not the issue title. The framework targets a single app (saucedemo), so issue-title prefixes like `[SDA]` and suffixes like "Login in Saucedemo App" are redundant noise in a filename.

```
tests/<feature>/<feature>.spec.ts
```

Where `<feature>` is the snake_case Feature field. Example: Feature `login` → `tests/login/login.spec.ts`.

#### Collision handling

Resolve the target path **and the write mode**. Read the contributor set of `tests/<feature>/<feature>.spec.ts` if it exists — that is the origin key on line 1 (`// Generated by /from-issue ... from Jira <KEY>.`) **plus** every key on the `// Augmented by:` line (if present). Then:

| Condition                                              | Mode                                                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--new-file` flag passed                               | **CREATE-NEW** — use `tests/<feature>/<feature>.spec.ts`, or `tests/<feature>/<feature>-<KEY>.spec.ts` if that exists (refuse if the suffixed path also exists for this same issue) |
| File does **not** exist                                | **CREATE-NEW** — write a fresh `tests/<feature>/<feature>.spec.ts`                                                                                                                  |
| File exists, `<KEY>` **is** in the contributor set     | **REFUSE** — _"issue <KEY> already contributed to `tests/<feature>/<feature>.spec.ts`. `rm` the relevant tests or edit it directly."_ No PR.                                       |
| File exists, `<KEY>` is **not** a contributor          | **AUGMENT** — go to Step 8.5                                                                                                                                                        |

For **CREATE-NEW**, ensure `tests/<feature>/` exists (`mkdir -p` if needed), then Write the file. For **AUGMENT**, Step 8.5 edits the existing file in place. In both cases, call the resolved path **`<testfile>`** — later steps reference it.

The new test title format, bucket structure, and the header block are unchanged from Step 7 / [`test-template.md`](test-template.md); AUGMENT reuses the same rendering, then inserts rather than writing a fresh file.

### 8.5. Insert into the existing file (AUGMENT mode only)

Skip this step entirely in CREATE-NEW mode. In AUGMENT mode, edit `<testfile>` in place with targeted `Edit` calls — never regenerate the whole file (that would destroy manual edits, per ADR-0010).

**Resolve the context describe by tag (per ADR-0015).** The file holds one `test.describe('<feature> — <context-label>', { tag: '<routing-tag>' }, ...)` per user-context. Find the sibling describe whose `{ tag }` equals the new tests' routing tag:

- **Match found** → insert the new tests into THAT describe's bucket blocks (the bucket logic below operates within it).
- **No match** → add a NEW sibling `test.describe('<feature> — <context-label>', { tag: '<routing-tag>' }, ...)` (with its own bucket children) after the existing context describes. This is the multi-user case (e.g. file has `@problem`, new tests are `@standard`) — no abort, no `--new-file` needed.

**Pre-check — structure recognizable.** If the file has no locatable outer `test.describe` or its bucket describes can't be found (hand-restructured beyond recognition), **abort**: _"couldn't locate insertion point in `<testfile>`; add the tests manually or re-run with `--new-file`."_

For each new test record (already bucket-classified in Step 6):

1. **Duplicate guard — scoped to the resolved context describe, never the whole file.** Normalize the record's title (lowercase, collapse whitespace) and compare it against the normalized titles **inside the context describe resolved above**. On a clear match, **skip** the record and note: `⏭️ skipped "<title>" — already covered by "<existing test>" in <context-label>`. When unsure, include it and let the reviewer decide (matches [`qa-analysis.md`](qa-analysis.md)'s conservative "default NOT skip").

   **An identical title in a _different_ context describe is not a duplicate — it is the multi-user case, and it must be inserted.** One file holds one describe per user-context, so `every product price is formatted with a leading dollar sign` under `@standard` and the same sentence under `@problem` are two different tests: same assertion, different user, and only one of them has coverage. A file-scoped comparison skips the second, reports `⏭️ already covered`, and hands back a PR claiming coverage that does not exist — the failure ADR-0020 exists to prevent, arriving as a green run rather than a red one.

   Do **not** strip tags while normalizing. Tags have not lived in titles since ADR-0015 moved them to the `{ tag }` option, so there is nothing to strip; an instruction to strip them can only mislead a reader into thinking title-embedded tags are still a thing.
2. **Locate the bucket** _within the resolved context describe_ (above). Find the `test.describe('Positive' | 'Negative' | 'Edge', () => { ... })` block matching the record's `bucket`.
   - Block exists → `Edit` to insert the new `test(...)` at the end of that block (before its closing `});`).
   - Block absent → insert a new bucket describe in the fixed **Positive → Negative → Edge** order, positioned correctly relative to existing buckets.
3. **Render the test body** exactly as Step 7 would (no spec-level `test.step`; steps live in Page Object methods per [`playwright-conventions.md`](playwright-conventions.md)).

**Update the header.** Append this issue to the `// Augmented by:` line as `<KEY> (YYYY-MM-DD)` (comma-separated). If the line doesn't exist yet, add it directly below the `// Title:` line:

```ts
// Augmented by: <KEY> (YYYY-MM-DD)
```

Record which records were `added` vs `skipped` for the PR body (Step 12).

### 9. Isolated typecheck

Run the typecheck script. Paths are **repo-relative**; pass every file this run created or
modified — the spec, plus any Page Object from Step 5 and any data file from Step 7:

```bash
.claude/skills/from-issue/scripts/typecheck-spec.sh <testfile> [src/pages/<PageName>.ts ...]
```

The script writes a throwaway tsconfig that extends the project's own (so `@fixtures/test`
and `@pages/*` resolve), typechecks through it, and always cleans up. It resolves `tsc` from
`node_modules/.bin` and refuses to run otherwise — never `npx tsc`, which with `node_modules`
absent silently fetches `tsc@2.0.4`, a deprecated squatter package that is not the TypeScript
compiler and would hand back a PASS the run never earned.

| Exit | Meaning |
| ---- | ------- |
| 0 | Clean → record `Typecheck: ✅ PASS` |
| 64 | Bad usage — you passed no files |
| 66 | No `tsconfig.json` at the repo root |
| 69 | TypeScript not installed → run `npm install`, then retry this step |
| other | Type errors, printed verbatim |

- **Exit 0** → record `Typecheck: ✅ PASS` and continue to Step 10.
- **Exit 64 / 66 / 69** → an environment problem, not a defect in the generated code, and
  not something this skill fixes on its own. Report it and stop — for 69, tell the user to run
  `npm install` and re-run the skill. These never consume a fix attempt.
- **Type errors** → capture verbatim and go to **Step 10.5**. Do NOT continue to Step 11.

### 10. Run the generated tests

**Run the smoke set, then the target spec.** Two commands, in that order (ADR-0032):

```bash
npx playwright test --grep "@smoke"
npx playwright test <testfile>
```

Smoke first because it is ~8 tests and a few seconds, and a critical-path regression should
stop the run before anything slower. Then the spec this run generated or augmented.

**Do not compute an "affected" set and do not run the whole suite.** Both were tried and both
are recorded in ADR-0032: a resolver that walks names and imports bottoms out at 87% of this
suite, because one Page Object is named by almost every spec; and the full suite inside a
generation loop is paid up to three more times by the fix loop. The broad net is the merge
run's job, not this step's.

Record in the PR's Verification section that smoke plus the target spec ran, with per-test
PASS/FAIL for both.

**Never pass `--reporter=...` here.** The flag *replaces* the reporter list from
`playwright.config.ts`, which silently drops `ObservationsReporter` — the run would produce
no `.observations/<feature>.json` and Step 11 would stage nothing (ADR-0021). The config
already includes `list`, so console output is unchanged without the flag.

Capture per-test PASS/FAIL output. Record one line per test for the PR body's Verification section:

- ✅ PASS → `` `<test title>` — ✅ PASS ``
- ❌ FAIL → `` `<test title>` — ❌ FAIL: <one-line message> `` plus a `<details>` block with verbatim failure output

If every test passed **and** Step 9 was clean, continue to Step 11. If anything failed, go to **Step 10.5** — a run never opens a red PR (ADR-0020).

### 10.5. Fix loop — the no-red-PR gate

**Only if Step 9 or Step 10 failed.** A run never opens a red PR (ADR-0020). Read
[`fix-loop.md`](fix-loop.md) and follow it — the diagnosis, the 3-attempt budget, the list of
fixes that are never allowed, and what a blocked run reports instead of opening a PR.

If both steps passed, skip straight to Step 11.

### 11. Branch + commit + push

**Skip check:** If `dry-run` **or `--from-file`** was passed, SKIP this step and Step 12. Report the local file path and verification status only. (`--from-file` per ADR-0026: a file-sourced run is a rehearsal and produces no artifacts.)

First record the branch you're on — the PR will target it (Step 12):

```bash
git branch --show-current   # capture as <base-branch> (e.g. e2e-jira-from-issues, or main)
git checkout -b <KEY>-<feature>
```

The branch is named **`<KEY>-<feature>`** — the exact uppercase Jira key first, then the feature slug (e.g., `SW-1-login`). Key-first per ADR-0012; the GitHub-for-Jira app matches the key (case-insensitively) to auto-link the PR onto ticket `<KEY>`.

If the branch already exists, abort with: _"Branch `<KEY>-<feature>` exists — delete it and re-run."_ No PR.

```bash
git add <testfile>
# If /scaffold-page-object created a new file during Step 5, also stage its actual path.
# Use the resolved path from Step 5 — could be src/pages/<PageName>.ts OR src/pages/checkout/<PageName>.ts.
# Example (top-level page):
#   git add src/pages/<PageName>.ts
# Example (checkout subfolder):
#   git add src/pages/checkout/<PageName>.ts
# If Step 7 externalized data per data-placement.md, also stage the data file(s) + loader:
#   git add data/scenarios/<feature>/<name>.json data/shared/<name>.json data/fixtures.ts data/types.ts
# Runtime observations (ADR-0021): DO NOT stage .observations/observations.json.
#
# This instruction used to say to stage it. It is reversed because ADR-0032 narrowed Step 10 to
# smoke plus the target spec, which makes EVERY run a partial run — and ADR-0029 records that a
# partial run writes false `absentSince` marks, because a signature is marked absent when the
# run exercised every feature in its `seenIn` and a narrow run did not exercise them at all.
# Staging it writes "not seen since <today>" into the record on evidence the run did not earn.
#
# Two consecutive runs (SW-20, SW-21) hit this and both resolved it by judgment, which is the
# signal that the instruction was wrong rather than the runs.
#
# So: discard the change, and report the real entries in the PR body instead — render them with
# `npm run observations` and describe any NEW signature in prose. A full `npm test` on main
# regenerates the index correctly, which is where that file's updates belong.
#
# If a new signature matters enough to be recorded rather than described, say so in the PR body
# and let the reviewer stage it deliberately. Do not stage it as a side effect of a partial run.
# If Step 6.5 grew the harness (per harness.md), also stage the changed source of truth
# (and, on first-time creation, the config + auth setup):
#   git add tests/users.ts
#   git add playwright.config.ts tests/auth.setup.ts   # first-time creation only
git commit \
  -m "feat(<feature>): automate <KEY> <feature> scenarios" \
  -m "<body: 1–3 sentences — coverage added (N tests across buckets), the scenarios/ACs covered, and any scaffold/side-effects (new Page Object, fixture registration, externalized data, augment)>" \
  -m "Refs: <KEY>" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin <KEY>-<feature>
```

**Conventional Commit (per ADR-0012):** subject `feat(<feature>): automate <KEY> <feature> scenarios` — imperative, ≤ ~72 chars; `<feature>` is the scope. Body explains what + why. `Refs: <KEY>` trailer ties the commit to the ticket. Each block is a **separate `-m`** flag.

**Commit message — never use a shell here-string.** Keep the subject as one `-m`, and pass any body or trailer (e.g. the `Co-Authored-By:` line the project requires) as **additional `-m` flags**, as shown above. Do NOT use `<<'EOF'` (bash) or `@'...'@` (PowerShell): wrong-shell heredoc syntax leaks stray characters into the commit subject. This has happened: PowerShell here-string syntax used inside the Bash tool produced a literal `@` prefix on the subject and forced an amend + force-push. Repeated `-m` flags are cross-shell safe and need no escaping — same reason Step 12 writes the PR body to a file.

If `git push` fails (no remote, no auth), abort with the git error verbatim. The local branch and files remain on disk.

### 11.5. Write the TCMS records artifact (Qase, at-merge model)

**Skip** if `dry-run` **or `--from-file`** (ADR-0026 — no ticket, so no catalogue entry). Per [`references/tcms-sync.md`](tcms-sync.md): write the Step 6 semantic model to **`.tcms/records/<feature>.json`** — keyed by **feature, not ticket**: **append** to the existing feature file when one exists (Step 1.5 guarantees you branched from a base that includes any merged sibling work), create it only if absent. One object per generated test: `title`, `acText`, `user`, `tags`, `bucket`, `feature`, `contextLabel`, plus a **per-record `jira` array** (`[{ "key": "<KEY>", "url": "…/browse/<KEY>" }]`) — there is **no file-level `meta` block** (a feature file legitimately spans tickets; see [`tcms-sync.md`](tcms-sync.md) for the exact shape). `git add` it with the rest of the change (Step 11). This does **NOT** touch Qase. The authoritative Qase create/update/archive runs **at merge** in CI (`npm run tcms:sync`, see ADR-0017), so a rejected PR never mutates Qase. No `QASE_*` is needed at PR time.

### 12. Open PR

Render the PR body using [`references/pr-description-template.md`](pr-description-template.md). **Use the Write tool to put the body in a temporary file**, then pass it to `gh pr create --body-file` (do NOT use bash heredoc — see note below):

1. Write the rendered PR body to `.pr-body.md` using the Write tool.
2. Open the PR:

   ```bash
   # If <base-branch> (captured in Step 11) isn't on the remote yet, push it first so the PR can target it:
   #   git push -u origin <base-branch>
   gh pr create --base <base-branch> \
     --title "feat(<feature>): automate <KEY> <feature> scenarios" \
     --body-file .pr-body.md
   ```

   - **`--base <base-branch>`** = the branch recorded in Step 11 (the one you branched from) — the integration branch during a build-up, `main` in normal use. Never hardcode `main`.
   - **Title** is the Conventional-Commit form (matches the commit subject), per ADR-0012. The PR body MUST also reference `<KEY>` so the GitHub-for-Jira app links it.

3. After PR creation succeeds, delete the temp file:

   ```bash
   rm .pr-body.md
   ```

Capture the returned PR URL — `gh pr create` writes it to stdout on success (the only line of output is the URL).

If `gh pr create` fails (no remote, no permission), abort with the `gh` error verbatim. The local branch and pushed branch remain on the remote.

**Why `--body-file` instead of `--body "$(cat <<'EOF' ... EOF)"`:** the inline heredoc pattern (used in earlier workflow versions) is fragile when the PR body contains backtick-wrapped code spans (e.g., `` `/from-issue` ``, `` `LoginPage` ``, `` `src/fixtures/test.ts` ``). The skill can mis-escape the backticks and leak template-literal-style syntax (`` ` + "..." + ` ``) into the rendered PR body. Writing to a file first eliminates the escaping problem entirely.

### 13. Report to user

No Jira write-back is performed: the **GitHub-for-Jira app** auto-links the PR to ticket `<KEY>` from the key in the branch + PR title/body.

_(If the link doesn't appear on the ticket, **say so and stop** — do not try to post a comment. This skill declares only the two Atlassian **read** tools, so it cannot write to Jira, and per ADR-0013 `/refine-ticket` is the only skill that does. An earlier version of this step told you to "post a comment-back via the Atlassian MCP as a fallback", which was never executable with the declared tools. Note also that whether the auto-link fired is **not checkable from the MCP**: the app writes Jira "development information", which `getJiraIssueRemoteIssueLinks` does not expose — it returns `[]` even for tickets whose PR merged long ago. Confirming it means looking at the ticket's Development panel.)_

Report to the user:

- PR URL
- Test count (generated)
- Skipped-AC count (if any)
- Collision warnings (if any)
- Typecheck status
- Test run result (PASS/FAIL counts)
- Fix attempts, if Step 10.5 ran: how many, and what each one changed
- Obstacles encountered (see below) — always, even if none

**Obstacles encountered** — ALWAYS render this section, even when there is nothing to
report (then it is one line: `Obstacles encountered: none.`). It is a deliberate exception
to the "omit empty sections" rule (ADR-0022): a section that can be dropped is one the
agent learns to drop, and the empty state only means something because it cannot be.

It carries exactly three things, and nothing that already has a channel elsewhere:

1. **Selector downgrades.** The preference order is `[data-test]` → `getByRole` → text →
   CSS, and only XPath fails lint. So when you write a locator below the highest level
   *available on the page*, nothing catches it but this line. Name the element, the level
   available, the level you used, and why. A stable unique id is a perfectly good locator —
   the point is not to apologise for it, it is that the reviewer learns you looked.
2. **Tooling friction** — a command or MCP call that failed and was retried or worked
   around. Say what failed and what you did instead.
3. **Reference gaps** — where this skill's own `references/` did not cover the case and
   you had to improvise. **Name the file that should have covered it.** This is the only
   signal that says what is stopping the skill from working as it should.

Do NOT restate what is already reported: ticket inferences belong in the assumptions
block, failed runs in the fix log, and collisions / harness growth / skipped ACs in their
own notes.

Done.

_(A run that reached this step is green — a blocked run reported itself in Step 10.5 and never got here.)_
