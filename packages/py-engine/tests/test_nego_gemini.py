"""Gemini negotiation driver — pure helpers (no API calls)."""
from __future__ import annotations

from decision_forge.nego.agent import (
    build_function_declarations,
    function_call_to_action,
)


def _config():
    return {
        "issues": [
            {"name": "price", "type": "continuous", "range": [100, 200], "yourWeight": 0.7},
            {
                "name": "terms",
                "type": "discrete",
                "options": ["net30", "net60", "net90"],
                "yourWeight": 0.3
            }
        ],
        "seats": []
    }


# --- function_call_to_action ----------------------------------------------


def test_make_offer_maps_to_offer_action():
    action = function_call_to_action(
        "make_offer",
        {"terms": {"price": 150}, "speech": "Here's my opening.", "rationale": "anchor low"},
        {"id": "buyer"}
    )
    assert action["kind"] == "offer"
    assert action["offer"]["seatId"] == "buyer"
    assert action["offer"]["terms"] == {"price": 150}
    assert action["offer"]["rationale"] == "anchor low"
    assert action["speech"] == "Here's my opening."


def test_make_offer_with_json_string_terms_is_parsed():
    # Some models emit the object as a JSON string — driver must tolerate it.
    action = function_call_to_action(
        "make_offer",
        {"terms": '{"price": 160}', "speech": "ok"},
        {"id": "buyer"}
    )
    assert action["offer"]["terms"] == {"price": 160}


def test_accept_maps_to_accept_action():
    action = function_call_to_action("accept", {"speech": "Deal."}, {"id": "supplier"})
    assert action == {"kind": "accept", "seatId": "supplier", "speech": "Deal."}


def test_reject_and_walk_map_through():
    assert function_call_to_action("reject", {"speech": "No."}, {"id": "s"})["kind"] == "reject"
    assert function_call_to_action("walk", {"speech": "Bye."}, {"id": "s"})["kind"] == "walk"


def test_unknown_function_falls_back_to_reject():
    action = function_call_to_action("frobnicate", {}, {"id": "s"})
    assert action["kind"] == "reject"
    assert action["seatId"] == "s"


def test_missing_speech_defaults_to_empty_string():
    action = function_call_to_action("accept", {}, {"id": "s"})
    assert action["speech"] == ""


# --- build_function_declarations ------------------------------------------


def test_declares_all_four_actions():
    decls = build_function_declarations(_config())
    names = {d.name for d in decls}
    assert names == {"make_offer", "accept", "reject", "walk"}


def test_make_offer_terms_schema_derives_from_issues():
    decls = build_function_declarations(_config())
    make_offer = next(d for d in decls if d.name == "make_offer")
    # terms is an OBJECT whose properties mirror the issue names
    props = make_offer.parameters.properties
    terms_schema = props["terms"]
    assert set(terms_schema.properties.keys()) == {"price", "terms"}
    # discrete issue carries its options as an enum
    terms_prop = terms_schema.properties["terms"]
    assert terms_prop.enum == ["net30", "net60", "net90"]
