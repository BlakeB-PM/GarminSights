"""Coaching policy and saved training plans.

Blake's durable training rules and the programs built with him in conversation
both live in fitness.db so they survive the chat session that produced them.
This module is the only place that reads or writes those two tables; the MCP
tools in mcp_server.py are thin wrappers over these functions.

Two ideas keep the system honest:

* Rules are **typed**, so the model knows how to resolve a conflict. A
  ``constraint`` is binding, a ``preference`` bends when the data argues for it.
* Rules are **retired, never deleted**, so the record of what changed and why
  stays queryable.
"""

import json
import logging
from datetime import datetime

from app.database import execute_query, execute_write

logger = logging.getLogger(__name__)


# Ordered loosely by how binding each type is.
RULE_TYPES = (
    "constraint",   # hard. Never violate.
    "limitation",   # injury or physical restriction. Treated as binding.
    "equipment",    # what's available to program with.
    "target",       # numeric goal to work toward.
    "preference",   # soft. Default to it, deviate only with a stated reason.
    "observation",  # learned pattern. Context, not instruction.
)

RULE_SCOPES = ("strength", "cycling", "cardio", "recovery", "nutrition", "global")

RULE_STATUSES = ("proposed", "active", "retired")

PLAN_STATUSES = ("active", "draft", "archived")

# Soft ceiling on the active rule set. Past this, the model is told to prompt
# for a prune rather than silently accumulating contradictions.
ACTIVE_RULE_SOFT_CAP = 15


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

# Blake's stated defaults, lifted from the `fitness` skill in personal-os. These
# land as source='seed' and status='active' the first time the table is empty.
# Everything after this arrives through conversation.
SEED_RULES: list[dict] = [
    {
        "rule_type": "constraint",
        "scope": "strength",
        "rule": "Strength sessions are capped at 60 minutes. Target 45.",
        "rationale": "Blake's standing default. Sessions that run long don't get done.",
    },
    {
        "rule_type": "constraint",
        "scope": "strength",
        "rule": (
            "Never program barbell squats and deadlifts (or Romanian deadlifts) "
            "in the same session. Split them across separate days."
        ),
        "rationale": "Each needs to be performed fresh to be worth doing.",
    },
    {
        "rule_type": "preference",
        "scope": "strength",
        "rule": (
            "Use antagonist supersets as the primary tool for session density. "
            "Preferred pairings: chest + back, overhead press + lat pulldown/row, "
            "quad isolation + triceps, hamstring/glute + biceps, calves with any "
            "upper body movement."
        ),
        "rationale": "Minimizes interference between movements and keeps the session inside the time cap.",
    },
    {
        "rule_type": "preference",
        "scope": "strength",
        "rule": (
            "Anchor compounds solo. Barbell back squat and Romanian deadlift go "
            "first in the session, rested, and are never superseted. Accessories "
            "are superseted after."
        ),
        "rationale": "Compounds earn full recovery; accessories are where density is bought.",
    },
    {
        "rule_type": "target",
        "scope": "strength",
        "rule": "10 or more sets per muscle group per week.",
        "rationale": "Blake's hypertrophy volume floor.",
    },
    {
        "rule_type": "equipment",
        "scope": "strength",
        "rule": (
            "Home gym: Mikolo power cage with cable attachments, standard barbell "
            "and plates, dumbbells. Garmin watch for tracking."
        ),
        "rationale": "Anything programmed has to be doable with this.",
    },
]


def seed_rules_if_empty() -> int:
    """Insert the seed rules if the table has never been populated.

    Idempotent: returns 0 once any rule exists, so a redeploy never duplicates
    the seed and never resurrects a rule Blake retired.
    """
    existing = execute_query("SELECT COUNT(*) AS c FROM coaching_rules")
    if existing and existing[0]["c"] > 0:
        return 0

    now = _now()
    for r in SEED_RULES:
        execute_write(
            """
            INSERT INTO coaching_rules
                (rule_type, scope, rule, rationale, status, source,
                 created_at, updated_at, confirmed_at)
            VALUES (?, ?, ?, ?, 'active', 'seed', ?, ?, ?)
            """,
            (r["rule_type"], r["scope"], r["rule"], r["rationale"], now, now, now),
        )
    logger.info("Seeded %d coaching rules", len(SEED_RULES))
    return len(SEED_RULES)


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

