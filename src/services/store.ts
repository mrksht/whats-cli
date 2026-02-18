import Database from 'better-sqlite3'
import { getDbPath } from '../utils/formatters.js'
import type { Chat, Message } from '../types/index.js'
import { MessageStatus, MessageType } from '../types/index.js'

let db: Database.Database | null = null

/**
 * Get or initialize the SQLite database connection.
 */
export function getDb(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initTables(db)
  return db
}

/**
 * Create tables if they don't exist.
 */
function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_keys (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      jid    TEXT PRIMARY KEY,
      name   TEXT NOT NULL DEFAULT '',
      notify TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS chats (
      jid             TEXT PRIMARY KEY,
      name            TEXT NOT NULL DEFAULT '',
      last_message     TEXT NOT NULL DEFAULT '',
      last_message_at  INTEGER NOT NULL DEFAULT 0,
      unread_count    INTEGER NOT NULL DEFAULT 0,
      is_group        INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      chat_jid    TEXT NOT NULL,
      sender_jid  TEXT NOT NULL DEFAULT '',
      sender_name TEXT NOT NULL DEFAULT '',
      body        TEXT NOT NULL DEFAULT '',
      timestamp   INTEGER NOT NULL DEFAULT 0,
      is_from_me  INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'sent',
      type        TEXT NOT NULL DEFAULT 'text'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_jid
      ON messages(chat_jid, timestamp);
  `)
}

// ─── Auth Key Operations ──────────────────────────────────────────────

export function getAuthKey(key: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM auth_keys WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setAuthKey(key: string, value: string): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO auth_keys (key, value) VALUES (?, ?)').run(key, value)
}

export function removeAuthKey(key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM auth_keys WHERE key = ?').run(key)
}

export function getAllAuthKeys(): Record<string, string> {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM auth_keys').all() as Array<{
    key: string
    value: string
  }>
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

export function clearAuthKeys(): void {
  const db = getDb()
  db.prepare('DELETE FROM auth_keys').run()
}

// ─── Contact Operations ──────────────────────────────────────────────

/**
 * Upsert a contact. `name` = phone addressbook name, `notify` = self-set name.
 * Phone addressbook name takes priority.
 */
export function upsertContact(jid: string, name: string, notify: string): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO contacts (jid, name, notify)
     VALUES (?, ?, ?)
     ON CONFLICT(jid) DO UPDATE SET
       name = CASE WHEN excluded.name != '' THEN excluded.name ELSE contacts.name END,
       notify = CASE WHEN excluded.notify != '' THEN excluded.notify ELSE contacts.notify END`
  ).run(jid, name, notify)
}

/**
 * Get the best display name for a JID from the contacts table.
 */
export function getContactName(jid: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT name, notify FROM contacts WHERE jid = ?').get(jid) as
    | { name: string; notify: string }
    | undefined
  if (!row) return null
  return row.name || row.notify || null
}

// ─── Chat Operations ─────────────────────────────────────────────────

export function upsertChat(chat: Chat): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO chats (jid, name, last_message, last_message_at, unread_count, is_group)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(jid) DO UPDATE SET
       name = CASE WHEN excluded.name != '' THEN excluded.name ELSE chats.name END,
       last_message = CASE WHEN excluded.last_message_at > chats.last_message_at THEN excluded.last_message ELSE chats.last_message END,
       last_message_at = MAX(excluded.last_message_at, chats.last_message_at),
       unread_count = excluded.unread_count,
       is_group = excluded.is_group`
  ).run(
    chat.jid,
    chat.name,
    chat.lastMessage,
    chat.lastMessageAt,
    chat.unreadCount,
    chat.isGroup ? 1 : 0
  )
}

export function getAllChats(): Chat[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT c.*, COALESCE(NULLIF(ct.name, ''), NULLIF(ct.notify, ''), '') AS contact_name
       FROM chats c
       LEFT JOIN contacts ct ON c.jid = ct.jid
       ORDER BY c.last_message_at DESC`
    )
    .all() as Array<{
    jid: string
    name: string
    last_message: string
    last_message_at: number
    unread_count: number
    is_group: number
    contact_name: string
  }>

  return rows.map((row) => ({
    jid: row.jid,
    name: row.contact_name || row.name,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    isGroup: row.is_group === 1,
  }))
}

