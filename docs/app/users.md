# Saucedemo — Users

Saucedemo provides 6 user accounts. The password is the same for all (`secret_sauce`, also documented in [`overview.md`](overview.md)). Each user surfaces a different intentional behavior.

> **Every behavioural claim here carries `Verified by:`** — the test that proves it, or a plain
> statement that nothing does. This file is _reference_: its claims are falsifiable statements about
> a live application, and a reference doc nobody checks rots silently. It did: on 2026-09-07 this
> page was found to be wrong about the `problem_user` sort mechanism, to claim a `locked_out_user`
> login test that does not exist, to cite a spec file that does not exist, and to name eight
> Playwright projects of which **none** were real. Every one of those was caught by asking "what
> verifies this?" — which is why the field is mandatory rather than nice to have. It is the same
> device as `Enforced by:` in `docs/adr/`, applied to the one doc that makes checkable claims.
>
> **`Verified by: nothing` is an acceptable answer.** An unverified claim that says so is useful;
> one that stays silent is a trap.

## Summary

The projects that actually exist are `setup-standard`, `setup-problem`, `setup-error`,
`chromium-standard`, `chromium-problem`, `chromium-error` and `chromium-no-auth` — derived from
`tests/users.ts` `AUTH_USERS`, currently `['standard', 'problem', 'error']`. Only those three users
have an authenticated project; the rest reach the app through `chromium-no-auth` by logging in via
the UI. A per-user project appears only when a ticket needs it (ADR-0014). Cross-browser was
deferred by ADR-0004 and later built opt-in by ADR-0027 — four Firefox/WebKit projects behind
`CROSS_BROWSER=1`, standard user only, so they add no per-user coverage.

| Username                  | Authenticated project | Intent                                                      | Behaviour verified?                             |
| ------------------------- | --------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `standard_user`           | `chromium-standard`   | Happy path — everything works                               | ✅ fully                                        |
| `locked_out_user`         | none                  | Login fails with a lockout error                            | ❌ **nothing verifies this**                    |
| `problem_user`            | `chromium-problem`    | Wrong product images; broken sort dropdown                  | ✅ both                                         |
| `performance_glitch_user` | none                  | ~10s artificial delay on every navigation                   | ⚠️ login/logout only; the delay is not asserted |
| `error_user`              | none                  | Broken sort dropdown (same as problem); intermittent errors | ⚠️ login/logout only; sort via instrumentation  |
| `visual_user`             | none                  | Intentional visual regressions (font sizes, colors)         | ⚠️ login/logout only; the regressions are not   |

## Per-user details

### `standard_user`

- **Behavior:** Fully functional. Sort works. Cart add/remove works. Checkout flow works.
- **Used by:** `chromium-standard` (authenticated) and `chromium-no-auth` (login/logout).
- **Verified by:** the most thoroughly covered user, and the only one whose every claim above has a test.
  - logs in and lands on inventory — `tests/login/login.spec.ts` (`@smoke`)
  - sort works, all four options — `tests/inventory/inventory.spec.ts` → `selecting "…" sorts products by …`
  - catalog renders (names, descriptions, prices, images, buttons) — `tests/inventory/inventory.spec.ts`
  - cart add/remove — `tests/cart/cart.spec.ts`
  - checkout flow — `tests/checkout/checkout.spec.ts`
  - logout — `tests/logout/logout.spec.ts` (`@smoke`)
- **Test scope:** default user for happy-path tests. Cross-browser is deferred, so there is no `firefox-standard` or `webkit-standard` — an earlier version of this file named both.

### `locked_out_user`

- **Behavior:** Login fails. Saucedemo returns the error: _"Epic sadface: Sorry, this user has been locked out."_
- **Used by:** nothing.
- **Verified by:** ❌ **nothing.** There is no test for this user anywhere — `grep -rn "locked" tests/` finds only two comments explaining its _absence_, and the expected error string appears nowhere in the repository. An earlier version of this file said "Login spec only (`tests/login/login.spec.ts`)", which was false: that spec loops the five users that _can_ authenticate and never touches this one.
- **Worth knowing why the belief was so durable:** `smoke-policy.md` and `bucket-classification.md` both use `locked_out_user sees the lockout error` as a **worked example** of a smoke-worthy negative test. The examples are illustrative and not wrong, but they read as descriptions of existing coverage.
- **Highest-value missing test in this file.** It is a `@no-auth` negative case, needs no storageState, and `LoginPage` already exposes `loginAs` and `getErrorMessage`.
- **Why no storageState:** authentication never succeeds, so there is no session to save.

