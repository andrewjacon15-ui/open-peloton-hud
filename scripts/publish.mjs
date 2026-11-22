/**
 * Publish the current code to the public repository (the `public` git remote), without its private history.
 *
 *   npm run publish:public            check, verify, then push
 *   npm run publish:public -- --dry   check and show what would be pushed, push nothing
 *
 * The private history contains things that must never be public (a cloud key from before the backend was removed), so the public
 * repository does not share it. Each publish makes ONE new commit whose files are exactly this repository's current commit (HEAD), on top
 * of the public `main` (or as a fresh first commit if the public repository is empty), and pushes that. Your local branches are untouched.
 * Before anything is pushed: the working tree must be clean, and check-secrets (which also blocks every string in your gitignored
 * .private-patterns) and `npm run verify` must pass. See docs/RELEASING.md.
 */
import { execFileSync } from 'node:child_process'

const dry = process.argv.includes('--dry')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
const fail = (msg) => {
  console.error(`\nNot published: ${msg}`)
  process.exit(1)
}

const remotes = git('remote').split(/\s+/)
if (!remotes.includes('public')) fail('there is no `public` remote. Add it once: git remote add public https://github.com/<you>/peloton-hud.git')
if (git('status', '--porcelain')) fail('the working tree has uncommitted changes. Commit or stash them first, so what is checked is what is pushed.')

run('node', ['scripts/check-secrets.mjs'])
run('npm', ['run', 'verify'])

let parent = ''
try {
  git('fetch', 'public', 'main')
  parent = git('rev-parse', 'FETCH_HEAD')
} catch {
  console.log('The public repository has no main branch yet: this will be its first commit.')
}

const tree = git('rev-parse', 'HEAD^{tree}')
if (parent && git('rev-parse', `${parent}^{tree}`) === tree) {
  console.log('The public repository already has exactly this code. Nothing to publish.')
  process.exit(0)
}

const head = git('rev-parse', '--short', 'HEAD')
const subject = git('log', '-1', '--format=%s')
const message = `${subject}\n\nPublished from ${head}.`
const email = git('config', 'user.email')
if (!/noreply/i.test(email)) {
  console.warn(`\nNote: the public commit will carry your git email (${email}). To keep it private, use your GitHub noreply address:`)
  console.warn('  git config user.email <id>+<username>@users.noreply.github.com')
}

if (dry) {
  console.log(`\nDry run: would push one commit with the tree of ${head} ("${subject}") to public/main${parent ? ` on top of ${parent.slice(0, 7)}` : ' as its first commit'}.`)
  process.exit(0)
}

const commit = git('commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message)
run('git', ['push', 'public', `${commit}:refs/heads/main`])
console.log(`\nPublished ${head} to public/main as ${commit.slice(0, 7)}.`)
