# Architecture Decision Records

[Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Start from `0000-template.md`.

This practice was checked against the documented standard on **2026-09-07**, after the immutability rule started to feel like a maintenance tax. The conclusion was that the rule is right and the way we were using the records was wrong. Sources at the bottom.

## The two layers — read this before anything else

**ADRs are a decision log, not the design guide.** [Azure Well-Architected][waf] is explicit: _"Avoid making decision records design guides. If more justification or design ideation is available, provide a link to a document as supplemental material."_

That distinction is the whole fix. If answering _"how does JSON load today?"_ requires reading ADR-0005 **and** ADR-0023, you are reading an audit log to learn the present — and it will feel like a tax, because it is one.

| Layer       | Where                                            | Mutable?                                               | Answers                       |
| ----------- | ------------------------------------------------ | ------------------------------------------------------ | ----------------------------- |
| **Present** | `docs/architecture.md`, `docs/app/`, `CLAUDE.md` | **Yes** — correct in place, noting what it said before | _What is true now?_           |
| **Log**     | `docs/adr/`                                      | **No** — append only                                   | _Why did it become this way?_ |

[arc42][arc42] structures documentation the same way: the decisions that shape the system live in §4 Solution Strategy (current state), and §9 expands them with context. It explicitly warns against duplicating between the two.

**A record may cite the present layer. The present layer may cite a record for the "why". Neither replaces the other.**

## Never edit an accepted ADR

Confirmed as the standard, not a local quirk. [Azure Well-Architected][waf]: _"The ADR serves as an append-only log. Don't go back and edit accepted records. If a decision changes, write a new record that supersedes the original and link the two together. This approach preserves the history of your thinking and makes it clear when and why the direction shifted."_

Reversing a decision means a new record that supersedes it; narrowing one means a record that scopes it.

> A minority position exists — [some argue][reflect] that in practice mutability works better, inserting dated notes into the original record. It is recorded here so the choice is visible rather than assumed. This repo follows the append-only majority: Nygard, arc42 and Microsoft agree, and the history of a reversed decision is the part worth keeping.

## Does this decision belong here?

The admission bar is [Azure Well-Architected's][waf], adopted verbatim because it is tighter than "an architectural decision changed":

> _Only include choices that affect the system's **structure**, **key quality attributes**, or are **difficult to reverse**._

A `no` to all three means it is not an ADR — write it in the reference or doc it governs instead. `0000-template.md` carries the three questions and a worked negative.

## Every record declares four things

| Field           | Why                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**      | _"Tracking status makes the current state of each decision clear, especially as the number of decisions grows"_ ([WAF][waf]). ADR-0005 sat `Accepted` for three and a half months while false — the mechanism existed, nobody moved it |
| **Confidence**  | _"Record the confidence level… Sometimes an architecturally significant decision is made with relatively low confidence"_ ([WAF][waf]). Say what would change your mind                                                                |
| **Review by**   | A date only when the decision has a shelf life — deferred scope, a vendor, a scale assumption. A prompt to re-read, not an expiry                                                                                                      |
| **Enforced by** | The lint rule, test, config or script that makes it true, or `Nothing — prose only`. If a decision states something a machine can check, write the check — ADR-0023 exists because one didn't                                          |

Records written before 2026-09-07 predate `Confidence` and `Review by`. **They are not being backfilled**: editing them to add fields would break the append-only rule for cosmetics, and a confidence level invented months after the fact is fiction.

## The budget, and how to count against it

`docs/roadmap-post-oct-2026.md` principle #4 says a mature framework has **10–20 ADRs in its whole life**. That number is a **local convention with no cited source** — not Nygard, not arc42, not Microsoft, none of which prescribe a count. Taken literally it also contradicts the same principle's "never edit, always supersede" rule, which manufactures records mechanically.

**So count only originating decisions against it.** Records the supersede rule demanded are not discretionary and do not compete for the budget.

|                                   | Count  |
| --------------------------------- | ------ |
| Total records                     | **32** |
| Superseding / scoping / extending | 13     |
| **Originating decisions**         | **19** |

Nineteen is inside the range, and one short of leaving it; thirty-two is not. Keep the table current when you add one — the point of writing the number down is that the next person sees it before adding the twenty-eighth, which is exactly what nobody could do before this file existed. ADR-0027 was the twenty-seventh and ADR-0028 the twenty-eighth; both moved the superseding count rather than the originating one. 0027 replaced a record that had been `Accepted` and false for four months, and 0028 records that ADR-0013's `allowed-tools` guard does not reach a shell script. ADR-0029 is the twenty-ninth, and it exists because 0027's own `CI is unchanged and stays chromium` had in turn gone false — the same failure, one record later, which is the argument for keeping this table honest rather than the argument for a smaller number. ADR-0030 is the thirtieth and the **nineteenth originating** one, which is the first time this table has been worth consulting before writing: it rejects Playwright's own healer agent, so the next originating decision should be weighed against retiring an earlier one rather than added on top.

## Index

| #    | Decision                                                      | Relationship           |
| ---- | ------------------------------------------------------------- | ---------------------- |
| 0001 | Page Object Model by Component                                |                        |
| 0002 | Multi-user via Playwright Projects + storageState + role tags |                        |
| 0003 | Hybrid data layout with typed loaders                         |                        |
| 0004 | Cross-browser smoke pattern                                   | superseded by 0027     |
| 0005 | ESM import attributes for JSON                                | **Superseded by 0023** |
| 0006 | Playwright CLI for AI application inspection                  |                        |
| 0007 | gh CLI for GitHub operations (no GitHub MCP)                  |                        |
| 0008 | Custom project-specific skills pattern                        |                        |
| 0009 | Skill contracts live in `references/`, not code comments      |                        |
| 0010 | `/from-issue` augment mode                                    |                        |
| 0011 | Jira as the ticket source                                     |                        |
| 0012 | `/from-issue` branch / commit / PR conventions                |                        |
| 0013 | `/refine-ticket` writes refined ACs back to Jira              | scopes 0011            |
| 0014 | `/from-issue` grows the harness autonomously                  |                        |
| 0015 | Spec tags via Playwright's `{ tag }` option                   |                        |
| 0016 | Optional one-way TCMS mirror (Qase)                           |                        |
| 0017 | TCMS sync at merge, whole-suite                               | scopes 0016            |
| 0018 | Qase runs are opt-in; merge sync is catalog-only              | scopes 0017            |
| 0019 | Skills are portable artifacts                                 | scopes 0008            |
| 0020 | `/from-issue` never opens a red PR                            | scopes 0012            |
| 0021 | Runtime observations: record what nobody asserted on          |                        |
| 0022 | Every first-party skill reports the obstacles it hit          |                        |
| 0023 | JSON loads through a typed fs loader                          | **supersedes 0005**    |
| 0024 | A blocked test lands as `test.fail()`, on human approval      | extends 0020           |
| 0025 | Component signatures reconcile in both directions             | scopes 0008            |
| 0026 | A file-sourced run produces no artifacts                      | scopes 0016 / 0017     |
| 0027 | Cross-browser is implemented, and opt-in                      | supersedes 0004        |
| 0028 | Evidence reaches a ticket via a script and an API token       | scopes 0013            |
| 0029 | Cross-browser is reachable in CI, on demand only              | **supersedes 0027**    |
| 0030 | A finding is reported, never acted on                         |                        |
| 0031 | Verification scope is resolved by one script, and fails safe  | **supersedes 0010**    |
| 0032 | A PR runs smoke plus its changed specs                        | **supersedes 0031**    |

---

**Sources.** [Michael Nygard — Documenting Architecture Decisions][nygard] (2011, the origin of the format) · [Azure Well-Architected Framework — Maintain an ADR][waf] · [arc42 §9 — Architecture Decisions][arc42] · [adr.github.io](https://adr.github.io/) · [ReflectRally — decision logs][reflect] (the mutability counter-position)

[nygard]: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
[waf]: https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record
[arc42]: https://docs.arc42.org/section-9/
[reflect]: https://reflectrally.com/architecture-decision-logs/