### `problem_user`

- **Behavior:** Two known intentional bugs:
  1. **Wrong product images** — every product on the inventory page renders the same broken-image asset, regardless of which product it is.

     **Verified by:** `tests/inventory/inventory.spec.ts` → `problem_user sees one identical broken image for every product` (the `@problem` context's Edge bucket). An earlier version of this file cited `tests/visual/inventory-images.spec.ts`, which does not exist.

  2. **Broken sort dropdown** — the control **discards the selection entirely**: after selecting any option, the `<select>`'s own `value` reverts to `az`, the active-option label stays "Name (A to Z)", and the order never changes. Measured live 2026-09-07 against `standard_user` as a control, which returns `value: "lohi"` and reorders correctly on identical steps.

     This corrects an earlier description here — "accepts the click but does not re-order" — which implied the control registered the selection. It does not. The distinction matters: a test that asserts only the resulting order would pass through the wrong mechanism.

     Filed as **SW-14**, and covered by the `test.fail()`-annotated tests in the `@problem` context of `tests/inventory/inventory.spec.ts` (ADR-0024). **This entry is a defect log, not a specification** — it records that the bug is known, not that the behaviour is correct.

- **Used by:** `chromium-problem` (authenticated) and `chromium-no-auth` (login/logout).

### `performance_glitch_user`

- **Behavior:** Artificially slow. Each page navigation takes ~10 seconds (saucedemo injects a deliberate delay). Functionality is otherwise correct.
- **Used by:** `chromium-no-auth` only. There is **no** `performance_glitch` project — one appears only when a ticket needs this user's authenticated page (ADR-0014).
- **Verified by:** ⚠️ **partly.** Login and logout are covered by the five-user loops in `tests/login/login.spec.ts` and `tests/logout/logout.spec.ts`. The ~10s delay itself is **not asserted** — it is merely _tolerated_, by a `{ timeout: 15_000 }` on the logout spec's URL assertion. So the suite would still pass if the delay vanished, and would fail if it grew past 15s. Neither outcome is an intentional test.
- **Note:** an earlier version of this file described a `navigationTimeout: 30_000` override in `playwright.config.ts` for a `performance_glitch` project. Neither the project nor the override exists.

### `error_user`

- **Behavior:** Same broken sort dropdown as `problem_user`, and it raises a native `alert()` when a sort option is selected. Some intermittent UI errors. Functional flows (cart, checkout) work.
- **Used by:** `chromium-no-auth` only. There is **no** `error` project.
- **Verified by:** ⚠️ **partly, and from an odd direction.** Login and logout come from the five-user loops. The `alert()` on sort is exercised only by `tests/_framework_validation/` — which exists to prove the observation **dialog detector** works, not to characterise this user's behaviour. So the app behaviour is confirmed to happen, as a side effect of testing the instrumentation. The intermittent UI errors are **not verified at all.**
- **Note:** `@sort-functional` is cited in several places as the tag that excludes this user, but no Playwright project greps it — see the checklist entry. As a sole routing tag it would route to no project at all.

### `visual_user`

- **Behavior:** Intentional visual regressions — font sizes wrong, button colors off. Functional flows are correct.
- **Used by:** `chromium-no-auth` only. There is **no** `visual` project.
- **Verified by:** ⚠️ **login and logout only**, via the five-user loops. **The visual regressions themselves are not verified by anything** — there is no visual-regression suite in this repository, so the one behaviour that gives this user its name is unchecked. The claim "functional flows are correct" is also unverified for this user specifically.
- **Test scope:** visual comparison remains deferred; treat the behaviour claim above as documentation of intent rather than of observed, tested fact.

## Tag mapping

For the per-tag → per-project mapping, see [`CLAUDE.md`](../../CLAUDE.md) (section "Tag conventions").