def _validate_rule_fields(rule_type: str, scope: str) -> str | None:
    if rule_type not in RULE_TYPES:
        return f"Unknown rule_type '{rule_type}'. Use one of: {', '.join(RULE_TYPES)}."
    if scope not in RULE_SCOPES:
        return f"Unknown scope '{scope}'. Use one of: {', '.join(RULE_SCOPES)}."
    return None


def _get_rule(rule_id: int) -> dict | None:
    rows = execute_query("SELECT * FROM coaching_rules WHERE id = ?", (rule_id,))
    return rows[0] if rows else None


def list_rules(
    rule_type: str | None = None,
    scope: str | None = None,
    status: str = "active",
) -> list[dict]:
    """Return rules filtered by type/scope/status. status='all' returns everything."""
    where: list[str] = []
    params: list = []

    if status != "all":
        where.append("status = ?")
        params.append(status)
    if rule_type:
        where.append("rule_type = ?")
        params.append(rule_type)
    if scope:
        where.append("scope = ?")
        params.append(scope)

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    return execute_query(
        f"""
        SELECT id, rule_type, scope, rule, rationale, status, source,
               supersedes_id, retired_reason, created_at, updated_at,
               confirmed_at, retired_at
        FROM coaching_rules
        {clause}
        ORDER BY CASE rule_type
                     WHEN 'constraint'  THEN 1
                     WHEN 'limitation'  THEN 2
                     WHEN 'equipment'   THEN 3
                     WHEN 'target'      THEN 4
                     WHEN 'preference'  THEN 5
                     ELSE 6
                 END,
                 updated_at DESC
        """,
        tuple(params),
    )


def propose_rule(
    rule: str,
    rule_type: str,
    scope: str = "strength",
    rationale: str | None = None,
    supersedes_id: int | None = None,
) -> dict:
    """Record a candidate rule as status='proposed'. It does not take effect
    until confirm_rule() is called."""
    rule = (rule or "").strip()
    if not rule:
        return {"error": "rule text is required."}

    err = _validate_rule_fields(rule_type, scope)
    if err:
        return {"error": err}

    if supersedes_id is not None and _get_rule(supersedes_id) is None:
        return {"error": f"supersedes_id {supersedes_id} does not exist."}

    now = _now()
    rule_id = execute_write(
        """
        INSERT INTO coaching_rules
            (rule_type, scope, rule, rationale, status, source,
             supersedes_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'proposed', 'learned', ?, ?, ?)
        """,
        (rule_type, scope, rule, rationale, supersedes_id, now, now),
    )
    return {
        "proposed": _get_rule(rule_id),
        "next_step": (
            "Show this to Blake and ask whether to keep it. Call "
            f"confirm_rule({rule_id}) if yes, retire_rule({rule_id}, reason) if no."
        ),
    }


def confirm_rule(rule_id: int) -> dict:
    """Promote a proposed rule to active. If it supersedes another rule, the
    superseded rule is retired in the same step."""
    existing = _get_rule(rule_id)
    if existing is None:
        return {"error": f"No rule with id {rule_id}."}
    if existing["status"] == "active":
        return {"unchanged": existing, "note": "Rule was already active."}

    now = _now()
    execute_write(
        """
        UPDATE coaching_rules
        SET status = 'active', confirmed_at = ?, updated_at = ?,
            retired_at = NULL, retired_reason = NULL
        WHERE id = ?
        """,
        (now, now, rule_id),
    )

    retired = None
    if existing["supersedes_id"]:
        execute_write(
            """
            UPDATE coaching_rules
            SET status = 'retired', retired_at = ?, updated_at = ?,
                retired_reason = ?
            WHERE id = ? AND status != 'retired'
            """,
            (now, now, f"Superseded by rule {rule_id}.", existing["supersedes_id"]),
        )
        retired = _get_rule(existing["supersedes_id"])

    out: dict = {"confirmed": _get_rule(rule_id)}
    if retired:
        out["retired"] = retired

    active_count = len(list_rules(status="active"))
    if active_count > ACTIVE_RULE_SOFT_CAP:
        out["warning"] = (
            f"{active_count} active rules, above the soft cap of {ACTIVE_RULE_SOFT_CAP}. "
            "Run review_rules and offer Blake a prune."
        )
    return out


