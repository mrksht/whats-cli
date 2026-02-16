import React from 'react'
import { Box, Text } from 'ink'
import type { Chat } from '../types/index.js'
import { formatTimestamp, truncate } from '../utils/formatters.js'

interface ChatListProps {
  chats: Chat[]
  selectedIndex: number
  isFocused: boolean
  width: number
}

/**
 * Scrollable list of conversations (left pane).
 * Shows contact name, last message preview, timestamp, and unread badge.
 */
export function ChatList({ chats, selectedIndex, isFocused, width }: ChatListProps) {
  const maxVisible = Math.max(5, process.stdout.rows - 4)
  const nameWidth = Math.max(10, width - 8)

  // Calculate scroll window
  let startIndex = 0
  if (selectedIndex >= maxVisible) {
    startIndex = selectedIndex - maxVisible + 1
  }
  const visibleChats = chats.slice(startIndex, startIndex + maxVisible)

  if (chats.length === 0) {
    return (
      <Box
        flexDirection="column"
        width={width}
        borderStyle="single"
        borderColor={isFocused ? 'green' : 'gray'}
        paddingX={1}
      >
        <Box marginBottom={1}>
          <Text bold color="green">
            {' 💬 Chats'}
          </Text>
        </Box>
        <Text dimColor>No chats yet.</Text>
        <Text dimColor>Send someone a message</Text>
        <Text dimColor>or wait for one to arrive!</Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={isFocused ? 'green' : 'gray'}
    >
      <Box paddingX={1} marginBottom={0}>
        <Text bold color="green">
          💬 Chats ({chats.length})
        </Text>
      </Box>

      {visibleChats.map((chat, i) => {
        const actualIndex = startIndex + i
        const isSelected = actualIndex === selectedIndex

        return (
          <ChatListItem
            key={chat.jid}
            chat={chat}
            isSelected={isSelected}
            isFocused={isFocused}
            nameWidth={nameWidth}
          />
        )
      })}

      {chats.length > maxVisible && (
        <Box paddingX={1}>
          <Text dimColor>
            ↕ {startIndex + 1}-{Math.min(startIndex + maxVisible, chats.length)} of {chats.length}
          </Text>
        </Box>
      )}
    </Box>
  )
}

interface ChatListItemProps {
  chat: Chat
  isSelected: boolean
  isFocused: boolean
  nameWidth: number
}

function ChatListItem({ chat, isSelected, isFocused, nameWidth }: ChatListItemProps) {
  const bgColor = isSelected && isFocused ? 'green' : isSelected ? 'gray' : undefined
  const textColor = isSelected && isFocused ? 'black' : undefined

  const displayName = chat.name || chat.jid.split('@')[0] || chat.jid
  const prefix = chat.isGroup ? '👥 ' : ''
  const unread = chat.unreadCount > 0 ? ` (${chat.unreadCount})` : ''
  const time = chat.lastMessageAt ? formatTimestamp(chat.lastMessageAt) : ''

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Box flexGrow={1}>
          <Text
            color={textColor}
            backgroundColor={bgColor}
            bold={chat.unreadCount > 0}
          >
            {prefix}
            {truncate(displayName, nameWidth - prefix.length - unread.length)}
            {unread && (
              <Text color="yellow" bold>
                {unread}
              </Text>
            )}
          </Text>
        </Box>
        <Text dimColor color={textColor} backgroundColor={bgColor}>
          {time}
        </Text>
      </Box>
      {chat.lastMessage && (
        <Box>
          <Text
            dimColor={!isSelected}
            color={textColor}
            backgroundColor={bgColor}
          >
            {truncate(chat.lastMessage, nameWidth)}
          </Text>
        </Box>
      )}
    </Box>
  )
}
