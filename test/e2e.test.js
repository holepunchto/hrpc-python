const test = require('brittle')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const Hyperschema = require('hyperschema-python')
const PythonHRPC = require('..')

const PYTHON = process.env.HRPC_PYTHON || path.join(__dirname, '..', '.venv', 'bin', 'python')
const RUNNER = path.join(__dirname, 'runner.py')

test('unary roundtrip + send event over an in-memory pair', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-e2e-'))

  const schema = new Hyperschema(null, {})
  const ns = schema.namespace('test')
  ns.register({
    name: 'command-a-request',
    fields: [
      { name: 'x', type: 'uint', required: true },
      { name: 'y', type: 'uint', required: true }
    ]
  })
  ns.register({
    name: 'command-a-response',
    fields: [{ name: 'sum', type: 'uint', required: true }]
  })
  Hyperschema.toDisk(schema, dir)

  const hrpc = PythonHRPC.from(dir, dir)
  const rpc = hrpc.namespace('test')
  rpc.register({
    name: 'command-a',
    request: { name: '@test/command-a-request', stream: false },
    response: { name: '@test/command-a-response', stream: false }
  })
  rpc.register({ name: 'notify', request: { name: 'string', stream: false, send: true } })
  PythonHRPC.toDisk(hrpc, dir)

  const res = spawnSync(PYTHON, [RUNNER, dir], { encoding: 'utf-8' })
  t.is(res.status, 0, `runner exited 0\n${res.stderr}`)
  if (res.status !== 0) return
  const out = JSON.parse(res.stdout)
  t.alike(out.response, { sum: 5 }, 'unary response decoded')
  t.alike(out.events, ['hi'], 'send event delivered')
})

test('response-stream roundtrip + destroy + no-handler over an in-memory pair', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-rs-'))

  const schema = new Hyperschema(null, {})
  const ns = schema.namespace('test')
  ns.register({ name: 'feed-req', fields: [{ name: 'count', type: 'uint', required: true }] })
  ns.register({ name: 'chunk', fields: [{ name: 'seq', type: 'uint', required: true }] })
  Hyperschema.toDisk(schema, dir)

  const hrpc = PythonHRPC.from(dir, dir)
  hrpc.namespace('test').register({
    name: 'feed',
    request: { name: '@test/feed-req', stream: false },
    response: { name: '@test/chunk', stream: true }
  })
  PythonHRPC.toDisk(hrpc, dir)

  const res = spawnSync(PYTHON, [RUNNER, dir, 'response_stream'], { encoding: 'utf-8' })
  t.is(res.status, 0, `runner exited 0\n${res.stderr}`)
  if (res.status !== 0) return
  const out = JSON.parse(res.stdout)
  t.alike(out.chunks, [{ seq: 0 }, { seq: 1 }, { seq: 2 }], 'typed chunks in order')
  t.is(out.destroy_code, 'BOOM', 'destroy error propagates with code')
  t.is(out.no_handler_code, 'NO_HANDLER', 'missing handler rejects')
})

test('request-stream roundtrip + handler-error + no-handler over an in-memory pair', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-qs-'))

  const schema = new Hyperschema(null, {})
  const ns = schema.namespace('test')
  ns.register({ name: 'up-chunk', fields: [{ name: 'seq', type: 'uint', required: true }] })
  ns.register({ name: 'up-res', fields: [{ name: 'total', type: 'uint', required: true }] })
  Hyperschema.toDisk(schema, dir)

  const hrpc = PythonHRPC.from(dir, dir)
  hrpc.namespace('test').register({
    name: 'upload',
    request: { name: '@test/up-chunk', stream: true },
    response: { name: '@test/up-res', stream: false }
  })
  PythonHRPC.toDisk(hrpc, dir)

  const res = spawnSync(PYTHON, [RUNNER, dir, 'request_stream'], { encoding: 'utf-8' })
  t.is(res.status, 0, `runner exited 0\n${res.stderr}`)
  if (res.status !== 0) return
  const out = JSON.parse(res.stdout)
  t.alike(out.reply, { total: 3 }, 'typed aggregate reply')
  t.is(out.error_code, 'HANDLER_ERROR', 'handler error rejects the reply')
  t.is(out.no_handler_code, 'NO_HANDLER', 'missing handler rejects the reply')
})

