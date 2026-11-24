import uuid
from datetime import datetime, timedelta, timezone

from conftest import make_msg


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_direct_submit_creates_then_dedupes(client, auth):
    msg = make_msg()
    r = client.post("/api/sos", json=msg)
    assert r.status_code == 201, r.text
    assert r.json()["result"] == "created"
    assert r.json()["delivery_status"] == "SERVER_RECEIVED"

    r2 = client.post("/api/sos", json=msg)
    assert r2.status_code == 200
    assert r2.json()["result"] == "duplicate"

    rows = client.get("/api/sos", headers=auth).json()
    assert len(rows) == 1
    assert rows[0]["received_via"] == "DIRECT"
    assert rows[0]["duplicate_receipts"] == 1


def test_gateway_sync_merges_relay_paths(client, auth):
    now = datetime.now(timezone.utc).isoformat()
    base = make_msg(hop_count=2)
    path1 = base["relay_history"] + [
        {"device_id": "device-B-0002", "hop": 1, "transport": "NEARBY", "received_at": now},
        {"device_id": "device-C-0003", "hop": 2, "transport": "NEARBY", "received_at": now},
    ]
    r = client.post("/api/sos/sync", json={
        "gateway_device_id": "device-C-0003", "messages": [{**base, "relay_history": path1}]})
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 1

    # Same SOS reaches the server through a second gateway, via a different path.
    path2 = base["relay_history"] + [
        {"device_id": "device-D-0004", "hop": 1, "transport": "NEARBY", "received_at": now},
    ]
    r = client.post("/api/sos/sync", json={
        "gateway_device_id": "device-D-0004", "messages": [{**base, "relay_history": path2, "hop_count": 1}]})
    assert r.json()["duplicates"] == 1 and r.json()["created"] == 0

    detail = client.get(f"/api/sos/{base['message_id']}", headers=auth).json()
    assert detail["received_via"] == "GATEWAY"
    assert detail["gateway_id"] == "device-C-0003"
    devices = {h["device_id"] for h in detail["relay_history"]}
    assert {"device-A-0001", "device-B-0002", "device-C-0003", "device-D-0004"} <= devices
    assert detail["relay_history"][-1]["transport"] in ("INTERNET", "NEARBY")


def test_sync_rejects_bad_messages_individually(client):
    now = datetime.now(timezone.utc)
    good = make_msg()
    expired = make_msg(created_at=(now - timedelta(hours=30)).isoformat(),
                       expiry_at=(now - timedelta(hours=1)).isoformat())
    too_many_hops = make_msg(hop_count=50)
    future = make_msg(created_at=(now + timedelta(hours=2)).isoformat(),
                      expiry_at=(now + timedelta(hours=20)).isoformat())
    r = client.post("/api/sos/sync", json={"gateway_device_id": "device-G-0001",
                                           "messages": [good, expired, too_many_hops, future]})
    body = r.json()
    assert body["created"] == 1 and body["rejected"] == 3
    reasons = {x["result"]: x for x in body["results"]}
    assert reasons["rejected"]["reason"]


def test_validation_errors(client):
    assert client.post("/api/sos", json=make_msg(priority="URGENT")).status_code == 422
    assert client.post("/api/sos", json=make_msg(latitude=200)).status_code == 422
    assert client.post("/api/sos", json=make_msg(longitude=None)).status_code == 422
    naive = datetime.now().replace(tzinfo=None).isoformat()
    assert client.post("/api/sos", json=make_msg(created_at=naive)).status_code == 422


