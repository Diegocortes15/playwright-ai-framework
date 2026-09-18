import { basename, dirname } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { LoginPage } from '@pages/LoginPage';
import { InventoryPage } from '@pages/InventoryPage';
import { ProductDetailPage } from '@pages/ProductDetailPage';
import { CartPage } from '@pages/CartPage';
import { CheckoutInfoPage } from '@pages/checkout/CheckoutInfoPage';
import { CheckoutOverviewPage } from '@pages/checkout/CheckoutOverviewPage';
import { CheckoutCompletePage } from '@pages/checkout/CheckoutCompletePage';
import { reportAnnotations } from '@utils/report-annotations';
import { products } from '@data/fixtures';
import { describeEvent, groupOf, iconFor, type ObservationGroup } from '../observations/digest';
import { isThirdParty, signatureFor } from '../observations/signature';
import { ignoredSignatures } from '../observations/triage';
import { ATTACHMENT_NAME, MAX_EVENTS_PER_TEST, type ObservationEvent } from '../observations/types';

/**
 * Puts products in the cart WITHOUT clicking through the inventory.
 *
 * Reaching a state through the UI is right when reaching it is what the test is about, and
 * wrong when it is setup. Six checkout tests were paying a navigation, three add-to-cart
 * clicks, a cart open, a checkout click and a three-field form before touching the screen
 * they actually assert on — which means the day the "Add to cart" button changes, six tests
 * about the overview page go red for something they are not testing.
 *
 * Call it BEFORE the first navigation: it installs an init script, and an init script only
 * affects pages loaded after it is added.
 */
export type SeedCart = (productNames: readonly string[]) => Promise<void>;

type Pages = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  productDetailPage: ProductDetailPage;
  cartPage: CartPage;
  checkoutInfoPage: CheckoutInfoPage;
  checkoutOverviewPage: CheckoutOverviewPage;
  checkoutCompletePage: CheckoutCompletePage;
};

export const test = base.extend<
  Pages & { seedCart: SeedCart; _reportAnnotation: void; _observations: ObservationEvent[] }
