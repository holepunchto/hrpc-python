const HRPCBuilder = require('hrpc')
const writeToDisk = require('./lib/write')

class PythonHRPC extends HRPCBuilder {
  static toDisk(hrpc, dir, opts = {}) {
    if (typeof dir === 'object' && dir !== null && !Array.isArray(dir)) {
      opts = dir
      dir = null
    }
    if (!dir) dir = hrpc.hrpcDir
    writeToDisk(hrpc, dir, opts)
  }
}

module.exports = PythonHRPC
