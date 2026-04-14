import uvicorn
from decision_forge.config import settings

def main() -> None:
    uvicorn.run(
        "decision_forge.app:create_app",
        host="127.0.0.1",
        port=settings.port,
        factory=True,
        log_level="info",
    )

if __name__ == "__main__":
    main()
