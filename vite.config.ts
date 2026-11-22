/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const APP_VERSION = `${pkg.version}+${gitSha()}`

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  // The bike reaches the laptop's dev server through `adb reverse` (npm run bike -- reverse), on this fixed port.
  server: { port: 5180, strictPort: true },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
