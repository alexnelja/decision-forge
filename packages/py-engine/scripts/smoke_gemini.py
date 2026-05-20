"""Live smoke test for the Gemini negotiation driver.

Makes ONE real gemini-2.5-pro call and prints the structured action it
returns. Exercises the actual API path (request build + function-call parse)
that the unit tests mock.

Usage:
    GEMINI_API_KEY=... python scripts/smoke_gemini.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

from decision_forge.nego.agent import GeminiDriver

CONFIG = {
    "issues": [
        {"name": "price", "type": "continuous", "range": [100, 200], "yourWeight": 0.7},
        {
            "name": "payment_terms",
            "type": "discrete",
            "options": ["net30", "net60", "net90"],
            "yourWeight": 0.3
        }
    ],
    "seats": [
        {
            "id": "buyer",
            "label": "Buyer",
            "controlledBy": "you",
            "private": {"batna": 180, "reservationPrice": 175, "utilityFn": [{"issue": "price", "weight": 1.0}], "info": ""}
        },
        {
            "id": "supplier",
            "label": "Supplier",
            "controlledBy": "ai",
            "private": {
                "batna": 150,
                "reservationPrice": 140,
                "utilityFn": [{"issue": "price", "weight": 0.7}, {"issue": "payment_terms", "weight": 0.3}],
                "info": "Production cost 120/ton; one other buyer waiting."
            },
            "persona": {"style": "analytical", "patience": 0.6, "deceptiveness": 0.3, "model": "gemini-2.5-pro"}
        }
    ],
    "maxRounds": 10,
    "discountFactor": 0.95,
    "acceptanceThreshold": 0.05,
    "walkAway": True
}


def main() -> int:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        print("ERROR: set GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment.")
        return 2

    driver = GeminiDriver(api_key=key)
    seat = CONFIG["seats"][1]  # the AI supplier
    transcript = [
        {
            "at": "2026-05-20T10:00:00Z",
            "action": {
                "kind": "offer",
                "offer": {"seatId": "buyer", "roundIndex": 0, "terms": {"price": 130, "payment_terms": "net90"}}
            },
            "speech": "I can do 130 on net90."
        }
    ]

    print("Calling gemini-2.5-pro for the supplier's reply…")
    action = driver.decide(seat, CONFIG, transcript, "gemini-2.5-pro")

    print("\n--- returned action ---")
    import json
    print(json.dumps(action, indent=2))

    kind = action.get("kind")
    if kind not in ("offer", "accept", "reject", "walk"):
        print(f"\nFAIL: unexpected action kind {kind!r}")
        return 1
    if kind == "offer":
        terms = action.get("offer", {}).get("terms", {})
        print(f"\nOK: model made a counter-offer with terms {terms}")
    else:
        print(f"\nOK: model chose to {kind}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
