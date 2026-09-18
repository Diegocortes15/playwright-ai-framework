---
name: report-bug
description: Turn a failed Playwright run into a ready-to-file bug report draft — repro steps, expected vs actual, correlated runtime observations and evidence paths — for a human to review and file. Never files anything itself.
allowed-tools: Bash(node:*) Bash(ls:*) Bash(zip:*) Read Glob Grep
---

# report-bug

Given the last failed run, this skill assembles a bug report you can paste into a tracker: repro steps, the acceptance criterion the test traces to, expected versus actual, any runtime observations recorded during that test, and the paths to the screenshot, video and trace.

**It files nothing.** You invoke it, you read the draft, you decide. That division is the point: the tedious part is transcription, and the part that needs judgment — is this a defect in the application, a ticket describing behaviour the application never had, or a test of ours encoding an assumption the application never promised to keep? — stays with a person.

## How to use it

Run the suite first, then:

> Use the report-bug skill.

Or for one failure when several failed:

> Use the report-bug skill for the test about sorting.

## Workflow

The full procedural workflow is in [`references/workflow.md`](references/workflow.md). Read that file before executing the skill.

## References

- [`references/workflow.md`](references/workflow.md) — the procedural workflow
- [`references/report-template.md`](references/report-template.md) — the draft's structure, and the two-readings rule

## Scripts

- [`scripts/collect-failure.mjs`](scripts/collect-failure.mjs) — gathers the failure, its evidence, its acceptance criterion and its observations into structured JSON. Plain Node, no dependencies. Locating facts is lookup, not judgment, so it is a script rather than prose.
- [`scripts/collect-evidence.mjs`](scripts/collect-evidence.mjs) — copies that failure's screenshot, video and trace into one readable folder under `bug-evidence/`, with a `README.txt` carrying the error and how to open the trace. Copies only; the run output is never moved or deleted.
- [`scripts/trace-to-har.mjs`](scripts/trace-to-har.mjs) — extracts the network log out of that trace as a `network.har`, which opens in any browser's DevTools under Network → Import HAR. An extraction, not a recording: the trace already holds the log, so turning on `recordHar` would write the same bytes twice. Credential cookie and header values are redacted; text response bodies are verbatim. Called by `collect-evidence.mjs`, and runnable on its own against any trace.

## Scope

Filing into a tracker is deliberately **not** implemented. Jira writes are the exception, not the rule, in this project — only `/refine-ticket` writes, and only on explicit approval (ADR-0013). When a tracker write is added here it needs the same treatment and its own ADR.

## See also

- ADR-0020 — why a run that cannot go green opens no PR; this skill is what you reach for afterwards
- ADR-0021 — the runtime observations this report correlates
- [ADR index (origin repo)](https://github.com/Diegocortes15/playwright-ai-framework/tree/main/docs/adr) — rationale for every `ADR-NNNN` cited above. Paths like `docs/…` and `src/…` are relative to that repo, not to this skill.