>({
  // saucedemo keeps the cart in localStorage under `cart-contents`, as a JSON array of its
  // own product ids — verified live on 2026-09-18. Writing that key is exactly what the
  // add-to-cart button does, so the application cannot tell the difference.
  //
  // This is the same technique the suite already trusts for authentication: 58 tests start
  // logged in because `storageState` seeds the session rather than replaying the login form,
  // and the 26 that TEST logging in still do it through the UI. Same rule here — a test
  // about adding to the cart clicks; a test about the screen after it seeds.
  seedCart: async ({ context }, use) => {
    await use(async (productNames) => {
      const ids = productNames.map((name) => {
        const product = products.find((candidate) => candidate.name === name);
        if (!product) throw new Error(`seedCart: no product named "${name}" in the catalog`);
        return product.id;
      });
      await context.addInitScript((contents: string) => {
        window.localStorage.setItem('cart-contents', contents);
      }, JSON.stringify(ids));
    });
  },

  // Auto fixture — annotate each test in the Playwright report with its Jira
  // ticket link(s) and the acceptance criterion it covers, derived from
  // `.tcms/records/<feature>.json` (feature = the spec's parent dir). No per-test
  // boilerplate; correct for augmented multi-ticket feature files.
  _reportAnnotation: [
    async ({}, use, testInfo) => {
      const feature = basename(dirname(testInfo.file));
      // `expectedStatus` is 'failed' for a test declared with test.fail() — the deterministic
      // signal, rather than parsing the spec for the marker.
      testInfo.annotations.push(
        ...reportAnnotations(feature, testInfo.title, {
          expectedToFail: testInfo.expectedStatus === 'failed',
        }),
      );
      await use();
    },
    { auto: true },
  ],

  // Auto fixture — record what the app did that nobody asserted on: console errors,
  // uncaught page errors, 4xx/5xx responses, and dialogs (ADR-0021). Detection is
  // deterministic and never judges; the ObservationsReporter deduplicates and writes.
  // Every handler swallows its own errors: observations must never fail a test.
  _observations: [
    async ({ page, baseURL }, use, testInfo) => {
      const events: ObservationEvent[] = [];
      const record = (event: ObservationEvent): void => {
        if (events.length < MAX_EVENTS_PER_TEST) events.push(event);
      };

      page.on('console', (message) => {
        try {
          if (message.type() !== 'error') return;
          // The browser echoes every failed resource load to the console. The
          // `response` handler already records those with method, status and URL,
          // so keeping both would double-report one event.
          if (message.text().startsWith('Failed to load resource')) return;
          record({ kind: 'console-error', message: message.text(), url: message.location().url });
        } catch {
          /* observations never break a test */
        }
      });

      page.on('pageerror', (error) => {
        try {
          record({ kind: 'page-error', message: error.message, url: page.url() });
        } catch {
          /* observations never break a test */
        }
      });

      page.on('response', (response) => {
        try {
          const httpStatus = response.status();
          if (httpStatus < 400) return;
          record({
            kind: 'failed-request',
            // HTTP/2 responses carry no status text, so fall back to the code alone.
            message: [httpStatus, response.statusText()].filter(Boolean).join(' ').trim(),
            url: response.url(),
            method: response.request().method(),
            httpStatus,
          });
        } catch {
          /* observations never break a test */
        }
      });

      // Registering ANY dialog listener disables Playwright's automatic dismissal,
      // so this handler must dismiss the dialog itself to preserve default behavior.
      // The catch covers a test that registers its own handler and gets there first.
      page.on('dialog', (dialog) => {
        try {
          record({
            kind: 'dialog',
            message: dialog.message(),
            dialogType: dialog.type(),
            url: page.url(),
          });
        } catch {
          /* observations never break a test */
        }
        void dialog.dismiss().catch(() => {});
      });

      // Auto fixtures still provide a value, so a test that names `_observations` can read
      // what the page has produced so far. Nothing else needs it — but without it the
      // detectors below are unassertable, and three of the four had never fired.
      await use(events);

      if (events.length > 0) {
        // Structured record for ObservationsReporter — not meant to be read by a person.
        await testInfo.attach(ATTACHMENT_NAME, {
          body: JSON.stringify(events),
          contentType: 'application/json',
        });

        const ignored = ignoredSignatures();
        const seen = new Map<string, ObservationEvent>();
        for (const event of events) {
          const key = `${event.kind}:${event.httpStatus ?? ''}:${event.url ?? event.message}`;
          if (!seen.has(key) && !ignored.has(signatureFor(event))) seen.set(key, event);
        }

        // Grouped the way a reader would look for them — the devtools tabs they map to.
        const groups = new Map<ObservationGroup, string[]>();
        for (const event of seen.values()) {
          const group = groupOf(event.kind);
          const icon = iconFor(event.kind, event.httpStatus);
          const line = `${icon} ${describeEvent(event.kind, event, isThirdParty(event.url, baseURL ?? ''))}`;
          groups.set(group, [...(groups.get(group) ?? []), line]);
        }

        for (const [group, lines] of groups) {
          // text/plain renders inline in the HTML report, so it reads without downloading.
          await testInfo.attach(`observations — ${group}`, {
            body: lines.map((line) => `• ${line}`).join('\n\n'),
            contentType: 'text/plain',
          });

          // One chip per group under the test title. The annotation TYPE is shown as its
          // label, so Network and Console separate visually instead of blurring together.
          testInfo.annotations.push({
            type: `observations: ${group.toLowerCase()}`,
            description:
              lines.length === 1
                ? lines[0].slice(0, 300)
                : `${lines.length} — see the "observations — ${group}" attachment`,
          });
        }
      }
    },
    { auto: true },
  ],

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page));
  },
  productDetailPage: async ({ page }, use) => {
    await use(new ProductDetailPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutInfoPage: async ({ page }, use) => {
    await use(new CheckoutInfoPage(page));
  },
  checkoutOverviewPage: async ({ page }, use) => {
    await use(new CheckoutOverviewPage(page));
  },
  checkoutCompletePage: async ({ page }, use) => {
    await use(new CheckoutCompletePage(page));
  },
});
export { expect };
