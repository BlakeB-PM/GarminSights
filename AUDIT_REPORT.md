# GarminSights — Comprehensive App Audit

**Date:** 2026-07-15 · **Scope:** full backend (FastAPI/SQLite), full frontend (React/Recharts), data pipeline, AI coach, UX & visualizations. **No code was changed** — this is findings + a prioritized improvement plan.

---

## Executive summary

GarminSights has a strong foundation: a clean sync pipeline, a rich set of analytics endpoints, a thoughtful dashboard information hierarchy, and an unusually good MCP surface for AI querying. But the audit found that **several visible features are silently broken in production today** (Activity Breakdown card, all Strength drill-downs, cycling cadence analysis, power-curve comparison), largely because the build pipeline never type-checks (`vite build` only — `tsc -b` currently reports **347 errors**) and there are **zero automated tests**. A second tier of issues makes *numbers lie*: the ACWR training-load ratio is mathematically wrong by ~7×, bodyweight work is invisible everywhere, the AI coach is fed a bogus FTP estimate, and the muscle-group mapper mis-attributes common barbell lifts.

Fixing the P0 list below would restore ~4 already-built features without designing anything new. The P1 list makes the analytics trustworthy. The roadmap section then focuses on what would elevate this from a "charts app" to an **insights app**: an automated insights feed, a real readiness/ACWR model, a coach with conversation memory + tool access, and surfacing data you already store but never show (rest times, rep ranges, intensity-minute goals).

---

## P0 — Broken features (users hit these today)

### P0.1 Route shadowing kills `/breakdown` and `/training-load` (verified)
`backend/app/routers/activities.py` registers `GET /{activity_id}` (line 124) **before** `GET /dashboard/summary` (167), `GET /training-load` (219), and `GET /breakdown` (368). Starlette matches routes in registration order, so `/api/activities/breakdown` and `/api/activities/training-load` are captured by `/{activity_id}` and fail int-validation → **422 for every request**. Reproduced with a minimal FastAPI app using the same ordering.

- **User impact:** the Dashboard's *Activity Breakdown* card always renders its empty state (`Dashboard.tsx:140` swallows the error with `.catch(() => null)`); training load is unreachable.
- **Fix:** move all static paths above the `/{activity_id}` route (a 5-line reorder).

### P0.2 Every strength drill-down is broken (chart click-throughs)
`StrengthAnalytics.tsx:353,369` call `getDrillDownData(params)` with a filter **object** (`{week_start, week_end, muscle_group, activity_type, date_range_start…}`), but `lib/api.ts:693` declares `getDrillDownData(muscleGroup: string, weekStart: string)`. At runtime the request becomes `?muscle_group=[object Object]&week_start=undefined` → 422. So the flagship interaction of the Strength Lab — click any bar/point to see the underlying workouts — **never works** (tsc flags this: *"Expected 2 arguments, but got 1"*).
- Even with a correct client, the api function never sends `week_end`, which the backend requires alongside `week_start` (`strength.py:950-960`) — and that failure path `raise ValueError` returns a **500**, not a 422.
- **Fix:** rewrite `getDrillDownData` to accept the params object; make the backend raise `HTTPException(422)`.

### P0.3 Cycling cadence analysis calls a nonexistent endpoint
`lib/api.ts:790` requests `/api/cycling/cadence`; the backend route is `/api/cycling/cadence-analysis` (`cycling.py:523`). In production the SPA catch-all (`main.py:136-143`) returns **index.html with HTTP 200** for the unknown API path, so the client fails on JSON parsing and the cadence card shows an error.
- **Fix:** correct the path; **also** make the SPA catch-all return 404 for any unmatched `/api/*` path — returning HTML for API routes masks this whole class of bug.

### P0.4 Power-curve comparison silently never loads
`lib/api.ts:777` sends `comparison_weeks=4`; the backend parameter is `compare_weeks_back` (`cycling.py:251`). FastAPI ignores the unknown query param, `comparison` is never included, and the "4 Weeks Ago" series (`CyclingAnalytics.tsx:669-670`) never renders. A whole built feature that no one sees.

