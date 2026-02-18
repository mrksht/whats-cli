import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type BaileysEventMap,
  type WAMessageContent,
  type proto,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { getDataDir } from '../utils/formatters.js'
import {
  upsertChat,
  upsertMessage,
  getAllChats,
  getMessagesForChat,
  incrementUnreadCount,
  updateChatName,
  upsertContact,
  getContactName,
} from './store.js'
import {
  type Chat,
  type Message,
  MessageStatus,
  MessageType,
  ConnectionState,
} from '../types/index.js'
import { isGroupJid, jidToPhoneNumber } from '../utils/formatters.js'

export interface WhatsAppEvents {
  'connection-state': (state: ConnectionState) => void
  qr: (code: string) => void
  ready: () => void
  message: (msg: Message) => void
  'chats-changed': () => void
}

export class WhatsAppService extends EventEmitter {
  private sock: WASocket | null = null
  private logger = pino({ level: 'silent' })
  private retryCount = 0
  private maxRetries = 5
  private chatUpdateTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    super()
  }

  /**
   * Debounced notification that chats have changed.
   * Coalesces rapid-fire updates during history sync into a single event.
   */
  private notifyChatsChanged(): void {
    if (this.chatUpdateTimer) clearTimeout(this.chatUpdateTimer)
    this.chatUpdateTimer = setTimeout(() => {
      this.emit('chats-changed')
      this.chatUpdateTimer = null
    }, 300)
  }

  async connect(): Promise<void> {
    this.emit('connection-state', ConnectionState.Connecting)

    const authDir = join(getDataDir(), 'auth')
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: true,
      markOnlineOnConnect: true,
      fireInitQueries: true,
    })

    // ─── Connection events ─────────────────────────────────────────

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        this.emit('connection-state', ConnectionState.QRReady)
        this.emit('qr', qr)
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        if (shouldReconnect && this.retryCount < this.maxRetries) {
          this.retryCount++
          this.emit('connection-state', ConnectionState.Connecting)
          setTimeout(() => this.connect(), Math.min(1000 * this.retryCount, 10000))
        } else {
          this.emit('connection-state', ConnectionState.Disconnected)
        }
      }

      if (connection === 'open') {
        this.retryCount = 0
        this.emit('connection-state', ConnectionState.Connected)
        this.emit('ready')
      }
    })

    // ─── Credential updates ────────────────────────────────────────

    this.sock.ev.on('creds.update', saveCreds)

    // ─── Incoming messages ─────────────────────────────────────────

    this.sock.ev.on('messages.upsert', ({ messages, type }) => {
      for (const msg of messages) {
        if (!msg.key.remoteJid) continue
        // Skip status broadcasts
        if (msg.key.remoteJid === 'status@broadcast') continue

        const parsed = this.parseMessage(msg)
        if (!parsed) continue

        // Skip protocol/system messages with no visible content
        if (!parsed.body) continue

        // Capture pushName from the sender into contacts table
        if (!parsed.isFromMe && msg.pushName) {
          const senderJid = msg.key.participant || msg.key.remoteJid || ''
          if (senderJid && senderJid !== 'status@broadcast') {
            upsertContact(senderJid, '', msg.pushName)
          }
        }

        // Ensure chat exists before persisting the message
        const chatJid = parsed.chatJid
        // Resolve best name: contact name > pushName > phone number
        const resolvedName = getContactName(chatJid) || parsed.senderName || jidToPhoneNumber(chatJid)
        const chat: Chat = {
          jid: chatJid,
          name: parsed.isFromMe ? (getContactName(chatJid) || '') : resolvedName,
          lastMessage: parsed.body || `[${parsed.type}]`,
          lastMessageAt: parsed.timestamp,
          unreadCount: 0,
          isGroup: isGroupJid(chatJid),
        }
        upsertChat(chat)

        // Now persist the message
        upsertMessage(parsed)

        if (!parsed.isFromMe) {
          incrementUnreadCount(chatJid)
        }

        this.emit('message', parsed)
        this.notifyChatsChanged()
      }
    })

    // ─── History sync (primary source of chats on connect) ─────────

    this.sock.ev.on('messaging-history.set', ({ chats: syncedChats, contacts: syncedContacts, messages: syncedMessages }) => {
      // Process chats first so rows exist for contact name updates
      for (const chat of syncedChats) {
        if (!chat.id || chat.id === 'status@broadcast') continue
        const mapped: Chat = {
          jid: chat.id,
          name: chat.name || jidToPhoneNumber(chat.id),
          lastMessage: '',
          lastMessageAt: chat.conversationTimestamp
            ? Number(chat.conversationTimestamp) * 1000
            : 0,
          unreadCount: chat.unreadCount ?? 0,
          isGroup: isGroupJid(chat.id),
        }
        upsertChat(mapped)
      }

      // Process contacts for phone addressbook name resolution
      for (const contact of syncedContacts) {
        if (!contact.id || contact.id === 'status@broadcast') continue
        upsertContact(contact.id, contact.name || '', contact.notify || '')
      }

      // Process messages
      for (const msg of syncedMessages) {
        if (!msg.key?.remoteJid || msg.key.remoteJid === 'status@broadcast') continue
        const parsed = this.parseMessage(msg)
        if (!parsed || !parsed.body) continue

        // Capture pushName into contacts
        if (!parsed.isFromMe && msg.pushName) {
          const senderJid = msg.key.participant || msg.key.remoteJid || ''
          if (senderJid) {
            upsertContact(senderJid, '', msg.pushName)
          }
        }

        const chatJid = parsed.chatJid
        const resolvedName = getContactName(chatJid) || parsed.senderName || jidToPhoneNumber(chatJid)
        const chat: Chat = {
          jid: chatJid,
          name: parsed.isFromMe ? (getContactName(chatJid) || '') : resolvedName,
          lastMessage: parsed.body || `[${parsed.type}]`,
          lastMessageAt: parsed.timestamp,
          unreadCount: 0,
          isGroup: isGroupJid(chatJid),
        }
        upsertChat(chat)
        upsertMessage(parsed)
      }

      this.notifyChatsChanged()
    })

    // ─── Incremental chat updates ──────────────────────────────────

    this.sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        if (!chat.id || chat.id === 'status@broadcast') continue
        const mapped: Chat = {
          jid: chat.id,
          name: chat.name || jidToPhoneNumber(chat.id),
          lastMessage: '',
          lastMessageAt: chat.conversationTimestamp
            ? Number(chat.conversationTimestamp) * 1000
            : 0,
          unreadCount: chat.unreadCount ?? 0,
          isGroup: isGroupJid(chat.id),
        }
        upsertChat(mapped)
      }
      this.notifyChatsChanged()
    })

    this.sock.ev.on('chats.update', (chats) => {
      for (const chat of chats) {
        if (!chat.id || chat.id === 'status@broadcast') continue
        // Upsert a minimal chat so it shows up even if we haven't seen it before
        const mapped: Chat = {
          jid: chat.id,
          name: chat.name || '',
          lastMessage: '',
          lastMessageAt: chat.conversationTimestamp
            ? Number(chat.conversationTimestamp) * 1000
            : 0,
          unreadCount: chat.unreadCount ?? 0,
          isGroup: isGroupJid(chat.id),
        }
        upsertChat(mapped)
        if (chat.name) {
          updateChatName(chat.id, chat.name)
        }
      }
      this.notifyChatsChanged()
    })

    // ─── Contacts for name resolution ──────────────────────────────

    this.sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        if (!contact.id || contact.id === 'status@broadcast') continue
        upsertContact(contact.id, contact.name || '', contact.notify || '')
      }
      this.notifyChatsChanged()
    })

    this.sock.ev.on('contacts.update', (contacts) => {
      for (const contact of contacts) {
        if (!contact.id) continue
        upsertContact(contact.id, contact.name || '', contact.notify || '')
      }
      this.notifyChatsChanged()
    })
  }

  /**
   * Send a text message to a JID.
   */
  async sendMessage(jid: string, text: string): Promise<Message | null> {
    if (!this.sock) return null

    try {
      const sent = await this.sock.sendMessage(jid, { text })
      if (!sent) return null

      const msg: Message = {
        id: sent.key.id || `local-${Date.now()}`,
        chatJid: jid,
        senderJid: 'me',
        senderName: 'You',
        body: text,
        timestamp: Date.now(),
        isFromMe: true,
        status: MessageStatus.Sent,
        type: MessageType.Text,
      }

      upsertMessage(msg)

      // Update chat's last message
      const chat: Chat = {
        jid,
        name: '',
        lastMessage: text,
        lastMessageAt: msg.timestamp,
        unreadCount: 0,
        isGroup: isGroupJid(jid),
      }
      upsertChat(chat)

      return msg
    } catch (error) {
      console.error('Failed to send message:', error)
      return null
    }
  }

  /**
   * Get all chats from the local store.
   */
  getChats(): Chat[] {
    return getAllChats()
  }

  /**
   * Get messages for a specific chat from the local store.
   */
  getMessages(chatJid: string, limit = 100): Message[] {
    return getMessagesForChat(chatJid, limit)
  }

  /**
   * Send a read receipt for messages in a chat.
   */
  async markChatRead(jid: string, messageIds: string[]): Promise<void> {
    if (!this.sock || messageIds.length === 0) return
    try {
      await this.sock.readMessages([{ remoteJid: jid, id: messageIds[0]!, participant: undefined }])
    } catch {
      // Silently fail — not critical
    }
  }

  /**
   * Disconnect the WhatsApp socket.
   */
  async disconnect(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined)
      this.sock = null
    }
  }

  /**
   * Parse a Baileys WAMessage into our Message type.
   */
  private parseMessage(msg: proto.IWebMessageInfo): Message | null {
    const key = msg.key
    if (!key || !key.remoteJid) return null

    const chatJid = key.remoteJid
    const isFromMe = key.fromMe ?? false
    const senderJid = isFromMe ? 'me' : (key.participant || key.remoteJid || '')
    const timestamp = msg.messageTimestamp
      ? typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp * 1000
        : Number(msg.messageTimestamp) * 1000
      : Date.now()

    const { body, type } = this.extractContent(msg.message)

    // Determine sender name
    let senderName = ''
    if (isFromMe) {
      senderName = 'You'
    } else if (msg.pushName) {
      senderName = msg.pushName
    } else {
      senderName = jidToPhoneNumber(senderJid)
    }

    return {
      id: key.id ?? `msg-${timestamp}`,
      chatJid,
      senderJid,
      senderName,
      body,
      timestamp,
      isFromMe,
      status: this.mapStatus(msg.status),
      type,
    }
  }

  /**
   * Extract text body and message type from WAMessageContent.
   * Recursively unwraps container messages (ephemeral, viewOnce, edited, etc.)
   */
  private extractContent(content: WAMessageContent | null | undefined): {
    body: string
    type: MessageType
  } {
    if (!content) return { body: '', type: MessageType.Unknown }

    // ─── Unwrap container / wrapper message types ─────────────────
    // These are "future-proof" wrappers that contain a nested .message
    const innerMessage =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message ||
      content.documentWithCaptionMessage?.message ||
      content.editedMessage?.message

    if (innerMessage) {
      return this.extractContent(innerMessage)
    }

    // ─── Skip protocol / system messages (not user-visible) ──────
    if (content.protocolMessage) {
      // Protocol messages: message deletes, disappearing mode changes, key changes
      const protoType = content.protocolMessage.type
      // Type 14 = message edit — extract the edited content
      if (protoType === 14 && content.protocolMessage.editedMessage) {
        return this.extractContent(content.protocolMessage.editedMessage as WAMessageContent)
      }
      return { body: '', type: MessageType.Unknown }
    }
    if (content.senderKeyDistributionMessage && !content.conversation && !content.extendedTextMessage) {
      // Key distribution is a protocol-level message, not user-visible
      // But sometimes it comes alongside actual content, so only skip if there's nothing else
      return { body: '', type: MessageType.Unknown }
    }

    // ─── Actual content types ────────────────────────────────────
    if (content.conversation) {
      return { body: content.conversation, type: MessageType.Text }
    }
    if (content.extendedTextMessage?.text) {
      return { body: content.extendedTextMessage.text, type: MessageType.Text }
    }
    if (content.imageMessage) {
      return {
        body: content.imageMessage.caption || '📷 Photo',
        type: MessageType.Image,
      }
    }
    if (content.videoMessage) {
      return {
        body: content.videoMessage.caption || '🎥 Video',
        type: MessageType.Video,
      }
    }
    if (content.audioMessage) {
      return {
        body: content.audioMessage.ptt ? '🎤 Voice message' : '🎵 Audio',
        type: MessageType.Audio,
      }
    }
    if (content.documentMessage) {
      return {
        body: content.documentMessage.fileName || '📄 Document',
        type: MessageType.Document,
      }
    }
    if (content.stickerMessage) {
      return { body: '🏷️ Sticker', type: MessageType.Sticker }
    }
    if (content.contactMessage) {
      return {
        body: content.contactMessage.displayName || '👤 Contact',
        type: MessageType.Contact,
      }
    }
    if (content.contactsArrayMessage) {
      const count = content.contactsArrayMessage.contacts?.length ?? 0
      return {
        body: `👥 ${count} contacts`,
        type: MessageType.Contact,
      }
    }
    if (content.locationMessage) {
      return { body: '📍 Location', type: MessageType.Location }
    }
    if (content.liveLocationMessage) {
      return { body: '📍 Live location', type: MessageType.Location }
    }
    if (content.reactionMessage) {
      return {
        body: content.reactionMessage.text || '❤️',
        type: MessageType.Reaction,
      }
    }
    if (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3) {
      const poll = content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3
      return {
        body: `📊 Poll: ${poll?.name || 'Poll'}`,
        type: MessageType.Text,
      }
    }
    if (content.pollUpdateMessage) {
      return { body: '📊 Poll vote', type: MessageType.Text }
    }
    if (content.listMessage) {
      return {
        body: content.listMessage.title || content.listMessage.description || '📋 List',
        type: MessageType.Text,
      }
    }
    if (content.buttonsMessage) {
      return {
        body: content.buttonsMessage.contentText || '🔘 Buttons',
        type: MessageType.Text,
      }
    }
    if (content.templateMessage) {
      return { body: '📝 Template', type: MessageType.Text }
    }
    if (content.groupInviteMessage) {
      return {
        body: `📨 Group invite: ${content.groupInviteMessage.groupName || 'Group'}`,
        type: MessageType.Text,
      }
    }
    if (content.interactiveMessage) {
      const header = content.interactiveMessage.header
      const body = content.interactiveMessage.body
      return {
        body: (body as any)?.text || (header as any)?.title || '🔲 Interactive message',
        type: MessageType.Text,
      }
    }
    if (content.orderMessage) {
      return { body: '🛒 Order', type: MessageType.Text }
    }
    if (content.paymentInviteMessage) {
      return { body: '💰 Payment', type: MessageType.Text }
    }
    if (content.pinInChatMessage) {
      return { body: '📌 Pinned a message', type: MessageType.Text }
    }
    if (content.keepInChatMessage) {
      return { body: '📌 Kept a message', type: MessageType.Text }
    }

    return { body: '💬 [Unsupported message]', type: MessageType.Unknown }
  }

  /**
   * Map Baileys WAMessageStatus to our MessageStatus.
   */
  private mapStatus(status: number | null | undefined): MessageStatus {
    switch (status) {
      case 0:
        return MessageStatus.Error
      case 1:
        return MessageStatus.Pending
      case 2:
        return MessageStatus.Sent
      case 3:
        return MessageStatus.Delivered
      case 4:
        return MessageStatus.Read
      default:
        return MessageStatus.Sent
    }
  }
}
