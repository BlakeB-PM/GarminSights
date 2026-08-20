"""Coaching policy and Blake's routine library.

His durable training rules and the sessions he likes both live in fitness.db so
they survive the chat that produced them. This module is the only place that
reads or writes those two tables; the MCP tools in mcp_server.py are thin
wrappers over these functions.

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
        "rule_type": "preference",
        "scope": "strength",
        "rule": (
            "Blake trains week to week, not to a fixed weekly schedule. Suggest "
            "sessions from his saved routine library and adapt to the time he "
            "actually has, rather than building multi-week programs with days "
            "assigned to them."
        ),
        "rationale": "His week is too unpredictable to hold a schedule. Stated 2026-08-20.",
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
# Training routines
# ---------------------------------------------------------------------------
#
# A routine is one session Blake likes and reuses, not a day in a schedule.
# His week is unpredictable, so the library holds several active routines and
# he picks one based on the time he has and what needs volume. There is
# deliberately no calendar here and no adherence tracking.

ROUTINE_FOCUSES = (
    "upper", "lower", "full", "push", "pull", "accessory", "conditioning",
)

ROUTINE_STATUSES = ("active", "archived")

BLOCK_TYPES = ("straight", "superset")

# Mirrors the seeded session-length constraint. Kept as a constant so
# check_routine_against_rules can flag a routine that busts the cap.
SESSION_MINUTES_CAP = 60

BLOCKS_SHAPE = [
    {
        "type": "straight | superset",
        "exercises": [
            {
                "name": "Barbell Bench Press",
                "sets": 4,
                "reps": "6-8",
                "notes": "optional",
            }
        ],
    }
]

# Movements that must not share a session, per Blake's standing constraint.
_SQUAT_PATTERN = ("squat",)
_HINGE_PATTERN = ("deadlift", "romanian")


def _validate_blocks(blocks: list) -> str | None:
    if not isinstance(blocks, list) or not blocks:
        return "blocks must be a non-empty list."
    for i, block in enumerate(blocks):
        if not isinstance(block, dict):
            return f"blocks[{i}] must be an object."
        btype = block.get("type", "straight")
        if btype not in BLOCK_TYPES:
            return f"blocks[{i}].type must be one of: {', '.join(BLOCK_TYPES)}."
        exercises = block.get("exercises")
        if not isinstance(exercises, list) or not exercises:
            return f"blocks[{i}].exercises must be a non-empty list."
        if btype == "superset" and len(exercises) < 2:
            return (
                f"blocks[{i}] is typed 'superset' but has one exercise. "
                "Use type 'straight' for a solo movement."
            )
        for j, ex in enumerate(exercises):
            if not isinstance(ex, dict) or not ex.get("name"):
                return f"blocks[{i}].exercises[{j}] needs a 'name'."
    return None


def _block_exercise_names(blocks: list) -> list[str]:
    names: list[str] = []
    for block in blocks:
        for ex in block.get("exercises", []):
            name = ex.get("name")
            if name:
                names.append(str(name).lower())
    return names


def check_routine_against_rules(
    blocks: list, estimated_minutes: int | None = None
) -> list[str]:
    """Check a routine against the constraints that are structurally checkable.

    Only two of Blake's rules can be verified without a human read: squat/hinge
    separation, and the session length cap when an estimate is supplied. Volume
    targets and pairing quality still need judgment, so this deliberately
    reports little rather than pretending to validate everything.
    """
    warnings: list[str] = []

    names = _block_exercise_names(blocks)
    has_squat = any(any(p in n for p in _SQUAT_PATTERN) for n in names)
    has_hinge = any(any(p in n for p in _HINGE_PATTERN) for n in names)
    if has_squat and has_hinge:
        warnings.append(
            "Contains both a squat and a deadlift/RDL pattern in one session, "
            "which violates the squat/hinge separation constraint."
        )

    if estimated_minutes and estimated_minutes > SESSION_MINUTES_CAP:
        warnings.append(
            f"Estimated at {estimated_minutes} minutes, over the "
            f"{SESSION_MINUTES_CAP} minute session cap."
        )

    return warnings


def _row_to_routine(row: dict) -> dict:
    out = dict(row)
    try:
        out["blocks"] = json.loads(row["blocks_json"])
    except (TypeError, ValueError):
        out["blocks"] = None
    out.pop("blocks_json", None)
    return out


def _get_routine(routine_id: int) -> dict | None:
    rows = execute_query("SELECT * FROM training_routines WHERE id = ?", (routine_id,))
    return _row_to_routine(rows[0]) if rows else None


def get_routine(routine_id: int) -> dict | None:
    return _get_routine(routine_id)


def list_routines(
    focus: str | None = None,
    max_minutes: int | None = None,
    include_archived: bool = False,
) -> list[dict]:
    """List routines with their full block structure.

    max_minutes filters to routines that fit a window of time. Routines with no
    estimate are always included, since an unknown length is not a known
    overrun and Blake can judge it himself.
    """
    where: list[str] = []
    params: list = []

    if not include_archived:
        where.append("status = 'active'")
    if focus:
        where.append("focus = ?")
        params.append(focus)
    if max_minutes is not None:
        where.append("(estimated_minutes IS NULL OR estimated_minutes <= ?)")
        params.append(max_minutes)

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = execute_query(
        f"""
        SELECT * FROM training_routines
        {clause}
        ORDER BY CASE status WHEN 'active' THEN 1 ELSE 2 END, updated_at DESC
        """,
        tuple(params),
    )
    return [_row_to_routine(r) for r in rows]


def save_routine(
    name: str,
    blocks: list,
    focus: str = "full",
    goal: str | None = None,
    estimated_minutes: int | None = None,
    notes: str | None = None,
) -> dict:
    """Add a routine to the library.

    Saving does not displace anything. The library is meant to hold several
    routines at once, so revise an existing one with update_routine rather than
    saving a near-duplicate.
    """
    name = (name or "").strip()
    if not name:
        return {"error": "name is required."}
    if focus not in ROUTINE_FOCUSES:
        return {"error": f"Unknown focus '{focus}'. Use one of: {', '.join(ROUTINE_FOCUSES)}."}

    shape_error = _validate_blocks(blocks)
    if shape_error:
        return {"error": shape_error, "expected_shape": BLOCKS_SHAPE}

    warnings = check_routine_against_rules(blocks, estimated_minutes)

    existing = execute_query(
        "SELECT id, name FROM training_routines WHERE LOWER(name) = LOWER(?) AND status = 'active'",
        (name,),
    )
    if existing:
        return {
            "error": (
                f"An active routine named '{existing[0]['name']}' already exists "
                f"(id {existing[0]['id']}). Update it instead of saving a duplicate, "
                "or pick a different name."
            )
        }

    now = _now()
    routine_id = execute_write(
        """
        INSERT INTO training_routines
            (name, focus, goal, estimated_minutes, blocks_json, notes,
             status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        """,
        (name, focus, goal, estimated_minutes, json.dumps(blocks), notes, now, now),
    )

    out: dict = {"saved": _get_routine(routine_id)}
    if warnings:
        out["rule_warnings"] = warnings
        out["note"] = "Routine was saved. Raise these warnings with Blake."
    return out


def update_routine(
    routine_id: int,
    name: str | None = None,
    blocks: list | None = None,
    focus: str | None = None,
    goal: str | None = None,
    estimated_minutes: int | None = None,
    notes: str | None = None,
) -> dict:
    """Revise a routine in place. Pass only the fields that change."""
    existing = _get_routine(routine_id)
    if existing is None:
        return {"error": f"No routine with id {routine_id}."}

    if focus is not None and focus not in ROUTINE_FOCUSES:
        return {"error": f"Unknown focus '{focus}'. Use one of: {', '.join(ROUTINE_FOCUSES)}."}

    if blocks is not None:
        shape_error = _validate_blocks(blocks)
        if shape_error:
            return {"error": shape_error, "expected_shape": BLOCKS_SHAPE}
        blocks_json = json.dumps(blocks)
        effective_blocks = blocks
    else:
        blocks_json = json.dumps(existing["blocks"])
        effective_blocks = existing["blocks"]

    effective_minutes = (
        estimated_minutes if estimated_minutes is not None
        else existing["estimated_minutes"]
    )
    warnings = check_routine_against_rules(effective_blocks, effective_minutes)

    execute_write(
        """
        UPDATE training_routines
        SET name = ?, focus = ?, goal = ?, estimated_minutes = ?,
            blocks_json = ?, notes = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            (name or existing["name"]).strip(),
            focus or existing["focus"],
            goal if goal is not None else existing["goal"],
            effective_minutes,
            blocks_json,
            notes if notes is not None else existing["notes"],
            _now(),
            routine_id,
        ),
    )

    out: dict = {"updated": _get_routine(routine_id)}
    if warnings:
        out["rule_warnings"] = warnings
    return out


