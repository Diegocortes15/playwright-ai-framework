# scaffold-page-object Workflow

The 12-step procedural workflow Claude follows when the `scaffold-page-object` skill is invoked.

## Inputs

- **URL** (required) — e.g., `https://www.saucedemo.com/cart.html`
- **Page name** (required) — e.g., `CartPage` (PascalCase, no `.ts` suffix)
- **Output path** (optional) — defaults per step 10; `scratch/<Name>.ts` for verification, `src/pages/<Name>.ts` for real work
- **storageState path** (optional) — e.g., `auth/standard.json`; no auth assumed if omitted

## Steps

### 1. Validate inputs

Check that URL and page name are present. If either is missing, ask the user; don't guess.

### 2. Verify storageState file exists (if provided)

If the user gave a storageState path, use `Read` to confirm it exists. If missing, abort with:

> _"storageState file not found at `<path>`. Run `npm test` (or `npx playwright test --project=setup`) to generate it."_

### 3. Refuse to overwrite

If the resolved output path already exists (use `Glob` or `Read` to check), abort with:

> _"`<path>` exists. `rm` it and re-run, or pick a different output path."_

No merging, no overwriting. Predictable safety.

### 4. Hybrid auto-discover of framework components

Run the check — do NOT eyeball the two lists:

```bash
.claude/skills/scaffold-page-object/scripts/check-component-signatures.sh
```

| Exit | Meaning |
| ---- | ------- |
| 0 | Reconciled. Stdout lists each component as `detect: <Name>` or `nested: <Name>` — the `detect:` set is what Step 7 looks for |
| 1 | Mismatch. The message names the file or the row to fix; abort and report it verbatim |
| 66 | `references/component-detection.md` not found — restore the skill |
| 67 | `src/components/` not found — wrong directory, or the framework is not bootstrapped |

The two sources it reconciles are the **canonical list** (`src/components/*.ts`, by filename) and
the **signature table** in `references/component-detection.md`.

**It reconciles in BOTH directions** (per ADR-0025). This step runs before the page is opened, so a
failure here aborts every run regardless of the target URL. That is deliberate: a stale table
generates a Page Object that does not compile.

1. **File with no row** → abort:

   > _"Found `src/components/<NewName>.ts` but no detection signature in `references/component-detection.md`. Add a signature row before re-running."_

2. **Row with no file** → abort:

   > _"`references/component-detection.md` lists `<Name>` but `src/components/<Name>.ts` does not exist. Delete the row (the component was removed) before re-running."_

A row whose Root signature reads **Nested** satisfies (1) without being added to the detection
set — the script reports it as `nested:` — because it is composed by a parent component and never
looked for on its own. Compose the parent; never compose a nested component directly from a
Page Object.

This catches both failure modes that actually happened: `BurgerMenu.ts` landed 2026-06-03 with no
row and silently aborted every run for three months, while the `ProductCard` and `SortDropdown`
rows outlived their deleted files since 2026-05-24. Neither was noticed, because the skill was
never executed in between.

### 5. Open the page via playwright-cli

```bash
# Unauthenticated (no storageState):
npx playwright-cli open <url>

# Authenticated (storageState provided):
npx playwright-cli open
npx playwright-cli state-load <path>
npx playwright-cli goto <url>
```

**`state-load` does not work on saucedemo, so logging in by hand is the normal path here, not a fallback.** `state-load` calls `setStorageState` on an existing context, which restores cookies and localStorage but **not sessionStorage** — that is per-tab and cannot be reapplied after page creation. saucedemo keeps `session-username` in sessionStorage, so `state-load` followed by `goto` lands you back on the login page. Expect this; don't treat it as a failure to debug.

Log in with this sequence. **`snapshot` is not optional** — every interactive command takes a element `ref` from a snapshot (`e11`), never a selector or free text, so skipping it leaves you with nothing to pass:

```bash
npx playwright-cli open
npx playwright-cli goto https://www.saucedemo.com
npx playwright-cli snapshot            # ← yields the refs used below
npx playwright-cli fill e11 standard_user   # textbox "Username" [ref=e11]
npx playwright-cli fill e13 secret_sauce    # textbox "Password" [ref=e13]
npx playwright-cli click e15                # button "Login"    [ref=e15]
npx playwright-cli goto 'https://www.saucedemo.com/inventory-item.html?id=4'
```

Two things that will bite you:

- **Read the refs out of your own snapshot; never copy the ones above.** They are stable for saucedemo's login form today and are shown so the shape is recognizable, but a ref identifies a node in one snapshot of one page.
- **Quote any URL containing `?`.** zsh treats it as a glob and the command dies with `no matches found` before `playwright-cli` ever runs — which reads like a CLI error and is not one.

