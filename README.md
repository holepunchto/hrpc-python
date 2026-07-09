# hrpc-python

Python code generation for [HRPC](https://github.com/holepunchto/hrpc): emits a typed Python RPC class that drives [bare-rpc-python](https://github.com/holepunchto/bare-rpc-python), with type codecs from [hyperschema-python](https://github.com/holepunchto/hyperschema-python). The Python analog of [hrpc-swift](https://github.com/holepunchto/hrpc-swift).

## Usage

```js
const Hyperschema = require('hyperschema-python')
const HRPC = require('hrpc-python')

// after registering schema types and rpc commands:
Hyperschema.toDisk(schema, './spec/python')
HRPC.toDisk(hrpc, './spec/python')
// writes ./spec/python/{schema.py, hrpc.json, hrpc.py}
```

The generated `hrpc.py` exposes an `HRPC` class: `rpc = HRPC(send, resolve)` (pass `schema.resolve`), then `await rpc.<command>(request)` for unary calls and `rpc.on_<command>(handler)` to serve them. Send (fire-and-forget), response-stream, request-stream, and duplex commands are generated too - see [Streams](#streams) below.

## Streams

Stream chunks are typed dicts (encoded/decoded through the schema type).

Response-stream - client sends args, reads a stream of responses:

```python
stream = await hrpc.feed({"count": 3})
async for chunk in stream:
    print(chunk["seq"])

# server
async def on_feed(request, outgoing):
    for i in range(request["count"]):
        await outgoing.write({"seq": i})
    await outgoing.end()

hrpc.on_feed(on_feed)
```

Request-stream - client streams requests, awaits one reply:

```python
outgoing, reply = await hrpc.upload()
await outgoing.write({"seq": 1})
await outgoing.end()
result = await reply

# server
async def on_upload(incoming):
    total = 0
    async for chunk in incoming:
        total += chunk["seq"]
    return {"total": total}

hrpc.on_upload(on_upload)
```

Duplex - both sides stream:

```python
outgoing, incoming = await hrpc.chat()
await outgoing.write({"n": 1})
await outgoing.end()
async for chunk in incoming:
    print(chunk["label"])

# server
async def on_chat(incoming, outgoing):
    async for chunk in incoming:
        await outgoing.write({"label": "n" + str(chunk["n"])})
    await outgoing.end()

hrpc.on_chat(on_chat)
```
