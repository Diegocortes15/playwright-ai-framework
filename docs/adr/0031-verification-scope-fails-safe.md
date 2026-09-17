# 0031 — Verification scope is resolved by one script, and it fails safe (supersedes ADR-0010's mitigation)

**Date:** 2026-09-14
**Status:** Superseded by [ADR-0032](0032-pr-runs-smoke-plus-changed-specs.md), which deletes the script this record is built around: file-granular selection bottomed out at 87% of the suite because one Page Object is named by almost every spec. The hole it identified — a pull request running zero tests — stays closed, by an unconditional smoke tier rather than a computed one. Supersedes [ADR-0010](0010-from-issue-augment-mode.md) on its verification mitigation only; augment mode itself and everything else in that record stand.
**Confidence:** High. The hole is not inferred — a pull request that ran zero tests and reported success is in this repository's history, and the replacement was executed against eight change shapes before this was written.
**Review by:** — (no shelf life; the trigger below is an event)
**Enforced by:** `scripts/check-adr-invariants.mjs` — fails if the pull-request test step in `.github/workflows/test.yml` stops calling `scripts/affected-specs.sh`. Hand-rolling the diff again is exactly how the hole was introduced, and it is a small, plausible edit that no reviewer would flag.

## Context

ADR-0010 recorded the mitigation for augment mode's main risk: _"Modifying a shared Page Object method can regress other specs; mitigated by running the full suite locally whenever a member is modified."_ Two things turned out to be wrong with it, in opposite directions.

**Locally it ran far too much.** The rule was justified in `/from-issue`'s workflow with "the matrix is ~1 min" — a statement about this repository's size dressed as a rule. Verifying the Twitter-to-X footer correction ran 84 tests where 10 could reach the change, and the fix loop can repeat that up to three times. At a thousand tests the justification is gone and the cost is not only minutes: an unrelated flake surfacing inside an unrelated pull request turns its author into the triager of someone else's problem.

**In CI it ran far too little, sometimes nothing.** The pull-request check asked `git diff --name-only -- tests/ | grep '\.spec\.ts$'` and, finding nothing, printed `No spec files added/modified in this PR — nothing to run.` and exited **0**. A pull request touching only a Page Object passed green having executed no tests.

That is not a hypothetical. **PR #94 was the fix that took `main` out of a red state.** It changed `src/pages/InventoryPage.ts` and the observations index, nothing under `tests/`, and its check reported SUCCESS with that line in the log. The only evidence the fix worked was a local run someone chose to do.

## Decision

One resolver, `scripts/affected-specs.sh`, answers "what does this change reach", and **both** the pull-request check and `/from-issue`'s local verification call it. It returns a list of specs, nothing, or the single word `ALL`, and **anything it cannot confidently map returns `ALL`.**

Resolution is by name: a spec reaches a Page Object through its fixture (`inventoryPage`) and a Component through the property holding it (`.footer`), so a case-insensitive search for the changed file's basename finds the specs that exercise it. Deliberately loose — over-selecting costs seconds, under-selecting costs a green check on untested code.

## Consequences

- **The failure mode inverts from silent to noisy.** Before, an unmappable change ran nothing and said "nothing to run". Now it runs everything. The worst case is a slow check rather than a false one.
- **Config, the fixture, `tests/users.ts`, `src/utils/` and `data/` always mean `ALL`.** Every spec imports the fixture, so scoping a fixture change is guessing. Naming these explicitly is what lets everything else be narrow.
- **No canary test is needed for construction breakage.** Playwright fixtures are lazy, so a spec that names the subject also instantiates the page composing it; if a constructor broke, those specs are exactly the ones that fail. An earlier draft of this rule added a canary per composing page and it was redundant.
- **A changed Page Object can still select most of the suite.** `InventoryPage` resolves to 8 specs and 72 of 83 tests, because that page really is used almost everywhere. That is the honest answer, not a failure of the resolver — and it is still not 83.
- **The resolver is a new thing to maintain.** A new top-level directory returns `ALL` until someone teaches it the path, which is the right default and also a small recurring tax.
- **Trigger to revisit:** the first time `ALL` fires so often that people stop reading the check, or a suite large enough that even a scoped run is too slow. The answer then is a real dependency graph, not a looser grep.

## Alternatives considered

- **Playwright's `--only-changed`** — rejected, after measuring. The flag exists and sounds exactly right. On this repository, a change to `src/components/Footer.ts` alone selects `_framework_validation.spec.ts` and **misses `footer/footer.spec.ts`**, the only spec that asserts on the footer. The first hypothesis was that tsconfig path aliases defeat its dependency tracking; that was tested with two throwaway specs importing `Footer`, one through `@components` and one by relative path, and **both were missed**, so the aliases are not the cause. Its own help says it runs "test files that have been changed", and it is correct for that case — which is not the case this decision is about. Recorded here in full so nobody spends an afternoon rediscovering it.
- **Keeping the full suite everywhere** — rejected. It is what ADR-0010 said, it does not scale, and it was never what CI actually did, so the record described a practice only half of the pipeline followed.
- **Keeping the CI script and only fixing the local rule** — rejected. The CI hole is the one with a proven incident behind it.
- **Failing open when resolution is uncertain** — rejected. That is the existing bug, and its cost is a green check on untested code, which is worse than any amount of wasted compute.
