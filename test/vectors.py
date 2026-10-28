import asyncio
import json
import sys

sys.path.insert(0, sys.argv[1])  # temp dir holding generated schema.py + hrpc.py

import schema  # noqa: E402
from hrpc import HRPC  # noqa: E402
from pipe import pair  # noqa: E402


def make_pair():
    """A client/server pair that records every frame each side puts on the wire."""
    sent = []
    left, right = pair(sent)
    return HRPC(left, schema.resolve), HRPC(right, schema.resolve), sent


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

    json.dump({"frames": [frame.hex() for frame in sent], "response": response, "served": served}, sys.stdout)


asyncio.run(main())
