import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

interface InputBarProps {
  chatName: string | null
  isFocused: boolean
  onSubmit: (text: string) => void
  onEscape: () => void
}

/**
 * Text input bar at the bottom of the screen.
 * Constrains text to available width with horizontal scrolling to prevent layout distortion.
 */
export function InputBar({ chatName, isFocused, onSubmit, onEscape }: InputBarProps) {
  const [input, setInput] = useState('')
  const [cursorPos, setCursorPos] = useState(0)

  useInput(
    (ch, key) => {
      if (!isFocused) return

      if (key.escape) {
        onEscape()
        return
      }

      if (key.return) {
        const trimmed = input.trim()
        if (trimmed) {
          onSubmit(trimmed)
          setInput('')
          setCursorPos(0)
        }
        return
      }

      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          setInput((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos))
          setCursorPos((prev) => prev - 1)
        }
        return
      }

      if (key.leftArrow) {
        setCursorPos((prev) => Math.max(0, prev - 1))
        return
      }

      if (key.rightArrow) {
        setCursorPos((prev) => Math.min(input.length, prev + 1))
        return
      }

      // Regular character input
      if (ch && !key.ctrl && !key.meta) {
        setInput((prev) => prev.slice(0, cursorPos) + ch + prev.slice(cursorPos))
        setCursorPos((prev) => prev + 1)
      }
    },
    { isActive: isFocused }
  )

  if (!chatName) {
    return (
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        height={3}
      >
        <Text dimColor>Select a chat to start typing...</Text>
      </Box>
    )
  }

  // Calculate visible window — scroll input so cursor stays in view
  const availableWidth = Math.max(10, (process.stdout.columns || 80) - 40)

  let viewStart = 0
  if (cursorPos >= availableWidth) {
    viewStart = cursorPos - availableWidth + 1
  }
  const visibleText = input.slice(viewStart, viewStart + availableWidth)
  const visibleCursorPos = cursorPos - viewStart

  const beforeCursor = visibleText.slice(0, visibleCursorPos)
  const cursorChar = visibleText[visibleCursorPos] ?? ' '
  const afterCursor = visibleText.slice(visibleCursorPos + 1)

  return (
    <Box
      borderStyle="single"
      borderColor={isFocused ? 'green' : 'gray'}
      paddingX={1}
      height={3}
      overflow="hidden"
    >
      <Text color="green" bold>
        {'> '}
      </Text>
      {isFocused ? (
        <Text wrap="truncate-end">
          {beforeCursor}
          <Text inverse>{cursorChar}</Text>
          {afterCursor}
        </Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          {input || `Type a message to ${chatName}...`}
        </Text>
      )}
    </Box>
  )
}
