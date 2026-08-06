// Cross-language conformance: the generated Python client's frames against
// hrpc-test's dispatch vectors.
//
// Only the dispatch family: framing is bare-rpc-python's, and it runs the other
// families itself. What is hrpc-python's to keep stable is the code it emits -
// command ids and payload codecs - so this drives a generated client and pins
// the bytes it puts on the wire.
const test = require('brittle')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const Hyperschema = require('hyperschema-python')
const PythonHRPC = require('..')

const PYTHON = process.env.HRPC_PYTHON || path.join(__dirname, '..', '.venv', 'bin', 'python')
const RUNNER = path.join(__dirname, 'vectors.py')

const DISPATCH_DIR = path.join(
  path.dirname(require.resolve('hrpc-test/package')),
  'fixtures',
  'dispatch'
)

test('generated client reproduces the dispatch vectors', (t) => {
  const frames = readJSON(path.join(DISPATCH_DIR, 'frames.json'))
  const messages = readJSON(path.join(DISPATCH_DIR, 'messages.json'))

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrpc-vectors-'))

  // Generated from hrpc-test's frozen spec, so the ids under test come from the
  // fixture rather than a hand-copy
  Hyperschema.toDisk(Hyperschema.from(path.join(DISPATCH_DIR, 'schema')), dir)
  PythonHRPC.toDisk(
    PythonHRPC.from(path.join(DISPATCH_DIR, 'schema'), path.join(DISPATCH_DIR, 'hrpc')),
    dir
  )

  const res = spawnSync(PYTHON, [RUNNER, dir], { encoding: 'utf-8' })
  t.is(res.status, 0, `runner exited 0\n${res.stderr}`)
  if (res.status !== 0) return

  const out = JSON.parse(res.stdout)

  t.alike(out.frames, frames, 'client and server frames match the fixtures')
  t.alike(out.response, { text: 'hi ada' }, 'hello response decoded')
  t.alike(out.served, [{ name: 'ada' }, { seq: 7 }], 'handlers received the decoded payloads')

  for (let i = 0; i < frames.length; i++) {
    t.is(out.frames[i], frames[i], messages[i].note)
  }
})

function readJSON(filename) {
  return JSON.parse(fs.readFileSync(filename))
}
