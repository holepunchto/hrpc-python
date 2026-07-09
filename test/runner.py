import asyncio
import json
import sys

sys.path.insert(0, sys.argv[1])  # temp dir holding generated schema.py + hrpc.py

import schema  # noqa: E402
from bare_rpc import RPCRemoteError  # noqa: E402
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


async def scenario_unary():
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
    for _ in range(100):
        if events:
            break
        await asyncio.sleep(0)

    return {"response": response, "events": events}


async def scenario_response_stream():
    result = {}

    # happy path
    a, b = make_pair()

    async def on_feed(request, outgoing):
        for i in range(request["count"]):
            await outgoing.write({"seq": i})
        await outgoing.end()

    b.on_feed(on_feed)
    stream = await a.feed({"count": 3})
    result["chunks"] = [chunk async for chunk in stream]

    # destroy propagation
    a2, b2 = make_pair()

    async def on_feed_destroy(request, outgoing):
        await outgoing.destroy(RPCRemoteError("nope", "BOOM", 0))

    b2.on_feed(on_feed_destroy)
    stream2 = await a2.feed({"count": 1})
    try:
        async for _ in stream2:
            pass
        result["destroy_code"] = None
    except RPCRemoteError as err:
        result["destroy_code"] = err.code

    # no handler
    a3, _ = make_pair()
    try:
        await a3.feed({"count": 1})
        result["no_handler_code"] = None
    except RPCRemoteError as err:
        result["no_handler_code"] = err.code

    return result


async def scenario_request_stream():
    result = {}

    # happy path
    a, b = make_pair()

    async def on_upload(incoming):
        total = 0
        async for chunk in incoming:
            total += chunk["seq"]
        return {"total": total}

    b.on_upload(on_upload)
    outgoing, reply = await a.upload()
    for i in range(3):
        await outgoing.write({"seq": i})
    await outgoing.end()
    result["reply"] = await reply

    # handler error
    a2, b2 = make_pair()

    async def on_upload_error(incoming):
        async for _ in incoming:
            pass
        raise ValueError("boom")

    b2.on_upload(on_upload_error)
    outgoing2, reply2 = await a2.upload()
    await outgoing2.write({"seq": 0})
    await outgoing2.end()
    try:
        await reply2
        result["error_code"] = None
    except RPCRemoteError as err:
        result["error_code"] = err.code

    # no handler
    a3, _ = make_pair()
    outgoing3, reply3 = await a3.upload()
    await outgoing3.end()
    try:
        await reply3
        result["no_handler_code"] = None
    except RPCRemoteError as err:
        result["no_handler_code"] = err.code

    return result


async def scenario_duplex():
    result = {}

    # happy path (request {n} -> response {label})
    a, b = make_pair()

    async def on_chat(incoming, outgoing):
        async for chunk in incoming:
            await outgoing.write({"label": "n" + str(chunk["n"])})
        await outgoing.end()

    b.on_chat(on_chat)
    outgoing, incoming = await a.chat()
    await outgoing.write({"n": 1})
    await outgoing.write({"n": 2})
    await outgoing.end()
    result["labels"] = [chunk async for chunk in incoming]

    # handler error -> both halves destroyed
    a2, b2 = make_pair()

    async def on_chat_error(incoming, outgoing):
        async for _ in incoming:
            pass
        raise ValueError("boom")

    b2.on_chat(on_chat_error)
    outgoing2, incoming2 = await a2.chat()
    await outgoing2.write({"n": 1})
    await outgoing2.end()
    try:
        async for _ in incoming2:
            pass
        result["error_code"] = None
    except RPCRemoteError as err:
        result["error_code"] = err.code

    # no handler
    a3, _ = make_pair()
    try:
        await a3.chat()
        result["no_handler_code"] = None
    except RPCRemoteError as err:
        result["no_handler_code"] = err.code

    return result


async def scenario_coexistence():
    a, b = make_pair()

    async def on_command_a(request):
        return {"sum": request["x"] + request["y"]}

    async def on_feed(request, outgoing):
        for i in range(request["count"]):
            await outgoing.write({"seq": i})
        await outgoing.end()

    async def on_upload(incoming):
        total = 0
        async for chunk in incoming:
            total += chunk["seq"]
        return {"total": total}

    async def on_chat(incoming, outgoing):
        async for chunk in incoming:
            await outgoing.write({"label": "n" + str(chunk["n"])})
        await outgoing.end()

    b.on_command_a(on_command_a)
    b.on_feed(on_feed)
    b.on_upload(on_upload)
    b.on_chat(on_chat)

    unary = await a.command_a({"x": 2, "y": 3})

    feed_stream = await a.feed({"count": 2})
    feed = [chunk async for chunk in feed_stream]

    up_out, up_reply = await a.upload()
    for i in range(3):
        await up_out.write({"seq": i})
    await up_out.end()
    upload = await up_reply

    chat_out, chat_in = await a.chat()
    await chat_out.write({"n": 7})
    await chat_out.end()
    chat = [chunk async for chunk in chat_in]

    return {"unary": unary, "feed": feed, "upload": upload, "chat": chat}


SCENARIOS = {
    "unary": scenario_unary,
    "response_stream": scenario_response_stream,
    "request_stream": scenario_request_stream,
    "duplex": scenario_duplex,
    "coexistence": scenario_coexistence,
}


async def main():
    name = sys.argv[2] if len(sys.argv) > 2 else "unary"
    result = await asyncio.wait_for(SCENARIOS[name](), 5)
    print(json.dumps(result))


asyncio.run(main())
