"""AI Coach chat router."""

import logging
import time
import anthropic
from fastapi import APIRouter, HTTPException

from app.models.schemas import ChatRequest, ChatResponse
from app.services.coach_service import get_coach_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])

# Simple in-memory rate limiter for the chat endpoint (protects Anthropic spend)
_CHAT_RATE_LIMIT = 20  # max requests per window
_CHAT_RATE_WINDOW = 60  # seconds
_chat_timestamps: list[float] = []


def _check_chat_rate_limit() -> None:
    """Raise 429 if chat rate limit is exceeded."""
    now = time.monotonic()
    cutoff = now - _CHAT_RATE_WINDOW
    # Prune old entries
    while _chat_timestamps and _chat_timestamps[0] < cutoff:
        _chat_timestamps.pop(0)
    if len(_chat_timestamps) >= _CHAT_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again shortly.")
    _chat_timestamps.append(now)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the AI Coach.

    The coach will analyze your recent fitness data and provide
    personalized advice based on your question.
    """
    _check_chat_rate_limit()
    coach = get_coach_service()

    try:
        response_text, context_summary = await coach.chat(
            message=request.message,
            context_days=request.context_days
        )

        return ChatResponse(
            response=response_text,
            context_summary=context_summary
        )

    except ValueError:
        raise HTTPException(
            status_code=503,
            detail="AI Coach is not configured. Set the ANTHROPIC_API_KEY environment variable."
        )
    except anthropic.AuthenticationError:
        logger.exception("Anthropic authentication error")
        raise HTTPException(
            status_code=503,
            detail="AI Coach authentication failed. Please check your ANTHROPIC_API_KEY."
        )
    except anthropic.APIError as e:
        logger.exception("Anthropic API error: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"AI service error: {e}"
        )
    except Exception as e:
        logger.exception("Chat error: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Chat request failed. Please try again."
        )


@router.get("/chat/context")
async def get_context_preview(days: int = 7):
    """
    Preview the fitness context that will be sent to the AI.
    
    Useful for debugging and understanding what data the AI sees.
    """
    coach = get_coach_service()
    context_text, summary = coach.build_fitness_context(days)
    
    return {
        "context": context_text,
        "summary": summary
    }