### 6. Snapshot the page

```bash
npx playwright-cli snapshot
```

Returns a structured tree with element refs.

### 7. Detect framework components

Walk the snapshot for each component signature loaded in step 4. For each match, mark the component for composition (not re-generation of its constituent locators).

### 8. Generate locators for non-component elements

For each remaining interactive element (excluding any covered by detected components):

```bash
npx playwright-cli generate-locator <ref>
```

Pick a semantic field name from the element's accessible name. **Naming rule:**

- Start from the accessible name
- Normalize to camelCase
- Strip filler words: `to`, `the`, `and`, `a`, `of`
- Favor brevity when meaning is preserved
- Examples:
  - `"Continue to Checkout"` → `clickContinue` (not `clickContinueToCheckout`)
  - `"First Name"` → `firstNameInput`
  - `"Add to cart"` → `clickAddToCart` (keeping "to cart" preserves meaning — without it, ambiguous)

Edge cases (e.g., two buttons with the same name on one page) get caught in C.2 review.

**Check the live DOM before settling for a lower level.** The preference order is
`[data-test]` → `getByRole` → text → CSS; only XPath fails lint, so everything else is on
your judgment. Before writing a CSS or id locator, **verify the higher level is actually
absent** — `playwright-cli eval "el => el.getAttribute('data-test')" <ref>` — rather than
assuming from the snapshot. Four selectors in `BurgerMenu.ts` sat on ids for months while
the elements had `data-test` attributes all along; nobody checked. A unique, stable id is a
fine locator; guessing that the attribute was missing is what went wrong. Note what you
settled for, and why, for Step 12 (ADR-0022), at the moment you make the call.

**Then count each locator on the OTHER pages a test can arrive from.** This is the check that
is easy to skip and expensive to miss, because a selector can be unique on the page you are
scaffolding and ambiguous on the page before it — and Playwright treats those two cases in
opposite ways. Zero matches auto-waits; **many matches throw a strict-mode violation
immediately**, which ends an `expect.poll` rather than being retried, so the test fails
intermittently with an error that names strict mode instead of the feature.

```bash
# On the page you are scaffolding, and then on each page that navigates INTO it:
npx playwright-cli eval "() => document.querySelectorAll('[data-test=\"inventory-item-name\"]').length"
```

`ProductDetailPage` shipped without this check. Its name, description, price and image locators
were bound straight to `page`, and saucedemo uses the same `data-test` values for all six cards
of the inventory grid — 6 on the grid, 1 on the detail page. It failed 3 times in 8 full-suite
runs. Note what did not help: those selectors were already level 1, and `getByRole('heading')`
returned 0 on that page, so the level above was worse.

**Where the count is above one anywhere, scope rather than downgrade.** Bind a container that
exists only on the destination page and hang the `data-test` children off it. Prefer a container
with its own `data-test` — `CartPage` does this with `[data-test="cart-list"]`, which is exactly
why the cart never had the bug — and take a CSS class when the page has none, saying which level
you took and why in a comment. **A scoping container is not a selector downgrade**, so it does not
belong in Step 12's downgrade list; it belongs in a comment at the call site. And never reach for
`.first()` to make a strict-mode violation go away: that trades a correct loud error for a test
that reads an arbitrary element.

### 9. Render the Page Object

Following `references/page-object-template.md`:

