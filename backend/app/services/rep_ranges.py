"""Rep range classification service."""

from typing import Optional, Literal

# Rep range definitions
REP_RANGES = {
    "heavy": (1, 7),      # 1-7 reps
    "moderate": (8, 12),  # 8-12 reps
    "light": (13, 999),  # 13+ reps
}


def classify_rep_range(reps: Optional[int]) -> Optional[Literal["heavy", "moderate", "light"]]:
    """
    Classify a rep count into a rep range.
    
    Args:
        reps: Number of reps (can be None)
    
    Returns:
        "heavy" (1-7), "moderate" (8-12), "light" (13+), or None if reps is None
    """
    if reps is None:
        return None
    
    if reps <= 7:
        return "heavy"
    elif reps <= 12:
        return "moderate"
    else:
        return "light"


def get_rep_range_bounds(rep_range: str) -> tuple[int, int]:
    """
    Get the min and max reps for a rep range.
    
    Args:
        rep_range: "heavy", "moderate", or "light"
    
    Returns:
        Tuple of (min_reps, max_reps)
    """
    return REP_RANGES.get(rep_range, (0, 0))


def is_in_rep_range(reps: Optional[int], rep_range: str) -> bool:
    """
    Check if a rep count falls within a specific rep range.
    
    Args:
        reps: Number of reps
        rep_range: "heavy", "moderate", or "light"
    
    Returns:
        True if reps falls within the range, False otherwise
    """
    if reps is None:
        return False
    
    min_reps, max_reps = get_rep_range_bounds(rep_range)
    return min_reps <= reps <= max_reps

