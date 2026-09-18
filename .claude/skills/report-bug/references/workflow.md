# report-bug Workflow

The procedural workflow Claude follows when the `report-bug` skill is invoked.

## Inputs

- **`--grep <substring>`** (optional) — narrow to one failure when the run had several. Matched against the test title.

## Steps

### 1. Collect the facts

```bash
node .claude/skills/report-bug/scripts/collect-failure.mjs [--grep "<substring>"]
```

| Exit | Meaning |
| ---- | ------- |
| 0 | JSON on stdout — continue |
| 3 | The last run had no failures. Say so and stop; there is nothing to report |
| 4 | No `test-results/results.json`. Tell the user to run the suite first, and stop |

Do **not** hunt for these facts by hand if the script fails — fix the run, then re-run the script. Reconstructing them by reading files is how a report ends up describing a different failure than the one that happened.

**Its `evidence` block is raw run output, not something to paste into the draft.** Those are absolute paths inside hashed `test-results/` directories on one machine, which is exactly what `report-template.md` forbids in a report. They are there so Step 1.5 knows what to copy. Name the folder Step 1.5 prints instead.

### 1.5. Collect the evidence into one place

```bash
node .claude/skills/report-bug/scripts/collect-evidence.mjs [--grep "<substring>"]
```

| Exit | Meaning |
| ---- | ------- |
| 0 | Collected — the folder path and its contents are printed; use them in the draft |
| 3 | No failure matched (same condition as Step 1's exit 3) |
| 4 | No `test-results/results.json` |
| 5 | The failure exists but its evidence files do not — the message names both possible causes |

**Why this step exists.** Playwright writes evidence into directories named things like
`inventory-inventory-invent-6da45-products-by-price-ascending-chromium-problem`, under absolute
paths on the machine that ran the suite. A report listing those paths has, in practice, **no
evidence at all**: nobody else can open them, and whoever filed it cannot easily find them
either. This turns that into one folder with `screenshot.png`, `video.webm`, `trace.zip`, a
`network.har` extracted from that trace, and a
`README.txt` — a single thing to drag onto a ticket.

**Exit 5 is worth reading rather than retrying.** It means `results.json` describes a failure
whose files are gone, which is either a capture-settings problem or a stale run — opposite fixes,
and the message says which is which.

### 2. Decide what kind of failure this is

**This is the judgment the skill exists to support, and it is not yours to settle.** The rule is wider than this skill and does not depend on it being invoked: ADR-0030 makes it any finding, and `docs/triage.md` in the origin repository carries the full workflow, including what happens after the report. Read the acceptance criterion against the actual behaviour and present *both* readings:

- **The application is wrong** — the test faithfully encodes the AC, and the app does not do it. A defect.
- **The ticket is wrong** — the app behaves as designed, and the AC describes something it never did. A refinement.
- **The automation is wrong** — the app and the AC are both fine, and the test encodes an assumption the app never promised to keep. A fix to this repository, and it gets its own ticket like any other work.

Nothing in the run distinguishes them for you. What the app currently serves is checkable — open the trace's DOM snapshot at the failing step, and probe the live page — and that **narrows** the question without closing it: markup that no longer matches the test says the assumption is stale, not who should have changed.

They are indistinguishable from the failure alone. A report that asserts "the application has a bug" when the truth was a badly written AC — or a locator of ours that was always too loose — sends someone chasing a ghost, and the credibility of every later report goes with it.

Where the repository documents the behaviour (`docs/app/`), cite it — but **citing it does not
settle the question**. Documentation records two different things that look identical on the
page, and they point in opposite directions:

- **A specification** — "the system shall do X". The app not doing X is a defect.
- **A defect log** — "X is broken for this user". That records that a bug *exists*; it is not
  evidence the bug is *correct*.

`docs/app/users.md` calling something a "Broken sort dropdown" is the second kind. Quoting it
proves the behaviour is known, not that the ticket was wrong to expect otherwise.

State which kind you found, quote it, and **still present both readings**. The only thing that
genuinely settles it is a person who knows whether the behaviour is intended.

### 3. Render the draft

Follow [`report-template.md`](report-template.md) exactly. Every section, in order.

**If the script returned `staleRun` on a failure**, stop and say so before drafting anything.
`test-results/results.json` outlives the spec that produced it, so the failure may describe a
test that has since been renamed or deleted — the SW-15 run renamed one mid-session. Ask for a
fresh run rather than filing a report about a test that no longer exists.

**If the script returned `missing` instead of `acceptanceCriterion`**, render its reason in
**Expected** before falling back to the assertion — the table in `report-template.md` gives the
wording. `no-matching-record` is the *expected* state after a run blocked by ADR-0020, which
writes no records artifact: do not treat it as an error, and do not go hunting for the file.

Repro steps come from the script's `reproSteps` — these are the `test.step` titles the Page Objects already wrap each action in, so they are prose, not code. Use them verbatim; do not paraphrase them into something prettier that no longer matches what ran.

### 4. Hand it over

Print the draft. **File nothing.**

If the user concludes the application is at fault and files the defect, the blocked test's
destination is `test.fail()` referencing it (ADR-0024) — never applied by you, and never
offered. Say where the draft goes; do not act on it. Say plainly that it is a draft for the user to review, and that the tracker write is deliberately not implemented (see the skill's Scope section).

Then report **Obstacles encountered** — ALWAYS, even when there are none (one line: `Obstacles encountered: none.`). Per ADR-0022 it carries three things:

1. **Evidence gaps** — a field the script could not fill: no acceptance criterion matched the test title, no trace was captured, no observations recorded. Name what is missing, because a reader will otherwise assume it was checked and found empty.
2. **Tooling friction** — a command that failed and was retried or worked around.
3. **Reference gaps** — where this skill's own `references/` did not cover the case and you improvised. **Name the file that should have covered it.**

Do not restate the two readings from Step 2 here; they belong in the draft itself.
