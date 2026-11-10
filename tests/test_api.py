"""API endpoint tests (no network: Lingva is mocked)."""
from unittest.mock import MagicMock

import requests


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json()["ok"] is True
    assert r.get_json()["words"] >= 120


def test_words_list_and_filters(client):
    data = client.get("/api/words").get_json()
    assert data["total"] >= 120 and data["count"] == data["total"]
    a1 = client.get("/api/words?level=A1").get_json()
    assert a1["total"] >= 20 and all(w["level"] == "A1" for w in a1["words"])
    fam = client.get("/api/words?topic=Familie").get_json()
    assert fam["total"] > 0 and all(w["topic"] == "Familie" for w in fam["words"])
    page = client.get("/api/words?limit=5&offset=5").get_json()
    assert page["count"] == 5 and page["words"][0]["id"] == data["words"][5]["id"]


def test_words_invalid_params(client):
    assert client.get("/api/words?level=Z9").status_code == 400
    assert client.get("/api/words?topic=Unknown").status_code == 400
    assert client.get("/api/words?limit=abc").status_code == 400
    assert client.get("/api/words?limit=-1").status_code == 400


def test_word_detail(client):
    r = client.get("/api/words/1")
    assert r.status_code == 200 and r.get_json()["word"]["id"] == 1
    assert client.get("/api/words/99999").status_code == 404
    bad = client.get("/api/words/abc")
    assert bad.status_code == 400 and bad.get_json()["ok"] is False


def test_levels_and_topics(client):
    levels = client.get("/api/levels").get_json()["levels"]
    assert [l["code"] for l in levels] == ["A1", "A2", "B1", "B2", "C1", "C2"]
    assert all(l["count"] >= 20 for l in levels)
    topics = client.get("/api/topics").get_json()["topics"]
    assert len(topics) == 14 and {"code", "name_de", "name_uz", "count"} <= set(topics[0])


def test_search_german_and_uzbek(client):
    de = client.get("/api/search?q=mutter").get_json()
    assert de["words"][0]["german"] == "Mutter"
    uz = client.get("/api/search?q=ona").get_json()
    assert any(w["german"] == "Mutter" for w in uz["words"])
    # umlaut-insensitive and apostrophe-insensitive
    assert client.get("/api/search?q=mude").get_json()["words"][0]["german"] == "müde"
    assert any(w["german"] == "Lehrer" for w in client.get("/api/search?q=o'qituvchi").get_json()["words"])
    only_de = client.get("/api/search?q=ona&lang=de").get_json()
    assert not any(w["german"] == "Mutter" for w in only_de["words"])


def test_search_validation(client):
    assert client.get("/api/search").status_code == 400
    assert client.get("/api/search?q=").status_code == 400
    assert client.get("/api/search?q=" + "a" * 101).status_code == 400
    assert client.get("/api/search?q=x&lang=fr").status_code == 400


def test_statistics(client):
    s = client.get("/api/statistics").get_json()
    assert s["total_words"] >= 120 and set(s["by_level"]) == {"A1", "A2", "B1", "B2", "C1", "C2"}


def test_translate_validation(client):
    assert client.post("/api/translate", data="text=x").status_code == 415
    assert client.post("/api/translate", json=[1, 2]).status_code == 400
    assert client.post("/api/translate", json={}).status_code == 400
    assert client.post("/api/translate", json={"text": 5}).status_code == 400
    assert client.post("/api/translate", json={"text": "x" * 301}).status_code == 400
    assert client.post("/api/translate", json={"text": "Hund", "from": "fr"}).status_code == 400
    assert client.post("/api/translate", json={"text": "Hund", "from": "de", "to": "de"}).status_code == 400
    assert client.get("/api/translate").status_code == 405


def test_translate_local_fallback_when_no_instances(client):
    data = client.post("/api/translate", json={"text": "Hund", "from": "de", "to": "uz"}).get_json()
    assert data["ok"] and data["source"] == "local" and data["translation"] == "it"
    assert "lokal" in data["message"]
    rev = client.post("/api/translate", json={"text": "ona", "from": "uz"}).get_json()
    assert rev["source"] == "local" and rev["translation"] == "die Mutter"


def test_translate_unknown_word(client):
    data = client.post("/api/translate", json={"text": "Quantenverschränkung"}).get_json()
    assert data["ok"] and data["source"] == "none" and data["translation"] is None


def _translator(app, instances, session):
    t = app.extensions["translator"]
    t.instances = instances
    t.session = session
    return t


def test_translate_uses_lingva_when_available(app, client):
    resp = MagicMock(status_code=200)
    resp.json.return_value = {"translation": "Salom"}
    session = MagicMock()
    session.get.return_value = resp
    _translator(app, ["https://lingva.example"], session)
    data = client.post("/api/translate", json={"text": "Hallo"}).get_json()
    assert data["source"] == "lingva" and data["translation"] == "Salom"
    assert session.get.call_args[0][0] == "https://lingva.example/api/v1/de/uz/Hallo"


def test_translate_falls_back_on_lingva_errors(app, client):
    session = MagicMock()
    session.get.side_effect = [requests.Timeout(), MagicMock(status_code=429), MagicMock(status_code=403)]
    _translator(app, ["https://a.example", "https://b.example", "https://c.example"], session)
    data = client.post("/api/translate", json={"text": "Brot"}).get_json()
    assert data["source"] == "local" and data["translation"] == "non"
    status = client.get("/api/health").get_json()["translation"]
    assert status["available"] is False and "429" in status["detail"] and "403" in status["detail"]


def test_translate_rate_limit(app, client):
    app.config["TRANSLATE_RATE_LIMIT"] = 2
    from backend.routes import api as api_module
    api_module._rate_buckets.clear()
    codes = [client.post("/api/translate", json={"text": "Hund"}).status_code for _ in range(3)]
    api_module._rate_buckets.clear()
    assert codes == [200, 200, 429]


def test_unknown_api_route_is_json_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.get_json()["ok"] is False


def test_cors_only_for_configured_origins(app, client):
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in r.headers
    app.config["CORS_ORIGINS"] = ["https://good.example"]
    r = client.get("/api/health", headers={"Origin": "https://good.example"})
    assert r.headers["Access-Control-Allow-Origin"] == "https://good.example"
