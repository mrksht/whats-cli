# whats-cli

> WhatsApp in your terminal — send & receive messages with a beautiful TUI

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-green" alt="Node >= 20" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript Strict" />
</p>

---

## What is this?

A full-featured WhatsApp client that runs entirely in your terminal. Built with TypeScript, Ink (React for CLIs), and Baileys (WhatsApp Web multidevice protocol). Connect with a QR scan, then send and receive messages without leaving your terminal.

```
┌──────────────────┬────────────────────────────────────┐
│ 💬 Chats (12)    │ 👥 Family Group                    │
│                  │                                    │
│ > Family Group   │ Mom: Don't forget dinner tomorrow  │
│   John Doe       │                   18:42            │
│   Alice          │                                    │
│   Work Team      │ You: I'll be there!                │
│   Bob            │                        18:43 ✓✓    │
│                  │                                    │
│                  ├────────────────────────────────────┤
│                  │ > what time?█                      │
└──────────────────┴────────────────────────────────────┘
 🟢 Connected │ Tab:switch │ ↑↓:navigate │ Ctrl+C:quit
```

---

## Features

- **QR Code Authentication** — Scan once, stay connected via multi-device linking
- **Send & Receive Text Messages** — Real-time, end-to-end encrypted
- **Full Chat List** — All conversations sorted by most recent activity
- **Unread Badges** — Visual unread count on each chat
- **Group Chat Support** — Group names, sender labels, and unread counts
- **Contact Name Resolution** — Shows phone addressbook names and push names
- **History Sync** — Loads full message history on first connect
- **Persistent Storage** — Messages, chats, contacts, and auth stored locally in SQLite
- **Keyboard Navigation** — Arrow keys, Tab, Enter, Escape — no mouse needed
- **Horizontal Input Scrolling** — Type long messages without breaking the layout
- **Auto-Reconnect** — Reconnects on network drops with exponential backoff (up to 5 retries)
- **Debounced UI Updates** — Batches rapid events during history sync to prevent flickering

---

## Quick Start

### Prerequisites

- **Node.js 20+** (`node -v` to check)
- A smartphone with WhatsApp installed
- A terminal that supports colors and Unicode (iTerm2, Alacritty, Ghostty, etc.)

### Install & Run

```bash
# Clone and install
git clone https://github.com/yourusername/whats-cli.git
cd whats-cli
npm install

# Run in dev mode (auto-reloads on file changes)
npm run dev

# Or build and run the compiled binary
npm run build
npm start
```

### First Launch

1. Run `npm run dev` (or `npm start` after building)
2. A QR code appears in the terminal
3. On your phone: WhatsApp → Settings → Linked Devices → Link a Device
4. Scan the QR code with your phone
5. Wait for history sync to complete — chats load automatically
6. Navigate, select, and start messaging

### Subsequent Launches

Auth credentials are persisted at `~/.whats-cli/auth/`. You won't need to scan again unless you log out or run `--reset`.

---

## Keybindings

| Key | Context | Action |
|---|---|---|
| `↑` / `↓` | Chat list focused | Navigate between chats |
| `Enter` | Chat list focused | Open selected chat and focus input |
| `Tab` | Anywhere | Toggle focus between chat list and input bar |
| `Escape` | Input focused | Return focus to chat list |
| `Enter` | Input focused | Send the typed message |
| `←` / `→` | Input focused | Move cursor within text |
| `Backspace` | Input focused | Delete character before cursor |
| `Ctrl+C` | Anywhere | Exit the application |

---

## CLI Flags

```bash
whats-cli             # Launch the chat interface
whats-cli --reset     # Delete auth data & re-pair from scratch
whats-cli --version   # Print version number
whats-cli --help      # Show usage help
```

---

## Architecture

### Project Structure

