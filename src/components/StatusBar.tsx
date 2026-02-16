import React from 'react'
import { Box, Text } from 'ink'
import { ConnectionState, FocusArea } from '../types/index.js'

interface StatusBarProps {
  connectionState: ConnectionState
  focusArea: FocusArea
  chatCount: number
}

/**
 * Bottom status bar showing connection state, keybindings, and focus info.
 */
export function StatusBar({ connectionState, focusArea, chatCount }: StatusBarProps) {
  const connectionIndicator = getConnectionIndicator(connectionState)

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box gap={2}>
        <Text>
          {connectionIndicator.icon}{' '}
          <Text color={connectionIndicator.color}>{connectionIndicator.text}</Text>
        </Text>
        <Text dimColor>
          {chatCount} chats
        </Text>
      </Box>
      <Box gap={2}>
        <Text dimColor>
          Tab:switch │ ↑↓:navigate │ Enter:select │ Esc:back │ Ctrl+C:quit
        </Text>
      </Box>
    </Box>
  )
}

function getConnectionIndicator(state: ConnectionState): {
  icon: string
  text: string
  color: string
} {
  switch (state) {
    case ConnectionState.Connected:
      return { icon: '🟢', text: 'Connected', color: 'green' }
    case ConnectionState.Connecting:
      return { icon: '🟡', text: 'Connecting...', color: 'yellow' }
    case ConnectionState.QRReady:
      return { icon: '🔵', text: 'Scan QR', color: 'blue' }
    case ConnectionState.Disconnected:
      return { icon: '🔴', text: 'Disconnected', color: 'red' }
  }
}
