// GENERATED FILE — do not edit. Source of truth: backend/nmas/cohort.py
// Regenerate with: backend/scripts/generate_cohort_facts.py
// Generated 2026-08-28T14:44:37.721870+00:00
//
// A row count and an artist count are different measurements. The first
// submission's master list holds 131 rows describing 130 distinct artists:
// one artist is carried twice under two provider UUIDs. The console imports
// these so it can state each figure under its own name (GAP-033).

export interface DuplicateArtist {
  /** the frame name that is a second identity for the same person */
  alias: string;
  /** the name kept when the two are merged */
  canonical: string;
  aliasProviderId: number | null;
  canonicalProviderId: number | null;
  /** delivered revenue rows carried across BOTH identities */
  revenueRows: number;
  /** revenue delivered under the alias, i.e. counted a second time */
  duplicatedRevenueUsd: number;
}

/** Rows in the delivered artist master list. */
export const MASTER_LIST_ROWS = 131;

/** Distinct artists those rows describe, after the documented merge. */
export const DISTINCT_ARTISTS = 130;

/**
 * The artist count the SHIPPED cost model used. A historical fact about
 * delivered files: 131 x 13 variables x 8 quarters = 13,624 units. It is a row
 * count, so the delivered cost model charged one artist twice. Never
 * 'correct' this to 130 — that would misreport what was delivered.
 */
export const COST_MODEL_N = 131;

/** Rows in the console's artists.json artifact. */
export const ARTIFACT_ARTIST_ROWS = 131;

/** Distinct artists in that artifact. */
export const ARTIFACT_DISTINCT_ARTISTS = 130;

/** Delivered artist-quarter revenue rows. */
export const REVENUE_ROWS = 638;

/** Quarters the first submission delivered revenue for. */
export const REVENUE_PERIODS = 5;

export const DUPLICATE_ARTISTS: DuplicateArtist[] = [
  {
    "alias": "Flavour N'abania",
    "canonical": "Flavour",
    "aliasProviderId": 372062,
    "canonicalProviderId": 56982,
    "revenueRows": 10,
    "duplicatedRevenueUsd": 3417762.76
  }
];

/** Revenue counted twice because of the duplicate identities above. */
export const DUPLICATED_REVENUE_USD = 3417762.76;