- Top-of-file comment block (mandatory; YYYY-MM-DD = today's date in the user's local time)
- Imports (`test` value + `type Locator`, `type Page` from `@playwright/test`; detected component classes from `@components/*`). The `test` value import is required so composed action methods can wrap their body in `test.step`.
- `readonly` fields — composed components first, page-direct locators second (ADR-0001 rule #6)
- Constructor — wire components first, then page-direct locators in declaration order
- Action methods — one per interactive element type:
  - Button → `click<Name>(): Promise<void>`
  - Input → `fill<Name>(value: string): Promise<void>`
  - Select → `select<Name>(value: string): Promise<void>`
- **`test.step` placement** (per `page-object-template.md`): single-element primitives (`click<Name>`, `fill<Name>`) are NOT wrapped. A composed/intent-level method that a test calls directly (`goto`, or a domain action like `loginAs`/`fillContactInfo` added when an obvious multi-step flow exists) wraps its body in exactly one `test.step('<action name>', ...)`. Generated specs never carry steps — the named report steps come from these methods.

### 10. Write the file

Default output path:

- If the user gave one explicitly, use it
- Else if URL contains `/checkout-step` or `/checkout-complete`, write to `src/pages/checkout/<Name>.ts`
- Else write to `src/pages/<Name>.ts`

Use the `Write` tool. (Step 3 already confirmed the path didn't exist.)

### 11. Isolated typecheck of the generated file

Run the check — do NOT hand-roll a tsconfig, and never `npx tsc`:

```bash
.claude/skills/scaffold-page-object/scripts/typecheck-generated.sh src/pages/<Name>.ts
```

| Exit | Meaning |
| ---- | ------- |
| 0 | Clean → record the pass for Step 12 |
| 64 | Bad usage — you passed no files |
| 66 | No `tsconfig.json` at the repo root |
| 69 | TypeScript not installed → tell the user to run `npm install`, and stop |
| other | Type errors, printed verbatim → leave the file in place and capture them for Step 12 |

The script writes a throwaway tsconfig that extends the project's own (so `@components/*`
resolves), typechecks through it, and always cleans up — including on failure or interrupt. It
resolves `tsc` from `node_modules/.bin` and refuses to run otherwise.

**Why not `npx tsc`,** which this step prescribed until 2026-09-07: with `node_modules` absent
or stale, `npx tsc` silently fetches `tsc@2.0.4` from the registry — a deprecated squatter
package that is not the TypeScript compiler — and hands back a PASS the run never earned.
`/from-issue` was hardened against this when its own script was extracted; this skill was not,
and kept the hazard for months. Exit 69 is what replaces it: an environment problem, reported
and stopped, never a silent success.

The project-wide `npm run typecheck` is unaffected — `scratch/` stays excluded, so half-baked
files never break the global build.

### 11.5. Register the page in `src/fixtures/test.ts`

Edit `src/fixtures/test.ts` to register the newly-scaffolded Page Object as a fixture so tests can destructure it from the `test()` args (e.g., `async ({ loginPage }) => ...`).

1. Read `src/fixtures/test.ts`.
2. Verify the page isn't already registered (look for `<pageName>: <PageName>` in the `Pages` type or the `test.extend<Pages>({...})` map).
3. If unregistered, apply three edits to the file:
   - Add `import { <PageName> } from '@pages/<PageName>';` to the imports block at the top
   - Add `<pageName>: <PageName>;` to the `Pages` type
   - Add to the `test.extend<Pages>({...})` block:
     ```ts
     <pageName>: async ({ page }, use) => {
       await use(new <PageName>(page));
     },
     ```
4. If already registered: skip the edit and report it in Step 12.

Naming: `<pageName>` is the camelCase form of `<PageName>` (e.g., `LoginPage` → `loginPage`, `CheckoutInfoPage` → `checkoutInfoPage`).

**If `src/fixtures/test.ts` doesn't exist**, abort with: _"`src/fixtures/test.ts` not found. The framework's fixture file is required. Restore from git or run framework bootstrap first."_

**This step replaces the previous implicit behavior** where `/from-issue` modified `src/fixtures/test.ts` by reading a code comment in that file. Per ADR-0009, skill contracts must live in `references/`, not in code comments — this step is now the contract.

### 12. Report what landed

Report to the user:

- Output file path
- List of composed components (if any)
- List of generated page-direct locators (field name → selector)
- List of generated action methods
- Isolated-typecheck result (PASS or list of errors verbatim)
- Confirmation that the top-of-file comment block landed (first 4 lines of the file match the template)
- Obstacles encountered (see below) — always, even if none

**Obstacles encountered** — ALWAYS render this section, even when there is nothing to
report (then it is one line: `Obstacles encountered: none.`). It is a deliberate exception
to the "omit empty sections" rule (ADR-0022): a section that can be dropped is one the
agent learns to drop, and the empty state only means something because it cannot be.

It carries exactly three things, and nothing that already has a channel elsewhere:

1. **Selector downgrades.** The preference order is `[data-test]` → `getByRole` → text →
   CSS, and only XPath fails lint. So when you write a locator below the highest level
   *available on the page*, nothing catches it but this line. Name the element, the level
   available, the level you used, and why. A stable unique id is a perfectly good locator —
   the point is not to apologise for it, it is that the reviewer learns you looked.
2. **Tooling friction** — a command or MCP call that failed and was retried or worked
   around. Say what failed and what you did instead.
3. **Reference gaps** — where this skill's own `references/` did not cover the case and
   you had to improvise. **Name the file that should have covered it.** This is the only
   signal that says what is stopping the skill from working as it should.

Do NOT restate what is already reported: ticket inferences belong in the assumptions
block, failed runs in the fix log, and collisions / harness growth / skipped ACs in their
own notes.
