const { execFileSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  const outDir = context && context.appOutDir
  if (!outDir) return
  try {
    execFileSync('xattr', ['-cr', outDir], { stdio: 'inherit' })
    console.log(`[afterPack] cleared xattr: ${outDir}`)
  } catch (error) {
    console.warn(`[afterPack] xattr clear failed: ${error && error.message ? error.message : error}`)
  }
}
