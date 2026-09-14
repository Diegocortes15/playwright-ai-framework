# 0010 — /from-issue augment mode (extend existing specs, not one file per issue)

**Date:** 2026-05-24
**Status:** Accepted. Its verification mitigation — _"mitigated by running the full suite locally whenever a member is modified"_ — is superseded by [ADR-0031](0031-verification-scope-fails-safe.md), which resolves scope mechanically and fails safe. Augment mode itself, and everything else here, stands.
**Enforced by:** **Nothing — prose only.** Lives in `/from-issue`'s workflow; it governs agent behaviour, which no check can verify.

## Context

`/from-issue` was generate-only: a new issue targeting an existing feature wrote a separate `tests/<feature>/<feature>-<num>.spec.ts` (phase-d1.2 collision handling). Over multiple issues per feature this fragments coverage across `login.spec.ts`, `login-25.spec.ts`, `login-31.spec.ts`… — not how a human extends a feature. The generate-only / refuse-to-overwrite stance was never a standalone ADR; it lived in the C2a skeleton design and the workflow. The skill's safety has always come from the PR review gate plus isolated typecheck and a local test run — not from refusing to mutate files.

## Decision

When an issue's ACs target a feature that already has a generated spec, `/from-issue` **augments** that spec (and its Page Object) by default: it inserts the new tests into the correct bucket describe and appends or modifies Page Object members as needed. A `--new-file` flag forces the old create-new behavior. Re-running any issue already recorded as a contributor — any issue in the spec's `Augmented by:` header, plus the original generating issue — refuses. Page Object modifications trigger a full-suite local run; add-only augments run just the target spec.

## Consequences

- Coverage for a feature stays in one readable spec file, matching hand-written practice.
- Safety is unchanged in kind: isolated typecheck + (conditional) test run + the PR diff a human reviews.
- Modifying a shared Page Object method can regress other specs; mitigated by running the full suite locally whenever a member is modified.
- The skill now mutates existing generated files — the "manual edits are welcome" promise is preserved by editing in place (Read + targeted Edit), never regenerating.
- A mis-targeted issue could augment the wrong feature; the `--new-file` override and the PR diff are the escape hatches.

## Alternatives considered

- **Keep generate-only (one file per issue).** Rejected: fragments coverage; not how engineers extend features.
- **AST/codemod insertion (ts-morph).** Rejected: heavy runtime dependency and machinery for a prompt-driven skill that only needs to insert a `test()` block.
- **Regenerate-and-merge the whole file each run.** Rejected: re-fetches every prior issue and destroys manual edits, contradicting the file's own "manual edits are welcome" contract.
- **Require an explicit `extends:` signal in the issue.** Rejected: needs an issue-template change + reporter discipline; a mis-filed issue silently fragments anyway.

## Supersedes

The implicit generate-only / refuse-to-overwrite behavior described in the C2a from-issue skeleton design and prior `workflow.md` Step 8.

## Related

- [ADR-0009](0009-skill-contracts-in-references-not-comments.md) — skill contracts live in references, not code comments.
