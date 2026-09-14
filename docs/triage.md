# Triage — what happens between a finding and a change

A run goes red, or a diagnosis turns up something nobody expected: an acceptance criterion
that is not satisfied, a selector the application renamed, a behaviour the docs describe
and the app does not have.

**None of that is settled by whoever found it.** The finder's job ends at a diagnosis good
enough for someone else to decide on. The decision is a person's, and it usually produces a
ticket.

This page is the workflow. The rule it exists to protect is one line: **green is not the
goal.** A suite is worth having because it tells the truth about a known build, and every
shortcut here trades that away for a colour.

## Phase 1 — Is it real?

Time-boxed. The question is not yet _what_ broke.

1. **Re-run just the failing test.** Intermittent means flake, and a flake goes down a
   different path than a defect. Do not triage a flake as a bug.
2. **Check the scope.** One test, one feature, or everything? A suite that fails all at once
   points at infrastructure, authentication or a deployment, not at a selector.
3. **Ask what changed, on both sides.** Ours is `git log` since the last green run. Theirs is
   whatever the environment records about the build under test. If nothing moved here and
   something moved there, the application is the likelier subject.

## Phase 2 — What exactly?

4. **Open the trace and read the DOM snapshot at the failing step**, not the screenshot. The
   screenshot shows a page; the snapshot shows the markup the locator was looking at.
5. **Probe the live application** to confirm what it serves now. `/report-bug` and the
   `playwright-cli` skill both exist for this.
6. **Land on one of three readings, each with its evidence.** They are indistinguishable from
   the failure alone, which is why this step is separate from Phase 1:

| Reading                                    | What it means                                                                           | Where the work goes                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------- |
| **The application is wrong**               | The test encodes the AC faithfully and the app does not do it                           | A **bug** on the application          |
| **The application changed, intentionally** | The app is right, and the AC now describes something that no longer exists              | A **story** — the requirement changed |
| **The automation is wrong**                | App and AC are both fine; the test encodes an assumption the app never promised to keep | A ticket against this repository      |

## Phase 3 — Report, and stop

7. **Bring the diagnosis, the evidence, and every reading that survives it.** Not a question
   — a decision that is cheap to make. A candidate fix may be prepared and shown; it is not
   applied.
8. **Say plainly when CI is red.** Urgency is real and it is the team's to weigh. It is not a
   reason to skip this step.

## Phase 4 — The team decides

Usually in refinement, and the ticket is what carries the discussion rather than the
conclusion. It may be killed there, and that is a working outcome, not a wasted one.

- **Bug confirmed** → the test becomes `test.fail()` linked to the ticket (ADR-0024). The
  suite goes green and the defect stays visible, which is the opposite of hiding it.
- **Intended change** → **correct the acceptance criterion first, then the test.** This is
  the step that gets skipped, and skipping it is how a specification gets rewritten with
  nobody's approval. A test edited to match new behaviour silently asserts that the new
  behaviour was always wanted.
- **Automation defect** → fix it under its own ticket, like any other work.

## Phase 5 — Close the loop

9. A `test.fail()` needs a review date. Quarantine without an expiry is deletion with extra
   steps.
10. Ask why it was found this way. If the application changed without notice, the fix is a
    notification channel or a pinned environment, not a better locator.

## Why not auto-healing

Playwright ships a healer agent (`npx playwright init-agents`) that debugs a failing test and
edits it until it passes. Its own prompt is explicit: _"Do not ask user questions, you are
not interactive tool, do the most reasonable thing possible to pass the test"_, it lists
_"Fixing assertions and expected values"_ among its jobs, and it marks what it cannot fix as
`test.fixme()`.

Its objective function is the colour, not the truth. Faced with the second reading above it
rewrites the expected value, and the requirement change nobody approved ships green. The
danger needs a code review to also miss it, which is two failures rather than one — but a
diff changing `toBe('$29.99')` to `toBe('$31.99')` reads like a data update and gets approved.

The mechanical half of what it does is genuinely useful: reproduce, snapshot, generate a
better locator, re-run. **Take the work, refuse the authority.** If that half is ever wanted
here, it is installed as a diagnostic tool that proposes and never merges — and ADR-0030 is
the record to supersede first.
