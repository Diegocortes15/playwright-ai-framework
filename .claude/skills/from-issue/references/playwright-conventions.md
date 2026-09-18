# Playwright Conventions Reference

The `/from-issue` skill consults this doc when rendering test files (Step 7 of [`workflow.md`](workflow.md)). These conventions are lifted from https://playwright.dev/docs/best-practices so the skill has them available offline.

## Locator preference order

**Read the rule below, not CLAUDE.md.** This section used to call CLAUDE.md the single source of
truth for selector order. That is exactly the coupling this skill is not allowed to have: a skill
directory is the portability boundary, so a skill lifted into another repository takes its own
`references/` and leaves CLAUDE.md behind. The rule has to be complete here or it does not survive
the move. Keep the two in agreement by editing both.

Use the highest-priority locator that **uniquely identifies the element on the page the test is
standing on**. Both halves of that sentence carry weight, and the second one is the half that
actually breaks tests — see "Uniqueness outranks level" below.

### How this order differs from Playwright's own, and why

Playwright's documentation recommends a different order, and it is worth knowing which you are
following. Upstream, in its own words, prefers "user-facing attributes and explicit contracts":
`getByRole`, then `getByText`, `getByLabel`, `getByPlaceholder`, `getByAltText`, `getByTitle`, and
`getByTestId` **last**. CSS and XPath are not on that list at all; the docs call them "not
recommended, as the DOM can often change leading to non resilient tests". The reasoning comes from
Testing Library, which groups queries by who can perceive them and places test ids last because
"the user cannot see (or hear) these".

This project inverts the top slot deliberately. A role or text locator is a bet on copy, and copy
moves: translation, a marketing rewrite, an A/B test. A `data-test` attribute is a contract written
for the test and changed on purpose. That bet pays off for an app with thorough `data-test`
coverage, which saucedemo has.

**If you point this framework at an app without that coverage, start from Playwright's order
instead.** Do not force `data-test` onto an app that has none — that is how you end up asking a
team to instrument their DOM to suit a test suite, which is a real cost and sometimes the wrong
trade. Record which order the project follows and why, and the rest of this file still applies
unchanged, because the failure modes below are about uniqueness, not about levels.

**`id` and `name` are not levels of this hierarchy.** They are CSS (`#submit`, `[name="email"]`).
Playwright has no `getById`. A unique, stable id is a perfectly good locator — it just sits at the
CSS level, not above it.

### 1. `[data-test="..."]` attribute selectors

```ts
await page.locator('[data-test="login-button"]').click();
```

Explicit testing affordance, and this project's default. Survives styling changes; brittle only if someone removes the attribute (which a code reviewer would catch) — or if it is not unique on the page being read, which is the failure this file's "Uniqueness outranks level" section exists for.

### 2. `getByRole(name, options)` with accessible name

```ts
await page.getByRole('button', { name: 'Login' }).click();
await page.getByRole('textbox', { name: 'Username' }).fill('standard_user');
```

