# Write-back template — the `Refined Acceptance Criteria` block

On approval (workflow Step 7), `/refine-ticket` writes the hardened result into the Jira **description**, then posts an audit comment via `addCommentToJiraIssue`. Per ADR-0013 this is the only Jira mutation, and only on human approval.

## The `OBSERVED` marker

A criterion that came from reading the live application carries `OBSERVED` and its date, inline,
before the criterion text:

```
<status lozenge>  OBSERVED 2026-10-07 (production)  AC 2: WHEN the password is wrong, THEN the
login form shall show "Epic sadface: Username and password do not match any user in this service".
```

Why it is on the ticket and not only in a commit message: in three months a reader cannot tell a
line that records a product decision from one that records what somebody saw on a screen. Those
fail differently. If the application changes, an `OBSERVED` line is the first place to look, and an
un-marked line is a decision somebody made on purpose and should not be quietly re-measured.

The marker is **not** a lower status. The person at the approval gate promoted it, so it is a
criterion like any other. It records provenance, not confidence.

## Write ADF, not Markdown — and here is why

Jira descriptions are ADF. `editJiraIssue` accepts `contentFormat: "markdown"` and converts, but the conversion **cannot produce a panel**, which was measured rather than assumed:

| Written as Markdown | What Jira actually stored |
| --- | --- |
| `> [!INFO]` | a `blockquote` containing the literal text `[!INFO]` — the brackets get escaped |
| `:::info` | a `paragraph` containing the literal text `:::info` |
| `---` | a proper `rule` node |
| a table | a proper `table` node |

So Markdown gives you `rule`, `blockquote`, `table`, headings, lists and the usual marks, and nothing else. Pass `contentFormat: "adf"` with the document object instead.

**Verified by writing them through this MCP:** `editJiraIssue` with `contentFormat: "adf"` stored a `panel` with only `{"panelType": "info"}` and `status` lozenges with `color` set, and reading back with `responseContentFormat: "adf"` returned both intact — **no `localId` needed**, so do not invent one. The write stays inside `editJiraIssue`, which is what keeps ADR-0013's `allowed-tools` guard meaningful; do not reach for `curl` and the REST API to get ADF.

> **Read and verify in ADF too.** `editJiraIssue` echoes the updated issue back in **Markdown** unless you ask otherwise, and that echo is lossy in exactly the ways above: the panel comes back as a plain bold paragraph and each lozenge as `<custom data-type="status" data-id="id-0">`. Nothing was lost in the ticket — only in the echo. So pass `responseContentFormat: "adf"` when you read, and never conclude from the Markdown echo that the write failed.

> **No HTML-comment sentinels.** `<!-- … -->` is stored as visible literal text, not a hidden marker. The managed section is bounded by a visible `rule` + heading, which renders cleanly and gives a reliable anchor.

## The block

Append these nodes to the **end** of `description.content`, preserving every node above them:

```jsonc
{ "type": "rule" },
{ "type": "heading", "attrs": { "level": 2 },
  "content": [{ "type": "text", "text": "Refined Acceptance Criteria" }] },

// The panel is doing a job, not decoration: it is what tells a reader the section is
// machine-owned. Before this, that warning was one line of italic prose, and the failure
// mode it guards against is someone editing below the divider and losing the edit on the
// next run. `info` — the section is not a warning and not a success, it is a notice.
{ "type": "panel", "attrs": { "panelType": "info" },
  "content": [{ "type": "paragraph", "content": [
    { "type": "text", "text": "Managed section. ", "marks": [{ "type": "strong" }] },
    { "type": "text", "text": "Refined by /refine-ticket on YYYY-MM-DD. Everything above the divider is the reporter's original request and is never touched. Everything from the divider down is replaced when this runs again — put your own edits above it." }
  ]}]},

{ "type": "paragraph", "content": [
  { "type": "text", "text": "Feature: ", "marks": [{ "type": "strong" }] },
  { "type": "text", "text": "<feature>" }]},

{ "type": "bulletList", "content": [
  // one listItem per AC — see the lozenge table below
]}
```

