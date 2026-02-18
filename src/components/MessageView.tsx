import React from 'react'
import { Box, Text } from 'ink'
import type { Chat, Message } from '../types/index.js'
import { formatMessageTime, getStatusTicks, splitBySearchTerm } from '../utils/formatters.js'

interface MessageViewProps {
  chat: Chat | null
  messages: Message[]
  isFocused: boolean
  searchQuery?: string
  isGlobalSearch?: boolean
  chats?: Chat[]
}

/**
 * Displays messages for the currently selected chat (right pane).
 * Shows the most recent messages that fit, with proper word wrapping.
 * Supports search highlighting when searchQuery is provided.
 */
export function MessageView({ chat, messages, isFocused, searchQuery = '', isGlobalSearch = false, chats = [] }: MessageViewProps) {
  // Reserve space for: header (2) + input bar (3) + search bar (3) + status bar (1) + borders (2)
  const maxVisible = Math.max(3, Math.floor((process.stdout.rows - 12) / 2))

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
  const isSearching = searchQuery.trim().length > 0

  // Build a JID → name lookup for global search results
  const chatNameMap = new Map<string, string>()
  if (isGlobalSearch) {
    for (const c of chats) {
      chatNameMap.set(c.jid, c.name || c.jid)
    }
  }

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
          {isGlobalSearch ? '🔍 Search Results' : chatTitle}
        </Text>
        <Text dimColor>
          {isSearching ? `${messages.length} matches` : `${messages.length} msgs`}
        </Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {visibleMessages.length === 0 ? (
          <Box justifyContent="center" flexGrow={1} alignItems="center">
            <Text dimColor>
              {isSearching ? 'No messages match your search' : 'No messages yet. Say hi! 👋'}
            </Text>
          </Box>
        ) : (
          visibleMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isGroup={chat?.isGroup ?? false}
              searchQuery={searchQuery}
              chatLabel={isGlobalSearch ? (chatNameMap.get(msg.chatJid) || msg.chatJid.split('@')[0]) : undefined}
            />
          ))
        )}
      </Box>
    </Box>
  )
}

interface MessageBubbleProps {
  message: Message
  isGroup: boolean
  searchQuery: string
  chatLabel?: string
}

function MessageBubble({ message, isGroup, searchQuery, chatLabel }: MessageBubbleProps) {
  const time = formatMessageTime(message.timestamp)
  const ticks = message.isFromMe ? ` ${getStatusTicks(message.status)}` : ''
  // Truncate very long messages to prevent layout blow-up
  const maxLen = (process.stdout.columns || 80) - 45
  const body = message.body.length > maxLen
    ? message.body.slice(0, maxLen - 1) + '…'
    : message.body

  // Render body with search highlighting
  const renderBody = (color: string) => {
    const segments = splitBySearchTerm(body, searchQuery)
    return (
      <Text color={color} wrap="truncate-end">
        {segments.map((seg, i) =>
          seg.isMatch ? (
            <Text key={i} backgroundColor="yellow" color="black">
              {seg.text}
            </Text>
          ) : (
            <Text key={i}>{seg.text}</Text>
          )
        )}
      </Text>
    )
  }

  if (message.isFromMe) {
    return (
      <Box flexDirection="column" marginBottom={0}>
        {chatLabel && <Text color="magenta" bold wrap="truncate-end">[{chatLabel}]</Text>}
        <Box justifyContent="flex-end">
          {renderBody('cyan')}
        </Box>
        <Box justifyContent="flex-end">
          <Text dimColor>{time}{ticks}</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginBottom={0}>
      {chatLabel && <Text color="magenta" bold wrap="truncate-end">[{chatLabel}]</Text>}
      {(isGroup || chatLabel) && !message.isFromMe && (
        <Text color="yellow" bold wrap="truncate-end">
          {message.senderName}
        </Text>
      )}
      {renderBody('white')}
      <Text dimColor>{time}</Text>
    </Box>
  )
}
