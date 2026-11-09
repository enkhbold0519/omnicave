// Thin wrapper around the webOS CLI installed by ../setup.ps1 in ../tools/node16.
// Usage:  node scripts/webos.mjs <package|install|launch|inspect|deploy|ares> [args]
// Env:    WEBOS_DEVICE (default "emulator")
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const node16 = resolve(appRoot, '..', 'tools', 'node16')
const outDir = join(appRoot, 'out')
const distDir = join(appRoot, 'dist')
const device = process.env.WEBOS_DEVICE || 'emulator'
const { id: appId, version } = JSON.parse(readFileSync(join(appRoot, 'public', 'appinfo.json'), 'utf8'))

function ares(cmd, args) {
  const isWin = process.platform === 'win32'
  const shim = isWin ? join(node16, `${cmd}.cmd`) : join(node16, 'bin', cmd)
  const exe = existsSync(shim) ? shim : cmd // fall back to PATH (e.g. global install on mac/linux)
  console.log(`\n> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(isWin ? `"${exe}"` : exe, args.map(a => (isWin && /\s/.test(a) ? `"${a}"` : a)), {
    stdio: 'inherit',
    shell: isWin,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function ipkPath() {
  const f = existsSync(outDir) && readdirSync(outDir).find(n => n.startsWith(appId) && n.endsWith('.ipk'))
  if (!f) { console.error('No .ipk in out/. Run "npm run webos:package" first.'); process.exit(1) }
  return join(outDir, f)
}

const [task, ...rest] = process.argv.slice(2)
switch (task) {
  case 'package':
    if (!existsSync(join(distDir, 'appinfo.json'))) { console.error('dist/ missing. Run "npm run build" first.'); process.exit(1) }
    ares('ares-package', [distDir, '-o', outDir, '--no-minify'])
    break
  case 'install':
    ares('ares-install', ['-d', device, ipkPath()])
    break
  case 'launch':
    ares('ares-launch', ['-d', device, appId])
    break
  case 'inspect':
    ares('ares-inspect', ['-d', device, '--app', appId, '--open'])
    break
  case 'deploy':
    ares('ares-package', [distDir, '-o', outDir, '--no-minify'])
    ares('ares-install', ['-d', device, ipkPath()])
    ares('ares-launch', ['-d', device, appId])
    console.log(`\nDeployed ${appId} ${version} to "${device}".`)
    break
  case 'ares': {
    const [cmd, ...args] = rest
    if (!cmd) { console.error('usage: npm run ares -- <ares-command> [args]'); process.exit(1) }
    ares(cmd, args)
    break
  }
  default:
    console.error('usage: node scripts/webos.mjs <package|install|launch|inspect|deploy|ares>')
    process.exit(1)
}
