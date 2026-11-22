// A small guard against the two ways private things end up in the repo: a credential pasted into a file, and personal data files
// (your spreadsheets, a backup) added by accident. It reads only the files git tracks, so it is what a push would publish.
// The app uses no cloud keys at all, so Google API keys (AIza...) are flagged too.
//
// Personal strings (your name, email, bike serial, Wi-Fi name...) can't be listed here without publishing them, so put them in a
// gitignored `.private-patterns` file, one per line (case-insensitive, # for comments). They are then blocked from every push.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)

/** Files that must never be tracked, whatever is in them. */
const FORBIDDEN = [
  { test: (f) => /\.(xlsx|xls)$/i.test(f), why: 'a spreadsheet (personal data)' },
  { test: (f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.(example|sample)$/.test(f), why: 'an environment file' },
  { test: (f) => /(^|\/)(serviceAccount|service-account)[^/]*\.json$/i.test(f) || /-firebase-adminsdk-[^/]*\.json$/.test(f), why: 'a service account key' },
  { test: (f) => /\.(apk|aab|keystore|jks)$/i.test(f), why: 'a built app or signing key' },
  { test: (f) => /(^|\/)local\.properties$/.test(f), why: 'a machine-specific Android file' },
  { test: (f) => /firestore-debug\.log$/.test(f), why: 'an emulator log' },
]

const PATTERNS = [
  { name: 'a private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'a service account key', re: /"private_key"\s*:\s*"-----BEGIN/ },
  { name: 'a GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'a Google refresh or access token', re: /\b1\/\/0[A-Za-z0-9_-]{40,}\b|\bya29\.[A-Za-z0-9_-]{30,}\b/ },
  { name: 'an AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'a Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'an Anthropic or OpenAI key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: 'a Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
if (existsSync('.private-patterns')) {
  for (const line of readFileSync('.private-patterns', 'utf8').split(/\r?\n/)) {
    const s = line.trim()
    if (s && !s.startsWith('#')) PATTERNS.push({ name: 'a private string from .private-patterns', re: new RegExp(escapeRe(s), 'i'), quiet: true })
  }
}

/** This file lists the patterns, so it would flag itself. */
const SKIP = new Set(['scripts/check-secrets.mjs'])
const SKIP_EXT = /\.(png|jpg|jpeg|gif|webp|ico|svg|woff2?|ttf|pdf|lock|zip|xlsx|jar)$/i
const MAX_BYTES = 1_000_000

const problems = []
for (const f of files) {
  for (const rule of FORBIDDEN) if (rule.test(f)) problems.push(`${f}: ${rule.why} is tracked`)
  if (SKIP.has(f) || SKIP_EXT.test(f) || f === 'package-lock.json') continue
  let size
  try {
    size = statSync(f).size
  } catch {
    continue // listed but deleted in the working tree
  }
  if (size > MAX_BYTES) continue
  const text = readFileSync(f, 'utf8')
  for (const p of PATTERNS) {
    const m = p.re.exec(text)
    if (!m) continue
    const line = text.slice(0, m.index).split('\n').length
    problems.push(p.quiet ? `${f}:${line}: contains ${p.name}` : `${f}:${line}: looks like ${p.name} (${m[0].slice(0, 12)}...)`)
  }
}

if (problems.length) {
  console.error('Possible secrets or personal data in tracked files:\n  ' + problems.join('\n  '))
  console.error('\nIf a match is a false alarm, change the file so it does not look like a credential, or narrow the pattern in scripts/check-secrets.mjs.')
  process.exit(1)
}
console.log(`Checked ${files.length} tracked files: no credentials or personal data files found.`)
