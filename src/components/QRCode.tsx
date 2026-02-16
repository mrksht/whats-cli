import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import qrcodeTerminal from 'qrcode-terminal'

interface QRCodeProps {
  code: string
}

/**
 * Renders a QR code in the terminal for WhatsApp authentication.
 * Full-screen centered layout with scanning instructions.
 */
export function QRCode({ code }: QRCodeProps) {
  const [qrArt, setQrArt] = useState<string>('')

  useEffect(() => {
    qrcodeTerminal.generate(code, { small: true }, (qr: string) => {
      setQrArt(qr)
    })
  }, [code])

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          {'╔══════════════════════════════════════╗'}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold color="green">
          {'║      🔐 WhatsApp Authentication      ║'}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold color="green">
          {'╚══════════════════════════════════════╝'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{qrArt}</Text>
      </Box>

      <Box flexDirection="column" alignItems="center">
        <Text color="cyan">Scan this QR code with WhatsApp:</Text>
        <Text dimColor>1. Open WhatsApp on your phone</Text>
        <Text dimColor>2. Go to Settings → Linked Devices</Text>
        <Text dimColor>3. Tap "Link a Device"</Text>
        <Text dimColor>4. Point your camera at this QR code</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor italic>
          QR code refreshes automatically. Press Ctrl+C to exit.
        </Text>
      </Box>
    </Box>
  )
}
