// Builds the website and copies it into ./app, so the desktop app runs the very same files.
import { execSync } from 'node:child_process'
import { cpSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const out = resolve(here, '..', 'app')

if (!existsSync(resolve(root, 'node_modules'))) execSync('npm install', { cwd: root, stdio: 'inherit' })
execSync('npm run build', { cwd: root, stdio: 'inherit' })
rmSync(out, { recursive: true, force: true })
cpSync(resolve(root, 'dist'), out, { recursive: true })
console.log('Copied the website into desktop/app')
