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
