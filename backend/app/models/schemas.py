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
    duration_seconds: Optional[int] = None
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


class ActivityWithSets(Activity):
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
    body_battery_high: Optional[int] = None
    body_battery_low: Optional[int] = None
    stress_average: Optional[int] = None
    calories_total: Optional[int] = None


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
    duration_seconds: Optional[int] = None


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

