# Failure modes

Where this framework breaks, what catches it, and what still does not.

**The rule for this page:** every claim is verified against the code, or it says it is unmeasured. Nothing here is an estimate dressed as a fact. Where a failure mode has no mitigation, it is listed anyway — a page that only lists solved problems is marketing.

---

## The four questions

### "How does this scale to a real application?"

The mechanics travel. The base URL, credentials and TCMS settings are env-driven through a single read point (`src/utils/env.ts`); the project matrix derives from one array and grows on demand ([ADR-0014](adr/0014-from-issue-harness-growth.md)); Page Objects are per-app and the composition rules are enforced by lint, not convention.

**What has never been exercised, and it is a lot:**

- **An application that changes.** saucedemo is frozen. Selector drift — the single most common cause of suite rot — has never happened here once. Every claim about locator stability in this repo is therefore theoretical.
- **Test data.** saucedemo needs no setup, no teardown, no isolation between parallel workers. A real app usually needs all three, and none of that machinery exists.
- **Authentication beyond a login form.** No MFA, no token refresh, no session expiry mid-run. `storageState` is generated once per user and reused.
- **Scale.** 8 features, 91 tests, 6 products. Nothing here has met a suite where run time or sharding is the constraint.

The honest summary: the _authoring_ layer is the transferable part. The runtime is a small, well-behaved suite against a small, well-behaved app.

### "What happens when the LLM hallucinates a selector or an acceptance criterion?"

This is the best-defended area, because it is the one that was designed for.

- **A run never opens a red pull request** ([ADR-0020](adr/0020-no-red-pr.md)). A hallucinated selector fails locally; the run diagnoses, retries up to three times, and if it still fails it reports and opens nothing.
- **Selectors are verified against the live DOM** before being written, via `playwright-cli` — not inferred from the page's source or from memory.
- **A downgrade is reported, not hidden.** Skills must render an `Obstacles encountered` section even when empty ([ADR-0022](adr/0022-obstacles-encountered.md)), and a selector written below the best available level has to be named there.
- **When the app contradicts the ticket, the run stops.** Real case: **SW-13** asked that `problem_user` be able to sort products. The tests were right and the app was wrong, so no PR was opened at all. The tests landed later, as `test.fail()` locked to the defect SW-14, only after a person decided ([ADR-0024](adr/0024-blocked-test-lands-as-expected-failure.md)).

**The gap:** all of that catches a _wrong_ selector. None of it catches a **plausible but incomplete** test — one that passes, asserts something true, and misses the point of the criterion. The PR body carries the agent's reasoning and its assumptions precisely so a human can catch that, and a human is the only thing that does.

### "What does a ticket cost in tokens?"

**Still unmeasured, and it was checked — the obvious tool does not answer it.**

`/skill-doctor` moved into Claude Code's Plugins → Stats tab, and it was run on 2026-09-09. It reports three columns, and only one of them is what this question needs:

