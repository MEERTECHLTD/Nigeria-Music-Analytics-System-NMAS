from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from sqlmodel import Session, select

from ..models import Artist, ArtistTrackLink, AuditLog, Track


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def list_artists(
    session: Session,
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[Artist]:
    statement = select(Artist)
    if status:
        statement = statement.where(Artist.status == status)
    statement = statement.order_by(Artist.artist_name.asc()).offset(offset).limit(limit)
    return list(session.exec(statement))


def list_tracks(
    session: Session,
    status: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[Track]:
    statement = select(Track)
    if status:
        statement = statement.where(Track.status == status)
    statement = statement.order_by(Track.track_name.asc()).offset(offset).limit(limit)
    return list(session.exec(statement))


def import_artists_from_csv(session: Session, csv_text: str, actor: str = "system") -> dict[str, int | list[str]]:
    created = 0
    updated = 0
    warnings: list[str] = []
    reader = csv.DictReader(io.StringIO(csv_text))

    for row_number, row in enumerate(reader, start=2):
        artist_name = _clean(row.get("artist_name") or row.get("name"))
        if not artist_name:
            warnings.append(f"Row {row_number}: missing artist_name.")
            continue

        raw_chartmetric_id = _clean(row.get("chartmetric_artist_id") or row.get("cm_artist_id"))
        chartmetric_artist_id = int(raw_chartmetric_id) if raw_chartmetric_id else None

        artist = None
        if chartmetric_artist_id is not None:
            statement = select(Artist).where(Artist.chartmetric_artist_id == chartmetric_artist_id)
            artist = session.exec(statement).first()
        if artist is None:
            statement = select(Artist).where(Artist.artist_name == artist_name)
            artist = session.exec(statement).first()

        is_new = artist is None
        if is_new:
            artist = Artist(artist_name=artist_name)
            created += 1
        else:
            updated += 1

        artist.artist_name = artist_name
        artist.chartmetric_artist_id = chartmetric_artist_id
        artist.country = _clean(row.get("country")) or artist.country or "NG"
        artist.genres = _clean(row.get("genres"))
        artist.label = _clean(row.get("label"))
        artist.spotify_id = _clean(row.get("spotify_id"))
        artist.youtube_id = _clean(row.get("youtube_id"))
        artist.status = _clean(row.get("status")) or artist.status
        artist.notes = _clean(row.get("notes"))
        artist.updated_at = _utc_now()

        session.add(artist)

    session.add(
        AuditLog(
            category="entity_universe",
            action="import_artists_csv",
            actor=actor,
            details={"created": created, "updated": updated, "warnings": warnings},
        )
    )
    return {"created": created, "updated": updated, "warnings": warnings, "linked": 0}


def import_tracks_from_csv(session: Session, csv_text: str, actor: str = "system") -> dict[str, int | list[str]]:
    created = 0
    updated = 0
    linked = 0
    warnings: list[str] = []
    reader = csv.DictReader(io.StringIO(csv_text))

    for row_number, row in enumerate(reader, start=2):
        track_name = _clean(row.get("track_name") or row.get("title") or row.get("name"))
        if not track_name:
            warnings.append(f"Row {row_number}: missing track_name.")
            continue

        raw_track_id = _clean(row.get("chartmetric_track_id") or row.get("cm_track_id"))
        chartmetric_track_id = int(raw_track_id) if raw_track_id else None

        track = None
        if chartmetric_track_id is not None:
            statement = select(Track).where(Track.chartmetric_track_id == chartmetric_track_id)
            track = session.exec(statement).first()
        if track is None:
            statement = select(Track).where(Track.track_name == track_name)
            track = session.exec(statement).first()

        is_new = track is None
        if is_new:
            track = Track(track_name=track_name)
            created += 1
        else:
            updated += 1

        primary_artist_name = _clean(row.get("artist_name") or row.get("primary_artist_name"))
        track.track_name = track_name
        track.chartmetric_track_id = chartmetric_track_id
        track.primary_artist_name = primary_artist_name
        track.isrc = _clean(row.get("isrc"))
        track.spotify_id = _clean(row.get("spotify_id"))
        track.youtube_id = _clean(row.get("youtube_id"))
        track.status = _clean(row.get("status")) or track.status
        track.notes = _clean(row.get("notes"))
        track.updated_at = _utc_now()
        session.add(track)
        session.flush()

        raw_artist_id = _clean(row.get("artist_id"))
        is_top_track = (_clean(row.get("is_top_track")) or "").lower() in {"1", "true", "yes", "y"}
        linked_artist = None
        if raw_artist_id:
            linked_artist = session.get(Artist, raw_artist_id)
        elif primary_artist_name:
            statement = select(Artist).where(Artist.artist_name == primary_artist_name)
            linked_artist = session.exec(statement).first()

        if linked_artist is not None:
            statement = select(ArtistTrackLink).where(
                ArtistTrackLink.artist_id == linked_artist.id,
                ArtistTrackLink.track_id == track.id,
            )
            existing_link = session.exec(statement).first()
            if existing_link is None:
                session.add(
                    ArtistTrackLink(
                        artist_id=linked_artist.id,
                        track_id=track.id,
                        link_type="primary",
                        is_top_track=is_top_track,
                    )
                )
                linked += 1

    session.add(
        AuditLog(
            category="entity_universe",
            action="import_tracks_csv",
            actor=actor,
            details={"created": created, "updated": updated, "linked": linked, "warnings": warnings},
        )
    )
    return {"created": created, "updated": updated, "linked": linked, "warnings": warnings}


def update_artist(session: Session, artist_id: str, payload: dict[str, object], actor: str = "system") -> Artist:
    artist = session.get(Artist, artist_id)
    if artist is None:
        raise KeyError(f"Artist not found: {artist_id}")

    for field_name, value in payload.items():
        if value is None or not hasattr(artist, field_name):
            continue
        setattr(artist, field_name, value)
    artist.updated_at = _utc_now()
    session.add(artist)
    session.add(
        AuditLog(
            category="entity_universe",
            action="update_artist",
            actor=actor,
            entity_type="artist",
            entity_id=artist.id,
            details=payload,
        )
    )
    return artist


def update_track(session: Session, track_id: str, payload: dict[str, object], actor: str = "system") -> Track:
    track = session.get(Track, track_id)
    if track is None:
        raise KeyError(f"Track not found: {track_id}")

    for field_name, value in payload.items():
        if value is None or not hasattr(track, field_name):
            continue
        setattr(track, field_name, value)
    track.updated_at = _utc_now()
    session.add(track)
    session.add(
        AuditLog(
            category="entity_universe",
            action="update_track",
            actor=actor,
            entity_type="track",
            entity_id=track.id,
            details=payload,
        )
    )
    return track

