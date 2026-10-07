# 0033 — /refine-ticket may read the app when the ticket references something that already exists (scopes ADR-0013)

**Date:** 2026-10-07
**Status:** Accepted. **Scopes** [ADR-0013](0013-refine-ticket-jira-writeback.md) rather than reversing it: the write-back rule, the approval gate and the single-writer boundary are unchanged.
**Confidence:** High on the decision, medium on the bound. The practice it permits is one this project already performs by hand on every ticket, with the evidence in SW-20 and SW-21. The bound — "already exists" versus "new" — is prose and will need a judgement call on a ticket that sits on the line.
**Review by:** — (no shelf life; the trigger is an event, below)
**Enforced by:** **Partly.** The `allowed-tools` line is what makes the reading possible at all, so a skill without it cannot drive the app even if its prose said to. Everything else — the exists-versus-new bound, `observed` provenance, read-never-act, and reporting a contradiction instead of absorbing it — is prose, and deliberately: a check that could tell "the ticket referenced an existing thing" from "the ticket described a new one" would have to understand the requirement.

## Context

ADR-0013 gave `/refine-ticket` its write scope. `references/sources.md` then added a prohibition that ADR-0013 does not contain:

> **Not a source: the live app.** `/refine-ticket` never drives a running app (no `playwright-cli`).

The parenthetical is false. This repository has shipped a `playwright-cli` skill since ADR-0006. More importantly the prohibition covers only half of what refinement does. The reason given for it is sound and stays: refinement is **shift-left**, so it must work for a feature that does not exist yet, and asking an application what a _new_ requirement should be is writing the specification from the implementation, defects included — it produces acceptance criteria that cannot fail.

But a ticket often points at something that **already exists**: "the same error as the login screen", "reuse the cart's empty state", "this component, on the new page". For that kind of gap the application _is_ the reference the ticket names. The skill's only alternatives were to ask a person to describe it from memory, or to assume.

**Describing from memory is this repository's dominant failure mode, measured.** Three claims in `docs/app/users.md` were wrong in one week: `performance_glitch_user`'s delay was documented as "~10s on every navigation" and measured at ~5s on three actions; `locked_out_user` was documented as verified by nothing while two tests covered it; and the footer's copyright year was asserted as a literal when the application computes it. Each was written from memory and each would have been caught by looking.

And the practice is already happening. SW-20 and SW-21 both carry a "Measured before writing" section whose tables came from driving the live application — SW-20's measurement is what stopped its AC 1 from asserting that Sauce Labs hardcodes the year, which is the opposite of what the app does. This ADR does not introduce a capability. It moves one that happens informally, in a session, into the skill, where it acquires rules and provenance.

## Decision

`/refine-ticket` **may** open the application and read it, bounded by one question: **does the thing the ticket references already exist?**

- **Yes** → the skill asks permission, opens that screen, and records what it saw.
- **No** → the application is not consulted. This is the shift-left rule and it is unchanged.

Four rules bound the reading:

1. **Every reading is an observation, not a criterion.** It carries its date and the environment it was taken in, reaches the approval gate marked `observed`, and becomes a criterion only because a person promoted it. The write-back marks such a line `OBSERVED` so that a reader in three months knows it came from looking at the app rather than from a product decision.
2. **Read, never act.** No form submissions, no state any team cares about.
3. **A contradiction is a finding.** When what the app does disagrees with the ticket or with `docs/app/`, that is reported, not absorbed as an input ([ADR-0030](0030-triage-is-a-human-decision.md)).
4. **Selectors never enter a ticket.** Unchanged from ADR-0013's surroundings; exact selectors stay `/from-issue`'s business at generation time.

A missing environment is not a failure: the skill says the reference could not be verified and asks.

## Consequences

- **A gap that used to be answered from memory can be answered by looking**, which is the half of this repository's failure modes that documentation gates do not reach.
- **`allowed-tools` widens** to permit `Bash(npx:*)`, which is what the `playwright-cli` skill needs. That is a real increase in what this skill can do, and it is why the read/never-act rule is written rather than assumed.
- **The cost is 8.5 seconds**, measured: `playwright-cli open` plus navigation, with a snapshot at 1.0s more. No preflight script is warranted — the sibling repository needed one because an emulator and an installed build stand between a person and a screen; here the browser is installed by the Quick start.
- **The exists-versus-new bound will need a judgement call**, and the skill reports which side it took so the gate can disagree.
- **Observation without promotion was considered and rejected** — see below. The consequence of that choice is that an observed fact can become a criterion, so the `OBSERVED` marker and the dated provenance are what keep the record honest about where it came from.
- **Trigger to revisit:** a refined ticket whose criterion turns out to have described a defect as intended behaviour. That would mean the bound failed, and the bound is the whole safety of this.

## Alternatives considered

- **Keep the prohibition.** Rejected: it forces a person to retype what the application already shows, and this project's own tickets demonstrate the practice happening anyway — unrecorded, unbounded, and in one step rather than two.
- **Let the skill read the app for any gap.** Rejected: that is how today's defects become tomorrow's acceptance criteria, and it produces tests that cannot fail.
- **Observe, but only ever as a comment on the ticket, never as a criterion.** Rejected as too weak, following the sibling repository's ADR-0045: a fact good enough to guide the implementation is good enough to be a criterion — provided a person promoted it and the ticket records that it was observed. The weaker version just relocates the retyping.
- **Let the skill resolve a contradiction between the app and the ticket.** Rejected: a disagreement is information for the author, and picking a side silently discards it. ADR-0030 already settles who decides.
