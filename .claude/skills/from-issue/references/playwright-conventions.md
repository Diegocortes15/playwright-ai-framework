# Playwright Conventions Reference

The `/from-issue` skill consults this doc when rendering test files (Step 7 of [`workflow.md`](workflow.md)). These conventions are lifted from https://playwright.dev/docs/best-practices so the skill has them available offline.

## Locator preference order

Use the highest-priority locator that uniquely identifies the element. **This matches CLAUDE.md's "Selector preference order" exactly** (single source of truth). Upstream Playwright docs recommend `getByRole` first; this project prioritizes `[data-test="..."]` attributes because saucedemo (and most apps the framework targets) provide explicit testing affordances.

### 1. `[data-test="..."]` attribute selectors

```ts
await page.locator('[data-test="login-button"]').click();
```

Explicit testing affordance. CLAUDE.md's required default. Survives styling changes; brittle only if someone removes the attribute (which a code reviewer would catch).

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

### 4. CSS selectors (last resort)

```ts
await page.locator('.btn-primary').click();
```

Brittle. Use only when nothing above works. NEVER use XPath in this project (per CLAUDE.md "What to NEVER do").

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

## See also

- [`test-principles.md`](test-principles.md) — F.I.R.S.T. (overlap on Fast / Repeatable)
- [`bucket-classification.md`](bucket-classification.md) — categorization happens after these conventions
- https://playwright.dev/docs/best-practices — upstream source
