"""Exercise-to-muscle group mapping service."""

from typing import Optional, Tuple, List

# Define the 10 muscle groups
MUSCLE_GROUPS = [
    "Chest",
    "Back",
    "Shoulders",
    "Triceps",
    "Biceps",
    "Abs",
    "Quads",
    "Hamstrings",
    "Glutes",
    "Calves",
]

# Comprehensive keyword mapping for each muscle group
# Priority: more specific keywords first, then general ones
MUSCLE_KEYWORDS = {
    "Chest": [
        "bench press", "bench", "chest press", "chest", "pec", "pectoral",
        "fly", "flye", "dumbbell fly", "cable fly", "pec deck",
        "push up", "pushup", "push-up", "incline bench", "decline bench",
        "chest dip", "dip", "chest press machine", "pec machine"
    ],
    "Back": [
        "row", "rowing", "barbell row", "dumbbell row", "cable row",
        "lat pulldown", "pulldown", "pull down", "lat", "lats", "latissimus",
        "pull up", "pullup", "pull-up", "chin up", "chinup", "chin-up",
        "deadlift", "dead lift", "back extension", "hyperextension",
        "t-bar row", "t bar row", "seated row", "one arm row",
        "reverse fly", "reverse flye", "rear delt fly", "face pull"
    ],
    "Shoulders": [
        "shoulder press", "overhead press", "ohp", "military press",
        "lateral raise", "side raise", "front raise", "rear delt",
        "rear deltoid", "delt", "deltoid", "shoulder", "shoulders",
        "arnold press", "dumbbell press", "barbell press",
        "upright row", "shrug", "shrugs", "face pull"
    ],
    "Triceps": [
        "tricep", "triceps", "tricep extension", "triceps extension",
        "overhead extension", "skull crusher", "skullcrusher",
        "close grip bench", "close-grip bench", "dip", "tricep dip",
        "pushdown", "push down", "cable extension", "rope extension",
        "kickback", "tricep kickback"
    ],
    "Biceps": [
        "bicep", "biceps", "curl", "barbell curl", "dumbbell curl",
        "hammer curl", "preacher curl", "cable curl", "concentration curl",
        "21s", "bicep curl", "biceps curl"
    ],
    "Abs": [
        "ab", "abs", "abdominal", "core", "crunch", "sit up", "situp",
        "sit-up", "plank", "leg raise", "hanging leg raise",
        "russian twist", "ab wheel", "cable crunch", "decline crunch",
        "bicycle crunch", "mountain climber", "dead bug"
    ],
    "Quads": [
        "squat", "leg press", "leg extension", "quad", "quads", "quadricep",
        "quadriceps", "front squat", "back squat", "goblet squat",
        "bulgarian split squat", "split squat", "lunge", "lunges",
        "walking lunge", "reverse lunge", "hack squat", "sissy squat"
    ],
    "Hamstrings": [
        "hamstring", "hamstrings", "hamstring curl", "leg curl",
        "romanian deadlift", "rdl", "stiff leg deadlift", "stiff-legged",
        "good morning", "nordic curl", "hamstring extension",
        "lying leg curl", "seated leg curl"
    ],
    "Glutes": [
        "glute", "glutes", "glute bridge", "hip thrust", "hip thrusts",
        "glute kickback", "cable kickback", "bulgarian split squat",
        "lunge", "squat", "deadlift", "rdl", "romanian deadlift",
        "hip abduction", "hip adduction", "clamshell", "fire hydrant"
    ],
    "Calves": [
        "calf", "calves", "calf raise", "standing calf raise",
        "seated calf raise", "donkey calf raise", "calf press",
        "leg press calf", "toe raise"
    ],
}

# Compound exercises that hit multiple muscle groups
# Format: exercise_name -> (primary, [secondary1, secondary2, ...])
COMPOUND_EXERCISES = {
    "deadlift": ("Back", ["Hamstrings", "Glutes"]),
    "romanian deadlift": ("Hamstrings", ["Glutes", "Back"]),
    "rdl": ("Hamstrings", ["Glutes", "Back"]),
    "squat": ("Quads", ["Glutes"]),
    "bench press": ("Chest", ["Triceps", "Shoulders"]),
    "bench": ("Chest", ["Triceps", "Shoulders"]),
    "overhead press": ("Shoulders", ["Triceps"]),
    "ohp": ("Shoulders", ["Triceps"]),
    "military press": ("Shoulders", ["Triceps"]),
    "dip": ("Triceps", ["Chest", "Shoulders"]),
    "pull up": ("Back", ["Biceps"]),
    "pullup": ("Back", ["Biceps"]),
    "pull-up": ("Back", ["Biceps"]),
    "chin up": ("Back", ["Biceps"]),
    "chinup": ("Back", ["Biceps"]),
    "chin-up": ("Back", ["Biceps"]),
    "lunge": ("Quads", ["Glutes"]),
    "lunges": ("Quads", ["Glutes"]),
    "bulgarian split squat": ("Quads", ["Glutes"]),
    "hip thrust": ("Glutes", ["Hamstrings"]),
    "hip thrusts": ("Glutes", ["Hamstrings"]),
}


def normalize_exercise_name(exercise_name: str) -> str:
    """Normalize exercise name for matching."""
    if not exercise_name:
        return ""
    return exercise_name.lower().strip()


def get_muscle_groups(exercise_name: str) -> Tuple[str, List[str]]:
    """
    Get primary and secondary muscle groups for an exercise.
    
    Returns:
        Tuple of (primary_muscle_group, [secondary_muscle_groups])
    """
    if not exercise_name:
        return ("Other", [])
    
    normalized = normalize_exercise_name(exercise_name)
    
    # Check compound exercises first (more specific)
    if normalized in COMPOUND_EXERCISES:
        primary, secondaries = COMPOUND_EXERCISES[normalized]
        return (primary, secondaries)
    
    # Check keyword matching
    matched_groups = []
    for muscle_group, keywords in MUSCLE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in normalized:
                matched_groups.append(muscle_group)
                break  # Only match once per muscle group
    
    if not matched_groups:
        return ("Other", [])
    
    # Primary is the first match, rest are secondary
    primary = matched_groups[0]
    secondaries = matched_groups[1:] if len(matched_groups) > 1 else []
    
    return (primary, secondaries)


def get_primary_muscle_group(exercise_name: str) -> str:
    """Get the primary muscle group for an exercise."""
    primary, _ = get_muscle_groups(exercise_name)
    return primary


def get_all_muscle_groups(exercise_name: str) -> List[str]:
    """Get all muscle groups (primary + secondary) for an exercise."""
    primary, secondaries = get_muscle_groups(exercise_name)
    return [primary] + secondaries if secondaries else [primary]