def archive_routine(routine_id: int, reason: str | None = None) -> dict:
    """Retire a routine Blake has stopped using. It stays queryable via
    list_routines(include_archived=True)."""
    existing = _get_routine(routine_id)
    if existing is None:
        return {"error": f"No routine with id {routine_id}."}

    now = _now()
    execute_write(
        """
        UPDATE training_routines
        SET status = 'archived', archived_at = ?, updated_at = ?, archived_reason = ?
        WHERE id = ?
        """,
        (now, now, (reason or "").strip() or None, routine_id),
    )
    return {"archived": _get_routine(routine_id)}


# ---------------------------------------------------------------------------
# Assembled context
# ---------------------------------------------------------------------------

def get_context() -> dict:
    """Everything the model needs before programming: the active rule set grouped
    by type, a summary of the routine library, and anything still awaiting
    Blake's confirmation."""
    active = list_rules(status="active")

    grouped: dict[str, list[dict]] = {}
    for r in active:
        grouped.setdefault(r["rule_type"], []).append(
            {"id": r["id"], "scope": r["scope"], "rule": r["rule"], "why": r["rationale"]}
        )

    routines = list_routines()
    proposed = list_rules(status="proposed")

    out: dict = {
        "how_to_apply": {
            "constraint": "Binding. Do not violate. Say so if Blake asks for something that would.",
            "limitation": "Binding. Physical restriction, program around it.",
            "equipment": "Bounds what can be programmed at all.",
            "target": "Work toward it. Call out when a session or week falls short.",
            "preference": "Default to it. Deviating is fine with a stated reason.",
            "observation": "Context Blake taught you. Weigh it, don't obey it.",
        },
        "rules": grouped,
        "active_rule_count": len(active),
        "routine_library": [
            {
                "id": r["id"],
                "name": r["name"],
                "focus": r["focus"],
                "estimated_minutes": r["estimated_minutes"],
            }
            for r in routines
        ],
        "capture_reminder": (
            "If Blake states a durable preference or corrects your programming in "
            "this conversation, call propose_rule so it survives the session."
        ),
    }
    if proposed:
        out["awaiting_confirmation"] = [
            {"id": r["id"], "rule": r["rule"], "rule_type": r["rule_type"]} for r in proposed
        ]
    if routines:
        out["routine_note"] = (
            "Call get_training_routine for the full block structure of any of these. "
            "Blake trains week to week, so pick or adapt from this library rather "
            "than building a multi-week schedule."
        )
    else:
        out["routine_note"] = (
            "No saved routines. If Blake settles on a session he likes, call "
            "save_training_routine so he can reuse it."
        )
    return out
