"""A plain KOReader device (no plugin) syncing through the hub."""

from __future__ import annotations

import pytest

DOCUMENT = "d41d8cd98f00b204e9800998ecf8427e"


def test_auth_accepts_any_configured_credentials(client):
    response = client.get("/users/auth", headers={"x-auth-user": "io", "x-auth-key": "chiave"})
    assert response.status_code == 200
    assert response.json()["authorized"] == "OK"


def test_auth_without_a_user_is_rejected(client):
    assert client.get("/users/auth").status_code == 401


def test_progress_round_trip(client):
    put = client.put("/syncs/progress", json={
        "document": DOCUMENT, "progress": "/body/DocFragment[4]", "percentage": 0.33,
        "device": "Kobo Clara", "device_id": "clara-1"})
    assert put.json()["document"] == DOCUMENT

    got = client.get(f"/syncs/progress/{DOCUMENT}").json()
    assert got["percentage"] == pytest.approx(0.33)
    assert got["progress"] == "/body/DocFragment[4]"
    assert got["device"] == "Kobo Clara"


def test_percentages_expressed_out_of_100_are_normalised(client):
    client.put("/syncs/progress", json={"document": DOCUMENT, "percentage": 42.0,
                                        "device": "Vecchio KOReader"})
    assert client.get(f"/syncs/progress/{DOCUMENT}").json()["percentage"] == pytest.approx(0.42)


def test_unknown_document_answers_empty_instead_of_failing(client):
    got = client.get("/syncs/progress/mai-visto").json()
    assert got["percentage"] == 0.0
    assert got["timestamp"] == 0


def test_an_alias_routes_kosync_progress_onto_the_catalogue_item(client, fake_calibre):
    """This is what makes a stock KOReader device reach Calibre."""
    client.post("/v1/aliases", json={"alias": f"kosync:{DOCUMENT}", "uid": "calibre:Lib:12"})
    client.put("/syncs/progress", json={"document": DOCUMENT, "percentage": 0.55,
                                        "device": "Kobo Clara", "device_id": "clara-1"})

    record = client.get("/v1/progress/calibre:Lib:12").json()
    assert record["percent"] == pytest.approx(0.55)

    client.post("/v1/sync/run")
    assert fake_calibre.set_calls[-1]["pos_frac"] == pytest.approx(0.55)


def test_kosync_and_the_plugin_share_one_record(client):
    client.post("/v1/aliases", json={"alias": f"kosync:{DOCUMENT}", "uid": "calibre:Lib:12"})
    client.post("/v1/progress", json={"records": [{
        "uid": "calibre:Lib:12", "kind": "book", "percent": 0.70,
        "device_id": "kobo-libra", "updated_at": 1_800_000_000_000}]})
    got = client.get(f"/syncs/progress/{DOCUMENT}").json()
    assert got["percentage"] == pytest.approx(0.70)
    assert got["device_id"] == "kobo-libra"
