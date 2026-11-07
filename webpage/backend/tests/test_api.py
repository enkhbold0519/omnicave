import os, tempfile
os.environ["DATABASE_URL"] = "sqlite:///" + tempfile.mkdtemp() + "/t.db"
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)

def test_flow():
    cred = {"email": "a@b.co", "password": "Cellar#2026"}
    assert c.post("/api/register", json=cred).status_code == 201
    assert c.post("/api/register", json=cred).status_code == 409
    assert c.post("/api/register", json={"email": "x@y.co", "password": "weak"}).status_code == 400
    assert c.post("/api/login", json={**cred, "password": "nope"}).status_code == 401
    h = {"Authorization": "Bearer " + c.post("/api/login", json=cred).json()["token"]}
    assert c.get("/api/state", headers=h).status_code == 404
    assert c.put("/api/state", json={"B": [1]}, headers=h).status_code == 200
    assert c.get("/api/state", headers=h).json() == {"B": [1]}
    assert c.get("/api/state").status_code == 401
