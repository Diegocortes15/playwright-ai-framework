# Bug report draft template

The `report-bug` skill renders this. Section order is mandatory — a reader scanning several
reports should find the same thing in the same place every time.

## Template

```markdown
**Summary:** <one line: what the app did that it should not have, in the user's words>

**Environment:** <project, e.g. chromium-problem> · <feature> · found by automated test

## Steps to reproduce

1. <reproSteps[0]>
2. <reproSteps[1]>
   …

## Expected Result

<the acceptance criterion verbatim when one is available; otherwise the test's assertion in plain words, preceded by the one-line reason it could not be resolved>

## Actual Result

<what happened — `received` when the script parsed one, otherwise the first line of the error>

## Which is wrong?

- **If the application:** <one sentence>
- **If the ticket:** <one sentence>
- **If the automation:** <one sentence — the app is fine and the test encodes a stale or over-loose assumption about it>
- <the repository's own documentation, cited, when it covers this — say whether it specifies intended behaviour or records a known defect; the second does not make the behaviour correct>

## Evidence

**Attach:** `<bug-evidence/<slug>--<project>/>` — screenshot, video, trace, a `network.har`
extracted from that trace, and a README with the error and how to open both. Collected by
Step 1.5; drag the folder onto the ticket, or zip it with the command that step prints.

- Failing test: `<file>:<line>` — `<title>`
- Trace, once attached: `npx playwright show-trace trace.zip`
- Network, without a checkout: open `network.har` in DevTools → Network → Import HAR

Name `network.har` in the report only when the failure is network-shaped — a request that 404s, a
resource that never loads, a wrong payload. Pointing a reader at it for a sorting bug wastes
their time, and the folder carries it either way.

**Never publish this folder to an unauthenticated host.** Not GitHub Pages, not a public bucket, not
a paste service, not a link anyone with the URL can open — and this holds however convenient it
would be for the person reading the ticket. A trace records response bodies and live session
tokens, so it inherits the confidentiality of the application under test, and the HAR is plainer to
read than the trace: it is JSON anybody can open. `trace-to-har.mjs` redacts credential cookie and
header values, which is a floor and not a licence; text response bodies are copied verbatim, so a
HAR from an app with real data holds real data.

Attach the folder to the ticket, where it inherits the tracker's permissions, or ship the CI
artifact, which inherits the repository's. If someone asks for a public link, the answer is the
artifact plus access, not a copy on a host with no door. This is the same reason the framework
never publishes its HTML report: the report bundles the traces.

## Runtime observations during this test

<one line per observation, or "None recorded.">
```

## Rules

- **There are three readings, not two, and the third is the one that gets forgotten.** The
  application can be wrong, the ticket can be wrong, and **the automation can be wrong** — a
  locator that was always too loose, an assumption about markup that the app never promised
  to keep. On 2026-09-11 two tests broke because a product card's links gained
  `role="button"` and an unfiltered `getByRole('button')` started matching three elements.
  Nothing was wrong with the app's behaviour and nothing was wrong with the ticket. A draft
  offering only the first two readings forces a reader toward a defect report that does not
  exist, which is the same failure as asserting one.
- **`Which is wrong?` is never omitted, and never resolved unilaterally — not even by documentation.** Cite `docs/app/` when it covers the behaviour, and say which kind of record it is: a **specification** ("the system shall do X" — then not doing X is a defect) or a **defect log** ("X is broken for this user" — which proves the bug is *known*, not that it is *correct*). Both readings still stand afterwards. A file describing something as "broken" is the strongest possible evidence that someone considered it a bug.
- **Steps are the `test.step` titles verbatim.** They describe what actually ran. Rewriting them into prettier prose breaks the guarantee that following the steps reproduces the failure.
- **Expected Result and Actual Result are always two headings, never one.** They are different kinds of claim: Expected is a **requirement somebody agreed to**, Actual is an **observation of what happened**. Merging them into "Expected vs actual" reads tidier and costs the distinction the whole report turns on — the `Which is wrong?` section exists precisely because either one can be the thing that is wrong, and SW-15 is the case where it was the Expected. Two headings also mean each can be cited on its own: "the Expected in SW-14 is wrong" is a sentence someone needs to be able to say.

