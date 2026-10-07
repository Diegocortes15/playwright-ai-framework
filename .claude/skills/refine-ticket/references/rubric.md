# Refinement Rubric — what "bulletproof" means

`/refine-ticket` scores the ticket against the checklist below. **Each unmet item is a "gap"** the workflow must close (auto-resolve from a source, or ask the user — see [`workflow.md`](workflow.md)). A ticket is **bulletproof when zero gaps remain open** — i.e. `/from-issue` would have nothing left to infer.

Score the **whole ticket** (Feature + every AC). Treat each AC independently for items 2–8.

## The checklist

1. **Feature** — a single snake_case slug is present (e.g. `Feature: login`). Drives `tests/<feature>/`. Gap → infer from the summary/subject and confirm with the user.
2. **One behavior per AC** — no compound "X and Y". Gap → split into separate ACs.
3. **Real user role** — each AC names the actor (e.g. `standard_user`, `locked_out_user`). Validate against `data/` users / `docs/app/users.md` when present. Gap → ask which user, or default and record the assumption.
4. **Explicit pass/fail signal** — each AC has an observable, deterministic outcome: a URL, an exact message string, or an element state. No "works", "looks good", "is correct". Gap → ask for the concrete signal (the user, the ticket, or a doc supplies it). Don't harvest selectors/strings from a running app — `/from-issue` confirms those at generation time.

   **Weigh the source.** `docs/app/` carries a `Verified by:` field naming the test that proves each claim, and it is allowed to read `Verified by: nothing`. When the signal comes from an unverified claim, use it — it is still the best available ground truth — but **record it as an assumption and surface it at the approval gate**, so the person approving knows they are accepting a documented belief rather than a tested fact. `/from-issue` will confirm it against the application at generation time, and the ADR-0020 gate catches it if the doc was wrong. (Real case: SW-15's lockout error string came from an unverified line in `users.md`, was flagged as such, and turned out to be correct — which is how that line stopped being unverified.)
5. **Location** — each AC says _where_ it happens ("on the inventory page", "in the cart"), mapping to an existing or scaffoldable Page Object. Gap → ask which surface.
6. **Concrete data** — literal values or a named scenario, not "some product". Gap → ask for values, or reference a `data/` scenario.
7. **Bucket coverage** — Positive / Negative / Edge considered for the feature; call out missing buckets (per `from-issue/references/bucket-classification.md`). Gap → propose the missing negative/edge AC for the user to accept or decline.
8. **Automatable** — flag manual-only ACs (visual aesthetics, subjective copy) per `from-issue/references/qa-analysis.md`. Gap → recommend marking the AC out of automation scope.
9. **Coverage (lightweight flag)** — does the AC overlap something already automated? Heuristic match of the AC's behavior against existing test titles + `tests/<feature>/` files. This is a **flag, not a blocker** ("AC2 looks already covered by `tests/login/login.spec.ts` — drop or confirm"). Degrades gracefully: nothing automated → never fires. (`/from-issue` still dedupes at generation time per ADR-0010; this surfaces it earlier, to the human.)
10. **EARS shape** — each AC is written in EARS form: an explicit trigger, one system, one response. See the section below for the patterns and the phrasing rule. Gap → rewrite the AC in the pattern that fits. This is not decoration: the trigger keyword is what forces a precondition to be stated, and the single `shall` is what makes item 2 checkable rather than a matter of taste.

11. **Intended or observed** — each AC makes clear whether it states what the system **should**
    do or what it **currently** does. The distinction is not cosmetic: it decides what happens
    when the test fails. An AC of intended behaviour that the app contradicts is a **finding** —
    the ADR-0020 gate blocks the run and a person files the defect. An AC of observed behaviour
    is characterization, and its test simply passes.

    Both shapes exist in this project's coverage and produced opposite results: _"the products
    are listed in descending alphabetical order"_ (intended → became `test.fail()` against a
    filed bug) versus _"every product image collapses to the same broken placeholder instead of
    a distinct image"_ (observed → passes). Gap → **ask the author which they mean.** A ticket
    that reads as documentation when a requirement was intended produces a test that passes
    while asserting the bug is correct, and nothing ever revisits it. This happened: SW-16 was
    first written as characterization of a broken sort, which would have locked in the defect as
    expected behaviour; rewritten as intended behaviour, it correctly blocked and produced SW-17.

    **A third state exists and must not be collapsed into the other two: `observed`.** When a gap
    was closed by reading the live application — permitted only for a reference that already
    exists, per `sources.md` — the fact is an observation until a person promotes it. It reaches
    the approval gate labelled, and the write-back marks it `OBSERVED`. The reason to keep it
    separate is that an observation promoted without anyone noticing is exactly the SW-16 failure
    with an extra step: a defect becomes expected behaviour, and the provenance that would have
    caught it was never written down. `observed` says where the line came from; `intended` versus
    `currently does` says what it claims.

