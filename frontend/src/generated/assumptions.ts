// GENERATED FILE — do not edit. Source of truth: backend/nmas/assumptions.py
// Regenerate with: backend/scripts/generate_frontend_assumptions.py
// Generated 2026-08-17T01:52:18.373635+00:00
//
// Every value here is an ASSUMPTION, not a measurement. The UI imports these
// so it can never disagree with what the pipeline actually computed (D-11).

export interface AssumptionMeta {
  value: number;
  unit: string;
  meaning: string;
  source: string;
  classification: 'EST' | 'ASM';
  limitation: string;
}

export const STREAMS_PER_LISTENER_MONTH = 3.5;
export const SPOTIFY_PER_STREAM = 0.004;
export const YOUTUBE_PER_VIEW = 0.004;
export const DEEZER_PER_STREAM = 0.004;
export const DEEZER_STREAMS_PER_FAN_MONTH = 2.0;
export const UNMEASURED_UPLIFT_RATE = 0.3;
export const NAIRA_PER_USD = 1500;
export const TRACKS_PER_QUARTER = 2;
export const AVG_PRODUCTION_COST_NGN = 750000;
export const AVG_DISTRIBUTION_COST_NGN = 15000;
export const AVG_PROMOTION_COST_NGN = 250000;
export const AVG_HOSTING_COST_QUARTERLY_NGN = 50000;

export const ASSUMPTIONS: Record<string, AssumptionMeta> = {
  STREAMS_PER_LISTENER_MONTH: {
    value: 3.5,
    unit: "plays per listener per month",
    meaning: "Converts Spotify monthly listeners (reach) into plays (volume).",
    source: "Industry proxy. Not derived from Nigerian data.",
    classification: "EST",
    limitation: "Held constant for every artist, quarter and year. Revenue level scales linearly with it: at 5.0 revenue would be 43% higher, at 2.0 43% lower. Cannot be replaced without track-level stream counts, which both providers deny (HTTP 401).",
  },
  SPOTIFY_PER_STREAM: {
    value: 0.004,
    unit: "USD per stream",
    meaning: "Payout per Spotify stream.",
    source: "Industry average (Ditto Music 2026, Chartlex 2026).",
    classification: "EST",
    limitation: "Flat across all 31 quarters. No Nigerian rate card obtained; actual payouts vary by territory, subscription tier and distributor.",
  },
  YOUTUBE_PER_VIEW: {
    value: 0.004,
    unit: "USD per view",
    meaning: "Payout per YouTube view.",
    source: "Industry average (Hootsuite 2025).",
    classification: "EST",
    limitation: "Flat across all quarters; real RPM varies by territory and format.",
  },
  DEEZER_PER_STREAM: {
    value: 0.004,
    unit: "USD per stream",
    meaning: "Payout per Deezer stream.",
    source: "Industry average.",
    classification: "EST",
    limitation: "Deezer is under 1% of total revenue, so sensitivity is negligible.",
  },
  DEEZER_STREAMS_PER_FAN_MONTH: {
    value: 2.0,
    unit: "plays per fan per month",
    meaning: "Converts Deezer fans into plays.",
    source: "Industry proxy.",
    classification: "EST",
    limitation: "Same structural weakness as the Spotify multiplier.",
  },
  UNMEASURED_UPLIFT_RATE: {
    value: 0.3,
    unit: "ratio of Spotify revenue",
    meaning: "Uplift for platforms never queried (Apple Music, Amazon, Boomplay, Audiomack and others).",
    source: "Assumed from Spotify's approximate market share. Verified against the delivered file, which reproduces at exactly this value.",
    classification: "ASM",
    limitation: "NOT a platform and must never be presented as one. No Boomplay, Audiomack, Apple Music or Amazon revenue is measured anywhere in it.",
  },
  NAIRA_PER_USD: {
    value: 1500,
    unit: "NGN per USD",
    meaning: "Fixed conversion for all naira figures.",
    source: "Single assumed rate.",
    classification: "ASM",
    limitation: "The real NGN/USD rate moved materially across 2019-2026. Every naira figure in the delivery is therefore a constant-rate conversion, not a market conversion, and cross-year naira comparisons are affected.",
  },
  TRACKS_PER_QUARTER: {
    value: 2,
    unit: "releases per artist per quarter",
    meaning: "Multiplier for per-track cost categories.",
    source: "Assumption.",
    classification: "ASM",
    limitation: "REPLACEABLE: actual release dates for 100,019 songs are now held in Artist_Catalogue_Summary.csv and could replace this with a counted value.",
  },
  AVG_PRODUCTION_COST_NGN: {
    value: 750000,
    unit: "NGN per track",
    meaning: "Studio production cost.",
    source: "NigerianInformer 2025 (secondary).",
    classification: "ASM",
    limitation: "No measured cost input exists anywhere in the pipeline.",
  },
  AVG_DISTRIBUTION_COST_NGN: {
    value: 15000,
    unit: "NGN per track",
    meaning: "Digital distribution cost.",
    source: "Blisshype 2026 (secondary).",
    classification: "ASM",
    limitation: "No measured cost input.",
  },
  AVG_PROMOTION_COST_NGN: {
    value: 250000,
    unit: "NGN per track",
    meaning: "Promotion and marketing cost.",
    source: "TaGetMedia 2025 (secondary).",
    classification: "ASM",
    limitation: "No measured cost input.",
  },
  AVG_HOSTING_COST_QUARTERLY_NGN: {
    value: 50000,
    unit: "NGN per artist per quarter",
    meaning: "Web hosting and CDN cost.",
    source: "Industry estimate (secondary).",
    classification: "ASM",
    limitation: "No measured cost input.",
  },
};
