const test = require('brittle')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const Hyperschema = require('hyperschema-python')
const PythonHRPC = require('.')

require('./test/skeleton.test.js') // run the generator unit tests as part of the suite

const PYTHON = process.env.HRPC_PYTHON || path.join(__dirname, '.venv', 'bin', 'python')
const RUNNER = path.join(__dirname, 'test', 'runner.py')

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
