const test = require('brittle')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Hyperschema = require('hyperschema-python')
const PythonHRPC = require('..')
const generatePython = require('../lib/codegen')

// Lay down a schema.json (with two structs) the hrpc builder can resolve
// against, and return an hrpc builder bound to that temp dir.
function scaffold() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-py-'))
  const schema = new Hyperschema(null, {})
  const ns = schema.namespace('test')
  ns.register({ name: 'req', fields: [{ name: 'x', type: 'uint', required: true }] })
  ns.register({ name: 'res', fields: [{ name: 'y', type: 'uint', required: true }] })
  Hyperschema.toDisk(schema, dir)
  return { dir, hrpc: PythonHRPC.from(dir, dir) }
}

test('golden: unary + send output is byte-for-byte stable', (t) => {
  const { hrpc } = scaffold()
  const rpc = hrpc.namespace('test')
  rpc.register({
    name: 'command-a',
    request: { name: '@test/req', stream: false },
    response: { name: '@test/res', stream: false }
  })
  rpc.register({ name: 'notify', request: { name: 'string', stream: false, send: true } })

  const expected = fs.readFileSync(path.join(__dirname, 'golden', 'unary_send.hrpc.py'), 'utf-8')
  t.is(generatePython(hrpc), expected, 'generated unary+send matches the golden fixture')
})

test('unary + send generate the expected class shape', (t) => {
  const { hrpc } = scaffold()
  const rpc = hrpc.namespace('test')
  rpc.register({
    name: 'command-a',
    request: { name: '@test/req', stream: false },
    response: { name: '@test/res', stream: false }
  })
  rpc.register({ name: 'notify', request: { name: 'string', stream: false, send: true } })

  const code = generatePython(hrpc)
  t.ok(code.includes('def __init__(self, send, resolve):'), 'resolve injected')
  t.ok(code.includes('resolve("@test/req")'), 'registered type via resolve')
  t.ok(code.includes('async def command_a(self, request=None):'))
  t.ok(code.includes('await self._rpc.request(0, data)'), 'unary uses request + id')
  t.ok(code.includes('async def notify(self, request=None):'))
  t.ok(code.includes('await self._rpc.event(1, data)'), 'send uses event + id')
  t.ok(code.includes('def on_command_a(self, handler):'))
  t.ok(code.includes('async def _on_request(self, req):'))
  t.ok(code.includes('async def _on_event(self, ev):'))
})

test('primitives-only schema omits the resolve param', (t) => {
  const { hrpc } = scaffold()
  hrpc.namespace('test').register({
    name: 'echo',
    request: { name: 'string', stream: false },
    response: { name: 'string', stream: false }
  })
  const code = generatePython(hrpc)
  t.ok(code.includes('def __init__(self, send):'), 'no resolve param')
  t.absent(code.includes('resolve('))
})

test('stream handler throws UNSUPPORTED_HANDLER', (t) => {
  const { hrpc } = scaffold()
  hrpc.namespace('test').register({
    name: 'streamy',
    request: { name: '@test/req', stream: false },
    response: { name: '@test/res', stream: true }
  })
  try {
    generatePython(hrpc)
    t.fail('expected throw')
  } catch (err) {
    t.is(err.code, 'UNSUPPORTED_HANDLER')
  }
})

test('bool type throws UNSUPPORTED_TYPE', (t) => {
  const { hrpc } = scaffold()
  hrpc.namespace('test').register({
    name: 'flag',
    request: { name: 'bool', stream: false },
    response: { name: 'string', stream: false }
  })
  try {
    generatePython(hrpc)
    t.fail('expected throw')
  } catch (err) {
    t.is(err.code, 'UNSUPPORTED_TYPE')
  }
})

test('missing response (not send) throws MISSING_RESPONSE', (t) => {
  const { hrpc } = scaffold()
  hrpc.namespace('test').register({ name: 'lonely', request: { name: 'string', stream: false } })
  try {
    generatePython(hrpc)
    t.fail('expected throw')
  } catch (err) {
    t.is(err.code, 'MISSING_RESPONSE')
  }
})

test('toDisk writes both files, and nothing on throw', (t) => {
  const { dir, hrpc } = scaffold()
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-out-'))
  hrpc.namespace('test').register({
    name: 'command-a',
    request: { name: '@test/req', stream: false },
    response: { name: '@test/res', stream: false }
  })
  PythonHRPC.toDisk(hrpc, out)
  t.ok(fs.existsSync(path.join(out, 'hrpc.json')))
  t.ok(fs.existsSync(path.join(out, 'hrpc.py')))

  const { hrpc: bad } = scaffold()
  bad.namespace('test').register({
    name: 'streamy',
    request: { name: '@test/req', stream: true },
    response: { name: '@test/res', stream: false }
  })
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-out2-'))
  try {
    PythonHRPC.toDisk(bad, out2)
    t.fail('expected throw')
  } catch (err) {
    t.is(err.code, 'UNSUPPORTED_HANDLER')
  }
  t.absent(fs.existsSync(path.join(out2, 'hrpc.json')))
  t.absent(fs.existsSync(path.join(out2, 'hrpc.py')))
  t.ok(dir)
})

test('a handler named receive collides with the transport method', (t) => {
  const { hrpc } = scaffold()
  hrpc.namespace('test').register({
    name: 'receive',
    request: { name: 'string', stream: false },
    response: { name: 'string', stream: false }
  })
  try {
    generatePython(hrpc)
    t.fail('expected throw')
  } catch (err) {
    t.is(err.code, 'DUPLICATE_METHOD_NAME')
  }
})

test('a client method and an on_ registration cannot collide', (t) => {
  const { hrpc } = scaffold()
  const rpc = hrpc.namespace('test')
  rpc.register({
    name: 'foo',
    request: { name: 'string', stream: false },
    response: { name: 'string', stream: false }
  })
  rpc.register({
    name: 'on-foo',
    request: { name: 'string', stream: false },
    response: { name: 'string', stream: false }
  })
  try {
    generatePython(hrpc)
    t.fail('expected throw')
  } catch (err) {
    t.is(err.code, 'DUPLICATE_METHOD_NAME')
  }
})

test('a handler mapping to a python keyword throws', (t) => {
  const { hrpc } = scaffold()
  hrpc.namespace('test').register({
    name: 'class',
    request: { name: 'string', stream: false },
    response: { name: 'string', stream: false }
  })
  try {
    generatePython(hrpc)
    t.fail('expected throw')
  } catch (err) {
    t.is(err.code, 'RESERVED_KEYWORD')
  }
})
