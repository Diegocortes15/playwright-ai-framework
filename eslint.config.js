import tseslint from 'typescript-eslint';
import playwrightPlugin from 'eslint-plugin-playwright';

export default [
  {
    ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'auth/'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: { playwright: playwrightPlugin },
    rules: {
      ...playwrightPlugin.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-conditional-in-test': 'warn',
      'playwright/expect-expect': 'error',
      'playwright/no-skipped-test': 'warn',
      'playwright/prefer-web-first-assertions': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // XPath is the one selector rule CLAUDE.md states as absolute ("Never use XPath"),
      // and it is the only one worth failing a build over: it encodes document structure,
      // so it breaks on layout changes that touch nothing else.
      //
      // The rest of the preference order ([data-test] -> getByRole -> text -> CSS) stays
      // AUTHORING guidance, not a build gate. A unique, stable locator that works is fine
      // regardless of which level it came from; a rule that fails on `#stable-id` only
      // teaches people to silence it, and eslint-disable sprawl is worse than no rule.
      // Fragility is proven by a test failing, not by an attribute's name.
      // ADR-0015: routing tags live in the { tag } option, never in the title string.
      // Playwright's project grep matches the title too, so a tag in the title still routes
      // — which is why this drifted undetected: it fails silently, in style not behaviour.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='test'] > Literal:first-child[value=/@/]",
          message:
            'ADR-0015: put routing tags in the { tag } option, not the test title. Titles are prose.',
        },
        {
          selector:
            "CallExpression[callee.object.name='test'][callee.property.name='describe'] > Literal:first-child[value=/@/]",
          message: 'ADR-0015: put routing tags in the { tag } option, not the describe title.',
        },
        {
          // ADR-0023: JSON is loaded through the typed fs loader in data/fixtures.ts, not
          // ESM import attributes. ADR-0005 chose attributes, they were implemented, and they
          // were removed months later as brittle through Playwright's ESM loader — while the
          // ADR sat 'Accepted' the whole time because nothing checked. This is that check.
          selector: 'ImportDeclaration[attributes.length>0]',
          message:
            "Import attributes are not used in this project (ADR-0023, superseding ADR-0005): they proved brittle through Playwright's ESM loader. Load JSON via the typed loader in data/fixtures.ts.",
        },
        {
          selector:
            "CallExpression[callee.property.name='locator'][arguments.0.value=/^(\\/\\/|\\(|xpath=)/]",
          message:
            'XPath is never allowed (CLAUDE.md). Use [data-test="..."], then getByRole, then text, then CSS.',
        },
      ],
    },
  },
  {
    // ADR-0001 rule #3: Pages never import other Pages. Fluent navigation was explicitly
    // rejected; a Page returning a Page is how it creeps back in.
    files: ['src/pages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pages/*', './*Page', '../*Page'],
              message:
                'ADR-0001 rule #3: Pages never import other Pages. Tests navigate explicitly via injected fixtures.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "TSTypeReference[typeName.name='Promise'] > TSTypeParameterInstantiation > TSTypeReference[typeName.name='Locator']",
          message:
            'ADR-0001 rule #8: queries return data, never a Locator. Return the value the test needs.',
        },
      ],
    },
  },
  {
    // ADR-0001 rule #4: tests know about Pages and Data only — never raw Locators.
    // ADR-0003: specs read data through @data/fixtures, never JSON off disk.
    files: ['tests/**/*.spec.ts'],
    rules: {
      // Scoped to specs on purpose: a unit test under src/ has no DOM to re-read, so polling
      // there would be noise.
      'no-restricted-syntax': [
        'error',
        {
          // `expect(await page.getX()).toBe(…)` takes ONE snapshot and compares it once.
          // Playwright's auto-waiting is gone — the property that lets this repo ban
          // waitForTimeout without consequence — and it has bitten us: the comment in
          // InventoryPage.goto() documents a test that failed one run in five on WebKit and
          // passed alone every time.
          //
          // `await expect.poll(() => page.getX()).toBe(…)` retries, and keeps ADR-0001 rule #8
          // intact: the query still returns data, never a Locator.
          //
          // playwright/prefer-web-first-assertions does NOT catch this. It only recognises
          // `expect(await locator.textContent())`; a Page Object method looks like any other
          // call to it, so 49 of these passed the gate clean.
          selector: "CallExpression[callee.name='expect'] > AwaitExpression:first-child",
          message:
            'Use `await expect.poll(() => …)` instead of `expect(await …)`: awaiting first takes ' +
            'a single DOM snapshot and loses auto-waiting. If the assertion is MEANT to fail at ' +
            'once (a test.fail() case), disable this rule on the line and say why.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:fs',
              message:
                'ADR-0003: specs never read data off disk. Add a typed loader to data/fixtures.ts and import from @data/fixtures.',
            },
          ],
          patterns: [
            {
              group: ['@components/*'],
              message:
                'ADR-0001 rule #4: tests use Pages and Data only, never Components directly.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.setup.ts'],
    rules: {
      'playwright/expect-expect': 'off',
    },
  },
];
