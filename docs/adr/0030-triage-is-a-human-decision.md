# 0030 — A finding is reported, never acted on; triage is a human decision

**Date:** 2026-09-14
**Status:** Accepted.
**Confidence:** High on the decision, which two incidents in one week produced independently. Lower on the cost: this forbids an agent from closing a loop it is capable of closing, and nobody has yet measured how much triage latency that adds on a suite larger than this one.
**Review by:** — (no shelf life; the trigger below is an event, not a date)
**Enforced by:** `scripts/check-adr-invariants.mjs` — fails if a Playwright **healer** agent definition is present in any directory `npx playwright init-agents` writes to (`.claude/agents/`, `.claude/prompts/`, `.github/agents/`, `.github/chatmodes/`, `.github/prompts/`, `.opencode/prompts/`). That command is one line to run and drops an agent whose prompt says _"do the most reasonable thing possible to pass the test"_, which would reverse this decision with no diff anyone reads.

## Context

Two failures in one week, both of which an agent could have "fixed" alone, and neither of which it should have.

A product card's links gained `role="button"`, so an unfiltered `getByRole('button')` began matching three elements. The application was fine and the acceptance criteria were fine; our locator had always been too loose. It was diagnosed **and fixed** in one pass, which is the thing this record exists to stop — the fix was correct, and taking the decision was not mine.

Then saucedemo rebranded a footer link from Twitter to X: `data-test="social-x"`, `href="https://x.com/saucelabs"`. The committed criterion reads _"The footer Twitter link's href is https://twitter.com/saucelabs."_ No defect exists. A test edited to match would have silently rewritten a requirement.

Both are the same shape. The evidence says clearly **what** changed and says nothing about **who should change in response**, and only the second question decides what work exists.

## Decision

Whoever finds a novelty — a failing test, an unmet acceptance criterion, a behaviour the docs claim and the app lacks — **diagnoses it fully and reports it. They do not act on it.** A candidate fix may be prepared and shown; it is not applied. The decision belongs to the team, usually in refinement, and usually produces a ticket: a **bug** when the application is wrong, a **story** when the application changed on purpose and the requirement is what went stale, a repository ticket when the automation is wrong.

`docs/triage.md` is the workflow. This record is the decision behind it, and the reason the obvious shortcut is refused.

## Consequences

- **An agent is slower than it could be, on purpose.** It can diagnose a stale locator and write the fix in the same minute, and it stops instead. That cost is real and is the point: the fix being correct is not the same as the decision being the agent's.
- **The scope is any finding, not any failing test, and not only `/report-bug`.** The rule previously lived inside that skill and therefore bound only runs that invoked it. The footer failure arrived as a red suite and routed nowhere, which is how this gap was found.
- **"The application changed intentionally" is a story, not a bug**, and its first change is the acceptance criterion. Editing only the test asserts that the new behaviour was always wanted, which is a claim nobody made.
- **A ticket may be killed in refinement**, and that is a working outcome. The ticket carries the discussion; it does not presume the conclusion.
- **This constrains people too, not only agents.** A QA who quietly retightens a selector after a redeploy erases the same signal, and the erasure is harder to see because no diff announces it.
- **Trigger to revisit:** a suite large enough that per-finding triage becomes the bottleneck rather than the fix. At that size the answer is probably a triage rota or a quarantine lane with an expiry, not an agent with the authority.

## Alternatives considered

- **Playwright's own healer agent** (`npx playwright init-agents`) — rejected, and it is the alternative that matters because it is free, maintained, and one command away. Its prompt is explicit: _"Do not ask user questions, you are not interactive tool, do the most reasonable thing possible to pass the test"_; it lists _"Fixing assertions and expected values"_ among its jobs; and it marks what it cannot fix as `test.fixme()`. Its objective function is the colour, not the truth. Given the footer failure it would have rewritten the expected URL and shipped an unapproved requirement change, green. The mechanical half of its work is genuinely good and could be adopted as a **diagnostic** that proposes and never merges; that is a different decision and needs a record superseding this one.
- **Relying on code review to catch a healed assertion** — rejected as the primary defence. It needs two failures rather than one, which sounds reassuring until you picture the diff: `toBe('$29.99')` → `toBe('$31.99')` reads like a data update and gets approved. A weak gate against the exact change that matters is not a gate.
- **Keeping the rule inside `/report-bug`** — rejected. That is where it lived, and it bound nothing when the failure arrived as a red CI run, which is how most of them arrive.
- **Prose only, with no check** — rejected, per ADR-0023. `init-agents` is a single command whose output would reverse this decision by adding files nobody reads in review, and a decision reversible by accident is the kind this project has already been burned by twice.
