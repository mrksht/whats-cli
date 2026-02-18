import React, { useState, useCallback, useMemo, useRef } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { QRCode } from './components/QRCode.js'
import { ChatList } from './components/ChatList.js'
import { MessageView } from './components/MessageView.js'
import { InputBar } from './components/InputBar.js'
import { SearchBar } from './components/SearchBar.js'
import { StatusBar } from './components/StatusBar.js'
import { useWhatsApp, useMessages, useChatNavigation } from './hooks/useWhatsApp.js'
import { searchAllMessages } from './services/store.js'
import { ConnectionState, FocusArea } from './types/index.js'

const CHAT_LIST_WIDTH = 32

export function App() {
  const { exit } = useApp()
  const {
    service,
    connectionState,
    qrCode,
    chats,
    error,
    sendMessage,
    refreshChats,
  } = useWhatsApp()

  const { selectedIndex, selectedChat, moveUp, moveDown, setSelectedIndex } =
    useChatNavigation(chats)

  const [focusArea, setFocusArea] = useState<FocusArea>(FocusArea.ChatList)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)

  const { messages } = useMessages(service, selectedChat)

  // Global search: query all messages across all chats, last 10 matches
  const searchResults = useMemo(() => {
    if (!isSearchMode || !searchQuery.trim()) return null
    return searchAllMessages(searchQuery.trim(), 10)
  }, [isSearchMode, searchQuery])

  // When searching, show search results; otherwise show current chat messages
  const displayMessages = searchResults ?? messages

  // ─── Handle keyboard input ─────────────────────────────────────

  useInput((ch, key) => {
    // Ctrl+C — exit
    if (key.ctrl && ch === 'c') {
      exit()
      return
    }

    // "/" — enter search mode (when not already in search or input)
    if (ch === '/' && focusArea !== FocusArea.SearchBar && focusArea !== FocusArea.InputBar && selectedChat) {
      setIsSearchMode(true)
      setFocusArea(FocusArea.SearchBar)
      return
    }

    // Tab — cycle focus: ChatList → InputBar → ChatList (skip search bar in tab cycle)
    if (key.tab) {
      if (focusArea === FocusArea.SearchBar) {
        // Exit search mode on tab
        setIsSearchMode(false)
        setSearchQuery('')
        setFocusArea(selectedChat ? FocusArea.InputBar : FocusArea.ChatList)
      } else {
        setFocusArea((prev) => {
          if (prev === FocusArea.ChatList && selectedChat) return FocusArea.InputBar
          return FocusArea.ChatList
        })
      }
      return
    }

    // Only handle navigation when ChatList is focused
    if (focusArea === FocusArea.ChatList) {
      if (key.upArrow) {
        moveUp()
        return
      }
      if (key.downArrow) {
        moveDown()
        return
      }
      if (key.return && selectedChat) {
        setFocusArea(FocusArea.InputBar)
        return
      }
    }
  })

  // ─── Send message handler ──────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!selectedChat) return
      await sendMessage(selectedChat.jid, text)
    },
    [selectedChat, sendMessage]
  )

  const handleInputEscape = useCallback(() => {
    setFocusArea(FocusArea.ChatList)
  }, [])

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const handleSearchEscape = useCallback(() => {
    setIsSearchMode(false)
    setSearchQuery('')
    setFocusArea(FocusArea.ChatList)
  }, [])

  // Track whether we've ever reached Connected state.
  // Once connected, we keep the main UI mounted even during brief reconnects.
  const hasConnected = useRef(false)
  if (connectionState === ConnectionState.Connected) {
    hasConnected.current = true
  }

  // ─── Render based on connection state ──────────────────────────

  // QR Code authentication screen (only before first connection)
  if (
    !hasConnected.current &&
    connectionState === ConnectionState.QRReady &&
    qrCode
  ) {
    return <QRCode code={qrCode} />
  }

  // Initial connecting/disconnected screen (only before first connection)
  if (
    !hasConnected.current &&
    (connectionState === ConnectionState.Connecting ||
     connectionState === ConnectionState.Disconnected)
  ) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" padding={2}>
        <Box marginBottom={1}>
          <Text bold color="green">
            whats-cli
          </Text>
        </Box>
        {connectionState === ConnectionState.Connecting ? (
          <Text color="yellow">⏳ Connecting to WhatsApp...</Text>
        ) : (
          <Box flexDirection="column" alignItems="center">
            <Text color="red">❌ Disconnected</Text>
            {error && <Text color="red">{error}</Text>}
          </Box>
        )}
      </Box>
    )
  }

  // ─── Main chat interface ───────────────────────────────────────

  return (
    <Box flexDirection="column" height={process.stdout.rows}>
      {/* Main content area */}
      <Box flexGrow={1}>
        {/* Left pane — Chat list */}
        <ChatList
          chats={chats}
          selectedIndex={selectedIndex}
          isFocused={focusArea === FocusArea.ChatList}
          width={CHAT_LIST_WIDTH}
        />

        {/* Right pane — Messages + Search + Input */}
        <Box flexDirection="column" flexGrow={1}>
          <MessageView
            chat={selectedChat}
            messages={displayMessages}
            isFocused={focusArea === FocusArea.MessageView}
            searchQuery={isSearchMode ? searchQuery : ''}
            isGlobalSearch={isSearchMode && !!searchQuery.trim()}
            chats={chats}
          />

          {isSearchMode && (
            <SearchBar
              isFocused={focusArea === FocusArea.SearchBar}
              onQueryChange={handleSearchQueryChange}
              onEscape={handleSearchEscape}
            />
          )}

          <InputBar
            chatName={selectedChat?.name || selectedChat?.jid?.split('@')[0] || null}
            isFocused={focusArea === FocusArea.InputBar}
            onSubmit={handleSendMessage}
            onEscape={handleInputEscape}
          />
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        connectionState={connectionState}
        focusArea={focusArea}
        chatCount={chats.length}
      />
    </Box>
  )
}
