/**
 * Thin adapter over `migros-api-wrapper` that the rest of the app depends on instead of
 * the wrapper directly (ADR-0001): it caches the guest token, throttles requests to be a
 * good API citizen, and returns mapped domain `Product`s.
 */
import type { Locale, Product } from "@macronomics/shared";
import { MigrosAPI } from "migros-api-wrapper";
import { Language } from "migros-api-wrapper/dist/api/enums/Language.js";
import { Region } from "migros-api-wrapper/dist/api/enums/Region.js";

import { parseProduct } from "./mappers.ts";

const LANGUAGE_BY_LOCALE: Record<Locale, Language> = {
  en: Language.EN,
  de: Language.DE,
  fr: Language.FR,
  it: Language.IT,
};

export interface MigrosClientOptions {
  /** Minimum gap between upstream calls, ms (rate-limit etiquette). */
  minIntervalMs?: number;
  region?: Region;
}

export class MigrosClient {
  #token: string | undefined;
  #lastCallAt = 0;
  readonly #minIntervalMs: number;
  readonly #region: Region;

  constructor(opts: MigrosClientOptions = {}) {
    this.#minIntervalMs = opts.minIntervalMs ?? 400;
    this.#region = opts.region ?? Region.NATIONAL;
  }

  async #throttle(): Promise<void> {
    const wait = this.#minIntervalMs - (Date.now() - this.#lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.#lastCallAt = Date.now();
  }

  async #guestToken(force = false): Promise<string> {
    if (this.#token && !force) return this.#token;
    const guest = (await MigrosAPI.account.oauth2.getGuestToken()) as { token?: string };
    if (!guest?.token) throw new Error("Migros guest token unavailable");
    this.#token = guest.token;
    return this.#token;
  }

  /** Search product UIDs for a free-text query. */
  async searchProductIds(
    query: string,
    opts: { locale?: Locale; limit?: number } = {},
  ): Promise<string[]> {
    const token = await this.#guestToken();
    await this.#throttle();
    const res = await MigrosAPI.products.productSearch.searchProduct(
      { query, language: LANGUAGE_BY_LOCALE[opts.locale ?? "de"], regionId: this.#region },
      { leshopch: token },
    );
    const raw = (res as { productIds?: unknown })?.productIds;
    const ids = Array.isArray(raw) ? raw.map(String) : [];
    return opts.limit ? ids.slice(0, opts.limit) : ids;
  }

  /**
   * Fetch + map product details for the given UIDs. One upstream call per locale (not per
   * product): nutrition/price are taken from the first locale; names merge across locales.
   */
  async getProducts(uids: string[], opts: { locales?: Locale[] } = {}): Promise<Product[]> {
    if (uids.length === 0) return [];
    const locales = opts.locales?.length ? opts.locales : (["de"] as Locale[]);
    const byUid = new Map<string, Product>();

    for (const locale of locales) {
      const token = await this.#guestToken();
      await this.#throttle();
      const detail = await MigrosAPI.products.productDisplay.getProductDetails(
        { uids, language: LANGUAGE_BY_LOCALE[locale], region: this.#region },
        { leshopch: token },
      );
      for (const raw of Array.isArray(detail) ? detail : []) {
        const parsed = parseProduct(raw, locale);
        if (!parsed) continue;
        const existing = byUid.get(parsed.uid);
        if (existing) Object.assign(existing.names, parsed.names);
        else byUid.set(parsed.uid, parsed);
      }
    }
    return [...byUid.values()];
  }
}
