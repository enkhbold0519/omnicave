"""Live updates over WebSocket (/api/ws).

After a change, every open client of that user gets {"type": "changed", "what": ...} and refetches at once,
instead of waiting for its next poll. Messages carry no data, so a missed one only costs a poll interval.
This works because the API runs as ONE process (see deploy/README.md); several workers would need a broker.
"""
from __future__ import annotations

import asyncio
import threading

_subs: dict[int, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = {}
_lock = threading.Lock()
DELAY = 0.3   # seconds; lets the change's database transaction commit before clients refetch


def subscribe(uid: int) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=20)
    with _lock:
        _subs.setdefault(uid, []).append((asyncio.get_running_loop(), q))
    return q


def unsubscribe(uid: int, q: asyncio.Queue) -> None:
    with _lock:
        left = [s for s in _subs.get(uid, []) if s[1] is not q]
        if left:
            _subs[uid] = left
        else:
            _subs.pop(uid, None)


def publish(uid: int | None, what: str) -> None:
    """Thread-safe: called from request threads and the simulator."""
    if uid is None:
        return
    with _lock:
        targets = list(_subs.get(uid, ()))
    msg = {"type": "changed", "what": what}
    for loop, q in targets:
        loop.call_soon_threadsafe(loop.call_later, DELAY, _put, q, msg)


def _put(q: asyncio.Queue, msg: dict) -> None:
    if not q.full():   # a slow client just misses messages; it still polls
        q.put_nowait(msg)
