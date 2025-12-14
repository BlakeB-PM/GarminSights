"""Pydantic schemas for request/response models."""

from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field


# ============================================
# Activity Schemas
# ============================================

class ActivityBase(BaseModel):
    """Base activity fields."""
    garmin_id: str
    activity_type: Optional[str] = None
    name: Optional[str] = None
    start_time: Optional[datetime] = None
    duration_seconds: Optional[float] = None  # Float to handle Garmin's precise durations
    distance_meters: Optional[float] = None
    calories: Optional[int] = None


class ActivityCreate(ActivityBase):
    """Schema for creating an activity."""
    raw_json: Optional[str] = None


class Activity(ActivityBase):
    """Schema for activity response."""
    id: int
    
    class Config:
        from_attributes = True


class HeartRateMetrics(BaseModel):
    """Heart rate metrics for an activity."""
    avg: Optional[int] = None
    max: Optional[int] = None
    min: Optional[int] = None
    resting: Optional[int] = None


class TrainingMetrics(BaseModel):
    """Training effect and performance metrics."""
    aerobic_effect: Optional[float] = None
    anaerobic_effect: Optional[float] = None
    vo2_max: Optional[float] = None
    recovery_time: Optional[int] = None  # seconds
    training_effect_label: Optional[str] = None
    performance_condition: Optional[int] = None


class ActivityDetails(Activity):
    """Activity with all available parsed metrics."""
    # Elevation
    elevation_gain: Optional[float] = None  # meters
    elevation_loss: Optional[float] = None  # meters
    
    # Speed/Pace
    average_speed: Optional[float] = None  # m/s
    max_speed: Optional[float] = None  # m/s
    elapsed_duration: Optional[float] = None  # seconds
    moving_duration: Optional[float] = None  # seconds
    
    # Heart Rate
    heart_rate: Optional[HeartRateMetrics] = None
    
    # Training
    training: Optional[TrainingMetrics] = None
    
    # Performance metrics
    cadence: Optional[int] = None  # steps/min or rev/min
    stride_length: Optional[float] = None  # meters
    average_power: Optional[float] = None  # watts
    max_power: Optional[float] = None  # watts
    normalized_power: Optional[float] = None  # watts
    
    # Splits and laps
    splits: Optional[list[dict]] = None
    laps: Optional[list[dict]] = None
    
    class Config:
        from_attributes = True


class ActivityWithSets(ActivityDetails):
    """Activity with strength sets included."""
    strength_sets: list["StrengthSet"] = []


# ============================================
# Sleep Schemas
# ============================================

class SleepBase(BaseModel):
    """Base sleep fields."""
    date: date
    sleep_score: Optional[int] = None
    total_sleep_seconds: Optional[int] = None
    deep_sleep_seconds: Optional[int] = None
    light_sleep_seconds: Optional[int] = None
    rem_sleep_seconds: Optional[int] = None
    awake_seconds: Optional[int] = None
    hrv_average: Optional[float] = None
    resting_hr: Optional[int] = None


class SleepCreate(SleepBase):
    """Schema for creating sleep data."""
    raw_json: Optional[str] = None


class Sleep(SleepBase):
    """Schema for sleep response."""
    id: int
    
    class Config:
        from_attributes = True


# ============================================
# Daily Metrics Schemas
# ============================================

class DailyBase(BaseModel):
    """Base daily metrics fields."""
    date: date
    steps: Optional[int] = None
    distance_meters: Optional[float] = None
    active_calories: Optional[int] = None
    calories_total: Optional[int] = None
    calories_bmr: Optional[int] = None
    body_battery_high: Optional[int] = None
    body_battery_low: Optional[int] = None
    body_battery_charged: Optional[int] = None
    body_battery_drained: Optional[int] = None
    stress_average: Optional[int] = None
    stress_high: Optional[int] = None
    low_stress_duration: Optional[int] = None  # Duration in seconds
    medium_stress_duration: Optional[int] = None  # Duration in seconds
    high_stress_duration: Optional[int] = None  # Duration in seconds
    rest_stress_duration: Optional[int] = None
    activity_stress_duration: Optional[int] = None
    intensity_minutes_moderate: Optional[int] = None
    intensity_minutes_vigorous: Optional[int] = None
    intensity_minutes_goal: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    min_heart_rate: Optional[int] = None
    resting_heart_rate: Optional[int] = None


class DailyCreate(DailyBase):
    """Schema for creating daily metrics."""
    raw_json: Optional[str] = None


class Daily(DailyBase):
    """Schema for daily metrics response."""
    id: int
    
    class Config:
        from_attributes = True


