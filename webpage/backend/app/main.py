"""OmniCave server: auth, per-user cellar state, live sync over WebSocket, and the web app itself."""
import hashlib, hmac, json, os, re, secrets, time
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import ForeignKey, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

DB = os.getenv("DATABASE_URL", "sqlite:///omnicave.db")
SECRET = os.getenv("SECRET_KEY", "dev-secret-change-me").encode()
engine = create_engine(DB, connect_args={"check_same_thread": False} if DB.startswith("sqlite") else {})

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    pw: Mapped[str] = mapped_column(String(255))
class State(Base):
    __tablename__ = "states"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    data: Mapped[str] = mapped_column(Text)
Base.metadata.create_all(engine)

EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$")
def strong(p: str) -> bool:
    return bool(re.search(r"[a-z]", p) and re.search(r"[A-Z]", p) and re.search(r"\d", p) and re.search(r"[^\w\s]", p) and len(p) >= 8)

def hash_pw(p: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    return salt.hex() + "$" + hashlib.scrypt(p.encode(), salt=salt, n=2**14, r=8, p=1).hex()
def check_pw(p: str, stored: str) -> bool:
    return hmac.compare_digest(hash_pw(p, bytes.fromhex(stored.split("$")[0])), stored)

def sign(body: str) -> str: return hmac.new(SECRET, body.encode(), "sha256").hexdigest()
def make_token(uid: int) -> str:
    body = f"{uid}.{int(time.time()) + 7 * 86400}"
    return f"{body}.{sign(body)}"
def read_token(t: str | None) -> int | None:
    try:
        uid, exp, sig = (t or "").split(".")
        if hmac.compare_digest(sig, sign(f"{uid}.{exp}")) and int(exp) > time.time(): return int(uid)
    except ValueError: pass
    return None
def current(auth: str | None) -> int:
    uid = read_token((auth or "").removeprefix("Bearer "))
    if uid is None: raise HTTPException(401, "Please log in again")
    return uid

class Creds(BaseModel):
    email: str
    password: str
class Profile(BaseModel):
    email: str | None = None
    password: str | None = None

app = FastAPI(title="OmniCave")
hub: dict[int, dict[str, WebSocket]] = {}

@app.get("/api/health")
def health(): return {"ok": True}

@app.post("/api/register", status_code=201)
def register(c: Creds):
    if not EMAIL.match(c.email): raise HTTPException(400, "Enter a valid email.")
    if not strong(c.password): raise HTTPException(400, "Password needs 8+ characters with upper, lower, number and symbol.")
    with Session(engine) as s:
        if s.scalar(select(User).where(User.email == c.email)): raise HTTPException(409, "That email is already registered.")
        s.add(User(email=c.email, pw=hash_pw(c.password))); s.commit()
    return {"ok": True}

@app.post("/api/login")
def login(c: Creds):
    with Session(engine) as s:
        u = s.scalar(select(User).where(User.email == c.email))
        if not u or not check_pw(c.password, u.pw): raise HTTPException(401, "Invalid email or password")
        return {"token": make_token(u.id)}

@app.put("/api/profile")
def profile(p: Profile, authorization: str | None = Header(None)):
    uid = current(authorization)
    with Session(engine) as s:
        u = s.get(User, uid)
        if p.email and p.email != u.email:
            if not EMAIL.match(p.email): raise HTTPException(400, "Enter a valid email.")
            if s.scalar(select(User).where(User.email == p.email)): raise HTTPException(409, "That email is already registered.")
            u.email = p.email
        if p.password:
            if not strong(p.password): raise HTTPException(400, "Password needs 8+ characters with upper, lower, number and symbol.")
            u.pw = hash_pw(p.password)
        s.commit()
    return {"ok": True}

@app.get("/api/state")
def get_state(authorization: str | None = Header(None)):
    uid = current(authorization)
    with Session(engine) as s:
        row = s.get(State, uid)
        if not row: raise HTTPException(404, "No saved cellar yet")
        return json.loads(row.data)

@app.put("/api/state")
async def put_state(request: Request, authorization: str | None = Header(None), x_cid: str = Header("")):
    uid = current(authorization)
    raw = await request.body()
    if len(raw) > 2_000_000: raise HTTPException(413, "State too large")
    json.loads(raw)
    with Session(engine) as s:
        row = s.get(State, uid)
        if row: row.data = raw.decode()
        else: s.add(State(user_id=uid, data=raw.decode()))
        s.commit()
    for cid, sock in list(hub.get(uid, {}).items()):
        if cid != x_cid:
            try: await sock.send_text("changed")
            except Exception: hub[uid].pop(cid, None)
    return {"ok": True}

@app.websocket("/ws")
async def ws(sock: WebSocket, token: str = "", cid: str = ""):
    uid = read_token(token)
    if uid is None:
        await sock.close(code=4401); return
    await sock.accept(); hub.setdefault(uid, {})[cid] = sock
    try:
        while True: await sock.receive_text()
    except WebSocketDisconnect: pass
    finally: hub.get(uid, {}).pop(cid, None)

app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "frontend", html=True), name="web")