def update_rule(
    rule_id: int,
    rule: str | None = None,
    rule_type: str | None = None,
    scope: str | None = None,
    rationale: str | None = None,
) -> dict:
    """Edit a rule in place. Use this for wording fixes. When the substance of a
    rule changes, prefer propose_rule(supersedes_id=...) so the history survives."""
    existing = _get_rule(rule_id)
    if existing is None:
        return {"error": f"No rule with id {rule_id}."}

    err = _validate_rule_fields(
        rule_type or existing["rule_type"], scope or existing["scope"]
    )
    if err:
        return {"error": err}

    execute_write(
        """
        UPDATE coaching_rules
        SET rule = ?, rule_type = ?, scope = ?, rationale = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            (rule or existing["rule"]).strip(),
            rule_type or existing["rule_type"],
            scope or existing["scope"],
            rationale if rationale is not None else existing["rationale"],
            _now(),
            rule_id,
        ),
    )
    return {"updated": _get_rule(rule_id)}


def retire_rule(rule_id: int, reason: str) -> dict:
    """Retire a rule. Nothing is deleted; retired rules stay queryable."""
    existing = _get_rule(rule_id)
    if existing is None:
        return {"error": f"No rule with id {rule_id}."}

    now = _now()
    execute_write(
        """
        UPDATE coaching_rules
        SET status = 'retired', retired_at = ?, updated_at = ?, retired_reason = ?
        WHERE id = ?
        """,
        (now, now, (reason or "").strip() or None, rule_id),
    )
    return {"retired": _get_rule(rule_id)}


def review_rules() -> dict:
    """Surface the active rule set for pruning: anything stale, still pending
    Blake's confirmation, or overlapping another rule in the same type+scope."""
    active = list_rules(status="active")
    proposed = list_rules(status="proposed")

    stale = [
        r for r in active
        if r["updated_at"] and r["updated_at"] < (
            datetime.now().replace(year=datetime.now().year - 1).strftime("%Y-%m-%d %H:%M:%S")
        )
    ]

    # Two rules of the same type and scope may be fighting. This is a prompt for
    # a human read, not a claim that they actually conflict.
    buckets: dict[tuple[str, str], list[dict]] = {}
    for r in active:
        buckets.setdefault((r["rule_type"], r["scope"]), []).append(r)
    overlapping = [
        {"rule_type": k[0], "scope": k[1], "rules": v}
        for k, v in buckets.items() if len(v) > 1
    ]

    return {
        "active_count": len(active),
        "soft_cap": ACTIVE_RULE_SOFT_CAP,
        "over_cap": len(active) > ACTIVE_RULE_SOFT_CAP,
        "awaiting_confirmation": proposed,
        "not_touched_in_a_year": stale,
        "same_type_and_scope": overlapping,
        "note": (
            "Overlap is a prompt to read, not a detected conflict. Ask Blake "
            "before retiring anything."
        ),
    }


# ---------------------------------------------------------------------------
# Training plans
# ---------------------------------------------------------------------------

PLAN_SHAPE = {
    "days": [
        {
            "day": "Monday (or 'Day 1')",
            "focus": "e.g. Lower (squat anchor)",
            "blocks": [
                {
                    "type": "straight | superset",
                    "exercises": [
                        {
                            "name": "Barbell Back Squat",
                            "sets": 4,
                            "reps": "5-8",
                            "notes": "optional",
                        }
                    ],
                }
            ],
        }
    ]
}

# Movements that must not share a session, per Blake's standing constraint.
_SQUAT_PATTERN = ("squat",)
_HINGE_PATTERN = ("deadlift", "romanian")


def _validate_plan(plan: dict) -> str | None:
    if not isinstance(plan, dict):
        return "plan must be an object with a 'days' list."
    days = plan.get("days")
    if not isinstance(days, list) or not days:
        return "plan.days must be a non-empty list."
    for i, day in enumerate(days):
        if not isinstance(day, dict):
            return f"plan.days[{i}] must be an object."
        if not day.get("day"):
            return f"plan.days[{i}] needs a 'day' label."
        blocks = day.get("blocks")
        if not isinstance(blocks, list) or not blocks:
            return f"plan.days[{i}].blocks must be a non-empty list."
        for j, block in enumerate(blocks):
            if not isinstance(block, dict):
                return f"plan.days[{i}].blocks[{j}] must be an object."
            exercises = block.get("exercises")
            if not isinstance(exercises, list) or not exercises:
                return f"plan.days[{i}].blocks[{j}].exercises must be a non-empty list."
            for k, ex in enumerate(exercises):
                if not isinstance(ex, dict) or not ex.get("name"):
                    return f"plan.days[{i}].blocks[{j}].exercises[{k}] needs a 'name'."
    return None


def _day_exercise_names(day: dict) -> list[str]:
    names: list[str] = []
    for block in day.get("blocks", []):
        for ex in block.get("exercises", []):
            name = ex.get("name")
            if name:
                names.append(str(name).lower())
    return names


def check_plan_against_rules(plan: dict) -> list[str]:
    """Check a plan against the constraints that are structurally checkable.

    Only the squat/hinge separation rule can be verified from the plan shape
    alone. Session length, volume targets, and pairing quality still need a
    human read, so this deliberately reports little rather than pretending to
    validate everything.
    """
    warnings: list[str] = []
    for day in plan.get("days", []):
        names = _day_exercise_names(day)
        has_squat = any(any(p in n for p in _SQUAT_PATTERN) for n in names)
        has_hinge = any(any(p in n for p in _HINGE_PATTERN) for n in names)
        if has_squat and has_hinge:
            warnings.append(
                f"{day.get('day')}: contains both a squat and a deadlift/RDL pattern, "
                "which violates the squat/hinge separation constraint."
            )
    return warnings


def _row_to_plan(row: dict) -> dict:
    out = dict(row)
    try:
        out["plan"] = json.loads(row["plan_json"])
    except (TypeError, ValueError):
        out["plan"] = None
    out.pop("plan_json", None)
    return out


def _get_plan(plan_id: int) -> dict | None:
    rows = execute_query("SELECT * FROM training_plans WHERE id = ?", (plan_id,))
    return _row_to_plan(rows[0]) if rows else None


def get_active_plan() -> dict | None:
    rows = execute_query("SELECT * FROM training_plans WHERE status = 'active' LIMIT 1")
    return _row_to_plan(rows[0]) if rows else None


def list_plans(include_archived: bool = False) -> list[dict]:
    clause = "" if include_archived else "WHERE status != 'archived'"
    rows = execute_query(
        f"""
        SELECT id, name, goal, status, days_per_week, starts_on, ends_on,
               notes, archived_reason, created_at, updated_at, archived_at
        FROM training_plans
        {clause}
        ORDER BY CASE status WHEN 'active' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
                 updated_at DESC
        """
    )
    return rows


def save_plan(
    name: str,
    plan: dict,
    goal: str | None = None,
    days_per_week: int | None = None,
    starts_on: str | None = None,
    ends_on: str | None = None,
    notes: str | None = None,
    status: str = "active",
) -> dict:
    """Save a program built in conversation. Saving a new active plan archives
    whichever plan was active before, so there is always exactly one."""
    name = (name or "").strip()
    if not name:
        return {"error": "name is required."}
    if status not in PLAN_STATUSES:
        return {"error": f"Unknown status '{status}'. Use one of: {', '.join(PLAN_STATUSES)}."}

    shape_error = _validate_plan(plan)
    if shape_error:
        return {"error": shape_error, "expected_shape": PLAN_SHAPE}

    warnings = check_plan_against_rules(plan)

    now = _now()
    previous = None
    if status == "active":
        current = get_active_plan()
        if current:
            execute_write(
                """
                UPDATE training_plans
                SET status = 'archived', archived_at = ?, updated_at = ?,
                    archived_reason = ?
                WHERE id = ?
                """,
                (now, now, f"Replaced by '{name}'.", current["id"]),
            )
            previous = {"id": current["id"], "name": current["name"]}

    if days_per_week is None:
        days_per_week = len(plan.get("days", []))

    plan_id = execute_write(
        """
        INSERT INTO training_plans
            (name, goal, status, days_per_week, starts_on, ends_on,
             plan_json, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            name, goal, status, days_per_week, starts_on, ends_on,
            json.dumps(plan), notes, now, now,
        ),
    )

    out: dict = {"saved": _get_plan(plan_id)}
    if previous:
        out["archived_previous"] = previous
    if warnings:
        out["rule_warnings"] = warnings
        out["note"] = "Plan was saved. Raise these warnings with Blake."
    return out


def update_plan(
    plan_id: int,
    name: str | None = None,
    plan: dict | None = None,
    goal: str | None = None,
    days_per_week: int | None = None,
    starts_on: str | None = None,
    ends_on: str | None = None,
    notes: str | None = None,
) -> dict:
    """Revise a saved plan in place. Pass only the fields that change."""
    existing = _get_plan(plan_id)
    if existing is None:
        return {"error": f"No plan with id {plan_id}."}

    warnings: list[str] = []
    if plan is not None:
        shape_error = _validate_plan(plan)
        if shape_error:
            return {"error": shape_error, "expected_shape": PLAN_SHAPE}
        warnings = check_plan_against_rules(plan)
        plan_json = json.dumps(plan)
    else:
        plan_json = json.dumps(existing["plan"])

    execute_write(
        """
        UPDATE training_plans
        SET name = ?, goal = ?, days_per_week = ?, starts_on = ?, ends_on = ?,
            plan_json = ?, notes = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            (name or existing["name"]).strip(),
            goal if goal is not None else existing["goal"],
            days_per_week if days_per_week is not None else existing["days_per_week"],
            starts_on if starts_on is not None else existing["starts_on"],
            ends_on if ends_on is not None else existing["ends_on"],
            plan_json,
            notes if notes is not None else existing["notes"],
            _now(),
            plan_id,
        ),
    )

    out: dict = {"updated": _get_plan(plan_id)}
    if warnings:
        out["rule_warnings"] = warnings
    return out


