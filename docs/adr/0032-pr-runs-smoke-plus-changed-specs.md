# 0032 — A pull request runs smoke plus its changed specs; the broad net is at merge (supersedes ADR-0031)

**Date:** 2026-09-17
**Status:** Accepted. Supersedes [ADR-0031](0031-verification-scope-fails-safe.md), and deletes the script that record was built around.
**Confidence:** High. The ceiling that kills the previous approach is measured, not argued, and the replacement is the shape the industry converged on rather than one invented here.
**Review by:** — (no shelf life; the trigger below is an event)
**Enforced by:** **Nothing — prose only, and deliberately.** ADR-0031 was gated on a script's continued existence; that gate is gone with the script. What replaces it is simpler than a check could usefully guard: two commands in a workflow step and two in a skill's Step 10. A lint asserting "this YAML still greps @smoke" protects less than it costs, and inventing a gate to satisfy a habit is how gates lose their meaning.

## Context

ADR-0031 built `scripts/affected-specs.sh` to answer "which specs does this change reach", and had both the pull-request check and `/from-issue`'s local verification call it. It closed a real hole — PR #94 passed green having run zero tests — and it worked as specified.

It does not scale, and the number is the argument. SW-19 changed two Page Objects and a helper; the resolver answered `ALL`. A fix to follow one hop of the import graph brought that to 77 of 88 tests. **That is 87% of the suite, which is not selection.**

The cause is not the resolver. `InventoryPage` is named by eight of nine specs, because it is the page every authenticated flow lands on. A change there genuinely can reach all eight. A hub Page Object makes file-granular selection meaningless, and this repository has one.

Finer signals were tried and rejected on evidence. "The diff only adds lines, so existing callers are safe" is unsound: a line inserted inside an existing method shows up in `git diff` as an addition and changes behaviour for every caller — verified in a scratch repository. Distinguishing a new member from an edited body needs a TypeScript parser, not a grep.

And the industry does not solve this with greps at all. Real test-impact analysis (Datadog, Bazel, Nx) maps **product code → tests** through runtime coverage, and cuts 40–70%. That mechanism does not transfer to end-to-end tests against a deployed application: the product code belongs to someone else and cannot be instrumented. What the resolver mapped — framework code to specs — is a weaker signal with a lower ceiling, and it hit it.

## Decision

A pull request runs the **smoke set** and **the spec files the pull request changed**. Nothing is computed.

Smoke runs first: it is 8 tests and about 6 seconds, selected by user-visible risk under `smoke-policy.md`, and a critical-path regression should stop the run before anything slower. Ordering it first also means the HTML report left behind belongs to whichever run failed.

`/from-issue`'s Step 10 does the same thing with the spec it just wrote.

The full suite stays at merge, and the scheduled cadences stay as they are. This is the tiered model — fast gate on the pull request, broad net asynchronously — that the Playwright ecosystem converged on.

## Consequences

- **Predictable instead of clever.** The pull-request tier is now a fixed cost plus one spec file, whatever the change. Nobody has to reason about whether a resolver classified their file correctly, and there is no path where a mapping error silently under-selects.
- **`scripts/affected-specs.sh` is deleted**, along with ADR-0031's gate in `check-adr-invariants.mjs`. It was a week of work that did not earn its place, and keeping it "because it exists" is worse than removing it.
- **The hole ADR-0031 closed stays closed, differently.** PR #94 changed a Page Object and no spec, and ran nothing. Under this rule it runs smoke — eight critical-path tests — because smoke is unconditional rather than derived from a diff that found nothing.
- **It does not scale by test count, which is the point.** At a thousand tests the pull-request tier is still smoke plus the changed specs. The lever for the merge run's wall time is sharding, not selection: `--shard` with a CI matrix, no test changes.
- **Coverage at the pull-request tier is lower than a correct affected-set would give.** That is the trade: a regression in an untouched spec is caught at merge rather than on the pull request. The merge run is minutes behind, and before ADR-0031 existed that regression was caught at merge too.
- **Trigger to revisit:** the smoke set growing past a few minutes, or a repeated pattern of regressions that merge green and break on `main`. The first is answered by trimming smoke against its policy; the second by widening the pull-request tier deliberately rather than by computing it.

## Alternatives considered

- **Keeping the resolver and adding smoke to it** — rejected. It keeps the complexity that the 77-of-88 measurement just showed does not pay, and smoke alone covers the case the resolver was invented for.
- **A TypeScript-level dependency graph**, symbol-granular, so that adding `blockProductImages()` selects only its callers — this is the technically correct answer and is not taken. It is a real static-analysis tool, not a script, and the payoff at this suite's size is seconds. Worth revisiting only alongside the trigger above.
- **Playwright's `--only-changed`** — still rejected, measured under ADR-0031: a change to `src/components/Footer.ts` selects `_framework_validation.spec.ts` and misses `footer/footer.spec.ts`. Both an aliased and a relative import were missed, so path aliases are not the cause.
- **Running the full suite on every pull request** — rejected for the reason this whole thread started: at a thousand tests it is minutes of waiting for a change that could not have touched them, and `/from-issue`'s fix loop can pay it three times over in one run.