test('duplex roundtrip with distinct element types + handler-error + no-handler', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-dx-'))

  const schema = new Hyperschema(null, {})
  const ns = schema.namespace('test')
  ns.register({ name: 'dup-in', fields: [{ name: 'n', type: 'uint', required: true }] })
  ns.register({ name: 'dup-out', fields: [{ name: 'label', type: 'string', required: true }] })
  Hyperschema.toDisk(schema, dir)

  const hrpc = PythonHRPC.from(dir, dir)
  hrpc.namespace('test').register({
    name: 'chat',
    request: { name: '@test/dup-in', stream: true },
    response: { name: '@test/dup-out', stream: true }
  })
  PythonHRPC.toDisk(hrpc, dir)

  const res = spawnSync(PYTHON, [RUNNER, dir, 'duplex'], { encoding: 'utf-8' })
  t.is(res.status, 0, `runner exited 0\n${res.stderr}`)
  if (res.status !== 0) return
  const out = JSON.parse(res.stdout)
  t.alike(
    out.labels,
    [{ label: 'n1' }, { label: 'n2' }],
    'response chunks decoded with the response codec'
  )
  t.is(out.error_code, 'HANDLER_ERROR', 'handler error destroys the response half')
  t.is(out.no_handler_code, 'NO_HANDLER', 'missing handler rejects')
})

test('all handler kinds coexist in one generated class', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-mix-'))

  const schema = new Hyperschema(null, {})
  const ns = schema.namespace('test')
  ns.register({
    name: 'ca-req',
    fields: [
      { name: 'x', type: 'uint', required: true },
      { name: 'y', type: 'uint', required: true }
    ]
  })
  ns.register({ name: 'ca-res', fields: [{ name: 'sum', type: 'uint', required: true }] })
  ns.register({ name: 'feed-req', fields: [{ name: 'count', type: 'uint', required: true }] })
  ns.register({ name: 'chunk', fields: [{ name: 'seq', type: 'uint', required: true }] })
  ns.register({ name: 'up-res', fields: [{ name: 'total', type: 'uint', required: true }] })
  ns.register({ name: 'dup-in', fields: [{ name: 'n', type: 'uint', required: true }] })
  ns.register({ name: 'dup-out', fields: [{ name: 'label', type: 'string', required: true }] })
  Hyperschema.toDisk(schema, dir)

  const hrpc = PythonHRPC.from(dir, dir)
  const rpc = hrpc.namespace('test')
  rpc.register({
    name: 'command-a',
    request: { name: '@test/ca-req', stream: false },
    response: { name: '@test/ca-res', stream: false }
  })
  rpc.register({
    name: 'feed',
    request: { name: '@test/feed-req', stream: false },
    response: { name: '@test/chunk', stream: true }
  })
  rpc.register({
    name: 'upload',
    request: { name: '@test/chunk', stream: true },
    response: { name: '@test/up-res', stream: false }
  })
  rpc.register({
    name: 'chat',
    request: { name: '@test/dup-in', stream: true },
    response: { name: '@test/dup-out', stream: true }
  })
  PythonHRPC.toDisk(hrpc, dir)

  const res = spawnSync(PYTHON, [RUNNER, dir, 'coexistence'], { encoding: 'utf-8' })
  t.is(res.status, 0, `runner exited 0\n${res.stderr}`)
  if (res.status !== 0) return
  const out = JSON.parse(res.stdout)
  t.alike(out.unary, { sum: 5 }, 'unary works alongside streams')
  t.alike(out.feed, [{ seq: 0 }, { seq: 1 }], 'response-stream works')
  t.alike(out.upload, { total: 3 }, 'request-stream works')
  t.alike(out.chat, [{ label: 'n7' }], 'duplex works')
})
