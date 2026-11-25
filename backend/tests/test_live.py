"""Live sync hub (live.py): a write sends "changed" to that owner's open connections only."""
import asyncio

from app import live


def test_write_notifies_only_the_owner(user, call):
    me = call("GET", "/api/me", token=user["token"])["id"]

    async def scenario():
        mine, stranger = live.subscribe(me), live.subscribe(-1)
        try:
            await asyncio.to_thread(call, "PATCH", "/api/me", {"display_name": "Daniel"}, user["token"])
            msg = await asyncio.wait_for(mine.get(), timeout=3)
            await asyncio.sleep(live.DELAY + 0.2)
            return msg, stranger.empty()
        finally:
            live.unsubscribe(me, mine)
            live.unsubscribe(-1, stranger)

    msg, stranger_quiet = asyncio.run(scenario())
    assert msg["type"] == "changed" and stranger_quiet
    assert me not in live._subs                                  # unsubscribing cleans up


def test_reads_send_nothing(user, call):
    me = call("GET", "/api/me", token=user["token"])["id"]

    async def scenario():
        q = live.subscribe(me)
        try:
            await asyncio.to_thread(call, "GET", "/api/cellars", None, user["token"])
            await asyncio.sleep(live.DELAY + 0.3)
            return q.empty()
        finally:
            live.unsubscribe(me, q)

    assert asyncio.run(scenario())
