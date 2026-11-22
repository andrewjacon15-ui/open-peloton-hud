/**
 * Runs a Gradle task on the Android shell (android/), with the SDK found for you.
 *
 *   node scripts/android.mjs <gradle task...>     e.g. assembleDebug, testDebugUnitTest, installDebug
 *
 * The SDK is ANDROID_HOME, or the first usual install place that has one (see docs/SETUP.md). android/local.properties is written
 * on first run and is not tracked.
 */
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const android = join(root, 'android')
// ANDROID_HOME / ANDROID_SDK_ROOT, else the usual install places (Android Studio's defaults per OS, and ~/Android/sdk).
const candidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  join(homedir(), 'Library', 'Android', 'sdk'),
  join(homedir(), 'Android', 'Sdk'),
  join(homedir(), 'Android', 'sdk'),
].filter(Boolean)
const sdk = candidates.find((p) => existsSync(join(p, 'platforms'))) || candidates[0] || join(homedir(), 'Android', 'sdk')
const tasks = process.argv.slice(2)

if (!tasks.length) {
  console.error('usage: node scripts/android.mjs <gradle task...>')
  process.exit(2)
}
if (!existsSync(join(sdk, 'platforms'))) {
  console.error(`No Android SDK at ${sdk}. Install it (docs/SETUP.md) or set ANDROID_HOME.`)
  process.exit(1)
}
const local = join(android, 'local.properties')
if (!existsSync(local)) writeFileSync(local, `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`)

// A .bat file can only be started through cmd.exe.
const [command, args] =
  process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', join(android, 'gradlew.bat')]] : [join(android, 'gradlew'), []]
const child = spawn(command, [...args, '--console=plain', ...tasks], {
  cwd: android,
  stdio: 'inherit',
  env: { ...process.env, ANDROID_HOME: sdk },
})
child.on('exit', (code) => process.exit(code ?? 1))