## EARS — the shape an AC takes

[EARS](https://alistairmavin.com/ears/) (Easy Approach to Requirements Syntax, Mavin et al., Rolls-Royce, 2009) constrains a requirement to a trigger, a system, and one response. Five patterns; the first two carry almost all the traffic here.

| Pattern            | Form                                                       | Use it for                                  |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------- |
| Event-driven       | **WHEN** \<trigger\>, the \<system\> **shall** \<response\>       | A user does the expected thing              |
| Unwanted behaviour | **IF** \<trigger\>, **THEN** the \<system\> **shall** \<response\> | Invalid input, rejection, error handling    |
| State-driven       | **WHILE** \<state\>, the \<system\> **shall** \<response\>        | A behaviour that holds during a mode        |
| Ubiquitous         | The \<system\> **shall** \<response\>                         | An invariant with no trigger                |
| Optional feature   | **WHERE** \<feature\>, the \<system\> **shall** \<response\>      | Behaviour that exists only in some configs  |

**Name the real system, not "the system".** EARS's `<system>` slot is meant to hold the actual thing — *"the login page shall…"*, *"the cart badge shall…"*. Writing the literal words "THE SYSTEM SHALL" produces stilted prose in a ticket a person has to read, and buys nothing. The keyword that matters is the trigger and the `shall`.

**One `shall` per AC.** If an AC needs a second `shall`, it is two ACs — that is item 2, made mechanical instead of a judgment call.

### Why it is worth the constraint here

The trigger keyword pre-classifies the test's bucket, which `/from-issue` otherwise decides from scratch at generation time:

- **WHEN** → the expected path → **Positive**
- **IF … THEN** → EARS calls this category "unwanted behaviours", which is what `bucket-classification.md` calls **Negative**

**The mapping stops there, and saying so matters more than the mapping.** `Edge` — boundary conditions, unusual-but-valid input, performance, precedence between two error paths — has no EARS counterpart, and an AC's keyword must never be used to argue a test out of `Edge`. A real case: SW-15's AC 3 (a locked account submitting a *wrong* password) is `IF … THEN` by EARS and was classified `Edge` by judgment, correctly. Treat the keyword as a hint for Positive-vs-Negative and nothing more; `bucket-classification.md` remains the authority.

## Worked example

**Raw AC:** "User can log in and it works."

| Item | Gap?                                            |
| ---- | ----------------------------------------------- |
| 3    | No user named → which of the six users?         |
| 4    | "it works" has no signal → what proves success? |
| 5    | No location → which page confirms login?        |

**After resolution, items 3/4/5 satisfied:** "`standard_user` logging in with `secret_sauce` lands on the inventory page (URL `/inventory.html`)."

**In EARS form, item 10 satisfied too:** "**WHEN** `standard_user` submits `secret_sauce` on the login page, the application **shall** navigate to the inventory page (URL `/inventory.html`)."

The second version is not merely tidier. The trigger is now separable from the response, which is what makes it drop into a test almost unchanged — the WHEN clause is the arrange-and-act, the shall clause is the assert — and `WHEN` marks it Positive without anyone deciding.

## What is NOT in the rubric (YAGNI)

- No semantic coverage matrix — item 9 is a heuristic flag only.
- No estimation, priority, or sprint fields — automation-readiness only.
