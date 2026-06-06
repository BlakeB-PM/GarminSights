# Runbook: Cloudflare 525 (SSL handshake failed) → Fly origin

**Symptom:** Visiting `https://garminsights.blakebeal.com` returns a Cloudflare
**Error 525: SSL handshake failed**.

## What 525 actually means

A 525 is raised by **Cloudflare's edge** when it cannot complete a TLS handshake
with the **origin** (our Fly.io app). It happens at the TLS layer, before any
HTTP request reaches FastAPI, so **this is never a GarminSights code bug** — it
is a certificate / DNS / Cloudflare-mode problem.

Architecture:

```
browser → Cloudflare edge (terminates browser TLS) → [TLS handshake] → Fly.io edge → app (uvicorn :8080)
                                                          ^ 525 happens here
```

When the Cloudflare proxy (orange cloud) is on, Cloudflare opens a TLS
connection to Fly and sends **SNI = `garminsights.blakebeal.com`**. Fly's edge
must present a certificate matching that exact hostname. No matching cert →
handshake aborts → 525.

## Root causes, most likely first

1. **Fly has no issued certificate for `garminsights.blakebeal.com`.** Either it
   was never added, or it is stuck in `pending` / `awaiting configuration`. The
   chicken-and-egg trap: Fly validates the Let's Encrypt cert with an ACME
   challenge, but the Cloudflare proxy intercepts the challenge so the cert
   never reaches `Ready`.
2. **Cloudflare SSL/TLS mode is "Full (strict)"** while the Fly cert is not yet
   valid/ready.
3. **DNS points at an origin with no TLS listener** for that hostname.

## Step 1 — Isolate edge vs origin

From your machine (not a Cloudflare-proxied path):

```bash
# 1. Confirm Cloudflare is the one returning 525 (look for server: cloudflare)
curl -vI https://garminsights.blakebeal.com/api/health

# 2. Hit the Fly origin directly via its native hostname (bypasses Cloudflare).
#    If this works, origin TLS is healthy and the problem is the custom-domain
#    cert or the Cloudflare mode.
curl -sI https://garminsights.fly.dev/api/health

# 3. THE DECISIVE TEST: hit the Fly origin directly but with the CUSTOM SNI.
#    This is exactly what Cloudflare does. If this handshake fails, Fly has no
#    cert for the custom hostname → root cause #1 confirmed.
FLY_IP=$(fly ips list -a garminsights | awk '/v4/{print $2; exit}')
curl -vI --resolve garminsights.blakebeal.com:443:$FLY_IP \
  https://garminsights.blakebeal.com/api/health
# or:
echo | openssl s_client -connect $FLY_IP:443 \
  -servername garminsights.blakebeal.com 2>&1 | grep -E 'verify|subject=|CN ='
```

## Step 2 — Fix the Fly certificate (root cause #1)

```bash
fly certs list -a garminsights
fly certs show garminsights.blakebeal.com -a garminsights   # shows what's needed
# if missing:
fly certs add garminsights.blakebeal.com -a garminsights
fly certs check garminsights.blakebeal.com -a garminsights
```

`fly certs show` will report the cert status. If it is **not** `Ready`, the ACME
challenge is being blocked by the Cloudflare proxy. Break the deadlock one of two
ways:

- **Easiest — grey-cloud temporarily:** In Cloudflare DNS, set the
  `garminsights` record to **DNS only** (grey cloud). Wait for
  `fly certs show` to flip to `Ready` (usually a few minutes), then turn the
  proxy back **on** (orange cloud).
- **DNS-01 — keep proxy on:** Add the `_acme-challenge` CNAME that
  `fly certs show` prints, as a **DNS-only** record, and wait for `Ready`.

## Step 3 — Set the correct Cloudflare SSL/TLS mode

Cloudflare dashboard → **SSL/TLS → Overview**:

- Use **Full (strict)** once `fly certs show` is `Ready`. Fly's Let's Encrypt
  cert satisfies strict validation.
- **Never use "Flexible"** with this app. `fly.toml` sets `force_https = true`,
  so Flexible (Cloudflare→origin over HTTP) causes an infinite redirect loop
  (`ERR_TOO_MANY_REDIRECTS`), not a 525.

## Step 4 — Verify

```bash
curl -sI https://garminsights.blakebeal.com/api/health   # expect HTTP/2 200
```

## Notes

- Do **not** change `fly.toml` or run `flyctl deploy` to fix this — it is purely
  a TLS/DNS/Cloudflare config issue and requires no redeploy.
- `force_https = true` is correct and should stay; it only matters once the
  handshake succeeds.
