from fastapi import FastAPI
from decision_forge.routers import health, forecast, mc, nego
from decision_forge.db import open_db, migrate
from decision_forge.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Decision Forge Engine", version="0.1.0")
    app.include_router(health.router)
    app.include_router(forecast.router)
    app.include_router(mc.router)
    app.include_router(nego.router)
    if forecast._conn is None:
        conn = open_db(settings.db_path)
        migrate(conn)
        forecast.set_connection(conn)
    return app
