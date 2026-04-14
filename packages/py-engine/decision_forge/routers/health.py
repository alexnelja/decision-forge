from fastapi import APIRouter
from decision_forge import __version__

router = APIRouter()

@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": __version__}