```
src/
├── index.tsx              # Entry point — CLI args, terminal setup, graceful shutdown
├── app.tsx                # Root React component — screen state machine, layout, keyboard routing
│
├── components/
│   ├── QRCode.tsx         # Full-screen QR code display for authentication
│   ├── ChatList.tsx       # Left pane — scrollable conversation list with selection highlight
│   ├── MessageView.tsx    # Right pane — message bubbles with timestamps and status ticks
│   ├── InputBar.tsx       # Text input with visible cursor and horizontal scroll
│   └── StatusBar.tsx      # Bottom bar — connection indicator, chat count, key hints
│
├── hooks/
│   └── useWhatsApp.ts     # React hooks: useWhatsApp, useMessages, useChatNavigation
│
├── services/
│   ├── whatsapp.ts        # Baileys wrapper — connection, events, message parsing, send
│   └── store.ts           # SQLite layer — CRUD for auth, contacts, chats, messages
│
├── types/
│   └── index.ts           # TypeScript interfaces, enums, constants
│
└── utils/
    └── formatters.ts      # Timestamp formatting, JID parsing, string helpers
```

### Data Storage

All data is stored at `~/.whats-cli/`:

```
~/.whats-cli/
├── auth/                  # Multi-file auth state (Baileys credentials)
│   ├── creds.json         # Session credentials
│   └── ...                # Signal protocol key files
└── store.db               # SQLite database (WAL mode)
```

#### Database Schema

| Table | Purpose | Key Columns |
|---|---|---|
| `auth_keys` | Signal protocol key store | `key`, `value` |
| `contacts` | Phone book & push name cache | `jid`, `name`, `notify` |
| `chats` | Conversation metadata | `jid`, `name`, `last_message`, `last_message_at`, `unread_count`, `is_group` |
| `messages` | Message history | `id`, `chat_jid`, `sender_jid`, `body`, `timestamp`, `is_from_me`, `status`, `type` |

---

## How It Works — Application Flow

### 1. Startup & Authentication

```
index.tsx
  │
  ├─ Parse CLI flags (--help, --version, --reset)
  ├─ Set terminal title
  ├─ Register graceful shutdown handlers (SIGINT, SIGTERM)
  └─ Render <App /> via Ink
```

The `<App />` component initializes the `useWhatsApp()` hook, which creates a `WhatsAppService` instance. The service:

1. Loads persisted auth credentials from `~/.whats-cli/auth/`
2. Fetches the latest Baileys protocol version
3. Opens a WebSocket to WhatsApp servers
4. If **no credentials exist** → emits a `qr` event → the app shows a full-screen QR code
5. If **credentials exist** → reconnects automatically, skipping the QR step

### 2. Connection State Machine

```
┌──────────────┐     QR scanned     ┌───────────┐
│ Disconnected │───────────────────► │ Connecting│
└──────────────┘                     └─────┬─────┘
       ▲                                   │
       │ logged out /                      │ connection: 'open'
       │ max retries                       ▼
       │                             ┌───────────┐
       │  connection: 'close'        │ Connected  │
       └─────────────────────────────┤ (QRReady)  │
          (with retry logic)         └───────────┘
```

States are defined in `ConnectionState` enum:
- **Disconnected** → Initial state, or after logout / max retries exceeded
- **Connecting** → WebSocket handshake in progress
- **QRReady** → Waiting for user to scan the QR code
- **Connected** → Authenticated and syncing

On disconnect, the service retries with exponential backoff: `min(1s × retryCount, 10s)`, up to 5 retries. If the disconnect reason is `loggedOut`, it stops immediately.

### 3. History Sync

Once connected, WhatsApp sends historical data through Baileys events:

```
WhatsApp Server
  │
  ├─ messaging-history.set  ──► Primary bulk sync (chats + contacts + messages)
  ├─ chats.upsert           ──► Individual chat metadata
  ├─ chats.update           ──► Chat property changes (name, unread, etc.)
  ├─ contacts.upsert        ──► Contact name updates
  └─ contacts.update        ──► Contact property changes
```

The `messaging-history.set` event is the main source of data on initial connect. It delivers chats, contacts, and messages in a single payload. The service processes them in order:

1. **Chats first** — Upsert chat rows so foreign references exist
2. **Contacts second** — Store addressbook names and push (self-set) names
3. **Messages last** — Parse each message, unwrap container types, persist to SQLite

**Full history sync** is enabled (`syncFullHistory: true`) to pull as many messages as WhatsApp provides.

### 4. Message Parsing Pipeline

Incoming messages go through `extractContent()` which handles WhatsApp's deeply nested message structure:

