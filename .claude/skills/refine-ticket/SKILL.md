---
name: refine-ticket
description: Iteratively harden a Jira automation ticket against a "bulletproof" rubric — grounded in existing automation, app docs, and user-supplied sources — then write the refined acceptance criteria back to the ticket on approval, so /from-issue has nothing left to guess.
allowed-tools: Read Glob Grep Bash(npx:*) mcp__atlassian__getAccessibleAtlassianResources mcp__atlassian__getJiraIssue mcp__atlassian__editJiraIssue mcp__atlassian__addCommentToJiraIssue mcp__atlassian__getConfluencePage mcp__atlassian__searchConfluenceUsingCql
---

# refine-ticket

Given a Jira issue key (e.g. `SW-123`), this skill reads the ticket via the Atlassian MCP, scores it against the refinement rubric, and loops — auto-resolving gaps from existing automation + docs and asking you (or a source you point it at) for the rest — until the ticket is unambiguous. On your approval it writes a `Refined Acceptance Criteria` section back to the ticket, using Jira's own rich formatting — a divider, an info panel marking the section machine-owned, and a `status` lozenge per acceptance criterion. It does NOT generate tests; run `/from-issue` after. See ADR-0013.

## How to use it

Tell Claude what you want:

> Use the refine-ticket skill on SW-123.

Or to preview without writing to Jira:

> Use the refine-ticket skill on SW-123 with dry-run.

During the loop, when asked about a gap you can either answer directly or point the skill at a source ("it's in Confluence page X", a URL, a doc path). The skill ingests it and continues. It does NOT inspect a running app — it's shift-left, so it works even before the feature is built. It stops when the ticket has no open gaps, then asks before writing anything back.

## Workflow

The full procedural workflow is in [`references/workflow.md`](references/workflow.md). Read that file before executing the skill.

> **Why `Bash(npx:*)` is in `allowed-tools`:** Step 5a may read the live application when the ticket
> references something that **already exists**, through the `playwright-cli` skill — always
> `npx playwright-cli`, since the binary lives in `node_modules/.bin` and not on `PATH`. Without this
> entry every call would prompt, and a skill that interrupts a refinement loop to ask permission per
> command is a skill nobody runs. The reading is read-only and bounded; ADR-0033 and
> `references/sources.md` carry the rules, and the shift-left prohibition still holds for anything
> that does not exist yet.
>
> **Setup note:** the Atlassian MCP must be connected (OAuth) with **write** scope for the Step 7 description update — defined at project scope in `.mcp.json`. Its read + write tools are pre-authorized in `allowed-tools` above so the loop doesn't prompt each call. Write-back happens only on your explicit approval (per ADR-0013).

## References

- [`references/workflow.md`](references/workflow.md) — the procedural loop
- [`references/rubric.md`](references/rubric.md) — the "bulletproof" checklist (definition of done)
- [`references/sources.md`](references/sources.md) — source catalog + user-supplied-source protocol
- [`references/writeback-template.md`](references/writeback-template.md) — the `Refined Acceptance Criteria` block as ADF nodes, the lozenge mapping, and the idempotent-update rule

## Composition

This skill pairs with `/from-issue`: refine first, then generate. It reuses the `/from-issue` skill's `references/bucket-classification.md` and `references/qa-analysis.md` for the rubric's coverage/automatable judgment.

## See also

- `docs/refine-ticket.md` — learning guide with a worked example
- ADR-0008 — why custom skills follow this layout
- [ADR index (origin repo)](https://github.com/Diegocortes15/playwright-ai-framework/tree/main/docs/adr) — rationale for every `ADR-NNNN` cited above. Paths like `docs/…` and `src/…` are relative to that repo, not to this skill.
