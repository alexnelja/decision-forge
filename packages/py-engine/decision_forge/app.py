from fastapi import FastAPI
from decision_forge.routers import health

def create_app() -> FastAPI:
    app = FastAPI(title="Decision Forge Engine", version="0.1.0")
    app.include_router(health.router)
    return app
