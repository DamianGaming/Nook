// Runs electron-builder. Usage: node scripts/builder.mjs dist|release
//  dist    builds the installer only.
//  release builds it and publishes it as a GitHub release (this is what auto updates read).
// The GitHub repository comes from GITHUB_REPOSITORY (set automatically on GitHub) or NOOK_REPO ("owner/repo"),
// so nothing has to be detected from git.
import { spawnSync } from 'node:child_process'

const mode = process.argv[2] === 'release' ? 'release' : 'dist'
const repo = (process.env.NOOK_REPO || process.env.GITHUB_REPOSITORY || '').trim()
const [owner, name] = repo.split('/')

const args = ['electron-builder', '--win', 'nsis', '--x64', '--publish', mode === 'release' ? 'always' : 'never']
if (owner && name) {
  // Builds the update address into the app, so installed copies know where to look for new versions.
  args.push('-c.publish.provider=github', `-c.publish.owner=${owner}`, `-c.publish.repo=${name}`, '-c.publish.releaseType=release')
} else if (mode === 'release') {
  console.error('Set NOOK_REPO to "owner/repo" (for example NOOK_REPO=megastudios/nook) to publish a release.')
  process.exit(1)
} else {
  console.log('Note: no GitHub repository set, so this installer will not check for updates. Set NOOK_REPO=owner/repo to enable that.')
}

if (process.env.NOOK_DRY) {
  console.log('npx', args.join(' '))
  process.exit(0)
}
const r = spawnSync('npx', args, { stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
