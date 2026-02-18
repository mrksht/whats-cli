/** Shared types for whats-cli */

export interface Chat {
  /** WhatsApp JID (e.g., 919876543210@s.whatsapp.net) */
  jid: string
  /** Display name (contact name or group subject) */
  name: string
  /** Last message preview text */
  lastMessage: string
  /** Unix timestamp (ms) of last message */
  lastMessageAt: number
  /** Unread message count */
  unreadCount: number
  /** Whether this is a group chat */
  isGroup: boolean
  /** Profile picture URL (if available) */
  profilePicUrl?: string
}

export interface Message {
  /** Baileys message ID */
  id: string
  /** Chat JID this message belongs to */
  chatJid: string
  /** Sender JID */
  senderJid: string
  /** Sender display name */
  senderName: string
  /** Message body (text content) */
  body: string
  /** Unix timestamp (ms) */
  timestamp: number
  /** Whether this message was sent by us */
  isFromMe: boolean
  /** Message delivery status */
  status: MessageStatus
  /** Type of message content */
  type: MessageType
}

export enum MessageStatus {
  Pending = 'pending',
  Sent = 'sent',
  Delivered = 'delivered',
  Read = 'read',
  Error = 'error',
}

export enum MessageType {
  Text = 'text',
  Image = 'image',
  Video = 'video',
  Audio = 'audio',
  Document = 'document',
  Sticker = 'sticker',
  Contact = 'contact',
  Location = 'location',
  Reaction = 'reaction',
  Unknown = 'unknown',
}

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  QRReady = 'qr-ready',
  Connected = 'connected',
}

export enum AppScreen {
  Auth = 'auth',
  Main = 'main',
}

export interface AppState {
  screen: AppScreen
  connectionState: ConnectionState
  qrCode: string | null
  chats: Chat[]
  selectedChatIndex: number
  messages: Message[]
  inputText: string
  focusArea: FocusArea
}

export enum FocusArea {
  ChatList = 'chat-list',
  MessageView = 'message-view',
  InputBar = 'input-bar',
  SearchBar = 'search-bar',
}

export const APP_NAME = 'whats-cli'
export const DATA_DIR_NAME = '.whats-cli'
export const DB_FILE_NAME = 'store.db'
