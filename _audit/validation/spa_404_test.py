#!/usr/bin/env python3
"""Deployment test: a nonexistent API artifact must return 404, not the SPA shell.
Run against the live deployment after deploy (verification pass 10)."""
import sys, urllib.request, urllib.error
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://nigeria-music-analytics-system-nmas.vercel.app"
def status(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=30) as r:
            return r.status, r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", "")
ok = True
code, ctype = status("/api/v1/console/THIS-DOES-NOT-EXIST.json")
print("nonexistent artifact -> %s (%s)" % (code, ctype))
if code != 404:
    print("FAIL: SPA rewrite still masks missing artifacts"); ok = False
code, ctype = status("/api/v1/nbs/summary.json")
print("real artifact        -> %s (%s)" % (code, ctype))
if code != 200 or "json" not in ctype:
    print("FAIL: real artifact not served as JSON"); ok = False
code, _ = status("/")
print("SPA root             -> %s" % code)
if code != 200:
    print("FAIL: SPA root broken"); ok = False
sys.exit(0 if ok else 1)
