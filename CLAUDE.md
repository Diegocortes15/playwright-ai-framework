# CLAUDE.md — Always-loaded AI rules

This file is loaded into context for every Claude Code session in this project. Keep it under 150 lines. Detailed reference lives in `docs/`.

## Project purpose

Playwright + TypeScript test framework for [saucedemo](https://www.saucedemo.com). AI-assisted extension is a first-class workflow.

- Framework architecture: [`docs/architecture.md`](docs/architecture.md)
- App behavior (the 6 saucedemo users, flows): [`docs/app/`](docs/app/) — it is _reference_, so every behavioural claim carries **`Verified by:`** naming the test that proves it, or says plainly that nothing does. Add the field when you add a claim; `Verified by: nothing` is a valid answer and a useful one.
- Test case management philosophy (why no TCMS, where reports live): [`docs/test-case-management.md`](docs/test-case-management.md)
- Decision rationale: [`docs/adr/`](docs/adr/) — index, the `Enforced by:` rule and the ADR budget live in [`docs/adr/README.md`](docs/adr/README.md); read it before adding one
- Design specs and plans (don't auto-load — read on demand): [`docs/superpowers/`](docs/superpowers/)

## Quick run

```bash
npm test                 # full matrix (all data-driven projects, per tests/users.ts)
npm run test:standard    # standard chromium only (fast local iteration)
npm run test:debug       # Playwright Inspector
npm run test:ui          # Playwright UI mode
```

## Playwright CLI

This project ships with the `@playwright/cli` Claude Code skill registered at `.claude/skills/playwright-cli/`. When you need to inspect the live application — discover selectors on an unfamiliar page, verify a selector before writing a test, or debug a flaky test by reading the rendered DOM — invoke the skill or call `npx playwright-cli` commands directly via Bash.

- **Always `npx playwright-cli`, never bare `playwright-cli`** — the binary is not on `PATH`, it lives in `node_modules/.bin/`, so the bare form fails with `command not found`. The vendored `SKILL.md` writes it bare in all 164 of its examples; that file is **generated**, so correcting it there would be undone by the next `install --skills`. This line is the correction, and it survives regeneration.
- Skill frontmatter `allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*)` permits these commands without per-call approval — `Bash(npx:*)` is the one that matters.
- Browser auto-detected at install time (Chrome on most dev machines).
- The CLI is independent of the test runner — `npm test` uses the bundled Playwright chromium and is unaffected.
- On `@playwright/cli` upgrade, re-run `npx playwright-cli install --skills` and commit the regenerated skill files in the same commit as the version bump.
- Full usage guide with worked examples: [`docs/playwright-cli.md`](docs/playwright-cli.md)
- Reach for `npm run codegen` instead when YOU want to manually click through the app and capture selectors interactively.

## Custom skills

This project ships custom skills under `.claude/skills/<skill-name>/` — domain-specific workflows that build on top of `playwright-cli` and other tools. The pattern is documented in [ADR-0008](docs/adr/0008-custom-skills-pattern.md): compact `SKILL.md` (frontmatter + intro + pointer) and verbose detail in `references/`.

**A skill directory is the portability boundary** ([ADR-0019](docs/adr/0019-skill-portability.md)): no markdown link inside a skill may resolve outside it. Cite ADRs as plain text (`ADR-0012`, not a link), write repo paths as backticked prose (`` `docs/tcms.md` ``), reference a sibling skill by name (`/scaffold-page-object`, never `../scaffold-page-object/SKILL.md`), and name — never link, never copy — a sibling skill's reference file. Verify before a handoff with the one-line `grep` in README.md under "Optional: validating the skills" — no output means clean, and it catches both failure modes with no false positives. Manual, not a CI gate: ADR-0019's alternatives say why, and name the scale that would change it.

Current custom skills:

- **`/scaffold-page-object`** — generate a draft Page Object class from a live page snapshot. Full guide: [`docs/scaffold-page-object.md`](docs/scaffold-page-object.md).
- **`/from-issue`** — generate a set of Playwright tests from a Jira ticket (read via the Atlassian MCP) and open a GitHub PR with the result. **Never opens a red PR** ([ADR-0020](docs/adr/0020-no-red-pr.md)): on a typecheck or test failure it diagnoses and retries up to 3 times, and if it still fails — or if the app, not the generated code, is what contradicts an AC — it reports and opens nothing. Composes `/scaffold-page-object` when a target Page Object doesn't yet exist, and grows the harness autonomously (data-driven `tests/users.ts` `AUTH_USERS`, [ADR-0014](docs/adr/0014-from-issue-harness-growth.md)) when a ticket needs an unwired auth user. Full guide: [`docs/from-issue.md`](docs/from-issue.md). Writes a committed `.tcms/records/<feature>.json` artifact; the authoritative Qase sync runs **at merge** in CI (`npm run tcms:sync`) — no `QASE_*` needed at PR time. Opt-in, one-way: [ADR-0016](docs/adr/0016-tcms-mirror.md) / [ADR-0017](docs/adr/0017-tcms-sync-at-merge.md) / [`docs/tcms.md`](docs/tcms.md).
- **`/report-bug`** — turn a failed Playwright run into a bug report draft: repro steps (the `test.step` titles the Page Objects already wrap actions in), the acceptance criterion the test traces to, expected vs actual, correlated runtime observations, and evidence paths. **Files nothing** — you invoke it, read the draft, and decide. It never resolves which of three things is wrong — the _application_, the _ticket_, or our own _automation_ — not even when `docs/app/` covers the behaviour, because documentation records known defects as readily as intended behaviour. All three readings stay in the draft; a person settles it.
- **`/refine-ticket`** — iteratively harden a Jira ticket against a "bulletproof" rubric (grounded in existing automation + docs + sources you point it at) and write the refined acceptance criteria back to the ticket on approval, so `/from-issue` has nothing left to guess. Writes to Jira ([ADR-0013](docs/adr/0013-refine-ticket-jira-writeback.md)) — the only skill that does. Full guide: [`docs/refine-ticket.md`](docs/refine-ticket.md).

## GitHub + Jira operations

**Ticket reads come from Jira via the Atlassian MCP** (see [ADR-0011](docs/adr/0011-jira-ticket-source.md)) — `/from-issue SW-123` reads the ticket through the MCP, NOT `gh issue`. The GitHub-for-Jira app auto-links the PR onto the ticket (no write-back).

**PR titles follow [Conventional Commits](CONTRIBUTING.md), and branches say what changed, not where they sit in a plan** — this repo squash-merges, so a PR title becomes the permanent commit on `main`. Full conventions in [`CONTRIBUTING.md`](CONTRIBUTING.md).

This project uses the `gh` CLI for GitHub operations (PRs, releases, workflow runs, arbitrary REST calls). `gh` is the user-installed GitHub CLI; assume it's authenticated (`gh auth login` is a one-time step).

- For PRs: `gh pr create`, `gh pr view`, `gh pr comment`, `gh pr checks`
- For arbitrary API: `gh api repos/<owner>/<repo>/...`
- We do NOT install a GitHub MCP server — see [ADR-0007](docs/adr/0007-gh-cli-not-github-mcp.md) (scoped by ADR-0011: gh for GitHub, Atlassian MCP for Jira).

## Composition rules (must follow)

1. **Component knows about Locators and (optionally) child Components only.** Never about Pages or its parent.
2. **Page composes Components and holds page-unique Locators.** Never composes other Pages.
3. **Pages NEVER return other Pages.** Methods return `void` or data only. Tests use injected page fixtures to navigate explicitly.
4. **Tests know about Pages and Data only.** Never raw Locators or Components directly.
5. **All locator/component fields are `readonly`.** Set in constructor, never reassigned.
6. **Constructor order:** composed Components first → page-direct Locators second.
7. **Action methods read like English.** Tests should be near-prose: `inventoryPage.addProductToCart('X')`.
8. **Queries return data, never `Locator`.** `getProductNames(): string[]`, not `getProductLocators(): Locator[]`.
9. **Components scoped to one of many similar elements take a discriminator** in the constructor (e.g., `new ProductCard(page, productName)`).
10. **Refactor a page-direct locator into a Component the moment a 2nd page needs it.** Don't wait.
11. **Component nesting depth ≤ 2.** Deeper indicates a design problem.
12. **No `await page.waitForTimeout()` ever.** Use Playwright auto-waiting assertions (`expect(...).toBeVisible()` etc.). Enforced by lint.

## Selector preference order

1. `[data-test="..."]` attribute
2. `getByRole(...)` (with anchored regex like `/^Add to cart$/i`)
3. Text matchers
4. CSS selectors (only when nothing above is available)

Never use XPath.

**Only XPath is a build gate.** `no-restricted-syntax` in `eslint.config.js` fails it outright — XPath encodes document structure, so it breaks on layout changes that touch nothing else. The rest of the order is **authoring guidance**: prefer the highest level available when writing a locator, but a unique, stable locator that works is fine whatever level it came from. **Level 1 wins only when it is actually unique for the element the test means** — a `data-test` that is not loses to the next level down. saucedemo reuses `inventory-item-name` for a detail page's title AND for each of six inventory cards, so it is unique on one page and ambiguous on the other; Playwright then throws a strict-mode violation rather than waiting, which aborts `expect.poll` instead of retrying it. Descend when that happens: scope the `data-test` under a container that exists only on the page you mean, at the highest level that provides one — `.inventory_details` in `ProductDetailPage` is a CSS class because that page has no container of its own carrying a `data-test` and no heading role at all. Name the level you took and why, at the call site. A rule that fails on `#stable-id` only teaches people to silence it, and `eslint-disable` sprawl is worse than no rule.

**Fragility is proven by a test failing, not by an attribute's name.** What does get reported is the _choice_: skills declare a mandatory `Obstacles encountered` section ([ADR-0022](docs/adr/0022-obstacles-encountered.md)) carrying selector downgrades, tooling friction, and gaps in their own `references/`. It renders even when empty (`None.`), so a deliberate fallback arrives labelled at review time.

## Tag conventions (Playwright Projects + storageState + role tags)

> Tags are applied via Playwright's **`{ tag }` option** — routing tags on `test.describe`, `@smoke` on the `test` — NOT in the title string (per [ADR-0015](docs/adr/0015-spec-tags-via-tag-option.md)). Project `grep` matches option-tags, so routing is unchanged. One feature file holds one tagged describe per user-context.

Projects are **data-driven from `tests/users.ts` `AUTH_USERS`** (currently `['standard', 'problem', 'error']`); `/from-issue` grows that array one user at a time as tickets need authenticated pages (ADR-0014). Each user yields a `setup-<user>` + a `chromium-<user>` project; plus a `chromium-no-auth` project. Cross-browser is **implemented and opt-in** ([ADR-0027](docs/adr/0027-cross-browser-opt-in.md)): `npm test` stays chromium, and `npm run test:firefox` / `test:webkit` / `test:cross` set `CROSS_BROWSER=1` to add the four Firefox/WebKit projects. Standard user only — never a per-user × per-browser matrix. In CI it is reachable **on manual dispatch only** ([ADR-0029](docs/adr/0029-cross-browser-on-demand-in-ci.md)): `regression.yml` takes a `browser` input, the scheduled cadences are pinned to chromium, and `scripts/run-suite.sh` exits 66 rather than let a cron run another engine.

| Tag          | Runs on project(s)                                                                          | Purpose                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@no-auth`   | `chromium-no-auth`                                                                          | Login / logout / route-guard tests — no pre-existing session                                                                                                                                                                                                                                                                                     |
| `@all-users` | every `chromium-<user>` project (`chromium-standard`, `chromium-problem`, `chromium-error`) | User-agnostic flows — runs the **same assertions** in every `chromium-<user>` project. Use it when invariance across users **is** the requirement (SW-20's footer: a copyright line should read the same for anybody). A persona whose expected outcome **or path** differs needs its own pinned describe — this tag cannot express user→outcome |
| `@standard`  | `chromium-standard`                                                                         | Tests where only standard_user is meaningful                                                                                                                                                                                                                                                                                                     |
| `@problem`   | `chromium-problem`                                                                          | Tests that _expect_ problem_user's broken UI                                                                                                                                                                                                                                                                                                     |
| `@error`     | `chromium-error`                                                                            | Tests that _expect_ error_user's broken UI                                                                                                                                                                                                                                                                                                       |
| `@<user>`    | `chromium-<user>` — **only once that user is wired** into `AUTH_USERS`                      | On-demand per ADR-0014: e.g. `@performance_glitch` / `@visual` route nowhere until a ticket needs that user (then `/from-issue` adds it + its project). Cross-browser covers the standard user only, opt-in (ADR-0027).                                                                                                                          |
| `@smoke`     | Cross-cutting (filtered via `--grep "@smoke"`)                                              | Build-verification candidates from /from-issue. Selected per `smoke-policy.md`. Run via `npm run test:smoke`.                                                                                                                                                                                                                                    |

## Where things live

| What                                            | Where                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page objects                                    | `src/pages/` (`LoginPage.ts`, `InventoryPage.ts`, `CartPage.ts`, `checkout/*`)                                                                   |
| Components                                      | `src/components/` (`Header.ts`, `Footer.ts`, `CartBadge.ts`, `BurgerMenu.ts`)                                                                    |
| Fixture (auto-injects pages)                    | `src/fixtures/test.ts` — tests import `test`/`expect` from `@fixtures/test`, NOT `@playwright/test`                                              |
| Seeding state without the UI                    | `seedCart` in `src/fixtures/test.ts` — for preconditions that are setup, not the subject. A test that verifies the action still clicks           |
| Test data + types + loaders                     | `data/` (use `@data/*` alias)                                                                                                                    |
| env config                                      | `src/utils/env.ts` (single read point for `process.env`)                                                                                         |
| Specs                                           | `tests/<feature>/*.spec.ts`                                                                                                                      |
| Auth setup (generates storageState per user)    | `tests/auth.setup.ts`                                                                                                                            |
| Playwright config (data-driven from AUTH_USERS) | `playwright.config.ts`                                                                                                                           |
| Runtime observations (ADR-0021)                 | `src/observations/` (`types.ts`, `signature.ts`, `reporter.ts`); index in `.observations/observations.json`; read it with `npm run observations` |
| TCMS mirror (optional Qase seam)                | `src/tcms/` (`types.ts`, `case-mapper.ts`, `results-reader.ts`, `qase-client.ts`, `suite-sync.ts`, `map-store.ts`)                               |

## Path aliases

```ts
'@data/*'       → 'data/*'
'@pages/*'      → 'src/pages/*'
'@components/*' → 'src/components/*'
'@fixtures/*'   → 'src/fixtures/*'
'@utils/*'      → 'src/utils/*'
```

## When extending the framework

- **Adding a test:** put it under `tests/<feature>/*.spec.ts`. Tag it correctly. Use `@fixtures/test` for `test`/`expect`, never `@playwright/test`.
- **Adding a page:** put it under `src/pages/`. Compose any existing Components first. Hold page-unique locators directly.
- **Adding a component:** put it under `src/components/`. Only if reused (or about to be reused) by 2+ pages.
- **Adding test data:** **inline in the spec is the default.** Externalize to `data/` only on a concrete trigger — reused across specs, large, owned by a non-engineer, env-specific, or a named scenario; the rule is `from-issue`'s `references/data-placement.md`. When you do externalize, reference data goes in `data/shared/` and scenarios in `data/scenarios/<feature>/`, with a typed loader in `data/fixtures.ts`.
- **Architectural changes:** read `docs/adr/` first; if you need to overturn an ADR, write a superseding one rather than editing the original. Every ADR declares **`Enforced by:`** — the lint rule, test, or config that makes it true, or `Nothing — prose only`. If a decision states something a machine can check, write the check: ADR-0005 stated one without a gate, the code was reverted three months later, and the record sat `Accepted` the whole time (see ADR-0023).

## What to NEVER do

- Make an observation fail a test — the `_observations` fixture records, never judges ([ADR-0021](docs/adr/0021-runtime-observations.md)). Triage is human, via the `status` field
- `await page.waitForTimeout()` — lint blocks; use auto-waiting assertions
- Make a Page method return another Page (we explicitly rejected fluent navigation — see ADR-0001)
- Import a Page from another Page (no cross-page imports in `src/pages/`)
- Import a raw Locator into a test (tests use Pages and Data only)
- Use XPath
- Act on a finding instead of reporting it — a failing test, an unmet AC, a behaviour the docs claim and the app lacks. Diagnose it fully, show the readings that survive, and stop; the decision is the team's and usually becomes a ticket ([ADR-0030](docs/adr/0030-triage-is-a-human-decision.md), workflow in [`docs/triage.md`](docs/triage.md))
- Add a per-user × per-browser matrix, or wire `firefox-problem` / `webkit-error` — cross-browser is standard-user-only and opt-in (ADR-0027, keeping ADR-0004's guardrail)
- Publish a Playwright trace to an unauthenticated host (GitHub Pages, a public bucket) — a trace records response bodies and live session tokens, so it inherits the confidentiality of the app under test. Ship the artifact, which already inherits the repo's permissions
