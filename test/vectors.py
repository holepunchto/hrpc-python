import asyncio
import json
import sys

sys.path.insert(0, sys.argv[1])  # temp dir holding generated schema.py + hrpc.py

import schema  # noqa: E402
from hrpc import HRPC  # noqa: E402


def make_pair():
    """A client/server pair that records every frame each side puts on the wire."""
    holder = {}
    sent = []

    async def send_a(frame):
        sent.append(bytes(frame).hex())
        await holder["b"].receive(frame)

    async def send_b(frame):
        sent.append(bytes(frame).hex())
        await holder["a"].receive(frame)

    holder["a"] = HRPC(send_a, schema.resolve)
    holder["b"] = HRPC(send_b, schema.resolve)
    return holder["a"], holder["b"], sent


async def main():
    client, server, sent = make_pair()
    served = []

    async def on_hello(request):
        served.append(request)
        return {"text": "hi " + request["name"]}

    async def on_ping(request):
        served.append(request)

    server.on_hello(on_hello)
    server.on_ping(on_ping)

    response = await client.hello({"name": "ada"})
    await client.ping({"seq": 7})

    # ping is fire-and-forget, so its handler is scheduled rather than awaited
    for _ in range(100):
        if len(served) == 2:
            break
        await asyncio.sleep(0)

    json.dump({"frames": sent, "response": response, "served": served}, sys.stdout)


asyncio.run(main())
