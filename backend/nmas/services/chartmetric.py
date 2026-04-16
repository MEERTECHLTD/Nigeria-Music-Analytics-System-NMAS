from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any

import requests

from ..config import Settings, get_settings
from ..metrics import MetricDefinition, get_metric_definition, unique_stat_endpoints


logger = logging.getLogger(__name__)

NIGERIAN_CITIES = {
    "lagos",
    "abuja",
    "port harcourt",
    "ibadan",
    "kano",
    "benin city",
    "kaduna",
    "enugu",
    "ilorin",
    "jos",
    "owerri",
    "uyo",
}


class ChartmetricAuthError(RuntimeError):
    pass


class ChartmetricRequestError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


@dataclass
class ProviderResponse:
    endpoint: str
    params: dict[str, Any]
    requested_at: datetime
    received_at: datetime
    status_code: int
    attempts: int
    payload: dict[str, Any] | list[Any] | None
    response_text: str | None
    error_classification: str | None = None
    normalization_note: str | None = None

    @property
    def payload_hash(self) -> str:
        body = self.response_text or ""
        return hashlib.sha256(body.encode("utf-8")).hexdigest()


@dataclass
class NormalizedObservation:
    variable_name: str
    observation_date: date
    value: float
    geo_scope: str
    geo_label: str
    unit: str
    source_field: str
    aggregation_rule: str
    is_fallback: bool = False
    fallback_source: str | None = None
    provenance_note: str | None = None


@dataclass
class LimitationNotice:
    variable_name: str
    platform: str
    geo_scope: str
    code: str
    description: str
    fallback_applied: bool = False
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExtractionResult:
    requested_metric: str
    emitted_metric_names: set[str]
    endpoint: str
    platform: str
    observations: list[NormalizedObservation]
    limitations: list[LimitationNotice]
    normalization_note: str | None = None


class RequestThrottle:
    def __init__(self, seconds_between_requests: float):
        self.seconds_between_requests = seconds_between_requests
        self.next_allowed_at = 0.0

    def wait(self) -> None:
        now = time.monotonic()
        if now < self.next_allowed_at:
            time.sleep(self.next_allowed_at - now)
        self.next_allowed_at = time.monotonic() + self.seconds_between_requests


class ChartmetricClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.session = requests.Session()
        self.throttle = RequestThrottle(self.settings.chartmetric_throttle_seconds)
        self._access_token = self.settings.chartmetric_access_token
        self._token_refreshed_at: datetime | None = None

    def provider_health(self) -> dict[str, Any]:
        return {
            "provider": "chartmetric",
            "base_url": self.settings.chartmetric_base_url,
            "auth_mode": self.settings.chartmetric_auth_mode,
            "access_token_configured": bool(self.settings.chartmetric_access_token),
            "refresh_token_configured": bool(self.settings.chartmetric_refresh_token),
            "throttle_seconds": self.settings.chartmetric_throttle_seconds,
            "max_retries": self.settings.chartmetric_max_retries,
        }

    def ensure_access_token(self) -> str:
        if self.settings.chartmetric_auth_mode == "static":
            if not self._access_token:
                raise ChartmetricAuthError("CHARTMETRIC_ACCESS_TOKEN is required in static auth mode.")
            return self._access_token

        if self.settings.chartmetric_auth_mode != "refresh":
            raise ChartmetricAuthError(f"Unsupported auth mode: {self.settings.chartmetric_auth_mode}")

        if self._access_token and self._token_refreshed_at is not None:
            age = (datetime.now(timezone.utc) - self._token_refreshed_at).total_seconds()
            if age < 45 * 60:
                return self._access_token

        if not self.settings.chartmetric_refresh_token:
            raise ChartmetricAuthError("CHARTMETRIC_REFRESH_TOKEN is required in refresh auth mode.")

        payload = {
            "refreshtoken": self.settings.chartmetric_refresh_token,
        }
        if self.settings.chartmetric_client_id:
            payload["client_id"] = self.settings.chartmetric_client_id
        if self.settings.chartmetric_client_secret:
            payload["client_secret"] = self.settings.chartmetric_client_secret

        response = self.session.post(
            self.settings.chartmetric_token_url,
            json=payload,
            timeout=self.settings.chartmetric_timeout_seconds,
            verify=self.settings.chartmetric_verify_ssl,
        )
        response.raise_for_status()
        data = response.json()
        token = data.get("access_token") or data.get("token")
        if not token:
            raise ChartmetricAuthError("Chartmetric token refresh response did not include an access token.")
        self._access_token = token
        self._token_refreshed_at = datetime.now(timezone.utc)
        return token

    def request_json(self, endpoint: str, params: dict[str, Any]) -> ProviderResponse:
        token = self.ensure_access_token()
        url = f"{self.settings.chartmetric_base_url.rstrip('/')}{endpoint}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        last_error: ChartmetricRequestError | None = None
        for attempt in range(1, self.settings.chartmetric_max_retries + 1):
            self.throttle.wait()
            requested_at = datetime.now(timezone.utc)
            try:
                response = self.session.get(
                    url,
                    headers=headers,
                    params=params,
                    timeout=self.settings.chartmetric_timeout_seconds,
                    verify=self.settings.chartmetric_verify_ssl,
                )
                received_at = datetime.now(timezone.utc)
                status_code = response.status_code
                retryable = status_code == 429 or status_code >= 500

                if retryable and attempt < self.settings.chartmetric_max_retries:
                    time.sleep(self.settings.chartmetric_backoff_seconds * attempt)
                    continue

                if status_code >= 400:
                    raise ChartmetricRequestError(
                        f"Chartmetric request failed with status {status_code}.",
                        status_code=status_code,
                        retryable=retryable,
                    )

                payload: dict[str, Any] | list[Any] | None
                try:
                    payload = response.json()
                except ValueError as exc:
                    raise ChartmetricRequestError(
                        f"Chartmetric response was not valid JSON: {exc}",
                        status_code=status_code,
                        retryable=False,
                    ) from exc

                return ProviderResponse(
                    endpoint=endpoint,
                    params=params,
                    requested_at=requested_at,
                    received_at=received_at,
                    status_code=status_code,
                    attempts=attempt,
                    payload=payload,
                    response_text=response.text,
                )
            except requests.RequestException as exc:
                retryable = attempt < self.settings.chartmetric_max_retries
                last_error = ChartmetricRequestError(str(exc), retryable=retryable)
                if retryable:
                    time.sleep(self.settings.chartmetric_backoff_seconds * attempt)
                    continue
                raise last_error from exc

        if last_error is None:
            raise ChartmetricRequestError("Chartmetric request failed without a captured error.")
        raise last_error

    def extract_metric(
        self,
        metric_name: str,
        chartmetric_id: int,
        period_label: str,
        start_date: date,
        end_date: date,
    ) -> tuple[ProviderResponse, ExtractionResult]:
        metric = get_metric_definition(metric_name)
        endpoint = metric.endpoint_template.format(chartmetric_id=chartmetric_id)

        # Chartmetric Where People Listen has a 365-day max window.
        # For safety, window all requests to max 365 days per call and merge results.
        max_window_days = 365 if metric.name == "Where_People_Listen" else 365
        windows = self._split_date_range(start_date, end_date, max_window_days)

        all_observations: list[NormalizedObservation] = []
        all_limitations: list[LimitationNotice] = []
        emitted_metric_names: set[str] = set()
        last_response: ProviderResponse | None = None

        for window_start, window_end in windows:
            params = {
                "since": window_start.isoformat(),
                "until": window_end.isoformat(),
            }
            provider_response = self.request_json(endpoint, params)
            last_response = provider_response
            extraction_result = self._normalize(metric, provider_response.payload, period_label)
            all_observations.extend(extraction_result.observations)
            all_limitations.extend(extraction_result.limitations)
            emitted_metric_names.update(extraction_result.emitted_metric_names)

        if last_response is None:
            raise ChartmetricRequestError("No date windows generated for extraction.", retryable=False)

        merged_result = ExtractionResult(
            requested_metric=metric.name,
            emitted_metric_names=emitted_metric_names,
            endpoint=metric.endpoint_template,
            platform=metric.platform,
            observations=all_observations,
            limitations=all_limitations,
            normalization_note=last_response.normalization_note,
        )
        return last_response, merged_result

    def extract_endpoint_all_metrics(
        self,
        endpoint_template: str,
        metrics: list[MetricDefinition],
        chartmetric_id: int,
        period_label: str,
        start_date: date,
        end_date: date,
    ) -> tuple[ProviderResponse | None, list[ExtractionResult]]:
        """Make ONE API call and extract ALL metrics from the same endpoint response.

        E.g. /stat/spotify returns {obj: {followers: [...], listeners: [...], popularity: [...]}}
        and we extract Spotify_followers_daily, Spotify_monthly_listeners_daily, Spotify_popularity_daily
        from a single request instead of three.
        """
        endpoint = endpoint_template.format(chartmetric_id=chartmetric_id)
        max_window_days = 365
        windows = self._split_date_range(start_date, end_date, max_window_days)

        all_results: list[ExtractionResult] = []
        last_response: ProviderResponse | None = None

        for window_start, window_end in windows:
            params = {
                "since": window_start.isoformat(),
                "until": window_end.isoformat(),
            }
            provider_response = self.request_json(endpoint, params)
            last_response = provider_response

            for metric in metrics:
                result = self._normalize(metric, provider_response.payload, period_label)
                all_results.append(result)

        return last_response, all_results

    @staticmethod
    def _split_date_range(start: date, end: date, max_days: int) -> list[tuple[date, date]]:
        from datetime import timedelta

        windows: list[tuple[date, date]] = []
        current = start
        while current <= end:
            window_end = min(current + timedelta(days=max_days - 1), end)
            windows.append((current, window_end))
            current = window_end + timedelta(days=1)
        return windows

    def _normalize(
        self,
        metric: MetricDefinition,
        payload: dict[str, Any] | list[Any] | None,
        period_label: str,
    ) -> ExtractionResult:
        if metric.name == "Where_People_Listen":
            return self._normalize_where_people_listen(metric, payload)

        records = self._extract_stat_records(payload, metric) if metric.stat_data_key else self._extract_records(payload)
        if not records:
            return ExtractionResult(
                requested_metric=metric.name,
                emitted_metric_names=set(),
                endpoint=metric.endpoint_template,
                platform=metric.platform,
                observations=[],
                limitations=[
                    LimitationNotice(
                        variable_name=metric.name,
                        platform=metric.platform,
                        geo_scope=metric.geo_scope_default,
                        code="no_records",
                        description="Provider response did not contain recognizable series records.",
                    )
                ],
            )

        observations: list[NormalizedObservation] = []
        limitations: list[LimitationNotice] = []
        emitted_metric_names: set[str] = set()

        requested_field = self._find_first_present_field(records, metric.source_field_candidates)
        fallback_metric = get_metric_definition(metric.fallback_metric) if metric.fallback_metric else None
        fallback_field = None
        if requested_field is None and fallback_metric is not None:
            fallback_field = self._find_first_present_field(records, fallback_metric.source_field_candidates)

        if requested_field is None and fallback_field is None:
            limitations.append(
                LimitationNotice(
                    variable_name=metric.name,
                    platform=metric.platform,
                    geo_scope=metric.geo_scope_default,
                    code="missing_value_field",
                    description="Expected metric field was not present in provider payload.",
                    details={"expected_fields": list(metric.source_field_candidates)},
                )
            )
            return ExtractionResult(
                requested_metric=metric.name,
                emitted_metric_names=set(),
                endpoint=metric.endpoint_template,
                platform=metric.platform,
                observations=[],
                limitations=limitations,
            )

        active_metric = metric
        active_field = requested_field
        fallback_applied = False

        if active_field is None and fallback_metric is not None and fallback_field is not None:
            active_metric = fallback_metric
            active_field = fallback_field
            fallback_applied = True
            limitations.append(
                LimitationNotice(
                    variable_name=metric.name,
                    platform=metric.platform,
                    geo_scope=metric.geo_scope_default,
                    code="fallback_metric_used",
                    description=f"{metric.name} unavailable; {fallback_metric.name} stored instead.",
                    fallback_applied=True,
                    details={"fallback_metric": fallback_metric.name},
                )
            )

        for record in records:
            observation_date = self._parse_date_from_record(record, active_metric)
            if observation_date is None:
                continue
            raw_value = record.get(active_field) if active_field else None
            if raw_value in (None, ""):
                continue
            try:
                numeric_value = float(raw_value)
            except (TypeError, ValueError):
                continue

            emitted_metric_names.add(active_metric.name)
            observations.append(
                NormalizedObservation(
                    variable_name=active_metric.name,
                    observation_date=observation_date,
                    value=numeric_value,
                    geo_scope=metric.geo_scope_default,
                    geo_label="",
                    unit=active_metric.unit,
                    source_field=active_field,
                    aggregation_rule=active_metric.aggregation_rule,
                    is_fallback=fallback_applied,
                    fallback_source=metric.name if fallback_applied else None,
                    provenance_note=f"Extracted from {period_label} Chartmetric window.",
                )
            )

        if not observations:
            limitations.append(
                LimitationNotice(
                    variable_name=metric.name,
                    platform=metric.platform,
                    geo_scope=metric.geo_scope_default,
                    code="no_valid_observations",
                    description="Records were present but no valid numeric observations could be normalized.",
                )
            )

        return ExtractionResult(
            requested_metric=metric.name,
            emitted_metric_names=emitted_metric_names,
            endpoint=metric.endpoint_template,
            platform=metric.platform,
            observations=observations,
            limitations=limitations,
        )

    def _normalize_where_people_listen(
        self,
        metric: MetricDefinition,
        payload: dict[str, Any] | list[Any] | None,
    ) -> ExtractionResult:
        records = self._extract_records(payload)
        observations: list[NormalizedObservation] = []
        limitations: list[LimitationNotice] = []
        emitted_metric_names: set[str] = set()

        value_field = self._find_first_present_field(records, metric.source_field_candidates)
        if value_field is None:
            return ExtractionResult(
                requested_metric=metric.name,
                emitted_metric_names=set(),
                endpoint=metric.endpoint_template,
                platform=metric.platform,
                observations=[],
                limitations=[
                    LimitationNotice(
                        variable_name=metric.name,
                        platform=metric.platform,
                        geo_scope="nigeria",
                        code="missing_value_field",
                        description="Where People Listen payload did not contain a recognizable share field.",
                    )
                ],
            )

        for record in records:
            city = (
                record.get("city")
                or record.get("name")
                or record.get("label")
                or record.get("market_name")
                or ""
            ).strip()
            country = str(record.get("country") or record.get("country_code") or "").strip().lower()
            if not city:
                continue
            city_key = city.lower()
            if country not in {"ng", "nigeria", ""} and city_key not in NIGERIAN_CITIES:
                continue
            if country == "" and city_key not in NIGERIAN_CITIES:
                continue
            observation_date = self._parse_date_from_record(record, metric)
            if observation_date is None:
                continue
            raw_value = record.get(value_field)
            try:
                numeric_value = float(raw_value)
            except (TypeError, ValueError):
                continue

            variable_name = f"Where_People_Listen_{city.strip().replace(' ', '_')}"
            emitted_metric_names.add(variable_name)
            observations.append(
                NormalizedObservation(
                    variable_name=variable_name,
                    observation_date=observation_date,
                    value=numeric_value,
                    geo_scope="nigeria",
                    geo_label=city,
                    unit="share_pct",
                    source_field=value_field,
                    aggregation_rule=metric.aggregation_rule,
                    provenance_note="Nigeria city-level audience proxy from Where People Listen.",
                )
            )

        if not observations:
            limitations.append(
                LimitationNotice(
                    variable_name=metric.name,
                    platform=metric.platform,
                    geo_scope="nigeria",
                    code="no_nigerian_city_records",
                    description="Where People Listen response did not contain recognizable Nigerian city records.",
                )
            )

        return ExtractionResult(
            requested_metric=metric.name,
            emitted_metric_names=emitted_metric_names,
            endpoint=metric.endpoint_template,
            platform=metric.platform,
            observations=observations,
            limitations=limitations,
        )

    @staticmethod
    def _extract_stat_records(payload: dict[str, Any] | list[Any] | None, metric: MetricDefinition) -> list[dict[str, Any]]:
        """Extract records from Chartmetric /stat/ endpoints which nest data as obj.<key>: [{value, timestp}, ...]."""
        if not isinstance(payload, dict):
            return []
        obj = payload.get("obj", payload)
        if not isinstance(obj, dict):
            return []
        data_key = metric.stat_data_key
        series = obj.get(data_key)
        if isinstance(series, list):
            return [record for record in series if isinstance(record, dict)]
        return []

    @staticmethod
    def _extract_records(payload: dict[str, Any] | list[Any] | None) -> list[dict[str, Any]]:
        if payload is None:
            return []
        if isinstance(payload, list):
            return [record for record in payload if isinstance(record, dict)]

        if not isinstance(payload, dict):
            return []

        for key in ("data", "obj", "series", "results", "items", "history"):
            value = payload.get(key)
            if isinstance(value, list):
                return [record for record in value if isinstance(record, dict)]
            if isinstance(value, dict):
                nested = value.get("data") or value.get("items") or value.get("series")
                if isinstance(nested, list):
                    return [record for record in nested if isinstance(record, dict)]

        return [payload]

    @staticmethod
    def _find_first_present_field(records: list[dict[str, Any]], candidates: tuple[str, ...]) -> str | None:
        for field_name in candidates:
            for record in records:
                if field_name in record and record[field_name] not in (None, ""):
                    return field_name
        return None

    @staticmethod
    def _parse_date_from_record(record: dict[str, Any], metric: MetricDefinition) -> date | None:
        for field_name in metric.date_field_candidates:
            raw_value = record.get(field_name)
            if raw_value in (None, ""):
                continue
            if isinstance(raw_value, datetime):
                return raw_value.date()
            if isinstance(raw_value, date):
                return raw_value
            text = str(raw_value)
            if "T" in text:
                text = text.split("T", 1)[0]
            try:
                return date.fromisoformat(text)
            except ValueError:
                continue
        return None
