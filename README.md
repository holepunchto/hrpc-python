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

The generated `hrpc.py` exposes an `HRPC` class: `rpc = HRPC(send, resolve)` (pass `schema.resolve`), then `await rpc.<command>(request)` for unary calls and `rpc.on_<command>(handler)` to serve them. Only unary and send (fire-and-forget) commands are generated in this cut.
