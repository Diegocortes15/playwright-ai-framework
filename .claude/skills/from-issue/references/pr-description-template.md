# PR Description Template

The `/from-issue` skill writes its PR body using this template. Section order is mandatory; reviewers expect to find each section in this position.

## Template

```markdown
## What I understood from the ticket

> Automated Playwright coverage for `<KEY>` (`<feature>`): <N> tests, all passing.

**Source ticket:** [<KEY>](<jira-issue-url>) — <issue-type>: "<summary>"
**Feature:** <feature>
**Requirement (as written):** <restatement shaped by `requirement_form` — restate the narrative if present; summarize the GWT scenarios; paraphrase prose into intent>

**Acceptance Criteria (normalized):**
- AC 1: <normalized text>
- AC 2: <normalized text>
- ...

**⚠️ Assumptions & open questions:** <render this block ONLY when `assumptions[]` is non-empty; omit entirely otherwise>

- <each inference/ambiguity, one per bullet, inviting reviewer confirmation — e.g. "Ticket didn't name a user → assumed `standard_user`. Reviewer: confirm.">

## AC coverage

| AC | Test | Bucket | Status |
|----|------|--------|--------|
| AC 1: <truncated text> | `<test title>` | Positive | ✅ generated |
| AC 2: <truncated text> | `<test title>` | Negative | ✅ generated |
| AC 3: <truncated text> | — | — | ⚠️ skipped: <LLM rationale> |

## Verification

- **Typecheck:** ✅ PASS
- **Test run:**
  - `<test title 1>` — ✅ PASS
  - `<test title 2>` — ✅ PASS
- 🗂️ **TCMS records:** `.tcms/records/<KEY>.json` written + committed (Qase syncs at merge — see ADR-0017).

## Notes for reviewer

(omit this section entirely if no notes)

- ⚠️ **Side effect:** the workflow modified `<file>` to make the generated test runnable. Verify the change is reasonable.
- ⚠️ **Side effect (externalized data):** per [`data-placement.md`](data-placement.md), N `<feature>` scenario(s) were externalized to `data/scenarios/<feature>/` + a loader in `data/fixtures.ts` (reused/large/named-scenario data). Reviewer: verify the loader + payloads. _(Omit when data stayed inline — the default for small, test-local parameterization.)_
- 🔁 **Augment:** this PR **augmented** an existing spec `tests/<feature>/<feature>.spec.ts` (prior contributors: `<KEY-list>`) rather than creating a new file. AC-coverage rows below are marked `added` or `skipped (already covered)`.
- ➕ **Page Object additions:** appended `<members>` to `<PageObject>` for the new tests (existing members untouched).
- ⚙️ **Harness grew:** wired the `<user>` project + auth setup (first ticket needing `<user>`) by appending to `tests/users.ts` `AUTH_USERS` (per ADR-0014). Reviewer: confirm. _(Omit when no new user was wired.)_
- ⚠️ **Smoke overlap:** `<new test>` covers the same failure as `<existing test>`, which is currently `@smoke`. Nothing was changed on the existing test — see `smoke-policy.md`. Reviewer: consider whether the older one still earns the tag.
- ⚠️ **Page Object modification:** modified existing method `<Method>` on `<PageObject>`. Because other specs may call it, the verification scope widened to every spec the resolver maps to that file (see Verification). Reviewer: confirm no dependent spec regressed.
- ⏭️ **Skipped (duplicate):** AC <id> maps to a test already present (`<existing test>`); not re-added. Reviewer: push back if the existing test doesn't actually cover it.
- _(Include only the augment notes that apply; omit this whole group for plain CREATE-NEW runs.)_
- 📝 **LLM judgment (MERGE):** AC X and AC Y were merged into one parameterized test because both share the same setup + flow with different inputs. Reviewer: push back if you want them split.
- 📝 **LLM judgment (SPLIT):** AC Z contained compound behaviors and was split into N tests. Reviewer: push back if you wanted one mega-test.
- 📝 **LLM judgment (SKIP):** AC W was skipped because <rationale per qa-analysis.md>. Reviewer: push back if you want it generated.

## Collision warnings

(omit this section entirely if no collisions)

- ⚠️ **Page Name collision** — `<PageName>` already exists at `<resolved-path>` (e.g., `src/pages/<PageName>.ts` or `src/pages/checkout/<PageName>.ts`). Reused the existing Page Object; did NOT call `/scaffold-page-object`. Reviewer: verify the existing Page Object exposes the methods this PR's tests rely on, or refile the ticket with a different Page Name.

## Obstacles encountered

(ALWAYS render this section — when there were none it is exactly: `None.`)

- 🎯 **Selector downgrade** — `<element>`: wanted `<preferred level>`, used `<actual level>` because `<reason>`. Reviewer: this one is a fallback, not a first choice.
- 🔧 **Tooling friction** — `<what failed>`; `<what you did instead>`.
- 📚 **Reference gap** — `<case the instructions didn't cover>`; improvised `<what you did>`. Should be covered by `references/<file>.md`.
```

## Rules

- **Section order is mandatory** — `What I understood` → `AC coverage` → `Verification` → `Notes for reviewer` (optional) → `Collision warnings` (optional) → `Obstacles encountered` (**never optional**). (No `## Source` footer — the `Source ticket:` line in "What I understood" already names + links the ticket.)
- **"What I understood" block** (adaptive, per ADR-0012):
  - **Summary** lead (`> `) — one TL;DR line: `Automated Playwright coverage for <KEY> (<feature>): N tests, all passing.`
  - **`Source ticket:`** — mandatory: `[<KEY>](<jira-url>) — <issue-type>: "<summary>"`. This is the key the GitHub-for-Jira app matches in the PR body to link the PR onto the ticket — so no separate `## Source` footer is needed.
  - **`Source ticket:` for a `--from-file` run** — render it as `` `<KEY>` — from local file `<path>` (not a Jira ticket) ``, unlinked. Add one line at the top of the PR body: `> ⚠️ Generated from a local ticket file, not a Jira ticket. The GitHub-for-Jira link will not appear.` A reviewer must never have to work out why a plausible-looking key resolves to nothing.
  - **`Feature:`** — the snake_case feature.
  - **`Requirement (as written):`** — restate the requirement in whatever form the ticket used (`requirement_restated` from Step 4): the narrative if present, a scenario summary for GWT, a paraphrase for prose. Never assert a fixed structure.
  - **`⚠️ Assumptions & open questions:`** — render ONLY when Step 4's `assumptions[]` is non-empty; one bullet per inference/ambiguity, each inviting reviewer confirmation. Omit the whole block when the ticket was fully explicit.
  - There is no `Page Name` or `User Story` line — the Page Object is covered by the Notes-for-reviewer scaffold/collision note, and the requirement is conveyed by `Requirement (as written)`.
