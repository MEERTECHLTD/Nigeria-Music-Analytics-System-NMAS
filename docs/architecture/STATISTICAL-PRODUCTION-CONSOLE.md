# NMAS Statistical Production Console

An operations interface for the Nigeria Music Analytics Study: every ingestion
call, transformation, estimation assumption, source attribution and computed
figure is visible and inspectable.

It is a **presentation layer**. No backend logic was changed to build it: no new
computation, no altered formula, no schema migration. The one addition is a
read-only projection script that reshapes artifacts the pipeline already
produces.

---

## The rule the interface enforces

**Nothing here displays a number the backend did not compute.**

Where an artifact cannot fill a field, the interface renders `NOT COLLECTED`
with a reason and a gap-register reference. It never renders `0`, a dash, or a
blank cell in place of an absent measurement — those read as data.

Five epistemic states carry all the colour in the interface. Colour is used for
nothing else:

| State | Meaning |
|---|---|
| **Observed** | A value a source returned. |
| **Estimated** | A conversion coefficient applied to an observed input. |
| **Assumed** | A constant imposed from outside the data. |
| **Allocated** | A total apportioned across units rather than measured per unit. |
| **Unavailable** | Never collected, or collected and empty. |

The boundary between these is decided in exactly one place —
`src/console/registry/epistemic.ts` — so it cannot drift between panels.

---

## Absence is derived, never hardcoded

The Chartmetric and SoundCharts endpoints are being activated. A panel that
asserted "radio airplay does not exist" would keep asserting it after airplay
data arrived.

So no panel states an absence directly. Each asks
`src/console/data/capabilities.ts`, which answers from the records actually
loaded. A capability flips to present the moment evidence backs it — no code
change, no redeploy. Twenty-two capabilities are tracked, including listener
geography, radio airplay, track streams, cross-market charts, residency
classification, raw payloads, audit rows and quota tracking.

The same applies to the data itself. Quarters, the archive floor, the variable
list and the roster size are all **derived** by the generator from the artifacts,
never declared. A newly ingested quarter appears on the next generation; a
deepened archive extends the coverage matrix frame automatically.

---

## Transport

Two transports, resolved by a single `/health` probe at startup:

| Mode | Source | Behaviour |
|---|---|---|
| **live** | FastAPI backend | Polled every 60s. Adds raw payloads, audit logs, per-run failures, provider health. |
| **static** | `/api/v1/console/*.json` | The generated projection. Always available. |

Both surfaces fall back to the projection independently, so a partially
activated backend degrades rather than blanking the interface.

One subtlety worth knowing: the live NBS routes read a CSV directory derived
from `EXPORT_ROOT`. Under the production environment that resolves to a path
that is never populated, so those endpoints answer `200` with an empty list. An
empty `200` is indistinguishable from "no data yet", so **an empty live response
falls back to the projection** rather than blanking a dashboard that has real
data.

---

## Surfaces

`#/dashboard` — **NBS Delivery Dashboard**, the results view. Auto-fetches,
defaults to the newest quarter present in the data rather than a hardcoded one.

`#/<panel>` — **Statistical Production Console**, 18 panels. Each declares in the
navigation what proportion of its specification real artifacts can support, so a
reader knows before opening it.

The signature panel is the **Quarter Coverage Matrix**. It renders the full
24-quarter study frame and shows the quarters that precede the earliest
observation, drawn to scale rather than clipped off the axis — a shorter axis
would make a hard archive limit look like a design choice. It distinguishes
three absences that are usually conflated: *before archive floor*, *never
attempted*, and *attempted and empty*.

Three panels are registers rather than views, and are fully backed:

- **Gap Register** — every requirement the pipeline does not satisfy, with
  evidence and a presentation-layer remedy.
- **Constants Register** — every coefficient shaping a published figure, with its
  justification status, its divergences, and any false provenance.
- **Artifact Manifest** — every file the console reads with its SHA-256, row
  count and modification time. This is the provenance of the console itself.

---

## Regenerating the projection

```bash
cd frontend && npm run api:generate     # or: python3 backend/scripts/generate_console_api.py
```

Reads 16 produced artifacts, writes 12 JSON files to
`frontend/public/api/v1/console/`. It computes no economic value — it projects,
counts, hashes, and derives display-only corrections that are labelled as such.
Absent fields become `null`, never `0`.

Where it derives something for display — the `last_minus_first` correction on
cumulative counters, or a run's wall-clock duration from two stored timestamps —
the field is named so the interface can label it a presentation-side derivation
and show it **beside**, never instead of, the published value.

---

## Configuration

See `frontend/.env.example`. Leaving `VITE_API_BASE` blank pins everything to the
static projection.

---

## What the console will not do

- Render a 24-quarter grid as though 24 quarters were measured.
- Present an assumed constant as a computed index.
- Show a residency split while the underlying field is a constant on every row.
- Label a synthesised value "actual".
- Present quality checks that cannot fail by construction as validation.
- Credit a source that has no client, URL or credential in the repository.
- Show a published aggregate built on a misapplied aggregation rule without the
  correction beside it.