# ============================================
# Strength Set Schemas
# ============================================

class StrengthSetBase(BaseModel):
    """Base strength set fields."""
    activity_id: int
    exercise_name: Optional[str] = None
    set_number: Optional[int] = None
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    duration_seconds: Optional[float] = None  # Float for precise duration


class StrengthSetCreate(StrengthSetBase):
    """Schema for creating a strength set."""
    raw_json: Optional[str] = None


class StrengthSet(StrengthSetBase):
    """Schema for strength set response."""
    id: int
    
    class Config:
        from_attributes = True


# ============================================
# Auth Schemas
# ============================================

class AuthStatus(BaseModel):
    """Authentication status response."""
    authenticated: bool
    username: Optional[str] = None
    error: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request - uses env credentials by default."""
    email: Optional[str] = None
    password: Optional[str] = None


# ============================================
# Sync Schemas
# ============================================

class SyncRequest(BaseModel):
    """Data sync request."""
    days_back: int = Field(default=30, ge=1, le=365)
    sync_activities: bool = True
    sync_sleep: bool = True
    sync_dailies: bool = True


class SyncStatus(BaseModel):
    """Sync operation status."""
    success: bool
    activities_synced: int = 0
    sleep_days_synced: int = 0
    dailies_synced: int = 0
    strength_sets_extracted: int = 0
    error: Optional[str] = None
    warnings: list[str] = []
    details: dict = {}


# ============================================
# Dashboard Schemas
# ============================================

class DashboardSummary(BaseModel):
    """Dashboard at-a-glance summary."""
    last_sleep_score: Optional[int] = None
    last_body_battery: Optional[int] = None
    weekly_steps: int = 0
    weekly_activities: int = 0
    last_updated: Optional[datetime] = None


class ActivityHeatmapDay(BaseModel):
    """Single day in activity heatmap."""
    date: date
    activity_count: int = 0
    total_duration_minutes: int = 0
    activity_types: list[str] = []


# ============================================
# Strength Analytics Schemas
# ============================================

class ExerciseProgress(BaseModel):
    """Progress data for a specific exercise."""
    exercise_name: str
    date: date
    estimated_1rm: Optional[float] = None
    total_volume: Optional[float] = None  # sets * reps * weight
    max_weight: Optional[float] = None
    total_reps: int = 0
    total_sets: int = 0


class ExerciseList(BaseModel):
    """List of exercises."""
    exercises: list[str]


# ============================================
# Strength Lab Views Schemas
# ============================================

class KeyLiftCard(BaseModel):
    """Key lift progress card data."""
    exercise_name: str
    best_recent_weight: Optional[float] = None
    best_recent_reps: Optional[int] = None
    estimated_1rm: Optional[float] = None
    four_week_trend_lbs: Optional[float] = None  # Change in estimated 1RM
    four_week_trend_percent: Optional[float] = None
    volume_trend_percent: Optional[float] = None  # Volume change vs 4-week avg
    last_trained_date: Optional[date] = None
    days_since_last: Optional[int] = None
    status: str = "stable"  # "progress", "stable", "plateau", "declining"


class TrainingBalanceData(BaseModel):
    """Training balance data for a week."""
    week_start: date
    week_end: date
    strength_sessions: int = 0
    cardio_sessions: int = 0
    zone2_sessions: int = 0
    vo2_sessions: int = 0
    strength_minutes: int = 0
    zone2_minutes: int = 0
    vo2_minutes: int = 0


class MuscleFrequency(BaseModel):
    """Muscle group frequency data."""
    muscle_group: str
    avg_sessions_per_week: float = 0.0
    days_since_last: Optional[int] = None
    total_sets: int = 0
    total_volume: float = 0.0


class VolumeTrendData(BaseModel):
    """Volume trend data for a week."""
    week_start: date
    week_end: date
    total_tonnage: float = 0.0  # weight × reps × sets
    total_sets: int = 0
    week_over_week_delta_percent: Optional[float] = None


class MuscleComparisonData(BaseModel):
    """Muscle comparison data for a week."""
    week_start: date
    week_end: date
    muscle_groups: dict[str, int] = {}  # muscle_group -> sets per week


# ============================================
# Chat Schemas
# ============================================

class ChatRequest(BaseModel):
    """AI Coach chat request."""
    message: str
    context_days: int = Field(default=7, ge=1, le=30)


class ChatResponse(BaseModel):
    """AI Coach chat response."""
    response: str
    context_summary: dict = {}


# Update forward references
ActivityWithSets.model_rebuild()

