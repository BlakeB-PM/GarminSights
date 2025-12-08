"""AI Coach chat router."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import ChatRequest, ChatResponse
from app.services.coach_service import get_coach_service

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the AI Coach.
    
    The coach will analyze your recent fitness data and provide
    personalized advice based on your question.
    """
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
        
    except ValueError as e:
        # API key not configured
        raise HTTPException(
            status_code=503,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {str(e)}"
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