def test_coordinator_endpoints_require_auth(client):
    assert client.get("/api/sos").status_code == 401
    assert client.get("/api/dashboard/stats").status_code == 401
    assert client.get("/api/sos", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_status_query_has_no_pii(client):
    msg = make_msg()
    client.post("/api/sos", json=msg)
    unknown = str(uuid.uuid4())
    r = client.post("/api/sos/status-query", json={"message_ids": [msg["message_id"], unknown]})
    body = r.json()
    assert body["unknown"] == [unknown]
    st = body["statuses"][0]
    assert set(st) == {"message_id", "delivery_status", "rescue_status", "priority", "updated_at"}


def test_full_rescue_lifecycle(client, auth):
    msg = make_msg(priority="CRITICAL", emergency_type="TRAPPED")
    client.post("/api/sos", json=msg)
    mid = msg["message_id"]

    # Cannot jump straight to IN_PROGRESS.
    assert client.patch(f"/api/sos/{mid}/status", json={"rescue_status": "IN_PROGRESS"}, headers=auth).status_code == 409

    d = client.post(f"/api/sos/{mid}/acknowledge", json={"note": "seen"}, headers=auth).json()
    assert d["delivery_status"] == "COORDINATOR_ACKNOWLEDGED"
    assert d["rescue_status"] == "ACKNOWLEDGED"
    # idempotent
    d = client.post(f"/api/sos/{mid}/acknowledge", headers=auth).json()
    assert sum(a["ack_type"] == "COORDINATOR_ACK" for a in d["acknowledgements"]) == 1

    vols = client.get("/api/volunteers", headers=auth).json()
    a = client.post("/api/assignments", json={"message_id": mid, "volunteer_id": vols[0]["id"]}, headers=auth)
    assert a.status_code == 201, a.text
    aid = a.json()["id"]
    assert client.post("/api/assignments", json={"message_id": mid, "volunteer_id": vols[0]["id"]},
                       headers=auth).status_code == 409

    d = client.get(f"/api/sos/{mid}", headers=auth).json()
    assert d["rescue_status"] == "ASSIGNED"
    assert d["active_assignment"]["volunteer_name"] == vols[0]["name"]

    client.patch(f"/api/assignments/{aid}", json={"status": "ON_SITE"}, headers=auth)
    assert client.get(f"/api/sos/{mid}", headers=auth).json()["rescue_status"] == "IN_PROGRESS"

    client.patch(f"/api/assignments/{aid}", json={"status": "COMPLETED"}, headers=auth)
    d = client.get(f"/api/sos/{mid}", headers=auth).json()
    assert d["rescue_status"] == "RESOLVED"
    assert [v for v in client.get("/api/volunteers", headers=auth).json() if v["id"] == vols[0]["id"]][0]["status"] == "AVAILABLE"

    # Status propagates to the public status query used by the mesh.
    st = client.post("/api/sos/status-query", json={"message_ids": [mid]}).json()["statuses"][0]
    assert st["rescue_status"] == "RESOLVED" and st["delivery_status"] == "COORDINATOR_ACKNOWLEDGED"

    events = [e["event"] for e in d["status_events"]]
    assert events[0] == "SERVER_RECEIVED" and "COORDINATOR_ACK" in events


def test_assignment_auto_acknowledges(client, auth):
    msg = make_msg()
    client.post("/api/sos", json=msg)
    vid = client.get("/api/volunteers", headers=auth).json()[0]["id"]
    client.post("/api/assignments", json={"message_id": msg["message_id"], "volunteer_id": vid}, headers=auth)
    d = client.get(f"/api/sos/{msg['message_id']}", headers=auth).json()
    assert d["delivery_status"] == "COORDINATOR_ACKNOWLEDGED"
    assert d["rescue_status"] == "ASSIGNED"


def test_priority_override_and_ordering(client, auth):
    low = make_msg(priority="LOW")
    crit = make_msg(priority="CRITICAL")
    client.post("/api/sos", json=low)
    client.post("/api/sos", json=crit)
    rows = client.get("/api/sos?sort=priority", headers=auth).json()
    assert rows[0]["message_id"] == crit["message_id"]

    d = client.patch(f"/api/sos/{low['message_id']}/priority", json={"priority": "CRITICAL", "note": "child"},
                     headers=auth).json()
    assert d["priority"] == "CRITICAL" and d["original_priority"] == "LOW"


def test_dashboard_stats(client, auth):
    client.post("/api/sos", json=make_msg(priority="CRITICAL"))
    client.post("/api/sos/sync", json={"gateway_device_id": "device-G-0001", "is_simulated": True,
                                       "messages": [make_msg(priority="LOW", is_simulated=True)]})
    s = client.get("/api/dashboard/stats", headers=auth).json()
    assert s["total"] == 2 and s["critical_open"] == 1 and s["pending"] == 2
    assert s["via_gateway"] == 1 and s["via_direct"] == 1 and s["simulated"] == 1
    assert s["volunteers_total"] == 2
