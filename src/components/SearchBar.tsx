import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'

interface SearchBarProps {
  isFocused: boolean
  onQueryChange: (query: string) => void
  onEscape: () => void
}

/**
 * Search input bar for filtering messages.
 * Activated with "/" and dismissed with Escape.
 */
export function SearchBar({ isFocused, onQueryChange, onEscape }: SearchBarProps) {
  const [input, setInput] = useState('')
  const [cursorPos, setCursorPos] = useState(0)

  // Notify parent when query changes
  useEffect(() => {
    onQueryChange(input)
  }, [input, onQueryChange])

  useInput(
    (ch, key) => {
      if (!isFocused) return

      if (key.escape) {
        setInput('')
        setCursorPos(0)
        onEscape()
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

      // Regular character input (ignore enter in search mode)
      if (ch && !key.ctrl && !key.meta && !key.return) {
        setInput((prev) => prev.slice(0, cursorPos) + ch + prev.slice(cursorPos))
        setCursorPos((prev) => prev + 1)
      }
    },
    { isActive: isFocused }
  )

  // Calculate visible window — scroll input so cursor stays in view
  const availableWidth = Math.max(10, (process.stdout.columns || 80) - 45)

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
      borderColor={isFocused ? 'yellow' : 'gray'}
      paddingX={1}
      height={3}
      overflow="hidden"
    >
      <Text color="yellow" bold>
        {'/ '}
      </Text>
      {isFocused ? (
        <Text wrap="truncate-end">
          {beforeCursor}
          <Text inverse>{cursorChar}</Text>
          {afterCursor}
        </Text>
      ) : (
        <Text dimColor wrap="truncate-end">
          {input || 'Type to search...'}
        </Text>
      )}
      <Box flexGrow={1} />
      <Text dimColor>ESC to close</Text>
    </Box>
  )
}
