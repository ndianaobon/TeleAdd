import asyncio
import contextlib

from fastapi import WebSocket, WebSocketDisconnect

from app.core.redis import get_redis


async def relay_channel(websocket: WebSocket, channel: str) -> None:
    """Forward Redis pub/sub messages on `channel` to the socket until either side closes."""
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(channel)

    async def reader() -> None:
        async for message in pubsub.listen():
            if message.get("type") == "message":
                await websocket.send_text(message["data"])

    async def keepalive() -> None:
        # Consume client pings/messages so disconnects are detected promptly.
        while True:
            await websocket.receive_text()

    tasks = [asyncio.create_task(reader()), asyncio.create_task(keepalive())]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        for t in done:
            with contextlib.suppress(WebSocketDisconnect, asyncio.CancelledError, RuntimeError):
                t.result()
    finally:
        for t in tasks:
            t.cancel()
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
