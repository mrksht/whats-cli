import React, { useState, useCallback } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { QRCode } from './components/QRCode.js'
import { ChatList } from './components/ChatList.js'
import { MessageView } from './components/MessageView.js'
import { InputBar } from './components/InputBar.js'
import { StatusBar } from './components/StatusBar.js'
import { useWhatsApp, useMessages, useChatNavigation } from './hooks/useWhatsApp.js'
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

  const { messages } = useMessages(service, selectedChat)

  const [focusArea, setFocusArea] = useState<FocusArea>(FocusArea.ChatList)

  // ─── Handle keyboard input ─────────────────────────────────────

  useInput((ch, key) => {
    // Ctrl+C — exit
    if (key.ctrl && ch === 'c') {
      exit()
      return
    }

    // Tab — cycle focus: ChatList → InputBar → ChatList
    if (key.tab) {
      setFocusArea((prev) => {
        if (prev === FocusArea.ChatList && selectedChat) return FocusArea.InputBar
        return FocusArea.ChatList
      })
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

  // ─── Render based on connection state ──────────────────────────

  // QR Code authentication screen
  if (
    connectionState === ConnectionState.QRReady &&
    qrCode
  ) {
    return <QRCode code={qrCode} />
  }

  // Connecting screen
  if (
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Disconnected
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

        {/* Right pane — Messages + Input */}
        <Box flexDirection="column" flexGrow={1}>
          <MessageView
            chat={selectedChat}
            messages={messages}
            isFocused={focusArea === FocusArea.MessageView}
          />

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
