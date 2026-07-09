const fs = require('fs')
const path = require('path')
const generatePython = require('./codegen')

module.exports = function writeToDisk(hrpc, dir) {
  const code = generatePython(hrpc) // throws before any write
  const root = path.resolve(dir)
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'hrpc.json'), JSON.stringify(hrpc.toJSON(), null, 2) + '\n', {
    encoding: 'utf-8'
  })
  fs.writeFileSync(path.join(root, 'hrpc.py'), code, { encoding: 'utf-8' })
}
