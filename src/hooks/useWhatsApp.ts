import { useState, useEffect, useRef, useCallback } from 'react'
import { WhatsAppService } from '../services/whatsapp.js'
import { resetUnreadCount } from '../services/store.js'
import type { Chat, Message } from '../types/index.js'
import { ConnectionState } from '../types/index.js'

/**
 * Core hook — manages the WhatsApp connection lifecycle and state.
 */
export function useWhatsApp() {
  const serviceRef = useRef<WhatsAppService | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  )
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const service = new WhatsAppService()
    serviceRef.current = service

    service.on('connection-state', (state: ConnectionState) => {
      setConnectionState(state)
      if (state === ConnectionState.Connected) {
        setQrCode(null)
      }
    })

    service.on('qr', (code: string) => {
      setQrCode(code)
    })

    service.on('ready', () => {
      // Load persisted chats on connection
      const storedChats = service.getChats()
      setChats(storedChats)
    })

    service.on('chats-changed', () => {
      // This is already debounced (300ms) in the service layer
      const updatedChats = service.getChats()
      setChats(updatedChats)
    })

    service.connect().catch((err) => {
      setError(String(err))
      setConnectionState(ConnectionState.Disconnected)
    })

    return () => {
      service.disconnect()
    }
  }, [])

  const sendMessage = useCallback(async (jid: string, text: string): Promise<Message | null> => {
    const service = serviceRef.current
    if (!service) return null

    const sent = await service.sendMessage(jid, text)

    // Refresh chats after sending
    const updatedChats = service.getChats()
    setChats(updatedChats)

    return sent
  }, [])

  const refreshChats = useCallback(() => {
    const service = serviceRef.current
    if (!service) return
    const updatedChats = service.getChats()
    setChats(updatedChats)
  }, [])

  return {
    service: serviceRef,
    connectionState,
    qrCode,
    chats,
    error,
    sendMessage,
    refreshChats,
  }
}

/**
 * Hook for managing messages for the currently selected chat.
 */
export function useMessages(
  service: React.RefObject<WhatsAppService | null>,
  selectedChat: Chat | null
) {
  const [messages, setMessages] = useState<Message[]>([])
  const selectedJid = selectedChat?.jid ?? null

  // Load messages when selected chat changes
  useEffect(() => {
    if (!selectedJid || !service.current) {
      setMessages([])
      return
    }

    const loadedMessages = service.current.getMessages(selectedJid)
    setMessages(loadedMessages)
    resetUnreadCount(selectedJid)
  }, [selectedJid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for new messages for the active chat
  useEffect(() => {
    const svc = service.current
    if (!svc || !selectedJid) return

    const handleMessage = (msg: Message) => {
      if (msg.chatJid === selectedJid) {
        setMessages((prev) => [...prev, msg])
        resetUnreadCount(selectedJid)
      }
    }

    svc.on('message', handleMessage)
    return () => {
      svc.removeListener('message', handleMessage)
    }
  }, [selectedJid]) // eslint-disable-line react-hooks/exhaustive-deps

  return { messages }
}

/**
 * Hook for managing chat list selection and navigation.
 * Tracks the selected chat by JID so reordering the list doesn't jump selection.
 */
export function useChatNavigation(chats: Chat[]) {
  const [selectedJid, setSelectedJid] = useState<string | null>(null)

  // Derive the index from the JID each render
  const selectedIndex = selectedJid
    ? Math.max(0, chats.findIndex((c) => c.jid === selectedJid))
    : 0

  const selectedChat = chats[selectedIndex] ?? null

  const moveUp = useCallback(() => {
    const newIndex = Math.max(0, selectedIndex - 1)
    if (chats[newIndex]) {
      setSelectedJid(chats[newIndex].jid)
    }
  }, [selectedIndex, chats])

  const moveDown = useCallback(() => {
    const newIndex = Math.min(chats.length - 1, selectedIndex + 1)
    if (chats[newIndex]) {
      setSelectedJid(chats[newIndex].jid)
    }
  }, [selectedIndex, chats])

  const setSelectedIndex = useCallback(
    (index: number) => {
      if (chats[index]) {
        setSelectedJid(chats[index].jid)
      }
    },
    [chats]
  )

  return {
    selectedIndex,
    setSelectedIndex,
    selectedChat,
    moveUp,
    moveDown,
  }
}
