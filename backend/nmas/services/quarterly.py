from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlmodel import Session, select

from ..models import NormalizedMetricObservation


def compute_quarterly_aggregates(session: Session, job_id: str) -> list[dict[str, object]]:
    statement = select(NormalizedMetricObservation).where(NormalizedMetricObservation.job_id == job_id)
    observations = list(session.exec(statement))

    grouped: dict[tuple[str, int | None, str, str, str, str, str], list[NormalizedMetricObservation]] = defaultdict(list)
    for observation in observations:
        grouped[
            (
                observation.entity_type,
                observation.chartmetric_entity_id,
                observation.entity_name,
                observation.variable_name,
                observation.platform,
                observation.geo_scope,
                observation.geo_label,
            )
        ].append(observation)

    rows: list[dict[str, object]] = []
    for group_key, items in grouped.items():
        by_period: dict[str, list[NormalizedMetricObservation]] = defaultdict(list)
        for item in items:
            by_period[item.period_label].append(item)

        ordered_periods = sorted(by_period.keys(), key=_period_sort_key)
        period_values: dict[str, float] = {}

        for period_label in ordered_periods:
            period_items = sorted(by_period[period_label], key=lambda item: item.observation_date)
            rule = period_items[0].aggregation_rule
            value = _apply_aggregation(rule, period_items)
            period_values[period_label] = value

        for period_label in ordered_periods:
            entity_type, chartmetric_entity_id, entity_name, variable_name, platform, geo_scope, geo_label = group_key
            current_value = period_values[period_label]
            qoq_label = _previous_quarter_label(period_label)
            yoy_label = _previous_year_label(period_label)
            qoq_change = current_value - period_values[qoq_label] if qoq_label in period_values else None
            yoy_change = current_value - period_values[yoy_label] if yoy_label in period_values else None
            first_item = sorted(by_period[period_label], key=lambda item: item.observation_date)[0]
            rows.append(
                {
                    "entity_type": entity_type,
                    "entity_name": entity_name,
                    "chartmetric_entity_id": chartmetric_entity_id,
                    "variable_name": variable_name,
                    "platform": platform,
                    "geo_scope": geo_scope,
                    "geo_label": geo_label,
                    "period_label": period_label,
                    "aggregation_rule": first_item.aggregation_rule,
                    "aggregated_value": current_value,
                    "unit": first_item.unit,
                    "qoq_change": qoq_change,
                    "yoy_change": yoy_change,
                }
            )

    return sorted(
        rows,
        key=lambda row: (
            str(row["entity_type"]),
            str(row["entity_name"]),
            str(row["variable_name"]),
            str(row["period_label"]),
        ),
    )


def _apply_aggregation(rule: str, items: list[NormalizedMetricObservation]) -> float:
    if rule == "sum":
        return float(sum(item.variable_value for item in items))
    if rule == "net_change":
        return float(items[-1].variable_value - items[0].variable_value)
    if rule == "last_value":
        return float(items[-1].variable_value)
    raise ValueError(f"Unsupported aggregation rule: {rule}")


def _period_sort_key(label: str) -> tuple[int, str]:
    try:
        quarter, year = _split_period_label(label)
        return year, f"{quarter:02d}"
    except ValueError:
        return (9999, label)


def _split_period_label(label: str) -> tuple[int, int]:
    quarter_text, year_text = label.split("_")
    return int(quarter_text.replace("Q", "")), int(year_text)


def _previous_quarter_label(label: str) -> str:
    try:
        quarter, year = _split_period_label(label)
    except ValueError:
        return ""
    if quarter == 1:
        return f"Q4_{year - 1}"
    return f"Q{quarter - 1}_{year}"


def _previous_year_label(label: str) -> str:
    try:
        quarter, year = _split_period_label(label)
    except ValueError:
        return ""
    return f"Q{quarter}_{year - 1}"


def default_periods() -> list[dict[str, object]]:
    """Reference periods covering the NBS historical extraction window.

    These cover Q1 2024 through Q4 2025 to allow full YoY and QoQ analysis.
    The system supports configurable period sets — these are defaults only.
    """
    return [
        {"label": "Q1_2024", "start_date": date(2024, 1, 1), "end_date": date(2024, 3, 31)},
        {"label": "Q2_2024", "start_date": date(2024, 4, 1), "end_date": date(2024, 6, 30)},
        {"label": "Q3_2024", "start_date": date(2024, 7, 1), "end_date": date(2024, 9, 30)},
        {"label": "Q4_2024", "start_date": date(2024, 10, 1), "end_date": date(2024, 12, 31)},
        {"label": "Q1_2025", "start_date": date(2025, 1, 1), "end_date": date(2025, 3, 31)},
        {"label": "Q2_2025", "start_date": date(2025, 4, 1), "end_date": date(2025, 6, 30)},
        {"label": "Q3_2025", "start_date": date(2025, 7, 1), "end_date": date(2025, 9, 30)},
        {"label": "Q4_2025", "start_date": date(2025, 10, 1), "end_date": date(2025, 12, 31)},
    ]