```
Raw WAMessage
  │
  ├─ Unwrap containers (recursive):
  │   ├─ ephemeralMessage        → disappearing messages
  │   ├─ viewOnceMessage         → view-once media (v1)
  │   ├─ viewOnceMessageV2       → view-once media (v2)
  │   ├─ viewOnceMessageV2Extension
  │   ├─ documentWithCaptionMessage
  │   └─ editedMessage           → message edits
  │
  ├─ Filter out protocol messages:
  │   ├─ protocolMessage         → receipts, key distribution
  │   └─ senderKeyDistributionMessage
  │
  └─ Extract content from 20+ message types:
      ├─ conversation / extendedTextMessage     → plain text
      ├─ imageMessage                           → "📷 Photo" + caption
      ├─ videoMessage                           → "🎥 Video" + caption
      ├─ audioMessage                           → "🎵 Audio" / "🎤 Voice"
      ├─ documentMessage                        → "📄 Document: filename"
      ├─ stickerMessage                         → "🏷️ Sticker"
      ├─ contactMessage / contactsArrayMessage  → "👤 Contact: name"
      ├─ locationMessage / liveLocationMessage  → "📍 Location"
      ├─ reactionMessage                        → "reaction emoji"
      ├─ pollCreationMessage / pollCreationMessageV3 → "📊 Poll: question"
      ├─ listMessage                            → "📋 List: title"
      ├─ buttonsMessage / templateMessage       → "🔘 title"
      ├─ groupInviteMessage                     → "👥 Group invite: name"
      ├─ orderMessage                           → "🛒 Order"
      ├─ paymentMessage                         → "💳 Payment"
      ├─ interactiveMessage                     → extracts body/title
      └─ (fallback)                             → "[Unsupported message]"
```

### 5. Event Flow — Baileys to React

```
Baileys WebSocket Events
  │
  ▼
WhatsAppService (EventEmitter)
  │
  ├─ Processes raw events
  ├─ Parses messages via extractContent()
  ├─ Persists to SQLite (upsertChat, upsertMessage, upsertContact)
  ├─ Debounces rapid updates (300ms coalescing via notifyChatsChanged)
  │
  └─ Emits simplified events:
      ├─ 'connection-state' → ConnectionState enum
      ├─ 'qr'              → QR code string
      ├─ 'ready'           → connection established
      ├─ 'message'         → parsed Message object
      └─ 'chats-changed'   → debounced signal to refresh chat list
```

React hooks subscribe to these events:

| Hook | Purpose |
|---|---|
| `useWhatsApp()` | Manages service lifecycle, connection state, chat list state, `sendMessage` |
| `useMessages(service, chat)` | Loads messages for the active chat, listens for new ones, resets unread |
| `useChatNavigation(chats)` | Tracks selection by **JID** (not index), so chat reordering doesn't jump |

### 6. Contact Name Resolution

Names are resolved through a priority chain:

```
Contact addressbook name (synced from phone)
  └─► Push name (self-set WhatsApp name)
      └─► Chat name (from chat metadata)
          └─► Phone number (extracted from JID)
```

The SQL query uses `COALESCE(NULLIF(ct.name, ''), NULLIF(ct.notify, ''), '')` to skip empty strings and pick the best available name.

Push names are captured from two sources:
- `messaging-history.set` events (bulk sync)
- `messages.upsert` events (real-time incoming messages with `msg.pushName`)

### 7. UI Layout & Rendering

```
 ┌─────────────────────────────────────────────────────┐
 │                     <App />                         │
 │  ┌────────────┬────────────────────────────────┐    │
 │  │            │        <MessageView />          │    │
 │  │ <ChatList/>│  Chat header + message bubbles  │    │
 │  │            │  (most recent N messages)        │    │
 │  │  Scrollable│  Sent = cyan, right-aligned     │    │
 │  │  list with │  Received = white, left-aligned │    │
 │  │  selection ├────────────────────────────────┤    │
 │  │  highlight │       <InputBar />              │    │
 │  │            │  "> text█" with cursor           │    │
 │  │            │  Fixed height=3, scrollable      │    │
 │  └────────────┴────────────────────────────────┘    │
 │  ┌──────────────────────────────────────────────┐    │
 │  │              <StatusBar />                    │    │
 │  │  🟢 Connected │ 12 chats │ Tab:switch │ ...  │    │
 │  └──────────────────────────────────────────────┘    │
 └─────────────────────────────────────────────────────┘
```