export function updateChatName(jid: string, name: string): void {
  const db = getDb()
  db.prepare('UPDATE chats SET name = ? WHERE jid = ?').run(name, jid)
}

export function resetUnreadCount(jid: string): void {
  const db = getDb()
  db.prepare('UPDATE chats SET unread_count = 0 WHERE jid = ?').run(jid)
}

export function incrementUnreadCount(jid: string): void {
  const db = getDb()
  db.prepare('UPDATE chats SET unread_count = unread_count + 1 WHERE jid = ?').run(jid)
}

// ─── Message Operations ──────────────────────────────────────────────

export function upsertMessage(msg: Message): void {
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender_jid, sender_name, body, timestamp, is_from_me, status, type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    msg.chatJid,
    msg.senderJid,
    msg.senderName,
    msg.body,
    msg.timestamp,
    msg.isFromMe ? 1 : 0,
    msg.status,
    msg.type
  )
}

export function getMessagesForChat(chatJid: string, limit = 100): Message[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM (
        SELECT * FROM messages WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT ?
      ) sub ORDER BY timestamp ASC`
    )
    .all(chatJid, limit) as Array<{
    id: string
    chat_jid: string
    sender_jid: string
    sender_name: string
    body: string
    timestamp: number
    is_from_me: number
    status: string
    type: string
  }>

  return rows.map((row) => ({
    id: row.id,
    chatJid: row.chat_jid,
    senderJid: row.sender_jid,
    senderName: row.sender_name,
    body: row.body,
    timestamp: row.timestamp,
    isFromMe: row.is_from_me === 1,
    status: row.status as MessageStatus,
    type: row.type as MessageType,
  }))
}

export function searchMessagesInChat(chatJid: string, query: string, limit = 100): Message[] {
  const db = getDb()
  const searchPattern = `%${query}%`
  const rows = db
    .prepare(
      `SELECT * FROM (
        SELECT * FROM messages
        WHERE chat_jid = ? AND body LIKE ? COLLATE NOCASE
        ORDER BY timestamp DESC LIMIT ?
      ) sub ORDER BY timestamp ASC`
    )
    .all(chatJid, searchPattern, limit) as Array<{
    id: string
    chat_jid: string
    sender_jid: string
    sender_name: string
    body: string
    timestamp: number
    is_from_me: number
    status: string
    type: string
  }>

  return rows.map((row) => ({
    id: row.id,
    chatJid: row.chat_jid,
    senderJid: row.sender_jid,
    senderName: row.sender_name,
    body: row.body,
    timestamp: row.timestamp,
    isFromMe: row.is_from_me === 1,
    status: row.status as MessageStatus,
    type: row.type as MessageType,
  }))
}

/**
 * Search across ALL messages globally. Returns the last `limit` matches by timestamp (most recent first).
 */
export function searchAllMessages(query: string, limit = 10): Message[] {
  const db = getDb()
  const searchPattern = `%${query}%`
  const rows = db
    .prepare(
      `SELECT * FROM (
        SELECT * FROM messages
        WHERE body LIKE ? COLLATE NOCASE
        ORDER BY timestamp DESC LIMIT ?
      ) sub ORDER BY timestamp DESC`
    )
    .all(searchPattern, limit) as Array<{
    id: string
    chat_jid: string
    sender_jid: string
    sender_name: string
    body: string
    timestamp: number
    is_from_me: number
    status: string
    type: string
  }>

  return rows.map((row) => ({
    id: row.id,
    chatJid: row.chat_jid,
    senderJid: row.sender_jid,
    senderName: row.sender_name,
    body: row.body,
    timestamp: row.timestamp,
    isFromMe: row.is_from_me === 1,
    status: row.status as MessageStatus,
    type: row.type as MessageType,
  }))
}

export function updateMessageStatus(id: string, status: MessageStatus): void {
  const db = getDb()
  db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, id)
}

// ─── Cleanup ─────────────────────────────────────────────────────────

export function clearAllData(): void {
  const db = getDb()
  db.exec('DELETE FROM messages; DELETE FROM chats; DELETE FROM auth_keys;')
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