Each AC is a `listItem` whose paragraph opens with a `status` lozenge for its EARS keyword, then the criterion:

```jsonc
{ "type": "listItem", "content": [{ "type": "paragraph", "content": [
  { "type": "status", "attrs": { "text": "WHEN", "color": "green" } },
  { "type": "text", "text": " <trigger>, the <system> shall <response>" }
]}]}
```

### Lozenge per EARS pattern

| Pattern | `text` | `color` | Why |
| --- | --- | --- | --- |
| Expected path | `WHEN` | `green` | The path that should work |
| Unwanted behaviour | `IF…THEN` | `yellow` | **Yellow, not red.** An unwanted-behaviour criterion is a legitimate requirement about rejection, not a failure. Red would read as "this AC is broken" |
| Holds during a mode | `WHILE` | `purple` | Distinct from both, and carries no good/bad reading |
| Invariant (no keyword) | `SHALL` | `neutral` | No trigger to announce |

The lozenge **repeats the keyword that is already in the text**, so colour is never the only carrier — the rule this project applies wherever colour appears, because red–green deficiency affects roughly 8% of men. Removing every colour here would lose nothing but scannability.

**No colour on the criteria themselves.** A list of requirements has no contrast for colour to reinforce, so tinting it would be decoration that costs legibility. Colour earns its place in a bug report because `Expected` versus `Actual` is a comparison; a list is not.

## Writing the criteria

EARS form (rubric item 10): an explicit trigger, the real system named, and **one** `shall`. Name the actual surface — *"the login page shall…"* — never the literal words "the system". A ticket is read by people, and the keyword doing the work is the trigger, not the noun.

## Idempotent-update rule

ADF makes this simpler than string search did. `description.content` is a flat array, so the managed section is a suffix of it:

1. Find the index of the `heading` node whose text is exactly `Refined Acceptance Criteria`.
2. **Found** → the managed section runs from that heading — and the `rule` immediately before it, if present — to the end of the array. Truncate the array at that index and append the fresh block.
3. **Not found** → append `rule` + the block to the end.

Never touch a node **above** that index. That is the reporter's content, and preserving it is the half of ADR-0013 that matters most.

The old Markdown version had to search a string for a heading and guess where the section ended. Locating an array index is exact, which is the second reason to author ADF and not only the panel.

**A ticket written by the Markdown-era template upgrades cleanly under this rule** — measured on SW-15, whose stored description was `paragraph`, `paragraph`, `paragraph`, `rule`, `heading`, `paragraph` (the italic byline), `paragraph`, `bulletList`. The heading sat at index 4 with its `rule` at 3, so truncating at 3 dropped the whole managed section and kept the reporter's three paragraphs. No special case is needed for the old shape.

**Carry forward dated history, and do not silently reword an approved criterion.** If the byline you are replacing records something a person established — SW-15's read `AC 3 corrected on 2026-09-07 against observed behaviour` — fold it into the new panel rather than dropping it; the section is machine-owned, but that sentence is a finding, not formatting. Likewise, a re-run whose purpose is presentation changes presentation: reformatting an already-approved AC into tighter EARS prose is a content change and belongs in the Step 6 diff where the user can see it, not in a formatting pass.

## Audit comment

After the description write succeeds, post one comment via `addCommentToJiraIssue` (Markdown is fine here — a comment needs no panel):

```
Refined by /refine-ticket on YYYY-MM-DD — N acceptance criteria hardened (see the "Refined Acceptance Criteria" section). Run /from-issue <KEY> to generate tests.
```

## If the user declines write-back

Do **not** call `editJiraIssue` or `addCommentToJiraIssue`. Emit the criteria in-session as plain Markdown so they can be pasted by hand — a person pasting into the Jira editor gets panels and lozenges from the editor's own toolbar, which is where SW-14's panels came from. Report that no Jira changes were made.

## Dry-run

With `dry-run`, perform every step EXCEPT the two writes. Print the criteria as Markdown and say which lozenge each would carry; printing raw ADF helps nobody read it.