- **ChatList** — Fixed width (32 chars). Scrollable window tracks selection. Shows chat name, last message preview, timestamp, and unread badge.
- **MessageView** — Flex-grows to fill remaining width. Shows the N most recent messages (calculated from terminal height). Long messages are truncated to prevent layout overflow.
- **InputBar** — Fixed height (3 rows). Horizontal scrolling viewport keeps the cursor visible for long messages. `overflow: hidden` prevents layout distortion.
- **StatusBar** — Single row at the bottom. Connection dot (green/yellow/red), chat count, keybinding hints.

### 8. Sending a Message

```
User types text and presses Enter
  │
  ▼
InputBar.onSubmit(text)
  │
  ▼
App.handleSendMessage(text)
  │
  ├─ Calls WhatsAppService.sendMessage(jid, text)
  │    ├─ sock.sendMessage(jid, { text })     → sends via Baileys WebSocket
  │    ├─ upsertMessage(msg)                  → persist locally
  │    ├─ upsertChat(chat)                    → update last_message
  │    └─ Returns Message object
  │
  └─ Refreshes chat list (chats re-sort by last_message_at)
      └─ Selection stays on same chat (tracked by JID, not index)
```

### 9. Receiving a Message

```
Baileys 'messages.upsert' event fires
  │
  ▼
WhatsAppService handler
  ├─ Skips status@broadcast
  ├─ Calls parseMessage() + extractContent()
  ├─ Captures pushName into contacts table
  ├─ upsertChat() with resolved name
  ├─ upsertMessage() to persist
  ├─ incrementUnreadCount() if not from self
  ├─ emit('message', parsedMsg)         → useMessages picks it up in real-time
  └─ notifyChatsChanged()               → 300ms debounce, then useWhatsApp refreshes chat list
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22+ |
| Language | TypeScript | 5.9 (strict mode, ES2022) |
| WhatsApp Protocol | [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) | 7.0.0-rc.9 |
| Terminal UI | [Ink](https://github.com/vadimdemedes/ink) + React | Ink 6.7, React 19 |
| Storage | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 12.6 |
| QR Rendering | qrcode-terminal | 0.12 |
| Logging | pino (silent in production) | 10.3 |
| Build Tool | [tsup](https://github.com/egoist/tsup) | 8.5 |
| Dev Runner | tsx (watch mode) | 4.21 |
| Linting | ESLint + Prettier | — |

---

## npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `tsx watch src/index.tsx` | Start in dev mode with hot reload |
| `npm run build` | `tsup` | Compile to single ESM bundle at `dist/index.js` |
| `npm start` | `node dist/index.js` | Run the compiled binary |
| `npm run typecheck` | `tsc --noEmit` | Type-check without emitting output |
| `npm run lint` | `eslint src/` | Lint source files |
| `npm run format` | `prettier --write src/` | Auto-format source files |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| QR code doesn't appear | Make sure your terminal supports Unicode. Try iTerm2 or Alacritty. |
| `SQLITE_IOERR_SHORT_READ` | Corrupted WAL file. Run `rm -rf ~/.whats-cli/store.db*` and restart. |
| No chats after connecting | Wait 10-30 seconds for history sync. Full sync can take time for large accounts. |
| "[Unsupported message]" | A new WhatsApp message type. Open an issue with the message type if possible. |
| UI looks broken | Resize your terminal to at least 80x24. Smaller terminals may clip content. |
| Auth expired | Run `whats-cli --reset` to clear credentials and re-scan. |

---

## Disclaimer

This project uses an **unofficial WhatsApp API**. WhatsApp does not officially support third-party clients. Use at your own risk:

- Your account could potentially be banned by WhatsApp
- The underlying protocol could change without notice
- This is NOT affiliated with or endorsed by WhatsApp/Meta

**Do NOT use this for spam, automation, or any activity that violates WhatsApp's Terms of Service.**

---

## License

MIT
