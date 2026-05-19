# CLAUDE.md — MCP server work-in-progress

Context for Claude Code sessions picking up the MCP server feature on
branch `claude/garmin-data-integration-RbTnQ`. The general repo
conventions live in `AGENTS.md` — read that first if this is your first
session in the codebase. This file is scoped to the MCP feature only.

## What this branch adds

A read-only Model Context Protocol server at `/mcp`, gated by Cloudflare
Access. The goal is to let external Claude clients (Claude Code,
claude.ai custom connectors) read the user's Garmin workout data so a
coach skill in their separate `personal-OS` repo can plan and analyze
strength training.

Key files:

| File | Purpose |
|---|---|
| `backend/app/mcp_server.py` | All MCP tools. FastMCP server, read-only SQL wrappers over the existing tables. |
| `backend/app/services/cf_access.py` | Validates `Cf-Access-Jwt-Assertion` against Cloudflare's JWKS for the team domain. |
| `backend/app/main.py:80-135` | Mounts `/mcp` with a gate ASGI wrapper. Dev mode mounts unauthenticated. |
| `backend/app/middleware.py:42-48` | Exempts `/mcp` from the legacy `APP_SECRET_KEY` middleware. |
| `backend/app/config.py` | Adds `cf_access_team_domain` and `cf_access_aud` settings. |
| `backend/requirements.txt` | Adds `mcp==1.2.0`, `PyJWT[crypto]==2.10.1`, `httpx==0.28.1`. |

## Auth model (don't re-architect this without reading first)

- Cloudflare Access sits in front of `garminsights.blakebeal.com` with
  **Managed OAuth** enabled in the Zero Trust dashboard.
- MCP clients (Anthropic's cloud for consumer claude.ai, or Claude Code
  via loopback) run the standard MCP OAuth 2.1 + PKCE + DCR flow against
  Cloudflare's discovery endpoints — we do not implement OAuth
  ourselves.
- After Cloudflare authenticates the user, it forwards the request to
  the Fly origin with a `Cf-Access-Jwt-Assertion` header. Our gate
  validates that JWT — this is purely defense in depth to prevent
  someone who discovers the Fly hostname from bypassing Cloudflare.

In production both `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` must be
set or `/mcp` refuses to mount. Locally (`ENV != production`) the route
mounts without a gate so it can be exercised with `mcp-inspector` or
Claude Code CLI.

## Deployment state as of this commit

- Fly secrets `CF_ACCESS_TEAM_DOMAIN=beal-enterprises.cloudflareaccess.com`
  and `CF_ACCESS_AUD=68d7ea1848719e7db05b939f96a4382c8c95e4f5eee877676e606c4c1d90daec`
  are already set (user did this manually).
- Cloudflare Access "Managed OAuth" is **on** for the GarminSights app.
  Allowed redirect URIs: `https://claude.ai/*`, `https://claude.com/*`.
  Localhost + loopback toggles are on. Grant session duration: 30d.
- The branch has **not** been merged to `main`. The deploy workflow
  (`.github/workflows/deploy.yml`) only fires on `main`, so `/mcp` is
  not live in production yet. Merging will deploy it.

## Local test loop

```bash
# Backend
cd backend
source venv/bin/activate           # or however you manage venvs
pip install -r requirements.txt    # picks up mcp, PyJWT, httpx
uvicorn app.main:app --reload --port 8000
```

Expected startup log line:
`MCP server mounted at /mcp WITHOUT auth (development mode).`

If you see `Cloudflare Access gate enabled` instead, there's a stale
`CF_ACCESS_TEAM_DOMAIN` in your local `.env` — remove it for dev work.

### Smoke test option A: MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Open the printed URL. Transport: **Streamable HTTP**. Server URL:
`http://localhost:8000/mcp/` (trailing slash matters). Click Connect.
You should see 14 tools. Try `get_personal_records` (no args) — should
return a list (empty if your local SQLite has no strength data).

### Smoke test option B: Claude Code CLI

```bash
claude mcp add --transport http garmin-local http://localhost:8000/mcp/
claude
```

Then ask: `list tools from garmin-local` or `what are my PRs?`.

### Local data

The production SQLite (`fitness.db`) lives on the Fly volume — your
laptop will have an empty or stale DB. Empty results from the tools
still prove the wiring works. For real data locally, run the existing
`POST /api/auth/login` + `POST /api/sync` flow against your local
server first.

## Tools exposed

All in `backend/app/mcp_server.py`. Every tool is read-only.

- Strength: `list_exercises`, `get_strength_sets`, `get_exercise_progress`,
  `get_personal_records`, `get_recent_strength_workouts`,
  `get_volume_by_muscle_group`
- Activities: `list_activities`, `get_activity`
- Wellness: `get_sleep`, `get_sleep_average`, `get_dailies`,
  `get_recovery_status`
- Cycling: `get_cycling_summary`

Adding new tools: decorate a function on `mcp` with `@mcp.tool()`. The
docstring becomes the tool description the LLM sees — keep it action-
oriented. Wrap existing service functions; do not write new SQL in
`mcp_server.py` unless there's no equivalent router/service to reuse.

## Known unresolved questions

- The redirect URI for claude.ai (consumer chat) custom connectors is
  not officially documented. The pattern `https://claude.ai/*` is
  permissive; once we see the actual URI in Cloudflare audit logs after
  a real connection attempt, narrow it to the specific path.
- Multiple open Anthropic GitHub issues describe consumer-chat
  Connectors failing the OAuth flow with custom servers
  (`anthropics/claude-code#46140`, `anthropics/claude-ai-mcp#215`).
  Path of least resistance if consumer chat breaks: use Claude Code on
  the web (claude.ai/code) sessions instead — those are also accessible
  from the Claude mobile app via session resume and use the `.mcp.json`
  mechanism, not the Connectors UI.

## Next steps after local smoke test passes

1. Open a PR for this branch and merge to `main` (triggers Fly deploy).
2. Verify production: hit `https://garminsights.blakebeal.com/mcp` in a
   browser — should redirect to Cloudflare Access login.
3. Build the coach skill in `personal-OS`: add `.mcp.json` pointing at
   `https://garminsights.blakebeal.com/mcp`, plus the skill itself.
4. Optionally also add the server to claude.ai consumer chat via
   Settings → Connectors → Add custom connector → paste the URL.
