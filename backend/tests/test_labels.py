"""Label photo reading (labels.py) with Rekognition faked, and the photo -> review queue flow."""
from app import config, labels


def test_match_catalog_wine_and_vintage():
    r = labels.match(["DOMAINE FOURRIER", "GEVREY-CHAMBERTIN", "2020", "APPELLATION CONTROLEE"])
    assert r["label"]["producer"] == "Domaine Fourrier" and r["label"]["vintage"] == 2020 and r["note"] is None
    assert labels.match(["SOME UNKNOWN WINERY", "2019"])["label"] is None


def test_photo_goes_to_review_with_free_spots(user, call, monkeypatch):
    monkeypatch.setattr(config, "LABEL_PROVIDER", "rekognition")
    monkeypatch.setattr(labels, "detect_text", lambda image: ["G.D. VAJRA", "BAROLO", "2016"])
    path = f"/api/cellars/{user['cellar_id']}/vision/label"
    first = call("POST", path, {"image_b64": "aGVsbG8="}, token=user["token"])
    assert first["provider"] == "rekognition"
    det = first["new"][0]
    assert det["wine"]["name"] == "Barolo" and det["wine"]["vintage"] == 2016
    # a second photo before confirming the first gets a different spot
    second = call("POST", path, {"image_b64": "aGVsbG8="}, token=user["token"])["new"][0]
    assert (second["rack_id"], second["x"], second["z"], second["level"]) != (det["rack_id"], det["x"], det["z"], det["level"])

    monkeypatch.setattr(labels, "detect_text", lambda image: ["NOTHING WE KNOW"])
    unknown = call("POST", path, {"image_b64": "aGVsbG8="}, token=user["token"])["new"][0]
    assert "fill in" in unknown["note"]


def test_llm_reading_fixes_ocr_and_reads_unknown_wines(user, call, monkeypatch):
    monkeypatch.setattr(config, "LABEL_PROVIDER", "rekognition")
    monkeypatch.setattr(config, "LLM_PROVIDER", "vllm")
    monkeypatch.setattr(labels, "detect_text", lambda image: ["G.D. VAJRA", "8AROLO", "Since 1972", "2O16"])
    reply = '{"producer": "G.D. Vajra", "name": "Barolo", "vintage": 2016, "region": "Piedmont", "color": "red"}'
    monkeypatch.setattr(labels.llm, "stream_chat", lambda *a, **k: iter([reply]))
    path = f"/api/cellars/{user['cellar_id']}/vision/label"
    det = call("POST", path, {"image_b64": "aGVsbG8="}, token=user["token"])["new"][0]
    assert det["wine"]["name"] == "Barolo" and det["wine"]["vintage"] == 2016   # not the founding year

    unknown = '{"producer": "Casa Perini", "name": "Espumante Moscatel", "vintage": null, "color": "dessert"}'
    monkeypatch.setattr(labels.llm, "stream_chat", lambda *a, **k: iter([unknown]))
    det = call("POST", path, {"image_b64": "aGVsbG8="}, token=user["token"])["new"][0]
    assert det["wine"]["producer"] == "Casa Perini" and "read from the label" in det["note"]

    monkeypatch.setattr(labels.llm, "stream_chat", lambda *a, **k: iter([""]))   # GPU server off: plain word match
    det = call("POST", path, {"image_b64": "aGVsbG8="}, token=user["token"])["new"][0]
    assert det["wine"]["name"] == "Barolo"
