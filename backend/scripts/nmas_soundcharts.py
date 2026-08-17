#!/usr/bin/env python3
"""
NMAS Soundcharts CLI.

One entry point for the second provider: probe the account, inspect an artist,
mint tokens, and drive the four pipeline stages.

    nmas-sc quota                      billing quota and rate limit, live
    nmas-sc status                     pipeline state: shards, rows, coverage
    nmas-sc search "Asake"             resolve a name to provider UUIDs
    nmas-sc artist <uuid>              metadata plus the platforms it holds
    nmas-sc audience <uuid> spotify    a daily series, any window
    nmas-sc token [api|mcp]            OAuth bearer token via client credentials
    nmas-sc resolve                    frame -> UUIDs (855 calls)
    nmas-sc backfill [sample|rest|all] extract 2019 -> current quarter
    nmas-sc merge                      merge both providers into NBS FINAL delivery
    nmas-sc standardise                dedupe evidence, registers, deterministic order
    nmas-sc excel                      build the Excel deliverable
    nmas-sc console                    regenerate the console artifact

Credentials come from backend/.env, which is gitignored. Nothing here prints a
secret: `token` prints a token because that is the command's purpose, and it is
the only one that does.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from nmas.services.soundcharts import client_from_env  # noqa: E402

SHARDS = BACKEND / "data" / "soundcharts" / "shards"
CITY_SHARDS = BACKEND / "data" / "soundcharts" / "city_shards"
RESOLUTION = BACKEND / "data" / "soundcharts" / "artist_resolution.csv"
FINAL = ROOT / "NBS FINAL delivery"
PY = str(BACKEND / ".venv" / "bin" / "python3")
NUM = "{:,}".format


def _load_env() -> None:
    env_path = BACKEND / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def cmd_quota(_: argparse.Namespace) -> int:
    client = client_from_env()
    body = client.get("/api/v2/team/usage")
    usage = body.get("object") or {}
    quota = usage.get("quota") or {}
    rate = usage.get("rateLimit") or {}
    limit = quota.get("limit") or 0
    used = quota.get("used") or 0
    print("BILLING QUOTA")
    print(f"  limit      {NUM(limit)}")
    print(f"  used       {NUM(used)}  ({100 * used / limit:.2f}%)" if limit else f"  used  {NUM(used)}")
    print(f"  remaining  {NUM(quota.get('remaining') or 0)}")
    if quota.get("endPeriodDate"):
        print(f"  period ends {quota['endPeriodDate']}")
    print("\nRATE LIMIT")
    print(f"  per minute {NUM(rate.get('limitPerMinute') or 0)}")
    print(f"  used       {NUM(rate.get('used') or 0)}")
    print(f"  remaining  {NUM(rate.get('remaining') or 0)}")
    print(f"  resets in  {rate.get('resetInSeconds')}s")
    return 0


def cmd_status(_: argparse.Namespace) -> int:
    shards = sorted(SHARDS.glob("*.csv")) if SHARDS.exists() else []
    city = sorted(CITY_SHARDS.glob("*.csv")) if CITY_SHARDS.exists() else []
    print("EXTRACTION")
    print(f"  artist shards   {len(shards)}")
    print(f"  city shards     {len(city)}")
    if shards:
        size = sum(p.stat().st_size for p in shards) / 1_048_576
        print(f"  shard size      {size:,.1f} MB")

    if RESOLUTION.exists():
        rows = list(csv.DictReader(RESOLUTION.open(encoding="utf-8")))
        counts: dict[str, int] = {}
        for row in rows:
            counts[row["match_confidence"]] = counts.get(row["match_confidence"], 0) + 1
        print(f"\nRESOLUTION ({len(rows)} artists)")
        for key in sorted(counts, key=lambda k: -counts[k]):
            print(f"  {key:20} {counts[key]}")

    print("\nDELIVERY")
    for name in ("Daily_Metric_Observations.csv", "Quarterly_Aggregates_Full.csv",
                 "Geography_Full_Daily.csv.gz", "Coverage_By_Quarter.csv"):
        target = FINAL / "04_Datasets" / name
        if target.exists():
            size = target.stat().st_size / 1_048_576
            print(f"  {name:34} {size:>8,.1f} MB")
        else:
            print(f"  {name:34} {'not built':>8}")
    excel = FINAL / "03_Excel_Deliveries" / "7_NMAS_Extended_History_2019_2026.xlsx"
    print(f"  {excel.name:34} {'present' if excel.exists() else 'not built':>8}")
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    client = client_from_env()
    items = client.search_artist(args.name, limit=args.limit)
    if not items:
        print("no matches")
        return 1
    for item in items:
        print(f"  {item.get('uuid')}  {item.get('name'):<32} "
              f"{item.get('countryCode') or '--':<4} {item.get('careerStage') or ''}")
    return 0


def cmd_artist(args: argparse.Namespace) -> int:
    client = client_from_env()
    meta = client.artist_metadata(args.uuid)
    if not meta:
        print("not found")
        return 1
    print(f"{meta.get('name')}  [{meta.get('countryCode') or '--'}]  {meta.get('uuid')}")
    print(f"  slug     {meta.get('slug')}")
    print(f"  app      {meta.get('appUrl')}")
    genres = meta.get("genres") or []
    if genres:
        roots = ", ".join(g.get("root", "") for g in genres if g.get("root"))
        print(f"  genres   {roots}")
    identifiers = client.artist_identifiers(args.uuid)
    platforms = sorted({(i.get("platformCode") or "").lower() for i in identifiers if i.get("platformCode")})
    print(f"  platforms ({len(platforms)}): {', '.join(platforms)}")
    return 0


def cmd_audience(args: argparse.Namespace) -> int:
    client = client_from_env()
    path = f"/api/v2/artist/{args.uuid}/audience/{args.platform}"
    window = {"startDate": args.start, "endDate": args.end}
    rows = list(client.paginate(path, window, page_size=100, max_pages=args.max_pages))
    if not rows:
        print("no observations in that window")
        return 0
    print(f"{len(rows)} observations  {rows[0].get('date','')[:10]} -> {rows[-1].get('date','')[:10]}")
    for item in rows[: args.head]:
        fields = {k: v for k, v in item.items() if k != "date" and v is not None}
        print(f"  {item.get('date','')[:10]}  {fields}")
    if len(rows) > args.head:
        print(f"  … {len(rows) - args.head} more")
    return 0


def cmd_token(args: argparse.Namespace) -> int:
    _load_env()
    if args.kind == "mcp":
        cid, secret = os.environ["SOUNDCHARTS_MCP_CLIENT_ID"], os.environ["SOUNDCHARTS_MCP_CLIENT_SECRET"]
    else:
        cid, secret = os.environ["SOUNDCHARTS_CLIENT_ID"], os.environ["SOUNDCHARTS_CLIENT_SECRET"]
    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    # team_id is optional despite the documented example: passing a team the
    # credential cannot see fails with "user does not have access to the
    # requested team", while omitting it resolves the default team.
    body = urllib.parse.urlencode([("grant_type", "client_credentials")]).encode()
    request = urllib.request.Request(
        os.environ.get("SOUNDCHARTS_TOKEN_URL", "https://account.soundcharts.com/oauth/token"),
        data=body,
        headers={"Authorization": f"Basic {basic}",
                 "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        print(f"token request failed: {exc.code} {exc.read()[:200].decode(errors='replace')}")
        return 1
    expires = payload.get("expires_in", 0)
    print(payload["access_token"])
    print(f"\n# {args.kind} token · expires in {expires}s "
          f"({expires / 86400:.1f} days)", file=sys.stderr)
    return 0


def _run(script: str, *script_args: str) -> int:
    return subprocess.call([PY, str(BACKEND / "scripts" / script), *script_args])


def cmd_resolve(_: argparse.Namespace) -> int:
    return _run("soundcharts_resolve_artists.py")


def cmd_backfill(args: argparse.Namespace) -> int:
    if args.workers:
        os.environ["SC_WORKERS"] = str(args.workers)
    return _run("soundcharts_backfill.py", args.scope)


def cmd_merge(_: argparse.Namespace) -> int:
    return _run("merge_final_delivery.py")


def cmd_standardise(_: argparse.Namespace) -> int:
    return _run("standardise_final_delivery.py")


def cmd_excel(_: argparse.Namespace) -> int:
    return _run("build_final_excel.py")


def cmd_console(_: argparse.Namespace) -> int:
    return _run("generate_extended_console_api.py")


def cmd_all(args: argparse.Namespace) -> int:
    """Everything downstream of extraction, in order."""
    for step, fn in (("merge", cmd_merge), ("standardise", cmd_standardise),
                     ("excel", cmd_excel), ("console", cmd_console)):
        print(f"\n=== {step} ===", flush=True)
        code = fn(args)
        if code != 0:
            print(f"{step} failed with {code}")
            return code
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nmas-sc", description="NMAS Soundcharts provider CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("quota", help="billing quota and rate limit").set_defaults(func=cmd_quota)
    sub.add_parser("status", help="pipeline state").set_defaults(func=cmd_status)

    search = sub.add_parser("search", help="resolve a name to provider UUIDs")
    search.add_argument("name")
    search.add_argument("--limit", type=int, default=10)
    search.set_defaults(func=cmd_search)

    artist = sub.add_parser("artist", help="metadata and held platforms")
    artist.add_argument("uuid")
    artist.set_defaults(func=cmd_artist)

    audience = sub.add_parser("audience", help="daily series for one platform")
    audience.add_argument("uuid")
    audience.add_argument("platform")
    audience.add_argument("--start", default="2019-01-01")
    audience.add_argument("--end", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    audience.add_argument("--head", type=int, default=10)
    audience.add_argument("--max-pages", type=int, default=8, dest="max_pages")
    audience.set_defaults(func=cmd_audience)

    token = sub.add_parser("token", help="mint an OAuth bearer token")
    token.add_argument("kind", nargs="?", choices=("api", "mcp"), default="api")
    token.set_defaults(func=cmd_token)

    sub.add_parser("resolve", help="frame -> UUIDs").set_defaults(func=cmd_resolve)

    backfill = sub.add_parser("backfill", help="extract 2019 -> current quarter")
    backfill.add_argument("scope", nargs="?", choices=("sample", "rest", "all"), default="all")
    backfill.add_argument("--workers", type=int, default=None)
    backfill.set_defaults(func=cmd_backfill)

    sub.add_parser("merge", help="merge providers into NBS FINAL delivery").set_defaults(func=cmd_merge)
    sub.add_parser("standardise", help="dedupe evidence, registers, deterministic order").set_defaults(func=cmd_standardise)
    sub.add_parser("excel", help="build the Excel deliverable").set_defaults(func=cmd_excel)
    sub.add_parser("console", help="regenerate the console artifact").set_defaults(func=cmd_console)
    sub.add_parser("all", help="merge, standardise, excel and console in order").set_defaults(func=cmd_all)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
