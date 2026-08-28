#!/usr/bin/env python3
"""
Deployment test: a nonexistent API artifact must return 404, not the SPA shell.
Run against the live deployment after deploy (verification pass 10).

Two things this test must keep in step with the deployment:
  · the host. The original deployment was decommissioned and relocated to
    nmas.vercel.app; the old default silently tested a dead URL.
  · the edge Basic Auth added with the relocation. Without credentials every
    path returns 401 and the 404-vs-SPA distinction cannot be observed at all,
    so the test authenticates exactly as middleware.ts expects and asserts that
    an unauthenticated request is refused.

Credentials come from NMAS_USER / NMAS_PASS, with the same provisioned fallback
middleware.ts uses, so rotating them in Vercel does not break this check.
"""
import base64
import os
import ssl
import sys
import urllib.error
import urllib.request

import certifi

_CTX = ssl.create_default_context(cafile=certifi.where())
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://nmas.vercel.app"
AUTH = "Basic " + base64.b64encode(
    ("%s:%s" % (os.environ.get("NMAS_USER", "NMAS"),
                os.environ.get("NMAS_PASS", "NMAS@2024NG"))).encode()
).decode()


def status(path, authenticate=True):
    headers = {"Authorization": AUTH} if authenticate else {}
    req = urllib.request.Request(BASE + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30, context=_CTX) as r:
            return r.status, r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", "")


ok = True
print("target: %s" % BASE)

code, _ = status("/", authenticate=False)
print("unauthenticated root -> %s" % code)
if code != 401:
    print("FAIL: deployment is not protected by Basic Auth")
    ok = False

code, ctype = status("/api/v1/console/THIS-DOES-NOT-EXIST.json")
print("nonexistent artifact -> %s (%s)" % (code, ctype))
if code != 404:
    print("FAIL: SPA rewrite still masks missing artifacts")
    ok = False

code, ctype = status("/api/v1/nbs/summary.json")
print("real artifact        -> %s (%s)" % (code, ctype))
if code != 200 or "json" not in ctype:
    print("FAIL: real artifact not served as JSON")
    ok = False

code, _ = status("/")
print("SPA root             -> %s" % code)
if code != 200:
    print("FAIL: SPA root broken")
    ok = False

sys.exit(0 if ok else 1)