When no `data-test` attribute exists. Survives most UI refactors (text/style changes don't break the locator if the role + name stay), accessibility-friendly.

### 3. Text-based matchers (`getByLabel`, `getByText`, `getByPlaceholder`)

```ts
await page.getByLabel('Username').fill('standard_user');
await page.getByText('Login').click();
```

When neither `data-test` nor an accessible role is exposed but a human-visible label exists.

### 4. CSS selectors (last resort as a *target*)

```ts
await page.locator('.btn-primary').click();
```

Brittle as the thing you are clicking or reading, because a class name is a styling decision and
styling changes. Use only when nothing above works.

**A CSS class used as a scoping container is a different thing and is not a downgrade.** See the
next section: `this.detail = page.locator('.inventory_details')` exists to answer "which page am I
on", not "which button do I click". The child locators under it stay `data-test`. Do not avoid this
because the word CSS appears.

**Never XPath.** `no-restricted-syntax` in `eslint.config.js` fails the build outright — XPath
encodes document structure, so it breaks on layout changes that touch nothing else. This is the one
level that is a gate rather than guidance.

## Uniqueness outranks level

A locator's level does not protect it. **What breaks tests is matching the wrong number of
elements**, and that count depends on which page the browser is actually showing when the read
happens.

The asymmetry that turns this into a failure rather than a retry:

| The locator resolves to | Playwright does |
| ----------------------- | --------------- |
| **zero** elements | auto-wait, then resolve — harmless |
| **one** element | act |
| **many** elements | throw a strict-mode violation **immediately** |

A throw is not a failed assertion. `expect.poll` retries a value it *receives*; an exception ends
the poll. So a locator that is ambiguous for even a few milliseconds fails the test outright,
intermittently, and the error names strict mode rather than anything about the feature.

### The worked example this rule came from

`product_detail.spec.ts` failed 3 times in 8 full-suite runs with
`strict mode violation: locator('[data-test="inventory-item-name"]') resolved to 6 elements`.

saucedemo reuses the same `data-test` values for a detail page's fields and for every card in the
inventory grid. Counted live, waiting for a marker unique to each destination before counting:

| `data-test` | inventory | detail |
| ----------- | --------- | ------ |
| `inventory-item-name` | **6** | 1 |
| `inventory-item-desc` | **6** | 1 |
| `inventory-item-price` | **6** | 1 |
| `[data-test$="-img"]` | **6** | 1 |

`ProductDetailPage` bound all four to `page`, unscoped, and `openProductDetail` returns as soon as
the click lands. A read that arrived before the detail page replaced the grid resolved against six
cards. Note what did **not** help: the selector was already level 1, and `getByRole('heading')`
returned **0** on that page, so the level above would have been worse.

The fix was to scope all four to a container that exists **only** on the detail page. On the grid
the container matches nothing, so the child matches nothing, and the read auto-waits. `CartPage`
already did this with `[data-test="cart-list"]`, which is why the cart never had the bug despite
using the same ambiguous attributes.

### What to do when you write a locator

1. **Count it on the page it belongs to.** One match is the answer you want.
2. **Count it on the pages a test arrives from.** If it matches more than one anywhere a test can
   be standing when it reads, it needs scoping — not a different level.
3. **Scope to a container unique to the destination page**, at the highest level that gives you
   one. Prefer a container with its own `data-test`; take a CSS class when there is none, and say
   so at the call site. Naming the level and the reason in a comment is the requirement, not
   apologising for it.
4. **Never reach for `.first()` or `.nth(0)` to silence a strict-mode violation.** That converts a
   loud, correct error into a test that passes while reading an arbitrary element. If the count is
   wrong, the locator is wrong.

The same reasoning applies to a suffix or prefix match: `[data-test$="-img"]` looked unique on the
detail page and matched six on the grid. A partial-attribute match is a bet on what else exists,
and it needs the same two counts as anything else.

## Composition rules the generated code must obey

Stated here rather than cited, because a skill lifted into another repository takes this file and
leaves CLAUDE.md behind. These are the shape decisions, and the first one is the most likely to be
reintroduced by accident — fluent Page Objects are what most tutorials teach.

**A Page method never returns another Page.** Return `void` or data. Fluent navigation
(`loginPage.login().then(inventoryPage => …)`) was considered and rejected: it makes every Page know
the graph of every Page it can reach, so a routing change edits files that have nothing to do with
it, and a test reads as a chain whose type tells you nothing about where you ended up. Tests
navigate explicitly through injected page fixtures instead, so the spec says which page it is on.

**No Page imports another Page.** That is the same rule seen from the file system, and it is the one
a generator breaks first: needing an import from a sibling Page is the signal that a method is about
to return one. If two Pages need the same element, it becomes a Component.

**A Component knows about Locators and, optionally, child Components. Never about a Page, and never
about its parent.** A component that reaches upward cannot be composed by a second page, which is
the only reason it exists. Nesting stops at depth 2.

**A Page composes Components and holds page-unique Locators.** It never composes another Page.

**Tests know Pages and Data only** — never a raw Locator, never a Component directly.

If you are generating for an app whose team already uses fluent Page Objects, this is a real
disagreement and not a detail: say so in the obstacles section rather than quietly following the
house style of whichever repository you are standing in.

## Web-first assertions (auto-retrying)

Always use `expect(locator).matcher()` patterns. They auto-retry until passing or timeout.

```ts
// GOOD: auto-retries until visible or timeout
await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();

// BAD: snapshot at a single moment, no retry
const isVisible = await page.getByRole('heading', { name: 'Inventory' }).isVisible();
expect(isVisible).toBe(true);
```

## No manual waits

```ts
// FORBIDDEN (lint-enforced in this project per CLAUDE.md)
await page.waitForTimeout(2000);

// PREFERRED
await expect(page.getByText('Loaded')).toBeVisible(); // auto-waits
```

## Test structure: `test.step` lives in the Page Object, not the spec

The Playwright HTML report shows `test.step` blocks as collapsible entries with per-step timing — critical for human-readable reports. **This framework puts those steps on the Page Object's composed action methods, not in the spec.** The step name lives where the action is defined, so every test that calls the method inherits the named step for free, and specs stay clean (just method calls + assertions).

The spec is plain:

```ts
test('@smoke standard_user logs in successfully', async ({ loginPage, page }) => {
  await loginPage.goto();
  await loginPage.loginAs('standard_user', env.password);
  await expect(page).toHaveURL(/\/inventory\.html$/);
});
```

The named steps come from the Page Object methods:

```ts
// LoginPage.ts — `test` is imported as a value from '@playwright/test'
async goto(): Promise<void> {
  await test.step('Navigate to the login page', async () => {
    await this.page.goto('/');
  });
}

async loginAs(username: string, password: string): Promise<void> {
  await test.step('Submit credentials', async () => {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  });
}
```

**Placement rules:**

- **Composed / intent-level methods** a test calls directly (`goto`, `loginAs`, `completeCheckout`) wrap their body in exactly **one** `test.step`. Depth 1 — a composed method calls unstepped primitives or raw locators inside its step, never other stepped methods.
- **Single-element primitives** (`fillUsername`, `clickLogin`) are **never** wrapped. Playwright auto-records each `.fill()` / `.click()` in the trace; wrapping them just nests redundant entries.
- **Specs never use `test.step`.** Assertions stay in the spec as plain `expect(...)` (auto-recorded). If a behavior needs a named action the Page Object doesn't expose, add a composed method to the Page Object — don't wrap raw calls in the spec.
- Step names are **action-focused** (`'Submit credentials'`), present-tense, written for a human reading a failure — not implementation-focused (`'Fill username then password then click'`).

**Why at the Page Object level:** in a generated framework the authoring cost of steps is paid by the machine, so the usual "steps are verbose boilerplate" objection doesn't apply. Defining the step once on the method (rather than in every spec that calls it) is DRY, keeps specs near-prose, and guarantees uniform report structure across every generated file.

One logical assertion per test. Don't pile multiple unrelated assertions into one test.

## Test isolation

Each test gets a fresh page via Playwright's fixtures. Don't share state across tests.

```ts
// GOOD: each test gets its own loginPage
test('test A', async ({ loginPage }) => {
  /* ... */
});
test('test B', async ({ loginPage }) => {
  /* ... */
});

// BAD: shared mutable state
let sharedPage: Page;
test.beforeAll(async ({ browser }) => {
  sharedPage = await browser.newPage();
});
```

## Page Object methods

Methods are verb phrases (`clickLogin()`, `fillUsername()`, `loginAs()`), NOT getters returning `Locator`.

```ts
// GOOD: action methods read like English in tests
await loginPage.loginAs('standard_user', env.password);

// BAD: tests reach into Page internals
await loginPage.usernameLocator.fill('standard_user'); // tests now know about Locator
```

(Also in ADR-0001 rule #4 — restated here for skill convenience.)

## Anti-patterns

### Testing third-party sites

Don't write tests against external services we don't control. Mock them or skip.

### Snapshot testing without intent

`toMatchSnapshot()` is powerful but easy to abuse. Use only when the visual/structural output IS the contract being tested.

### Conditional asserts

```ts
// BAD: test passes vacuously when banner isn't visible
if (await loginPage.errorBanner.isVisible()) {
  expect(/* ... */).toContain('error');
}
```

Use auto-waiting assertions and let them fail loudly.

### No conditionals in a test body (parameterized variants)

eslint `playwright/no-conditional-in-test` flags any `if`/`else` inside a `test(...)`, and CI runs `npm run lint`. When you parameterize a test over variants that differ by which **action** or **expected value** applies, put that difference **in the data table** and apply it on a single straight-line path — never branch in the body.

```ts
// BAD — branches on the variant inside the test
for (const control of ['Cancel button', 'cart icon'] as const) {
  test(`${control} returns to the cart`, async ({ checkoutInfoPage, page }) => {
    if (control === 'Cancel button') await checkoutInfoPage.cancel();
    else await checkoutInfoPage.openCart();
    await expect(page).toHaveURL(/\/cart\.html$/);
  });
}

// GOOD — the differing step is data (a Page Object method name), applied unconditionally
const controls = [
  { name: 'Cancel button', via: 'cancel' },
  { name: 'cart icon', via: 'openCart' },
] as const;
for (const { name, via } of controls) {
  test(`${name} returns to the cart`, async ({ checkoutInfoPage, page }) => {
    await checkoutInfoPage.goto();
    await checkoutInfoPage[via](); // type-safe: via is 'cancel' | 'openCart'
    await expect(page).toHaveURL(/\/cart\.html$/);
  });
}
```

Whatever varies — a value, an expected result, or a method name (above) — goes in the table, so the body stays branch-free. Each row is still a real, independent test, and the lint gate stays green.

## Computed-style / pseudo-state assertions (hover / focus / active)

Some ACs assert a style that only appears in a pseudo-state — e.g. "the title turns green on hover." Read the **computed** style and let the state settle:

```ts
// Page Object — return the computed value as data (ADR-0001 rule #8)
async getProductTitleColor(productName: string): Promise<string> {
  return this.page
    .getByText(productName, { exact: true })
    .evaluate((el) => getComputedStyle(el).color);
}
```

```ts
// Spec
const resting = await inventoryPage.getProductTitleColor(name);
expect(resting).not.toBe('rgb(61, 220, 145)'); // sanity: not already the target
await inventoryPage.hoverProductTitle(name); // trigger the pseudo-state
await expect
  .poll(() => inventoryPage.getProductTitleColor(name)) // re-reads until it settles
  .toBe('rgb(61, 220, 145)');
```

Rules:

- Compare in **computed form** — browsers report color as `rgb(...)` / `rgba(...)`, never the source hex. Convert `#3ddc91` → `rgb(61, 220, 145)` in the expectation.
- **Sanity-check the resting value ≠ the target** first, so the test proves the state _changed_ it (not that it was always green).
- Use **`expect.poll(...)`** (not a one-shot read) so a CSS transition can finish — `expect.poll` retries like a web-first assertion.
- The hover/focus trigger is a composed Page Object action (one `test.step`); the computed-style read is a query returning data.

## Exact-match for named-element filters

When a query targets ONE element identified by a human name, match it **exactly** — a substring match would also catch a longer name that contains it.

```ts
// GOOD: exact — only the card titled exactly this
this.page.getByText(productName, { exact: true });

// RISKY: substring — a short name matches every longer name that contains it
this.productNames.filter({ hasText: productName });
```

Prefer `getByText(name, { exact: true })` or an anchored regex. Substring `filter({ hasText })` is fine only when matching a _group_ deliberately (e.g. "all cards mentioning 'Sauce'").

## Reaching the state a test starts from

Before rendering a test, decide for each precondition: **is getting there the subject, or is
it setup?**

- **The acceptance criterion names the action** → drive it through the UI. A test that seeds
  the cart and then asserts adding to the cart works has asserted nothing.
- **The criterion assumes the action and describes what comes after** → seed the state. The
  `seedCart` fixture writes saucedemo's `cart-contents` key through
  `context.addInitScript`, which is what the add-to-cart button does anyway.

Read the criterion's own words. *"adding three products shows a badge of three"* names the
action. *"the overview shows the item total"* assumes it.

The suite already works this way for authentication and nobody calls it seeding: 58 tests
start logged in because `storageState` injects the session, and the 26 that TEST logging in
still fill the form. This is the same rule applied to the cart.

**It is not about speed.** Measured on saucedemo, seeding the cart saves about 80ms against
nine UI actions. What it buys is that changing the "Add to cart" button stops turning six
overview tests red for something they do not test.

**`@smoke` is the exception.** A smoke test's job is to fail when the critical journey is
broken, so it walks the journey even when its assertion is about the screen at the end. One
checkout test keeps its clicks for exactly this reason — seeding it would let smoke pass with
the purchase flow dead, which is the regression that tier exists to catch.

Seed before the first navigation: an init script only affects pages loaded after it is added.

**And the exception that matters: never seed when the subject is the state SURVIVING.** This is
not a style preference, it is a test that passes while asserting nothing. `context.addInitScript`
re-runs on every new **document**, so a seeded value is rewritten every time one is created — and
`page.reload()` creates one. A persistence test that seeds its precondition and then reloads is
handed the seeded value back by the fixture and goes green with the behaviour completely broken.

Measured on saucedemo, because the boundary is not where you would guess:

| After | Seeded cart |
| ----- | ----------- |
| seeding, then removing an item through the UI | `[1]` — the removal stuck |
| opening a product detail page and returning | `[1]` — **no re-seed**, routed client-side |
| `page.reload()` | `[4,1]` — **re-seeded** |

So "every navigation re-seeds" is false and "a reload re-seeds" is true. In-app navigation through
the application's own controls is client-side here and creates no document. Do not generalise from
one app either: whether a given transition creates a document is a property of the app, so if the
subject is survival, drive the precondition through the UI and do not spend the analysis.

`tests/cart/cart.spec.ts` carries the worked example — SW-21's five persistence tests build the
cart with two clicks for exactly this reason.
## Browser-level navigation belongs in the spec, not in a Page Object

`page.goBack()`, `page.goForward()` and `page.reload()` are called **directly from the spec**. They
are not Page Object methods.

The reason is ownership. A Page Object's methods are the actions that page offers — its buttons,
its links, its form. Back and reload are the browser's controls, and they work the same on every
page, so a `CartPage.reload()` would have to be repeated on every Page Object in the framework and
would still be describing something the page does not own. The existing precedent is
`tests/logout/logout.spec.ts`, which calls `page.goBack()` from the spec, and `tests/cart/`
followed it for SW-21's AC 4 and AC 5.

This is a deliberate exception to "if a behavior needs a named action the Page Object doesn't
expose, add a composed method", which otherwise holds. Take the `page` fixture alongside the page
objects and use it for these three calls only.

**Assert you arrived before you go back.** A `goBack()` that has nothing to undo is a silent no-op,
and the test then asserts against the page it never left — which reads as a pass. SW-21's AC 4
asserts the checkout URL first for exactly this reason:

```ts
await cartPage.checkout();
await expect(page).toHaveURL(/\/checkout-step-one\.html$/);
await page.goBack();
```

Note also what a reload does to a seeded precondition — see "Reaching the state a test starts
from" above. A reload re-runs the init script, so a persistence test that seeds cannot fail.

## Network interception

Everything below was settled by SW-19, the first ticket that needed it. Its run reported
this file as a reference gap, which is why the section exists.

### An interception lives in the Page Object, never in the spec

A spec says `await inventoryPage.blockProductImages()`. It never calls `page.route`, for the
same reason it never touches a Locator (ADR-0001 rule #4): the URL shape of an asset is the
page's business. The primitives go in a helper the Page Object calls — `src/utils/network.ts`
holds `abortRequests` and `readImageStates` — and the Page Object wraps each in one named
`test.step`.

### Install the route BEFORE navigating

A route only affects requests issued after it is added. `blockProductImages()` is called
before `goto()`, and the method's comment says so, because the failure mode is silent: block
after navigating and the page already has its images, the assertion sees a loaded image and
the test fails for a reason that looks like a product bug.

When the page is already open and you need it anyway, install the route and **reload** —
that is what `blockProductImage(name)` does for the one-image case.

### Prove the failure happened, or the test passes vacuously

This is the discipline the whole ticket turned on. Asserting only what stays visible is not
enough, because the visible thing is usually there either way: saucedemo's `alt` text is
present whether or not the image loads, so a test asserting it alone **passes green having
blocked nothing**.

Every interception test asserts two things:

1. the failure really occurred, and
2. the behaviour under test.

For an image that is `naturalWidth === 0` **and** `complete === true`. The second half is not
decoration: an image still in flight also reports width 0, so `naturalWidth` alone cannot
tell "failed" from "not downloaded yet", and a test asserting it would pass against a page
that was merely slow.

### Derive the URL from the page, never hardcode it

Asset filenames carry build hashes — `sauce-backpack-1200x1500-CjRW-Djj.jpg`. A literal
pattern silently matches nothing after a redeploy, and a test that blocks nothing passes for
the wrong reason. `blockProductImage` reads the `src` off the rendered card and routes on
that. A glob over a directory (`**/assets/*.jpg`) is fine; a glob over a hashed filename is
not.

### Start with isolation, not with business mocking

`route.abort()` on third-party noise and on assets, and deliberate latency, apply to any
application today. Replacing business responses with `route.fulfill()` needs an application
that has an API to replace; saucedemo serves its catalogue from its own bundle and keeps the
cart in `localStorage`, so there is nothing to mock. Check what the app actually requests
before designing around a REST call that may not exist.

## See also

- [`test-principles.md`](test-principles.md) — F.I.R.S.T. (overlap on Fast / Repeatable)
- [`bucket-classification.md`](bucket-classification.md) — categorization happens after these conventions
- https://playwright.dev/docs/best-practices — upstream source