def archive_plan(plan_id: int, reason: str | None = None) -> dict:
    existing = _get_plan(plan_id)
    if existing is None:
        return {"error": f"No plan with id {plan_id}."}

    now = _now()
    execute_write(
        """
        UPDATE training_plans
        SET status = 'archived', archived_at = ?, updated_at = ?, archived_reason = ?
        WHERE id = ?
        """,
        (now, now, (reason or "").strip() or None, plan_id),
    )
    return {"archived": _get_plan(plan_id)}


# ---------------------------------------------------------------------------
# Assembled context
# ---------------------------------------------------------------------------

def get_context() -> dict:
    """Everything the model needs before programming: the active rule set grouped
    by type, the active plan, and anything still awaiting Blake's confirmation."""
    active = list_rules(status="active")

    grouped: dict[str, list[dict]] = {}
    for r in active:
        grouped.setdefault(r["rule_type"], []).append(
            {"id": r["id"], "scope": r["scope"], "rule": r["rule"], "why": r["rationale"]}
        )

    plan = get_active_plan()
    proposed = list_rules(status="proposed")

    out: dict = {
        "how_to_apply": {
            "constraint": "Binding. Do not violate. Say so if Blake asks for something that would.",
            "limitation": "Binding. Physical restriction, program around it.",
            "equipment": "Bounds what can be programmed at all.",
            "target": "Work toward it. Call out when a plan falls short.",
            "preference": "Default to it. Deviating is fine with a stated reason.",
            "observation": "Context Blake taught you. Weigh it, don't obey it.",
        },
        "rules": grouped,
        "active_rule_count": len(active),
        "active_plan": plan,
        "capture_reminder": (
            "If Blake states a durable preference or corrects your programming in "
            "this conversation, call propose_rule so it survives the session."
        ),
    }
    if proposed:
        out["awaiting_confirmation"] = [
            {"id": r["id"], "rule": r["rule"], "rule_type": r["rule_type"]} for r in proposed
        ]
    if not plan:
        out["active_plan_note"] = (
            "No saved plan. If you build a program with Blake, call save_training_plan "
            "so he doesn't have to rebuild it next session."
        )
    return out