| Column      | Verdict                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context`   | **Trustworthy.** It is the cost of each skill's one-line description in the system prompt, and it checks out — across all five skills the ratio of description characters to reported tokens lands between 2.6 and 3.0. Total for the five: **~310 tokens per turn**, which is small enough that no skill is worth removing on cost grounds                                                        |
| `uses`      | **Accurate, but not about what it looks like.** It counts _skill invocations_. `playwright-cli` reads `0 uses / never` while the repository invokes `npx playwright-cli` **13 times** through Bash — by design, since #63 moved everything to that form and `CLAUDE.md` instructs it. The skill is reference documentation, not something invoked                                                  |
| `7d tokens` | **Cannot be verified from here.** The legend says tokens "attributed to the skill", without saying how. `scaffold-page-object` shows 15.6m against 1 use and `refine-ticket` 3.2m against 1 use — the same invocation count, five times apart. The figures are far too large to be per-invocation. A session-scoped attribution would explain it, but that is a guess and nothing here rests on it |

**So the cost of one ticket is still not known.** Measuring it needs per-run accounting, which no tool in this stack currently exposes.

**One thing the panel gets actively wrong for this repository**, worth recording so nobody follows it: it advises _"1 skill loaded but never invoked… Disable in /skills, or remove from .claude/skills"_, pointing at `playwright-cli`. Removing it would delete the ten reference files the browser workflows depend on, while the CLI itself carried on being used thirteen times. The advice is sound in general and wrong here, because the metric it rests on does not see Bash.

### "What if Qase goes down, or the team switches TCMS?"

An outage is genuinely harmless. The mirror is **opt-in and self-skipping** — with `QASE_API_TOKEN` unset both entry points print `TCMS off … skipping` and exit cleanly — and the sync runs **at merge**, not at PR time ([ADR-0017](adr/0017-tcms-sync-at-merge.md)), so Qase being down cannot block a pull request or a test run.

**Switching vendors is a smaller job than a rewrite and a bigger one than this repo's README used to claim.** That README said `src/tcms/qase-client.ts` is "the only Qase-aware file". Measured on 2026-09-08, **eleven** files mention Qase:

| File                                 | Mentions | What that means                                                         |
| ------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `tcms/qase-client.ts`                | 7        | **The real seam.** Every HTTP call to Qase lives here and nowhere else. |
| `tcms/run-report.ts`                 | 20       | Orchestration — and it does `new QaseClient(cfg)` directly (line 144)   |
| `tcms/suite-sync.ts`                 | 13       | Same, at line 115                                                       |
| `tcms/map-store.ts`, `tcms/types.ts` | 8, 5     | The `QaseMap` type and `qase-map.json`                                  |
| `utils/qase-env.ts`                  | 6        | Reads the `QASE_*` variables                                            |
| 5 more files                         | 1–3 each | Incidental — a comment, a type name                                     |

So: the HTTP surface really is one file, which is the part that matters. But the **vocabulary leaks** — the client is constructed at two call sites rather than injected, and a type named `QaseMap` would end up holding Xray ids. A swap means editing those two constructions and either renaming across ten files or living with vendor names on generic things.

---

## What has actually broken here

The credible half of this page. Each of these happened, was found, and has something that catches the next one.

| What broke                                                                                                                                                                                                                                                                                           | How long it went unnoticed                   | What catches it now                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A decision recorded and never implemented.** ADR-0004 said "add `firefox-standard` and `webkit-standard`"; five projects existed and no Firefox or WebKit. Meanwhile `CLAUDE.md`, the roadmap and ADR-0014 all cited it as the reason cross-browser stayed _out_ — the opposite of what it decided | 4 months, `Accepted`                         | Every ADR declares **`Enforced by:`**, and `npm run lint:adr` fails the build when configuration contradicts one                                 |
| **A skill's reference table drifting from the code it describes.** `BurgerMenu.ts` landed 2026-06-03 and no row was added, so `/scaffold-page-object` **aborted on every invocation, against any URL**. The reference file was even edited in that window and the gap still went unseen              | 3 months                                     | `check-component-signatures.sh` reconciles both directions and exits non-zero ([ADR-0025](adr/0025-component-signatures-reconcile-both-ways.md)) |
| **A documented command that could not run.** The skill workflow said `playwright-cli open`; the binary is in `node_modules/.bin`, not on `PATH`                                                                                                                                                      | Unknown — nothing executes documentation     | `npm run lint:docs` fails on any bash block invoking a binary that only exists in `node_modules/.bin`                                            |
| **A green run whose record said the opposite.** A flaky test is `success` to the job, and the reader took the _first_ attempt — the failed one — so Qase recorded `failed` for a test that had passed                                                                                                | Never fired in 200 CI runs; found by reading | The last attempt decides the status, and the retry is named in the case comment                                                                  |
| **An observation whose cause was fixed, listed forever.** Nothing removed it and nothing said it had stopped                                                                                                                                                                                         | Structural since the index existed           | `absentSince`, set only when a run exercised every feature the entry came from and still did not see it                                          |
| **A race one browser was fast enough to hide.** `InventoryPage.goto()` returned before the product list rendered; ten tests read a list on the next line. Chromium always won that race; WebKit lost it one run in five                                                                              | Since the Page Object existed                | The wait lives in the Page Object. And cross-browser is what surfaced it — on its first real use ([ADR-0027](adr/0027-cross-browser-opt-in.md))  |
| **A pull request merged into an already-merged branch.** SW-12's work never reached `main`                                                                                                                                                                                                           | Minutes                                      | `sync-base-branch.sh` refuses to run on a previous ticket's branch or a stale base                                                               |

The pattern worth naming: **six of the seven are documentation or records drifting from reality, not code defects.** That is what this framework's gates are mostly for.

---

## What has no mitigation

- **Token cost is unmeasured.** See above.
- **The framework has never faced an application that changes.** Every claim about selector durability is untested.
- **No test-data isolation exists**, because saucedemo needs none.
- **Six of the seven Page Objects share a pattern proven fragile.** `goto()` navigates and returns without waiting for anything. Only `InventoryPage` was fixed, because only it has failed — and the other six have never run outside chromium, the engine that hid the problem. The mitigation is detection rather than prevention: Playwright marks a flake natively, the scheduled run's Slack message prints the count, and the HTML report filters them with a chip. If one of the six flakes, it announces itself.
- **A plausible-but-wrong test passes every gate.** Nothing but a human reviewer stands between a test that asserts something true and a test that covers the criterion.
- **One author.** Whether these conventions survive contact with a second person is untested, and the skill-portability check is a manual `grep` by deliberate choice ([ADR-0019](adr/0019-skill-portability.md)) — at this scale a CI gate was judged compliance theater.
