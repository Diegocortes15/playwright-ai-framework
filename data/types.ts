// Shared domain types for externalized test data (data/).
// Loaders in fixtures.ts return these; specs import via the @data/* alias.

export interface Product {
  /** Exact product title as displayed on the inventory card. */
  name: string;
  /**
   * saucedemo's own product id. It is what the application writes into the `cart-contents`
   * key in localStorage, so it is what a seeded cart needs — verified live on 2026-09-18
   * against the `item-<id>-title-link` attributes. Not displayed anywhere.
   */
  id: number;
  /** Exact product description text. */
  description: string;
  /** Displayed price including the leading "$", e.g. "$29.99". */
  price: string;
}
