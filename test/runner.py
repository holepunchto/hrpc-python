import asyncio
import json
import sys

sys.path.insert(0, sys.argv[1])  # temp dir holding generated schema.py + hrpc.py

import schema  # noqa: E402
from hrpc import HRPC  # noqa: E402


def make_pair():
    holder = {}

    async def send_a(frame):
        await holder["b"].receive(frame)

    async def send_b(frame):
        await holder["a"].receive(frame)

    holder["a"] = HRPC(send_a, schema.resolve)
    holder["b"] = HRPC(send_b, schema.resolve)
    return holder["a"], holder["b"]


async def main():
    events = []
    a, b = make_pair()

    async def on_command_a(request):
        return {"sum": request["x"] + request["y"]}

    async def on_notify(request):
        events.append(request)

    b.on_command_a(on_command_a)
    b.on_notify(on_notify)

    response = await a.command_a({"x": 2, "y": 3})
    await a.notify("hi")
    for _ in range(100):  # let the detached event-dispatch task run
        if events:
            break
        await asyncio.sleep(0)

    print(json.dumps({"response": response, "events": events}))


asyncio.run(main())