### P0.5 The Training Load card is dead code — and its math is wrong anyway
`TrainingLoadCard.tsx` + `getTrainingLoad()` are **never rendered/called anywhere**. If wired up, the endpoint's ACWR math is broken: acute load is a **7-day total** while chronic load is a **28-day daily average** (`activities.py:308-337`), so a steady trainer gets a ratio ≈ 7 and lands in "danger. High injury risk." permanently (thresholds 0.8–1.5 assume like units). Custom date ranges make it worse — the ratio scales with the range length.
- **Fix:** compare like units (acute daily avg ÷ chronic daily avg, or 7-day total ÷ trailing 28-day weekly average), pin acute to 7 days regardless of the dashboard range, then render the card on the Dashboard. This is one of the highest-value "insights" in the codebase and it's currently unreachable and wrong.

### P0.6 No type-check, no tests, no CI gate
- `frontend/package.json` build is `vite build` (esbuild strips types without checking). `npx tsc -b` → **347 errors**, including P0.2 and eight `TimeFrameSelector type=...` prop errors in CyclingAnalytics.
- The only workflow (`.github/workflows/deploy.yml`) deploys straight to Fly on push to main — no typecheck, no lint, no tests. There are **no test files anywhere** in the repo.
- **Fix:** `"build": "tsc -b && vite build"`, add a CI job (typecheck + lint + a handful of API tests with FastAPI's TestClient — the route-shadowing bug would have been caught by a one-line test).

### P0.7 Backend error-shape bugs
- `GET /api/activities/{id}` returns `{"error": "Activity not found"}` under `response_model=ActivityWithSets` → Pydantic validation failure → **500** instead of 404 (`activities.py:132-133`).
- `/api/strength/muscle-comparison` and `/drill-down` `raise ValueError` for bad input → **500** instead of 422 (`strength.py:844-848,960`).

### P0.8 Drill-down variable shadowing (latent, must fix with P0.2)
In `/api/strength/drill-down`, the loop `exercise_name = s.get("exercise_name")` (`strength.py:1032`) **overwrites the `exercise_name` query parameter**. When filtering by muscle group, every activity after the first gets an unintended `AND ss.exercise_name = <last exercise of previous activity>` filter — wrong results. Rename the loop variable.

---

## P1 — Correctness: numbers that lie

1. **Bodyweight work is invisible.** Every strength query filters `weight_lbs > 0`, so pull-ups, dips, push-ups, planks contribute nothing to volume, frequency, balance, PRs, or the coach's context. For a fitness insights app this is a big blind spot. Options: count sets/reps for zero-weight exercises (frequency/balance already count sets), or let the user enter bodyweight and estimate load.
2. **Muscle mapping mis-attributes common lifts.** `COMPOUND_EXERCISES` is an exact-string dict, so real Garmin names ("Barbell Romanian Deadlift", "Dumbbell Bench Press") miss it and fall to keyword matching, where **primary = first matching group in dict order**. "Barbell Romanian Deadlift" → primary **Back** (should be Hamstrings). Also, full set volume is added to *every* matched group (`strength.py:236-259`), so per-group volumes sum to well over the real total with no note in the UI. Recommend: substring matching for compounds, and either primary-only volume or explicit fractional attribution.
3. **The AI coach quotes a bogus FTP.** `coach_service.py:349-354` estimates FTP as *best average ride power × 0.95*. That's not FTP (a 20-minute hard ride avg vs a 3-hour endurance ride avg are incomparable). The cycling router already has the correct best-20-min-power method — reuse it, or let the user set FTP in Settings and use that everywhere (power zones, IF, coach).
4. **Epley 1RM at any rep count.** `weight × (1 + reps/30)` is applied to 15–20+ rep sets, inflating e1RMs and PRs (a 20-rep set of 100 lb → 167 lb "1RM"). Standard practice: cap the formula at ≤10–12 reps or fall back to max-weight.
5. **Rest rows contaminate workout summaries.** `strength_sets` stores rest periods as `exercise_name='Rest'`; `/api/strength/recent-workouts` counts them in `total_sets` and `exercise_count` (`strength.py:180-204`). The dashboard's "recent workouts" set counts are inflated.
6. **Dashboard stat bugs** (`Dashboard.tsx`):
   - "Avg Sleep" display value has an operator-precedence bug — `sum / count || 1` shows **1** when a period has sleep rows but no scores (line 311-317; the `scoreValue` two lines below has the correct parens).
   - "Avg Body Batt" is labeled as an average but shows **the most recent day's peak** (line 339-346).
7. **Recovery score fragility.** `/api/wellness/recovery` grades "today's" row, which is usually partial (body battery high still climbing), and substitutes stress=50 when missing. Grade the most recent *complete* day, and say which day is being graded in the UI.
8. **Cadence "distribution" is per-ride averages,** not time-in-cadence (`cycling.py:560-576`) — a 3-hour ride and a 20-minute ride each contribute one point. Either label it honestly ("ride-average cadence") or weight by duration (the data for time-weighted is already collected).
9. **Timezone drift.** Activities store `startTimeLocal` naïvely while all "last N days" cutoffs use server `datetime.now()` (UTC on Fly). Near midnight, "today" in queries and the user's day disagree; the dashboard week (computed client-side) is fine because dates are passed explicitly. Standardize on user-local dates, or at least document the convention.
10. **`/dashboard/summary` default is 8 days,** not 7 (`today - 7` through today inclusive), so "weekly steps" over-counts by a day when no range is passed.

---

## P2 — Engineering hygiene

- **Sync performance:** every sync re-fetches all `days_back` sleep + daily days (2×30 API calls) even when rows exist and are complete; `key-lifts` runs ~50 sequential SQL queries per page view (5 per exercise × 10). Both are easy consolidations.
- **`INSERT OR REPLACE`** on sleep/dailies churns primary keys each sync (harmless today, will break foreign keys later). Prefer `ON CONFLICT ... DO UPDATE`.
- **Dead/leftover code:** `TrainingLoadCard` + `getTrainingLoad` (unused), `frontend/fix-api.js` (a one-off codegen patch script that should be deleted), ~40 unused imports flagged by tsc, `PRD GarminSights.md` is empty.
- **Docs drift:** README says the coach uses `claude-sonnet-4-20250514` and "streams" responses — the code pins `claude-sonnet-4-6` (valid) and does not stream. README schema omits the stress-duration columns added by migrations.
- **Security (acceptable for single-user, worth noting):** `APP_SECRET_KEY` accepted as `?token=` query param (leaks into access logs); `/api/chat/test` echoes the Anthropic key prefix; MCP `run_sql` is properly read-only-guarded behind the secret path — good.

---

## UX & visualization review

### Dashboard
**Working well:** the three-tier structure (live snapshot → date-ranged period stats → fixed-window long-term views) is genuinely good, and each card labels its window. Recovery banner + 4 stat tiles is the right "glance" layer.

**Issues / changes:**
- The **broken Activity Breakdown** (P0.1) and **missing Training Load** (P0.5) leave the dashboard without its two most "insight-like" cards.
- Mixed time-scopes still confuse: the heatmap is always 30 days and Strength-Cardio Balance always 12 weeks inside a section controlled by the date selector. Suggest visually separating "period" cards from "fixed-window" cards (or making all respect the selector).
- The Strength-Cardio Balance bar chart stacks strength on `stackId="a"` and cardio on `"b"` — side-by-side pairs read ambiguously; a single stacked bar (strength/zone2/VO2) or grouped bars with clearer legend would read better. VO2-vs-Zone2 classification is keyword-based on activity *names* ("interval", "hiit") — most rides/runs will never match; consider HR-zone data (already in `raw_json`) instead.
- Sleep & HRV trends are fixed 30-day windows with hard-coded colors; fine, but HRV would benefit from a 7-day rolling baseline band (the single most useful HRV visualization) rather than a raw line.

### Strength Lab
A 1,900-line single page with ~8 stacked sections. Content is strong (volume trends with WoW deltas, key-lift cards with plateau detection, frequency, radar balance) but:
- **Drill-down is broken everywhere** (P0.2) — restoring it transforms the page.
- Convert the long scroll into **tabs or sub-nav** (Overview / Volume / Balance / Lifts).
- The muscle-volume **pie chart with 10 slices** is hard to read and double-counts volume (P1.2); a sorted horizontal bar with sets + volume is strictly better.
- The 10-line muscle-comparison chart is unreadable in "individual" mode; default to the Upper/Lower or Body Regions views.
- **Rep-range analysis exists in the backend (`rep_ranges.py`) and rest-time data is already stored (`Rest` rows), but neither appears in the UI.** Heavy/moderate/light split per muscle group, and average rest per exercise, are high-value additions with zero new data collection.
- No PR timeline: PRs table shows all-time bests but nothing celebrates *new* PRs. A "PRs this month" strip (data already computable) adds delight.

### Cycling Analytics
- **Power curve is rendered as grouped bars.** The standard, and far more legible, form is a **line on a log-scaled duration axis** (1s → 30min), with the comparison period as a second line — especially once P0.4 restores comparison data.
- FTP is re-estimated from whatever window is selected, so zones/IF silently drift between views. Add a **user-set FTP (Settings)** with "estimated from best 20-min: X" as a hint; use one FTP everywhere.
- Cadence card: fix endpoint (P0.3), then either time-weight it or relabel (P1.8).
- Sleep→performance scatter with correlation coefficient is a great differentiator — extend the same pattern to strength (sleep vs e1RM/volume) for a cross-domain insight.

### AI Coach
- **No conversation memory:** only the latest message is sent (`Coach.tsx:149`, `chat.py`), so "what about bench?" follow-ups get answered contextlessly even though the UI *displays* a persistent thread — a UX contradiction. Send the last N turns.
- **No streaming:** long waits with a spinner; the README even claims streaming. Stream via SSE (the coach service already uses `AsyncAnthropic`).
- **Context window mismatch:** context is 7 days by default, but the suggested prompts ask about "this month" and progression — the model will correctly answer "your data doesn't include that." Add a context-range selector (7/30/90d) or, better, replace the static context blob with **tool use against the existing MCP tools** so the model fetches exactly what each question needs (the tools are already written!).
- The `preprocessMarkdown` table-repair hack treats a symptom; with streaming + tables rendered from real data via tools, it can go.

### Activity Log / Data Viewer
- ActivityDetailView is the file with the most type errors (its props assume parsed-metric fields that the `Activity` type doesn't declare) — it works only by accident of `Record<string, unknown>` merging. Type the detail response properly.
- Data Viewer duplicates Activity Log's job for raw records; consider merging into one "History" page with a raw-data toggle.

---

## Recommended plan, in priority order

**Phase 1 — Restore what's already built (small diffs, big wins)**
1. Reorder activities routes (P0.1) → Activity Breakdown card works again.
2. Fix `getDrillDownData` client + backend `week_end`/error codes + variable shadowing (P0.2/0.7/0.8) → all Strength click-throughs work.
3. Fix cadence path + power-curve param name; 404 unknown `/api/*` in the SPA catch-all (P0.3/0.4).
4. Add `tsc -b` to build & CI; burn down the 347 type errors starting with the real bugs; add TestClient smoke tests for every route (P0.6).

**Phase 2 — Make the numbers trustworthy**
5. Fix ACWR units and ship the Training Load card on the dashboard (P0.5).
6. FTP: user-set value in Settings, single source of truth for zones/IF/coach (P1.3).
7. Cap Epley reps; exclude Rest rows from workout summaries; fix the two dashboard stat bugs; recovery uses last complete day (P1.4–1.7).
8. Muscle mapping: substring compound matching + primary-only (or fractional) volume; count bodyweight sets (P1.1–1.2).

**Phase 3 — Become an *insights* app (new value)**
9. **Insights feed** on the dashboard: auto-generated, data-backed callouts — new PRs, HRV vs 7/28-day baseline deviations, load-ratio warnings, streaks, "chest volume down 40% for 3 weeks." Most inputs already exist as endpoints; this is composition + copy.
10. **Daily readiness recommendation** combining the (fixed) ACWR + recovery score: "Green day — good day for intervals or a heavy lower session."
11. **Coach v2:** conversation history, streaming, and tool-calling against the MCP tool set; optional weekly summary generated on a schedule.
12. **Surface stored-but-hidden data:** rest-time analysis and rep-range mix in Strength Lab; intensity-minutes vs the 150-min/week goal (goal field is already synced) as a dashboard ring.
13. **Cross-domain correlations:** generalize the sleep↔cycling scatter to sleep↔strength and stress↔training volume.
14. **Broader sport coverage:** running/walking currently get no analytics page despite pace/HR data sitting in `raw_json` — even a minimal pace-trend view closes the gap.

**Phase 4 — Polish**
15. Power curve → log-axis line chart; muscle pie → sorted bars; comparison chart defaults to aggregated views; Strength Lab tabbed layout.
16. Sync performance (skip complete days, batch key-lifts SQL), `ON CONFLICT DO UPDATE`, delete dead code (`fix-api.js`, unused card/function), refresh README, write the PRD.

---

*Verification notes: route shadowing reproduced against FastAPI with the exact route ordering; type errors from `npx tsc -b` (347 lines); endpoint mismatches confirmed by cross-referencing `lib/api.ts` against router definitions; no automated tests exist in the repository.*