- **Colour the two headings, do not box them.** Where the tracker supports it, tint `Expected Result` green and `Actual Result` red, with a `✓` and a `✗` in front. In Jira that is a `textColor` mark on the heading's text: **`#006644`** for Expected, **`#bf2600`** for Actual.

  **Take the values from the tracker's own picker, never invent a hex.** Jira stores the hex but maps it to a design token at render time (`hexToEditorTextPaletteColor('#0747A6')` → `var(--ds-text-accent-blue, #0747A6)`), so a palette colour **adapts to light and dark themes** and an arbitrary one renders literally — which looks like a sticker in whichever theme it was not chosen for. The two hexes above came from the picker for exactly that reason; an earlier pair, invented here, did not and had to be replaced.

  Two rules come with it, and both are the reason it works:

  - **Never wrap them in coloured panels.** A report already uses panels for the summary, the unresolved question and the fix instruction. Turning two more sections into boxes means most of the page is a coloured box, and the red summary panel at the top stops standing out — it currently pops precisely because it is the only red thing above the fold. If everything shouts, nothing does.
  - **Colour must always be redundant.** Red and green are the worst possible pair for the ~8% of men with a red-green deficiency, so the words `Expected Result` / `Actual Result` and the `✓` / `✗` carry the meaning on their own. The colour is reinforcement for everyone else, never the signal itself. The same applies to a status lozenge: `UNCHANGED` in red still reads as `UNCHANGED` in greyscale.

  Green here borrows the diff metaphor — expected on the green side, observed on the red — rather than meaning "success". An Expected Result that did not happen is not a success, and the wording should never imply it was.

- **A control comparison belongs under Actual Result, not between the two.** A table contrasting the broken case with a working one (a second user, a previous version, another browser) is **evidence that the observed behaviour is real and correctly attributed** — it is not a comparison of expected against actual. Filing it under a merged heading mislabels what it is.

- **Expected prefers the acceptance criterion over the assertion.** The AC is what a person agreed the system should do; the assertion is one engineer's encoding of it. When the script found no AC it returns a `missing` reason instead — **render that reason**, then fall back to the assertion. Never fall back silently: restating the assertion that just failed is circular, and a reader has no way to tell an oversight from a structural absence.

  | `missing` | What to write |
  | --- | --- |
  | `no-matching-record` | "No acceptance criterion is committed for this test. A run blocked by an application-versus-AC contradiction writes no records artifact (ADR-0020), which is the usual reason after a blocked run — and the situation this skill exists for. Falling back to the assertion; supply the criterion from the ticket if you have it." |
  | `no-records-file` | "No records file exists for this feature, so nothing traces its tests to acceptance criteria. Falling back to the assertion." |
  | `unreadable-records-file` | "The feature's records file could not be parsed — worth fixing separately. Falling back to the assertion." |

  When the user supplies the criterion (from the ticket, as they did for SW-13), quote it and say where it came from, so a reader is never left assuming it was machine-resolved.
- **Observations are context, never a conclusion.** A 404 recorded during the test may explain the failure or may be unrelated noise already triaged as `ignored`. Present them; do not build the diagnosis on them.
- **No severity, no priority, no component.** Those are the reporter's call and depend on a tracker's own taxonomy. Guessing them wastes the triager's time correcting them.
- **Never list raw `test-results/` paths as the evidence.** They are absolute, they sit on one machine, and their directory names are unreadable — a reader cannot open them and the reporter can barely find them. Name the collected folder instead, and say plainly if it was not collected: a report whose evidence nobody can open has, in practice, no evidence, and saying so is better than implying otherwise.
