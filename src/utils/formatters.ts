import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DATA_DIR_NAME, DB_FILE_NAME } from '../types/index.js'

/**
 * Format a unix timestamp (ms) into a human-readable time string.
 * - Today: "HH:MM"
 * - This week: "Mon", "Tue", etc.
 * - Older: "DD/MM/YY"
 */
export function formatTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }

  return date.toLocaleDateString([], {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

/**
 * Format a timestamp for message display (always show time).
 */
export function formatMessageTime(timestampMs: number): string {
  const date = new Date(timestampMs)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Truncate a string to a max length, appending "…" if truncated.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}

/**
 * Get the data directory path (~/.whats-cli/), creating it if it doesn't exist.
 */
export function getDataDir(): string {
  const dir = join(homedir(), DATA_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Get the database file path (~/.whats-cli/store.db).
 */
export function getDbPath(): string {
  return join(getDataDir(), DB_FILE_NAME)
}

/**
 * Returns the status tick marks for message delivery status.
 */
export function getStatusTicks(status: string): string {
  switch (status) {
    case 'pending':
      return '⏳'
    case 'sent':
      return '✓'
    case 'delivered':
      return '✓✓'
    case 'read':
      return '✓✓' // In a real terminal, we'd color these blue
    case 'error':
      return '✗'
    default:
      return ''
  }
}

/**
 * Extract a readable name from a WhatsApp JID.
 * e.g., "919876543210@s.whatsapp.net" → "+919876543210"
 */
export function jidToPhoneNumber(jid: string): string {
  const number = jid.split('@')[0]
  if (number) return `+${number}`
  return jid
}

/**
 * Check if a JID is a group chat.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us')
}
