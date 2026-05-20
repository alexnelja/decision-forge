from pathlib import Path

import uvicorn
from dotenv import load_dotenv

# Load packages/py-engine/.env before anything reads os.environ (e.g. the
# GeminiDriver's GEMINI_API_KEY/GOOGLE_API_KEY lookup). override=False so a key
# the desktop app passes in via the keychain still wins.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

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
