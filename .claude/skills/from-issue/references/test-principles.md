# Test Principles (F.I.R.S.T.) Reference

The `/from-issue` skill consults this doc when rendering test files (Step 7 of [`workflow.md`](workflow.md)). Generated tests should comply with the F.I.R.S.T. principles for test quality. The compliant + non-compliant examples below help calibrate what "good" looks like for this framework.

F.I.R.S.T. = **F**ast, **I**solated, **R**epeatable, **S**elf-validating, **T**imely.

## Principles

### Fast

A test should run in seconds, not minutes. Target: <5 seconds per test for UI-driven scenarios; <1 second for unit-style.

- Favor API setup over UI clicks when verifying non-UI behavior (e.g., set storageState rather than clicking through login for every test)
- Avoid waiting for animations or network delays unnecessarily
- Use Playwright's auto-waiting assertions (no `waitForTimeout`)

### Isolated

Each test creates its own state. No test depends on another test's side effects.

- Use `beforeEach` not `beforeAll` to reset state per test
- Don't share mutable fixtures across tests
- Tests must pass in any order; tests must pass when run alone
- The Playwright fixture pattern (`async ({ loginPage }) => ...`) inherently gives each test a fresh page

### Repeatable

Same result every time, every environment.

- No `Math.random()` without a fixed seed
- No `new Date()` assertions tied to wall-clock time
- No flaky waits (always use auto-retrying `expect` assertions)
- Use fixed test data (from `data/` fixtures, not generated random values)

### Self-validating

Every test ends with an `expect(...)` assertion. Pass/fail is unambiguous.

- No "look at the screenshot and verify" tests
- No `console.log` as the verification mechanism
- No tests that pass when the SUT is broken (e.g., asserting an element exists without checking its content)

### Timely

Tests are written close in time to the code change they verify.

- For this framework: generated tests ship in the same PR as the Page Object scaffold (or shortly after)
- Don't accumulate untested code — file a Jira ticket when a feature lands

## Anti-pattern gallery

### Anti-Fast: UI login for every test

```ts
// BAD: every test logs in via UI (~3s each, 50 tests = 2.5 minutes wasted)
test('@standard add product', async ({ page }) => {
  await page.goto('/');
  await page.fill('[data-test=username]', 'standard_user');
  await page.fill('[data-test=password]', 'secret_sauce');
  await page.click('[data-test=login-button]');
  await page.click('[data-test=add-to-cart-backpack]');
});
```

Rewrite: use the `@standard` Playwright project's storageState (login happens once in `auth.setup.ts`, all tests start logged in):

```ts
// GOOD: project supplies the session, test starts on InventoryPage
test('@standard add product', async ({ inventoryPage }) => {
  await inventoryPage.goto();
  await inventoryPage.addProductToCart('Sauce Labs Backpack');
  expect(await inventoryPage.header.cartBadge.getCount()).toBe(1);
});
```

### Anti-Isolated: shared state via beforeAll

```ts
// BAD: cart state persists across tests, test order matters
let cart: CartPage;
test.beforeAll(async ({ browser }) => {
  cart = /* shared singleton */;
});
test('add item', async () => {
  await cart.add('X');
});
test('cart shows 1 item', async () => {
  await cart.expectCount(1); // depends on first test running first
});
```

Rewrite: each test gets its own fixture-provided page; setup happens per-test.

### Anti-Self-validating: assertion-free test

```ts
// BAD: test always passes if the page loads, even if the action is broken
test('add product', async ({ inventoryPage }) => {
  await inventoryPage.goto();
  await inventoryPage.addProductToCart('Sauce Labs Backpack');
  // No expect(). Test passes even if the cart didn't update.
});
```

Rewrite: every test has an `expect(...)` at the end.

```ts
test('add product', async ({ inventoryPage }) => {
  await inventoryPage.goto();
  await inventoryPage.addToCart('Sauce Labs Backpack');
  await expect.poll(() => inventoryPage.getCartBadgeCount()).toBe(1);
});
```

The previous version of this rewrite was itself non-compliant twice over, which is worth naming
because it sat in a reference file that skills read: it used `expect(await …)`, which
`eslint.config.js` fails outright — awaiting first takes one DOM snapshot and loses auto-waiting —
and it reached `inventoryPage.header.cartBadge` from the test, which composition rule #4 forbids
(tests know Pages and Data, never Components). The compliant form was one method away the whole
time.

### Anti-Self-validating: the assertion that could have read another element

The sibling of the one above, and harder to see: this test **has** an `expect` and still cannot
fail for the reason it claims.

```ts
// BAD: on the cart page with one product, the badge and the row quantity BOTH read "1".
// This passes whether the locator resolves to the badge or to the quantity.
test('the cart badge shows one', async ({ inventoryPage, cartPage }) => {
  await inventoryPage.goto();
  await inventoryPage.addToCart('Sauce Labs Backpack');
  await inventoryPage.openCart();
  await expect.poll(() => cartPage.getCartBadgeCount()).toBe(1);
});
```

Strict mode is satisfied — the locator matches exactly one element. What is ambiguous is the
**value**, and nothing in Playwright checks that.

Rewrite: drive the app to a state where the candidates differ, so a wrong locator goes red.

```ts
// Two products: the badge reads 2, each row reads 1. Now the assertion can only pass
// by reading the badge.
test('the cart badge shows two', async ({ inventoryPage, cartPage }) => {
  await inventoryPage.goto();
  await inventoryPage.addToCart('Sauce Labs Backpack');
  await inventoryPage.addToCart('Sauce Labs Bike Light');
  await inventoryPage.openCart();
  await expect.poll(() => cartPage.getCartBadgeCount()).toBe(2);
});
```

And the collection form of the same mistake: **a query that returns a collection is verified
against more than one item, or reported as unverified.** One row is the state in which a query
that reads only the first row looks perfectly correct.

`playwright-conventions.md` carries the full obligation this comes from, including why changing
the expected value to watch it go red does not substitute for it.

## When in doubt

Prefer **Isolated** and **Self-validating** above the others. Fast and Repeatable matter at scale; Timely is about workflow not code. Isolated + Self-validating directly determine whether a test is trustworthy.

## See also

- [`playwright-conventions.md`](playwright-conventions.md) — overlap on "no waitForTimeout" (Fast + Repeatable)
- [`workflow.md`](workflow.md) Step 7 — where these principles are consulted during render
