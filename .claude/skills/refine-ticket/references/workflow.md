# /refine-ticket — procedural workflow

Read this file before executing the skill. The skill hardens a Jira ticket against the rubric, looping until no gaps remain, then writes the refined ACs back to the ticket on approval. It does NOT generate tests — that is `/from-issue`'s job.

## 1. Parse arguments

- Required: a Jira issue key `<KEY>` (e.g. `SW-123`).
- Optional: `dry-run` — do everything except the Jira writes (see [`writeback-template.md`](writeback-template.md)).

## 2. Read the ticket

```bash
# Resolve the Atlassian cloudId, then fetch the issue.
```

Call `getAccessibleAtlassianResources` (cloudId), then `getJiraIssue` for `<KEY>` with `responseContentFormat: "adf"`. Capture the summary + the description's **ADF `content[]` array** — the write-back in Step 7 preserves the reporter's nodes verbatim, so it needs the real nodes, not a Markdown rendering of them. **If the ticket can't be read**, abort with the MCP error verbatim.

## 3. Discover sources

**First, sync the working branch with its remote** so the repo reads below (and the rubric's item-9 coverage-overlap check) see the latest merged work — a stale local branch is why an overlap can be missed (it makes item-9 wrongly report "no existing specs"). Require a clean tree; fast-forward only:

```bash
base=$(git branch --show-current)
git fetch origin "$base"
# clean tree required; if origin/$base exists: git merge --ff-only "origin/$base"
```

If the tree is dirty or the fast-forward fails (local diverged), don't force it — note it and proceed with the local state (refine-ticket only reads the repo; it never branches), but flag in the assumptions that coverage checks ran against a possibly-stale tree. If `origin/$base` has no counterpart, skip.

Then, per [`sources.md`](sources.md), consult sources in cheap→expensive order (repo reads → app docs → conventions). Do not yet ask the user — gather what ground truth exists first.

## 4. Score against the rubric

Apply every item in [`rubric.md`](rubric.md) to the Feature + each AC. Produce a **gap list**: each unmet item, tagged with which AC it belongs to. Also build the `assumptions[]` running list (every inference made from a source rather than the ticket).

## 5. Refinement loop

Repeat until the gap list is empty (or the user says "good enough"):

1. **Auto-resolve** every gap a source can answer; record each as an assumption.
2. **For residual gaps with no source**, ask the user a targeted, clustered question — offering **(a) answer directly** or **(b) point at a source** (Confluence / URL / doc path), per [`sources.md`](sources.md). Ingest any provided source.
3. **Re-score** (Step 4) with the new information.

**Never** silently guess a residual gap; either a source closes it or the user does. Abort ONLY if the ticket has no extractable behavior at all and the user provides nothing: _"Nothing testable in `<KEY>` and no source provided — cannot refine."_

### 5a. When the gap is about something that already exists, you may look

Before asking a person to describe a thing the application already shows, ask whether the thing the
ticket references **exists today**. If it does, that screen is the reference the ticket named, and
reading it beats asking someone to recall it — this repository's own documentation was wrong three
times in one week on claims written from memory.

1. **Ask permission first**, naming what you want to open and why: _"AC 2 says 'the same error as
   the login screen'. That screen exists. Open it and record the exact text?"_
2. **Drive it read-only** via the `playwright-cli` skill. No submissions, no state anyone cares about.
3. **Record it as an observation**, with the date and the environment — never straight into an AC.
4. **Carry it to Step 6 marked `observed`**, so the approval gate is where it becomes a criterion.
5. **If the app contradicts the ticket or `docs/app/`, stop and report it.** That is a finding, and
   whether the ticket or the app is wrong is not yours to settle (ADR-0030).

If the reference does **not** exist yet, do not open anything: the full reasoning, the four bounding
rules and the `OBSERVED` marker are in [`sources.md`](sources.md), and the decision is ADR-0033.

Cost, measured: about 8.5 seconds to open and navigate, 1 second for a snapshot. Cheap enough that
no preflight step is warranted.

## 6. Present for approval

Show the user, in one message:

- **Before → After** of the ACs (the hardened set).
- **Resolved assumptions** — the `assumptions[]` list (what was inferred and from where).
- **Coverage flags** — any rubric item-9 overlaps ("AC2 looks already covered by …"), including anything found by reading a sibling ticket the boundaries name.
- **Boundary crossings, each as its own item** — any criterion that enters what the ticket declared out of scope (rubric item 12). Name the boundary, name the sibling that owns it, and offer **keep / drop / move**. Never fold one into the AC list, where it reads as something the ticket asked for.
- **Observed facts, listed separately and never folded into the AC list** — anything Step 5a read from the live app, each with the date, the environment and the screen it came from. Say plainly that these are observations and ask which to promote: _"AC 2's error text was read from the login screen on 2026-10-07 against production. Promote it to a criterion, or leave it as context?"_ An observation nobody promoted does not become an AC.
- The exact `Refined Acceptance Criteria` block that will be written, shown as readable Markdown — say which lozenge each AC carries rather than printing raw ADF, which nobody can review. Structure and node types are in [`writeback-template.md`](writeback-template.md).

Ask: **"Write this back to `<KEY>`? (yes / edit / no)"**

## 7. Write back (on approval)

- **yes** → apply the idempotent description update via `editJiraIssue` with `contentFormat: "adf"`, then the audit comment via `addCommentToJiraIssue` (per [`writeback-template.md`](writeback-template.md)). Per ADR-0013 — both writes go through the MCP, never through `curl` and the REST API, because `allowed-tools` is what makes that boundary real. If a write fails, report the MCP error verbatim and emit the block locally so nothing is lost.
- **edit** → apply the user's tweaks, return to Step 6.
- **no** → emit the block in-session for manual paste; make NO Jira calls.
- **dry-run mode** → never write; print what would be written.

## 8. Hand off

Suggest the next step: _"`<KEY>` is refined. Run `/from-issue <KEY>` to generate tests — its Assumptions block should now be near-empty."_

Then report **Obstacles encountered** — ALWAYS, even when there are none (one line:
`Obstacles encountered: none.`). Per ADR-0022 it carries three things: tooling friction (a
Jira/Confluence MCP call that failed and was retried or worked around), reference gaps
(where `references/rubric.md` or `references/sources.md` did not cover the case and you
improvised — **name the file**), and any source you could not reach. Do NOT restate the
rubric gaps you already presented in Step 6.

This goes to the user in the terminal only. It is **never** written back to the ticket:
the write-back is the `Refined Acceptance Criteria` block alone (ADR-0013). Obstacles
are the agent's own process, not the ticket's content.

## Error handling (summary)

- Ticket unreadable → abort with MCP error verbatim.
- No sources + user provides none → still score + ask per gap; never invent ground truth.
- Decline at approval → no mutation; emit locally.
- Write fails → report verbatim; result preserved in-session.
- No environment available: say the reference could not be verified and ask the user, rather than assuming. Not a failure.
- Reference does not exist yet: the app is not consulted at all — that is the shift-left rule (ADR-0033). Facts not in the ticket/docs/automation are asked of the user; exact selectors/strings are `/from-issue`'s job at generation time.
