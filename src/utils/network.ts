// Network-failure testing capability (SW-19) — the two halves a test needs to cover
// how the UI degrades when a request does not arrive:
//
//   1. CAUSE the failure — `abortRequests` drops matching requests the way a blocked
//      CDN or a dead connection would.
//   2. OBSERVE it — `readImageStates` reports whether an <img> actually rendered.
//
// They belong together because neither is usable alone: asserting on a page without
// blocking anything passes vacuously (saucedemo's `alt` text is present whether or not
// the image loads), and blocking without a load-state read proves nothing was checked.
//
// Page Objects wrap these in named actions/queries; specs never call them directly.
import type { Locator, Page } from '@playwright/test';

/**
 * Matches every product photo saucedemo serves. Verified live on 2026-09-17: the six
 * inventory images and the single detail image are the only `/assets/*.jpg` requests a
 * page makes. The burger-menu icons and the detail page's back arrow are inline
 * `data:` URIs, so this glob leaves the page chrome intact.
 */
export const PRODUCT_IMAGE_URL_GLOB = '**/assets/*.jpg';

/**
 * Abort every request whose URL matches `urlPattern`, for the life of this page.
 * Routes are per-page and torn down with the page's context, so a test that installs
 * one never leaks into the next.
 *
 * Install it BEFORE navigating: a route only affects requests made after it is added.
 */
export async function abortRequests(page: Page, urlPattern: string): Promise<void> {
  await page.route(urlPattern, (route) => route.abort());
}

/** What an `<img>` tells us about whether it rendered. */
export interface ImageLoadState {
  /** The image's alt text — present whether or not the image loaded. */
  alt: string;
  /**
   * `HTMLImageElement.complete` — the browser has finished trying, successfully or not.
   * This is the half that makes `naturalWidth` meaningful: an image still in flight also
   * reports a width of 0, so `naturalWidth === 0` alone cannot tell "failed" from
   * "not downloaded yet", and a test asserting it would pass against a page that was
   * merely slow.
   */
  loadFinished: boolean;
  /** Intrinsic width in pixels: 0 when the image did not load, > 0 when it did. */
  naturalWidth: number;
}

/**
 * Read the load state of every image `images` resolves to, in DOM order. Takes a Locator
 * because the Page Object that owns the images passes its own — specs never see it
 * (ADR-0001 rule #4).
 */
export function readImageStates(images: Locator): Promise<ImageLoadState[]> {
  return images.evaluateAll<ImageLoadState[], HTMLImageElement>((elements) =>
    elements.map((image) => ({
      alt: image.alt,
      loadFinished: image.complete,
      naturalWidth: image.naturalWidth,
    })),
  );
}
