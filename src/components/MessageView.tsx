import React from 'react'
import { Box, Text } from 'ink'
import type { Chat, Message } from '../types/index.js'
import { formatMessageTime, getStatusTicks } from '../utils/formatters.js'

interface MessageViewProps {
  chat: Chat | null
  messages: Message[]
  isFocused: boolean
}

/**
 * Displays messages for the currently selected chat (right pane).
 * Shows the most recent messages that fit, with proper word wrapping.
 */
export function MessageView({ chat, messages, isFocused }: MessageViewProps) {
  // Reserve space for: header (2) + input bar (3) + status bar (1) + borders (2)
  const maxVisible = Math.max(3, Math.floor((process.stdout.rows - 9) / 2))

  if (!chat) {
    return (
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor="gray"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="green" bold>
          whats-cli
        </Text>
        <Text dimColor>Select a chat to start messaging</Text>
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text dimColor>↑/↓ Navigate chats</Text>
          <Text dimColor>Enter  Select chat</Text>
          <Text dimColor>Tab    Switch panels</Text>
          <Text dimColor>Ctrl+C Exit</Text>
        </Box>
      </Box>
    )
  }

  // Show the most recent messages that fit
  const visibleMessages = messages.slice(-maxVisible)
  const chatTitle = chat.isGroup ? `👥 ${chat.name}` : (chat.name || chat.jid)

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={isFocused ? 'green' : 'gray'}
      overflow="hidden"
    >
      {/* Chat header */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="green" wrap="truncate-end">
          {chatTitle}
        </Text>
        <Text dimColor>{messages.length} msgs</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {visibleMessages.length === 0 ? (
          <Box justifyContent="center" flexGrow={1} alignItems="center">
            <Text dimColor>No messages yet. Say hi! 👋</Text>
          </Box>
        ) : (
          visibleMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isGroup={chat.isGroup} />
          ))
        )}
      </Box>
    </Box>
  )
}

interface MessageBubbleProps {
  message: Message
  isGroup: boolean
}

function MessageBubble({ message, isGroup }: MessageBubbleProps) {
  const time = formatMessageTime(message.timestamp)
  const ticks = message.isFromMe ? ` ${getStatusTicks(message.status)}` : ''
  // Truncate very long messages to prevent layout blow-up
  const maxLen = (process.stdout.columns || 80) - 45
  const body = message.body.length > maxLen
    ? message.body.slice(0, maxLen - 1) + '…'
    : message.body

  if (message.isFromMe) {
    return (
      <Box flexDirection="column" marginBottom={0}>
        <Box justifyContent="flex-end">
          <Text color="cyan" wrap="truncate-end">{body}</Text>
        </Box>
        <Box justifyContent="flex-end">
          <Text dimColor>{time}{ticks}</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginBottom={0}>
      {isGroup && (
        <Text color="yellow" bold wrap="truncate-end">
          {message.senderName}
        </Text>
      )}
      <Text color="white" wrap="truncate-end">{body}</Text>
      <Text dimColor>{time}</Text>
    </Box>
  )
}
