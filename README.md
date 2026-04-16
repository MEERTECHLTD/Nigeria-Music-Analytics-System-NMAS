# Nigeria Music Analytics System (NMAS)

**AI-Powered Analytics Platform for Nigeria's Music Industry**
Built for the National Bureau of Statistics (NBS) to quantify the economic contribution of Nigerian music through Chartmetric data.

[![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/frontend-React%2018-61DAFB)](https://react.dev/)
[![Chartmetric](https://img.shields.io/badge/data-Chartmetric%20API-blue)](#data-source)
[![Python 3.13](https://img.shields.io/badge/python-3.13-yellow)](https://python.org)

---

## Overview

NMAS is a Chartmetric-first data platform that tracks **131 Nigerian artists** across **15+ streaming and social media platforms**, producing quarterly economic datasets for the National Bureau of Statistics.

The system collects daily metric observations via the Chartmetric API, computes gross streaming revenue, digital export revenue, employment estimates, and hosting/production costs, then packages everything into standardized Excel deliverables for government submission.

---

## Project Structure

```
NMAS/
├── backend/                   # FastAPI application
│   ├── nmas/                  # Core package
│   │   ├── application.py     # FastAPI routes & endpoints
│   │   ├── config.py          # Environment & settings
│   │   ├── database.py        # SQLite/PostgreSQL via SQLModel
│   │   ├── models.py          # ORM models (Artist, Metrics, Jobs, etc.)
│   │   ├── metrics.py         # Chartmetric metric definitions
│   │   ├── schemas.py         # API request/response schemas
│   │   └── services/          # Business logic
│   │       ├── chartmetric.py # Chartmetric API client
│   │       ├── entities.py    # Artist management
│   │       ├── exports.py     # Data export generation
│   │       ├── jobs.py        # Extraction job orchestration
│   │       └── quarterly.py   # Quarterly aggregation
│   ├── scripts/               # NBS pipeline & delivery scripts
│   │   ├── nbs_extract_full.py          # Full 26-endpoint extraction
│   │   ├── nbs_extract_new_artists.py   # Incremental artist extraction
│   │   ├── nbs_deliverables.py          # 4 NBS CSV deliverables
│   │   ├── nbs_final_delivery.py        # Complete delivery package generator
│   │   ├── build_digital_export_excel.py # Digital export workbook
│   │   └── build_sample.py              # Sample preview workbook builder
│   ├── tests/                 # Test suite
│   ├── alembic/               # Database migrations
│   ├── data/                  # Runtime data (gitignored)
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── Procfile
│
├── frontend/                  # React + TypeScript + Vite
│   └── src/
│       ├── App.tsx
│       ├── features/nmas/
│       │   ├── NbsConsole.tsx     # Job management & monitoring
│       │   └── NbsDashboard.tsx   # Data visualization dashboard
│       └── lib/api.ts             # API client
│
├── delivery/                  # NBS Submission Package (13 sections)
│   ├── 01_Executive_Summary/
│   ├── 02_Methodology/
│   ├── 03_Excel_Deliveries/   # 7 formatted workbooks
│   ├── 04_Datasets/           # 9 CSV datasets
│   ├── 05_Database_Extracts/
│   ├── 06_Sample_Workbooks/   # 8 preview workbooks
│   ├── 07_Quality_Checks/
│   ├── 08_References/
│   ├── 09_AI_Disclosure/
│   ├── 10_Presentation/       # PPTX + video + narrative
│   ├── 11_Raw_Extractions/    # Full Chartmetric raw data
│   ├── 12_System_Exports/     # Timestamped export runs
│   └── 13_Database/           # SQLite DB (shared separately)
│
├── docs/
│   ├── architecture/          # System design & audit docs
│   └── proposals/             # NBS brief, methodology, technical response
│
└── deployment/                # Docker & cloud configs
```

---

## Data Source

All music industry data is sourced from the **Chartmetric API**, covering:

- **Spotify** -- listeners, followers, popularity
- **YouTube** -- channel subscribers, video views, daily views
- **Apple Music** -- playlist adds, chart positions
- **Instagram** -- followers, engagement
- **TikTok** -- followers, video views
- **Twitter/X** -- followers
- **Deezer, Shazam, Audiomack, Boomplay** and more

**26 Chartmetric endpoints** are used per artist to capture comprehensive cross-platform metrics.

---

## NBS Deliverables

The system produces 4 core quarterly datasets for NBS:

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | **Gross Streaming Revenue** | Platform-by-platform revenue per artist per quarter |
| 2 | **Gross Export Revenue** | International digital music earnings in USD and NGN |
| 3 | **Employment (Male/Female)** | Music industry employment estimates by gender |
| 4 | **Hosting & Production Costs** | Infrastructure and production cost breakdowns |

**Coverage**: Q1 2025, Q2 2025, Q3 2025, Q4 2025, Q1 2026

---

## Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| Python 3.13 | Core language |
| FastAPI | REST API framework |
| SQLModel + SQLAlchemy | ORM & database |
| SQLite / PostgreSQL | Data storage |
| Alembic | Database migrations |
| Chartmetric API | Primary data source |
| openpyxl | Excel workbook generation |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool |
| Tailwind CSS | Styling |
| Recharts | Data visualization |
| TanStack Query | Data fetching |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Chartmetric API key

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Add your CHARTMETRIC_REFRESH_TOKEN to .env

# Run the API server
python run_nmas.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Frontend**: http://localhost:5173

---

## NBS Pipeline

Run the extraction and delivery scripts in order:

```bash
cd backend

# 1. Extract data from Chartmetric (all 131 artists)
python scripts/nbs_extract_full.py

# 2. Generate the 4 NBS CSV deliverables
python scripts/nbs_deliverables.py

# 3. Build the complete delivery package (Excel, methodology, summaries)
python scripts/nbs_final_delivery.py

# 4. Build sample preview workbooks
python scripts/build_sample.py
```

Output lands in the `delivery/` folder, ready for submission.

---

## Economic Model

| Metric | Formula | Source |
|--------|---------|--------|
| Streaming Revenue | streams x per-stream rate ($0.003-$0.005) | Industry averages (Ditto, Chartlex 2026) |
| Export Revenue | international streams x $0.004 | IFPI Global Music Report |
| Employment | revenue / average salary ($15,000) | NBS creative sector data |
| GDP Multiplier | revenue x 1.5 | World Bank Creative Economy |

Exchange rate: 1 USD = 1,500 NGN

---

## License

MIT License -- see [LICENSE](LICENSE)

---

## Contact

**MeerTech LTD**
Prepared for the National Bureau of Statistics (NBS), Nigeria

*Last Updated: April 2026*