- **AC coverage table**:
  - Truncate long AC text to ≤80 chars; reviewers can click through to the ticket for full text.
  - "Test" column: backtick-wrapped **prose** test title for generated ACs (titles no longer contain tags — tags live in the `{ tag }` option per ADR-0015); em-dash `—` for skipped. Prepend `⚡ ` INSIDE the backticks for tests tagged `@smoke` (the test's `{ tag }`), e.g., `` `⚡ standard_user logs in and lands on inventory` ``. Non-smoke tests have no prefix.
  - "Bucket" column: exactly one of `Positive` / `Negative` / `Edge` for generated tests; em-dash `—` for skipped ACs. Classification follows [`bucket-classification.md`](bucket-classification.md).
  - "Status" column: `✅ generated` or `⚠️ skipped: <one-line rationale>`. **For AUGMENT runs:** use `✅ added` for tests inserted into an existing file, and `⏭️ skipped (already covered)` for duplicate-guard skips.
- **Verification — bucket warnings**: If workflow Step 6 emitted any "invalid bucket" soft warnings (per [`bucket-classification.md`](bucket-classification.md)), append them as additional bullets at the END of the Verification section, after the Test run list. Example: `- ⚠️ LLM emitted invalid bucket "Boundary" for test "<title>" — defaulted to Edge. Reviewer: verify classification.`
- **Verification — smoke warnings**: If workflow Step 6 emitted any "invalid smoke value" soft warnings (per [`smoke-policy.md`](smoke-policy.md)), append them as additional bullets at the END of the Verification section, after any bucket warnings. Example: `- ⚠️ LLM emitted invalid smoke value "maybe" for test "<title>" — defaulted to false. Reviewer: verify classification.`
- **Verification — say what ran**: Step 10 runs the smoke set and the target spec. Name both in the Test run list — `- **Scope:** smoke (N tests) + `<testfile>`.` A reader must never have to infer from the number of lines whether a narrow run was a decision or an oversight.
- **Notes for reviewer**: include this section ONLY when the skill made side-effect file changes OR LLM-judgment calls (merge/split/skip per [`qa-analysis.md`](qa-analysis.md)) that the reviewer might disagree with. Each note is a bullet starting with an emoji marker (⚠️ for side effects, ⚙️ for harness growth per [`harness.md`](harness.md), 📝 for judgment calls). If the workflow produced no side effects and no merge/split/skip decisions, OMIT this section entirely. Position: between `Verification` and `Collision warnings` per the Section order rule.
- **Verification — fix attempts**: a PR only exists when the run is green (ADR-0020: a blocked run reports itself and opens nothing). So `❌ FAIL` never appears as a final state. What DOES belong here is the **fix log**, when workflow Step 10.5 ran: the reviewer needs to know the first run was red and what changed to fix it — a spec that needed three attempts deserves a closer read than one that passed first try. Append after the Test run list:

    ```markdown
    - **Fix attempts:** 2 (first run red)
      <details>
      <summary>What changed</summary>

      1. `Add to cart` button not found — selector guessed from the AC text; verified live with /playwright-cli and corrected to `[data-test="add-to-cart-sauce-labs-backpack"]`.
      2. Cart badge assertion read the wrong element — pointed at `Header`'s `CartBadge` component instead of the page-direct locator.

      </details>
    ```

    Omit the whole item when the first run was green.

- **Verification — observations**: if the run added or changed entries in `.observations/observations.json` (ADR-0021), add one bullet after the Test run list naming what appeared. These are things the app did that no test asserted on — never a blocker, and never a claim that something is broken. Example: `- :mag: **Observations:** 1 new — \`GET /checkout-step-one.html\` returns 404 (first-party, 9×). Reviewer: triage in \`.observations/observations.json\`.` Omit when the run produced nothing new.

- **Obstacles encountered is ALWAYS rendered** (ADR-0022) — the one section that is never omitted. With nothing to report its entire body is `None.` A section that can be dropped is a section the agent learns to drop, and the empty state only carries meaning because it cannot be. It holds exactly three things:
  1. **Selector downgrades** — only XPath fails lint, so a locator written below the highest level *available on the page* is caught by nothing else. Name the element, the level available, the level used, and why. A stable unique id is a good locator; the point is that the reviewer learns you checked rather than guessed.
  2. **Tooling friction** — a command or MCP call that failed and was retried or worked around.
  3. **Reference gaps** — where this skill's `references/` didn't cover the case. **Name the file that should have.**

  Do NOT restate what other sections already carry: ticket inferences go in `⚠️ Assumptions & open questions`, failed runs in the fix log, and collisions / harness growth / skipped ACs in their own notes. A section that repeats what the reader just read is a section they learn to skip.

- **Collision warnings section is omitted entirely when no collisions occur** — don't render an empty header.

## Example: 2-test PR with one collision

```markdown
## What I understood from the ticket

> Automated Playwright coverage for `SW-1` (`login`): 2 tests, all passing.

**Source ticket:** [SW-1](https://your-site.atlassian.net/browse/SW-1) — Story: "Login in Saucedemo App"
**Feature:** login
**Requirement (as written):** four Given/When/Then scenarios — successful login for the valid users, empty/missing-field validation, and invalid-credential rejection.

<!-- Assumptions block omitted: the ticket was fully explicit (no inferences). -->

**Acceptance Criteria (normalized):**
- AC 1: User can log in with standard_user / secret_sauce and lands on inventory page.
- AC 2: Locked-out user sees an error message.

## AC coverage

| AC | Test | Bucket | Status |
|----|------|--------|--------|
| AC 1: User can log in with standard_user / secret_sauce and lands... | `⚡ standard_user logs in successfully and lands on inventory` | Positive | ✅ generated |
| AC 2: Locked-out user sees an error message. | `⚡ locked_out_user sees the lockout error` | Negative | ✅ generated |

## Verification

- **Typecheck:** ✅ PASS
- **Test run:**
  - `standard_user logs in successfully and lands on inventory` — ✅ PASS
  - `locked_out_user sees the lockout error` — ✅ PASS

## Collision warnings

- ⚠️ **Page Name collision** — `LoginPage` already exists at `src/pages/LoginPage.ts`. Reused the existing Page Object; did NOT call `/scaffold-page-object`. Reviewer: verify the existing Page Object exposes the methods this PR's tests rely on, or refile the ticket with a different Page Name.

## Obstacles encountered

- 🎯 **Selector downgrade** — lockout error banner: wanted `getByRole('alert')`, used `[data-test="error"]` because the banner carries no ARIA role. Reviewer: this one is a fallback, not a first choice.
```
