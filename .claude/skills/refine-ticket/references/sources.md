# Sources — where refinement evidence comes from

`/refine-ticket` resolves gaps (see [`rubric.md`](rubric.md)) from **ground truth**, not invention. It consults sources in the cheap-to-expensive order below, then asks the user for anything still unresolved. **A missing source is never a failure — it is a prompt for input.** This is what makes the skill reusable on a greenfield repo with no docs.

## Discovery order (cheap → expensive)

1. **The ticket** — already read in workflow Step 2 (Atlassian MCP `getJiraIssue`).
2. **The authoring contract** — `docs/jira-tickets.md`: what a good ticket looks like (mirrors the rubric).
3. **Existing automation (ground truth)** — read the repo:
   - `src/pages/` — real Page Objects + their action methods (confirms locations + capabilities).
   - `tests/` — existing specs (feeds the rubric's coverage flag).
   - `data/` — named scenarios and reference data (confirms data). In *this* repo it holds only `shared/products.json`; the users live in `docs/app/users.md` (source 4). Check both rather than assuming either.
   - `src/fixtures/`, `src/components/` — what's wired.
4. **App domain knowledge** — `docs/app/` when present: `users.md` (the real users), `flows.md`, `overview.md`, `glossary.md`.
5. **Framework judgment** — `CLAUDE.md`, `from-issue/references/bucket-classification.md`, `from-issue/references/smoke-policy.md`, `from-issue/references/qa-analysis.md`.
6. **User-supplied** — anything the user points at mid-loop (next section).

7. **The live app — but only for a reference that already exists.** See below; this is bounded,
   not open.

> **The live app, and the one question that bounds it.** Refinement is **shift-left**: it must work
> for a ticket whose feature is not built yet, and asking an application what a NEW requirement
> should be is writing the specification from the implementation, defects included — it produces
> acceptance criteria that cannot fail. So the bound is a single question: **does the thing the
> ticket references already exist?**
>
> - **Yes** — "the same error as the login screen", "reuse the cart's empty state", "this
>   component, on the new page". The app **is** the reference the ticket names. Ask permission,
>   open that screen, record what you saw.
> - **No** — the app is not consulted at all.
>
> Four rules bound the reading, and they are the reason this is safe rather than convenient:
>
> 1. **Every reading is an observation, not a criterion.** It carries its date and the environment
>    it was taken in, reaches the approval gate marked `observed`, and becomes a criterion only
>    because a person promoted it. The write-back marks it `OBSERVED`.
> 2. **Read, never act.** No form submissions, no state any team cares about.
> 3. **A contradiction is a finding.** When the app disagrees with the ticket or with `docs/app/`,
>    report it; never absorb it as an input.
> 4. **Selectors never enter a ticket.** Exact selectors and live strings stay `/from-issue`'s job
>    at generation time.
>
> A missing environment is not a failure: say the reference could not be verified, and ask.
>
> An earlier version of this file prohibited the app outright, giving "no `playwright-cli`" as the
> reason — which was false, the skill has existed since ADR-0006. The shift-left half of that
> reasoning was right and is kept above. ADR-0033 records the scoping.

## User-supplied-source protocol

When a gap cannot be closed from sources 1–5, ask the user a **targeted** question and offer two response modes:

- **(a) Answer directly** — the user states the fact ("use `standard_user`"; "the error is `Epic sadface: ...`").
- **(b) Point at a source** — the user names where the knowledge lives. Ingest it, then re-resolve the gap:
  - **Confluence page** → fetch via `getConfluencePage` (or locate via `searchConfluenceUsingCql`).
  - **A URL** → fetch and read it.
  - **A repo path or doc** → `Read` / `Grep` it.

Ask one cluster of related gaps at a time; do not interrogate one field per message. Record every assumption made when the user says "default it / your call" so it can be shown at the approval gate.

## Greenfield behavior

On a repo with no `docs/app/` and an empty suite, sources 3–4 yield little; the skill leans on 5–6 (conventions + you). It still scores the ticket against the rubric and closes gaps via user input — it does **not** abort for lack of docs, and it does **not** invent ground truth silently.
