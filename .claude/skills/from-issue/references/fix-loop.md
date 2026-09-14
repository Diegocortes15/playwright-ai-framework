# Fix loop — the no-red-PR gate

Read this **only when a run goes red**: workflow Step 9 (typecheck) or Step 10 (tests) failed.
A run that is green from the first attempt never needs any of it, which is why it lives here
rather than in `workflow.md` — the happy path should not pay for the failure path.

A `/from-issue` run **never opens a red PR** (ADR-0020, which supersedes the treatment of
failures in Steps 9 and 10). Enter this step whenever the typecheck or any test failed.

## First: is the generated code wrong, or is the app wrong?

Diagnose before editing anything. A failing test is not automatically a broken test — this is
a QA framework, and a test that faithfully encodes its AC while the app misbehaves has found
a bug. "Fixing" it would delete the finding.

- **Generated code is wrong** — wrong selector, bad import, a Page Object method that doesn't
  do what the test assumed, a tag routed to a project that isn't wired, a type error →
  fixable. Continue the loop.
- **The app is wrong** — the selector resolves, the flow runs, and the app's actual behavior
  contradicts an AC the ticket asserts → **STOP.** Do not touch the test. Go to "Reporting a
  blocked run" and say plainly that the ticket's AC and the app disagree.
- **Cannot tell** → treat it as "the app is wrong" and stop. Guessing produces a test that
  passes by meaning nothing.

## The loop

Budget: **3 fix attempts.** For each attempt:

1. State the diagnosis in one line before editing — what failed and why.
2. Apply the **narrowest** fix, and only to artifacts THIS run produced: the spec, and the
   Page Object if this run created it or appended to it. Verify a corrected selector against
   the live page with `/playwright-cli` instead of guessing a second time.
3. Re-run Step 9 (if the typecheck failed) and Step 10.
4. Record the attempt: diagnosis, what changed, resulting status.

**Stop early** when the same failure signature repeats on two consecutive attempts. The
diagnosis isn't converging, and further attempts spend tokens without producing information.

**Never, on any attempt:**

- delete a failing test, or mark it `.skip()` / `.fixme()`
- weaken an assertion, or change an expected value to whatever the app happened to emit
- add `await page.waitForTimeout()` (lint blocks it — use auto-waiting assertions)
- reinterpret an AC to match observed behavior
- edit a spec or Page Object member this run did not generate — the one exception is the
  deliberate Page Object modification already resolved in Step 5

Each of these reaches green by making the run worthless. If green is only reachable that way,
the run is blocked: report it.

## Outcome

- **Green within budget** → continue to Step 11. Carry the attempt log into the PR body's
  Verification section (per `pr-description-template.md`): the reviewer needs to see that the
  first run was red and what changed to fix it.
- **Budget exhausted, non-converging, or blocked** → "Reporting a blocked run", below.

## Reporting a blocked run

**Skip Steps 11, 11.5 and 12 entirely.** No branch, no commit, no push, no PR, no TCMS
artifact. The generated files stay on disk for you to inspect and finish by hand.

Report to the user:

- Why the run is blocked: budget exhausted, non-converging, or an app/AC contradiction.
- Every file this run wrote or modified, by path.
- The final failure output, verbatim — type errors and/or the failing tests.
- The full attempt log: per attempt, the diagnosis, what changed, and the resulting failure.
- The recommended next step. For an app/AC contradiction, say that the ticket may be
  describing a real defect and should go back to the reporter rather than into a spec.

Then stop. Do not ask whether to open the PR anyway — the gate is the point.

**Where the test goes next is not your call** (ADR-0024). If the user decides the application
is at fault and files a defect, the test lands annotated with `test.fail()` referencing that
defect — it runs for real, keeps CI green while the bug lives, and turns red the day the fix
lands. **Never apply that annotation yourself, and never offer to.** An agent that can mark
any failing test as expected-to-fail has a one-line way to make anything green, which is the
same escape hatch as weakening an assertion. Report; the person decides.
