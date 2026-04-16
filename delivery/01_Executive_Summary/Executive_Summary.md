# EXECUTIVE SUMMARY
## Nigeria Music Analytics System (NMAS)
## National Bureau of Statistics — Final Delivery Package
### Date: 2026-04-14

---

## 1. Overview

This package contains the complete statistical delivery for Nigeria's digital music economy,
covering **131 verified Nigerian artists** across **5 reference periods**: Q1 2025, Q2 2025, Q3 2025, Q4 2025, and Q1 2026.

Data is sourced from **Chartmetric Developer API + SoundCharts API** (primary extraction layer — 26 Chartmetric endpoints covering 15 platforms, supplemented by SoundCharts for track-level metrics)
and supplemented with industry benchmarks from verified public sources.

---

## 2. Key Findings

### 2.1 Gross Streaming Revenue

| Period | Revenue (USD) | Revenue (NGN) |
|--------|---------------|---------------|
| Q1 2025 | $23,270,140.60 | ₦34,905,210,900 |
| Q2 2025 | $23,333,704.59 | ₦35,000,556,882 |
| Q3 2025 | $23,180,573.93 | ₦34,770,860,890 |
| Q4 2025 | $24,158,040.28 | ₦36,237,060,426 |
| Q1 2026 | $27,956,467.15 | ₦41,934,700,727 |

### 2.2 Gross Export Revenue

| Period | Export Revenue (USD) | Export Revenue (NGN) | Export Share |
|--------|---------------------|---------------------|-------------|
| Q1 2025 | $16,289,098.42 | ₦24,433,647,630 | 70% |
| Q2 2025 | $16,333,593.21 | ₦24,500,389,817 | 70% |
| Q3 2025 | $16,226,401.75 | ₦24,339,602,623 | 70% |
| Q4 2025 | $16,910,628.20 | ₦25,365,942,298 | 70% |
| Q1 2026 | $19,569,527.01 | ₦29,354,290,509 | 70% |

### 2.3 Employment

| Period | Total | Male | Female |
|--------|-------|------|--------|
| Q1_2025 | 1,300,000 | 806,000 | 494,000 |
| Q2_2025 | 1,326,000 | 822,120 | 503,880 |
| Q3_2025 | 1,352,520 | 838,562 | 513,958 |
| Q4_2025 | 1,379,570 | 855,333 | 524,237 |
| Q1_2026 | 1,407,162 | 872,440 | 534,722 |

### 2.4 Hosting & Production Costs

Quarterly cost for 131 artists (2 releases/quarter):
- **Q1_2025**: ₦272,480,000 ($181,653.33)
- **Q2_2025**: ₦272,480,000 ($181,653.33)
- **Q3_2025**: ₦272,480,000 ($181,653.33)
- **Q4_2025**: ₦272,480,000 ($181,653.33)
- **Q1_2026**: ₦272,480,000 ($181,653.33)

---

## 3. Data Sources

| Source | Usage | Type |
|--------|-------|------|
| Chartmetric Developer API | Artist stats (15 platforms), Where People Listen, charts | Primary |
| SoundCharts API | Track-level metrics, chart appearances (supplements denied Chartmetric endpoints) | Primary |
| Ditto Music 2026 | Spotify per-stream rate ($0.004) | Rate reference |
| Royalty Exchange 2025 | Multi-platform payout rates | Rate reference |
| IFPI Global Music Report 2024 | Market share ratios | Market structure |
| WIPO 2025 | International music trade methodology | Methodology |
| US ITA Nigeria Commercial Guide 2024 | Employment baselines (300K direct, 1M indirect) | Employment |
| UNESCO Creative Economy Report 2023 | Gender split (62/38%) | Demographics |
| Nairametrics Dec 2025 | $600M industry revenue, growth projections | Industry context |
| Turntable Charts | Nigeria Spotify stats (₦58B royalties, 6.2M daily streams) | Validation |
| NigerianInformer 2025 | Production cost benchmarks | Cost data |
| Blisshype 2026 | Distribution pricing | Cost data |
| TaGetMedia 2025 | Promotion cost benchmarks | Cost data |

---

## 4. Package Contents

| Folder | Contents |
|--------|----------|
| Datasets/ | All CSV data files (raw + processed) |
| Excel Deliveries/ | Professional Excel workbooks with charts |
| Summaries/ | This executive summary |
| Methodology/ | Detailed methodology and variable definitions |
| Reference and Proof/ | Complete URL/source reference file |
| Database Extracts/ | SQL query results from NMAS database |
| Quality Checks/ | Validation and cross-check results |

---

## 5. Limitations

1. Stream counts are estimated from monthly listeners (no track-level API access)
2. YouTube views use actual daily_views from youtube_artist endpoint where available
3. Employment figures are industry-wide, not NMAS-universe specific
4. Production costs are median estimates from industry surveys
5. Exchange rate fixed at ₦1,500/USD
6. 30% domestic / 70% export split based on Chartmetric Where People Listen data

---

*Prepared by the Nigeria Music Analytics System (NMAS) for the National Bureau of Statistics*
