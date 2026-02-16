import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

// ─── CLI argument handling ─────────────────────────────────────────

const args = process.argv.slice(2)

if (args.includes('--version') || args.includes('-v')) {
  console.log('whats-cli v0.1.0')
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  whats-cli — WhatsApp in your terminal

  Usage:
    whats-cli          Start the chat interface
    whats-cli --reset   Clear auth and re-pair with QR code
    whats-cli --version Show version
    whats-cli --help    Show this help

  Keybindings:
    Tab        Switch between chat list and message input
    ↑/↓        Navigate chat list
    Enter      Select chat / Send message
    Escape     Back to chat list
    Ctrl+C     Exit
`)
  process.exit(0)
}

if (args.includes('--reset')) {
  const { rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')
  const authDir = join(homedir(), '.whats-cli', 'auth')

  try {
    rmSync(authDir, { recursive: true, force: true })
    console.log('✅ Auth data cleared. Restart whats-cli to scan a new QR code.')
  } catch {
    console.log('No auth data found.')
  }
  process.exit(0)
}

// ─── Set terminal title ────────────────────────────────────────────

process.stdout.write('\x1b]0;whats-cli\x07')

// ─── Handle graceful shutdown ──────────────────────────────────────

process.on('SIGINT', () => {
  process.stdout.write('\x1b]0;\x07') // Reset terminal title
  process.exit(0)
})

process.on('SIGTERM', () => {
  process.stdout.write('\x1b]0;\x07')
  process.exit(0)
})

// ─── Render the app ────────────────────────────────────────────────

const { waitUntilExit } = render(React.createElement(App))

try {
  await waitUntilExit()
} catch {
  // Silently exit
} finally {
  process.stdout.write('\x1b]0;\x07') // Reset terminal title
}
