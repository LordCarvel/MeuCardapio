import { useEffect, useMemo, useRef, useState } from 'react'
import {
  API_BASE_URL,
  controlWhatsappBot,
  getWhatsappConfig,
  getWhatsappConversations,
  getWhatsappMessages,
  getWhatsappStatus,
  markWhatsappConversationRead,
  patchWhatsappConversation,
  refreshWhatsappConversationAvatar,
  sendWhatsappMessage,
  syncWhatsappConversations,
} from '../backend/backendApi'

const CONVERSATION_REFRESH_MS = 60 * 1000
const MESSAGE_REFRESH_MS = 20 * 1000
const AGENT_STORAGE_KEY = 'meucardapio:whatsapp-agent'

function WaIcon({ name, size = 20 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.9',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }

  switch (name) {
    case 'whatsapp':
      return <svg {...props}><path d="M20 11.7a7.8 7.8 0 0 1-11.6 6.8L4 20l1.5-4.1A7.8 7.8 0 1 1 20 11.7Z" /><path d="M8.8 9c.4 2.8 1.9 4.3 4.6 5.1l1.1-1 1.8.6c.3.1.4.3.3.6-.4 1-1.1 1.5-2 1.5-3.6-.1-6.7-3.2-6.8-6.8 0-.9.5-1.6 1.5-2 .3-.1.5 0 .6.3l.6 1.8Z" /></svg>
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="2.7" /><path d="m19 13.5 1.2 1.1-1.8 3.1-1.6-.5a8 8 0 0 1-1.8 1l-.4 1.7h-3.6l-.4-1.7a8 8 0 0 1-1.8-1l-1.6.5-1.8-3.1L5 13.5a8 8 0 0 1 0-3L3.8 9.4l1.8-3.1 1.6.5a8 8 0 0 1 1.8-1l.4-1.7h3.6l.4 1.7a8 8 0 0 1 1.8 1l1.6-.5 1.8 3.1L19 10.5a8 8 0 0 1 0 3Z" /></svg>
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>
    case 'refresh':
      return <svg {...props}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M18.2 9A7 7 0 0 0 6.7 6.4L4 9" /><path d="M5.8 15a7 7 0 0 0 11.5 2.6L20 15" /></svg>
    case 'bolt':
      return <svg {...props}><path d="M13 2 5 14h6l-1 8 9-13h-6l0-7Z" /></svg>
    case 'search':
      return <svg {...props}><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.4 15.4 4.1 4.1" /></svg>
    case 'tag':
      return <svg {...props}><path d="M20 11.5 12.5 19 4 10.5V4h6.5L20 13.5Z" /><circle cx="8" cy="8" r="1.4" /></svg>
    case 'star':
      return <svg {...props}><path d="m12 3 2.8 5.6 6.2.9-4.5 4.3 1.1 6.2-5.6-2.9L6.4 20l1.1-6.2L3 9.5l6.2-.9L12 3Z" /></svg>
    case 'pin':
      return <svg {...props}><path d="m14 4 6 6-3 1-4 4 1 4-1 1-4-4-4 4-1-1 4-4-4-4 1-1 4 1 4-4 1-3Z" /></svg>
    case 'users':
      return <svg {...props}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 11a2.5 2.5 0 1 0-.7-4.9" /><path d="M16.5 18.5a4.5 4.5 0 0 0-2.4-3.9" /></svg>
    case 'clock':
      return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8v4.6l3.1 1.8" /></svg>
    case 'smile':
      return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 10h.1M15.4 10h.1" /><path d="M8.5 14.2a4.3 4.3 0 0 0 7 0" /></svg>
    case 'paperclip':
      return <svg {...props}><path d="m21 11.2-8.5 8.5a5 5 0 0 1-7.1-7.1l9-9a3.4 3.4 0 0 1 4.8 4.8l-9 9a1.8 1.8 0 1 1-2.6-2.6l8.4-8.4" /></svg>
    case 'mic':
      return <svg {...props}><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" /><path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 18v3" /></svg>
    case 'send':
      return <svg {...props}><path d="m21 3-8 18-3-8-8-3 19-7Z" /><path d="m10 13 11-10" /></svg>
    case 'check':
      return <svg {...props}><path d="m5 12.5 4.2 4L19 7" /></svg>
    case 'menu':
      return <svg {...props}><path d="M12 6h.1M12 12h.1M12 18h.1" /></svg>
    default:
      return <svg {...props}><circle cx="12" cy="12" r="7" /></svg>
  }
}

function cleanWhatsappAddress(value = '') {
  return String(value || '')
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace('@g.us', '')
    .replace('@lid', '')
    .trim()
}

function cleanPhone(value = '') {
  const text = String(value || '')
  if (text.includes('@lid') || text.includes('@g.us')) return ''
  return cleanWhatsappAddress(text).replace(/[^\d+]/g, '')
}

function normalizeRecipient(value = '') {
  const raw = String(value || '').trim()
  if (!raw || raw.includes('@')) return raw
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }
  return digits ? `+${digits}` : raw
}

function getConversationTitle(conversation) {
  return conversation?.contactName || conversation?.phone || cleanWhatsappAddress(conversation?.remoteJid) || 'Cliente'
}

function getConversationPreview(conversation) {
  return conversation?.lastMessage || 'Contato sincronizado'
}

function getInitials(value = '') {
  const text = cleanWhatsappAddress(value).replace(/[^\p{L}\p{N}\s+]/gu, ' ').trim()
  if (!text) return 'WA'
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDay(value) {
  if (!value) return 'Hoje'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Hoje'
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000)
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function messageText(message) {
  return String(message?.body || message?.text || '').trim()
}

function samePayload(left, right) {
  return JSON.stringify(left || []) === JSON.stringify(right || [])
}

function botState(conversation) {
  if (!conversation) return { paused: false, label: 'Robo ativo' }
  if (conversation.botPausedIndefinitely) return { paused: true, label: 'Robo pausado' }
  if (conversation.botPausedUntil) {
    const pausedUntil = new Date(conversation.botPausedUntil)
    if (!Number.isNaN(pausedUntil.getTime()) && pausedUntil.getTime() > Date.now()) {
      return { paused: true, label: `Pausado ate ${formatTime(conversation.botPausedUntil)}` }
    }
  }
  if (conversation.botStatus === 'human') return { paused: true, label: 'Atendimento humano' }
  return { paused: false, label: 'Robo ativo' }
}

function attendanceState(conversation) {
  if (!conversation) return { tone: 'muted', label: 'Sem conversa' }
  if (conversation.assignedAgent) return { tone: 'human', label: `Humano: ${conversation.assignedAgent}` }
  if (conversation.unreadCount > 0) return { tone: 'waiting', label: 'Aguardando atendimento' }
  return { tone: 'open', label: 'Em monitoramento' }
}

function botTone(conversation) {
  const state = botState(conversation)
  if (conversation?.botStatus === 'human') return 'human'
  return state.paused ? 'paused' : 'active'
}

function isBotPaused(conversation) {
  return botState(conversation).paused || conversation?.botStatus === 'human'
}

function formatPhone(value = '') {
  const phone = cleanWhatsappAddress(value)
  if (!phone) return 'Telefone nao informado'
  return phone.startsWith('+') ? phone : `+${phone}`
}

function avatarImageUrl(storeId, conversation) {
  if (!storeId || !conversation?.remoteJid || !conversation?.avatarUrl) return ''
  return `${API_BASE_URL}/stores/${storeId}/whatsapp/conversations/avatar-image?remoteJid=${encodeURIComponent(conversation.remoteJid)}`
}

function avatarFor(conversation, title, large = false, storeId = '') {
  const initials = getInitials(title)
  const imageUrl = avatarImageUrl(storeId, conversation)
  return (
    <span className={`wa-avatar ${large ? 'wa-avatar--large' : ''}`.trim()}>
      <span className="wa-avatar__fallback">{initials}</span>
      {imageUrl ? (
        <img
          key={imageUrl}
          alt=""
          src={imageUrl}
          onLoad={(event) => {
            event.currentTarget.hidden = false
          }}
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      ) : null}
    </span>
  )
}

function getStoredAgentName() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(AGENT_STORAGE_KEY) || ''
}

function setStoredAgentName(value) {
  if (typeof window === 'undefined') return
  const name = String(value || '').trim()
  if (name) {
    window.localStorage.setItem(AGENT_STORAGE_KEY, name)
  }
}

export function WhatsappDesk({ storeId, onOpenModal, standalone = false }) {
  const [config, setConfig] = useState(null)
  const [conversations, setConversations] = useState([])
  const [selectedJid, setSelectedJid] = useState('')
  const [manualConversation, setManualConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const feedRef = useRef(null)
  const manualConversationRef = useRef(null)
  const avatarRequestsRef = useRef(new Set())

  const selectedConversation = useMemo(() => {
    const saved = conversations.find((conversation) => conversation.remoteJid === selectedJid)
    if (saved) return saved
    if (manualConversation?.remoteJid === selectedJid) return manualConversation
    return conversations[0] || null
  }, [conversations, manualConversation, selectedJid])
  const effectiveSelectedJid = selectedConversation?.remoteJid || ''
  const unreadTotal = conversations.reduce((sum, conversation) => sum + Number(conversation.unreadCount || 0), 0)
  const state = botState(selectedConversation)

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase()
    return conversations.filter((conversation) => {
      if (filter === 'unread' && !conversation.unreadCount) return false
      if (filter === 'favorites' && !conversation.favorite) return false
      if (filter === 'groups' && !String(conversation.remoteJid || '').includes('@g.us')) return false
      if (filter === 'bot_paused' && !isBotPaused(conversation)) return false
      if (filter === 'waiting' && (conversation.assignedAgent || !conversation.unreadCount)) return false
      const haystack = [
        getConversationTitle(conversation),
        conversation.phone,
        conversation.remoteJid,
        conversation.label,
        conversation.assignedAgent,
        getConversationPreview(conversation),
      ].filter(Boolean).join(' ').toLowerCase()
      return !term || haystack.includes(term)
    })
  }, [conversations, filter, search])

  const renderedMessages = useMemo(() => {
    const source = effectiveSelectedJid ? messages.filter((message) => messageText(message)) : []
    return source.reduce((items, message) => {
      const day = formatDay(message.createdAt)
      const previousDay = items[items.length - 1]?.day || ''
      items.push({ message, day, showDay: day !== previousDay })
      return items
    }, [])
  }, [effectiveSelectedJid, messages])
  const lastMessageId = renderedMessages[renderedMessages.length - 1]?.message?.id || ''

  useEffect(() => {
    manualConversationRef.current = manualConversation
  }, [manualConversation])

  async function loadConversations(silent = true) {
    if (!storeId) return
    try {
      const [loadedConfig, loadedConversations] = await Promise.all([
        getWhatsappConfig(storeId),
        getWhatsappConversations(storeId),
      ])
      setConfig(loadedConfig)
      setConversations((current) => (samePayload(current, loadedConversations) ? current : loadedConversations))
      refreshMissingAvatars(loadedConversations)
      setSelectedJid((current) => {
        if (loadedConversations.some((conversation) => conversation.remoteJid === current)) return current
        if (manualConversationRef.current?.remoteJid === current) return current
        return loadedConversations[0]?.remoteJid || ''
      })
      if (!silent) {
        setStatus({ type: 'success', message: `${loadedConversations.length} conversa(s) carregada(s).` })
      }
    } catch (err) {
      setStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel carregar WhatsApp.' })
    }
  }

  function refreshMissingAvatars(loadedConversations = conversations) {
    if (!storeId) return
    loadedConversations
      .filter((conversation) => conversation?.remoteJid && !conversation.avatarUrl && !avatarRequestsRef.current.has(conversation.remoteJid))
      .slice(0, 12)
      .forEach((conversation) => {
        avatarRequestsRef.current.add(conversation.remoteJid)
        refreshWhatsappConversationAvatar(storeId, conversation.remoteJid)
          .then((updated) => {
            if (!updated?.remoteJid) return
            setConversations((current) => current.map((item) => (
              item.remoteJid === updated.remoteJid ? updated : item
            )))
          })
          .catch(() => {})
      })
  }

  useEffect(() => {
    if (selectedConversation?.remoteJid && !selectedConversation.avatarUrl) {
      refreshMissingAvatars([selectedConversation])
    }
  }, [selectedConversation?.remoteJid, selectedConversation?.avatarUrl, storeId])

  async function loadMessages(silent = true) {
    if (!storeId || !effectiveSelectedJid) {
      setMessages([])
      return
    }
    const isUnsavedManualConversation = manualConversationRef.current?.remoteJid === effectiveSelectedJid
      && !conversations.some((conversation) => conversation.remoteJid === effectiveSelectedJid)
    if (isUnsavedManualConversation) {
      setMessages([])
      return
    }
    try {
      const loaded = await getWhatsappMessages(storeId, effectiveSelectedJid)
      setMessages((current) => (samePayload(current, loaded) ? current : loaded))
      if (selectedConversation?.unreadCount) {
        await markWhatsappConversationRead(storeId, effectiveSelectedJid)
        setConversations((current) => current.map((conversation) => (
          conversation.remoteJid === effectiveSelectedJid ? { ...conversation, unreadCount: 0 } : conversation
        )))
      }
      if (!silent) {
        setStatus({ type: 'success', message: `${loaded.length} mensagem(ns) carregada(s).` })
      }
    } catch (err) {
      setMessages([])
      setStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel carregar mensagens.' })
    }
  }

  useEffect(() => {
    if (!storeId) return undefined
    let cancelled = false
    async function run() {
      if (!cancelled) await loadConversations(true)
    }
    void run()
    const interval = window.setInterval(run, CONVERSATION_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeId || !effectiveSelectedJid) {
      return undefined
    }
    let cancelled = false
    async function run() {
      if (!cancelled) await loadMessages(true)
    }
    void run()
    const interval = window.setInterval(run, MESSAGE_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [effectiveSelectedJid, storeId])

  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    feed.scrollTop = feed.scrollHeight
  }, [effectiveSelectedJid, lastMessageId])

  async function syncSession() {
    if (!storeId) return
    try {
      setStatus({ type: 'warning', message: 'Sincronizando contatos e logs disponiveis...' })
      const syncResult = await syncWhatsappConversations(storeId)
      const loadedConversations = Array.isArray(syncResult) ? syncResult : syncResult.conversations || []
      setConversations(loadedConversations)
      refreshMissingAvatars(loadedConversations)
      setManualConversation(null)
      setSelectedJid((current) => (
        loadedConversations.some((conversation) => conversation.remoteJid === current) ? current : loadedConversations[0]?.remoteJid || ''
      ))
      setStatus({
        type: syncResult.partial ? 'warning' : 'success',
        message: syncResult.message || `${loadedConversations.length} conversa(s) sincronizada(s).`,
      })
    } catch (err) {
      setStatus({ type: 'danger', message: err instanceof Error ? err.message : 'Nao foi possivel sincronizar.' })
    }
  }

  async function refreshStatus() {
    if (!storeId) return
    try {
      const response = await getWhatsappStatus(storeId)
      setStatus({ type: 'success', message: response.status || 'Status consultado.' })
    } catch (err) {
      setStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel consultar status.' })
    }
  }

  function startConversation() {
    const value = window.prompt('WhatsApp do cliente com DDI, ex: +5547999999999')
    const recipient = normalizeRecipient(value)
    if (!recipient) return
    const next = {
      id: `manual-${recipient}`,
      remoteJid: recipient,
      contactName: cleanWhatsappAddress(recipient),
      phone: cleanPhone(recipient),
      lastMessage: '',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      botStatus: 'human',
    }
    setManualConversation(next)
    setSelectedJid(recipient)
    setMessages([])
  }

  async function sendText(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!storeId || !effectiveSelectedJid || !text) return
    try {
      await sendWhatsappMessage(storeId, effectiveSelectedJid, text)
      setDraft('')
      await loadMessages(true)
      await loadConversations(true)
      setManualConversation(null)
    } catch (err) {
      setStatus({ type: 'danger', message: err instanceof Error ? err.message : 'Nao foi possivel enviar.' })
    }
  }

  async function runBotAction(action) {
    if (!storeId || !effectiveSelectedJid) return
    if (action === 'pause_forever') {
      const confirmed = window.confirm('Parar o bot sem prazo nesta conversa? O atendimento automatico so volta quando alguem retomar manualmente.')
      if (!confirmed) return
    }
    try {
      const updated = await controlWhatsappBot(storeId, effectiveSelectedJid, action)
      setConversations((current) => current.map((conversation) => (
        conversation.remoteJid === updated.remoteJid ? updated : conversation
      )))
      if (action === 'send_menu') {
        await loadMessages(true)
      }
      const labels = {
        pause_today: 'Robo pausado nesta conversa hoje.',
        pause_forever: 'Robo parado sem prazo.',
        resume: 'Robo retomado.',
        send_menu: 'Cardapio enviado.',
      }
      setStatus({ type: 'success', message: labels[action] || 'Acao aplicada.' })
    } catch (err) {
      setStatus({ type: 'danger', message: err instanceof Error ? err.message : 'Nao foi possivel controlar o robo.' })
    }
  }

  async function patchSelected(patch) {
    if (!storeId || !effectiveSelectedJid) return
    try {
      const updated = await patchWhatsappConversation(storeId, effectiveSelectedJid, patch)
      setConversations((current) => {
        const exists = current.some((conversation) => conversation.remoteJid === updated.remoteJid)
        if (!exists) return [updated, ...current]
        return current.map((conversation) => (conversation.remoteJid === updated.remoteJid ? updated : conversation))
      })
      if (manualConversation?.remoteJid === updated.remoteJid) {
        setManualConversation(null)
      }
    } catch (err) {
      setStatus({ type: 'danger', message: err instanceof Error ? err.message : 'Nao foi possivel atualizar a conversa.' })
    }
  }

  function assignConversation() {
    const current = selectedConversation?.assignedAgent || getStoredAgentName()
    const name = window.prompt('Nome do atendente', current)
    if (name == null) return
    setStoredAgentName(name)
    void patchSelected({ assignedAgent: name.trim() })
  }

  function labelConversation() {
    const label = window.prompt('Etiqueta da conversa', selectedConversation?.label || '')
    if (label == null) return
    void patchSelected({ label: label.trim() })
  }

  function pinNote() {
    const note = window.prompt('Nota fixada da conversa', selectedConversation?.pinnedNote || '')
    if (note == null) return
    void patchSelected({ pinnedNote: note.trim(), pinned: Boolean(note.trim()) })
  }

  const title = getConversationTitle(selectedConversation)
  const phone = cleanWhatsappAddress(selectedConversation?.phone || selectedConversation?.remoteJid || '')
  const displayPhone = formatPhone(phone)
  const selectedBotTone = botTone(selectedConversation)
  const selectedAttendance = attendanceState(selectedConversation)
  const emptyList = filteredConversations.length === 0
  const emptyMessages = renderedMessages.length === 0
  const inboxFilters = [
    ['all', 'Todas'],
    ['unread', 'Nao lidas'],
    ['favorites', 'Favoritas'],
    ['groups', 'Grupos'],
    ['bot_paused', 'Bot pausado'],
    ['waiting', 'Aguardando atendimento'],
  ]
  const navItems = [
    ['dashboard', 'Dashboard', 'bolt'],
    ['orders', 'Pedidos', 'check'],
    ['conversations', 'Conversas', 'whatsapp'],
    ['customers', 'Clientes', 'users'],
    ['settings', 'Configuracoes', 'settings'],
  ]

  return (
    <article className={`module-card module-card--full wa-desk ${standalone ? 'wa-desk--standalone' : ''}`.trim()}>
      <div className="wa-desk__body">
        {standalone ? null : (
          <aside className="wa-rail" aria-label="Navegacao principal">
            {navItems.map(([id, label, icon]) => (
              <button className={id === 'conversations' ? 'is-active' : ''} key={id} type="button" title={label}>
                <WaIcon name={icon} size={20} />
                {id === 'conversations' && unreadTotal > 0 ? <span>{unreadTotal}</span> : null}
              </button>
            ))}
            <button type="button" title="Configurar atendimento" onClick={() => onOpenModal('whatsappSetup')}>
              <WaIcon name="settings" size={20} />
            </button>
          </aside>
        )}

        <section className="wa-list" aria-label="Caixa de entrada">
          <header className="wa-list__header">
            <div>
              <span>Central de atendimento</span>
              <h2>Caixa de entrada</h2>
              <small>Canal WhatsApp - {config?.status || 'aguardando conexao'}</small>
            </div>
            <div>
              <button type="button" title="Nova conversa" onClick={startConversation}><WaIcon name="plus" size={18} /></button>
              <button type="button" title="Sincronizar conversas" onClick={syncSession}><WaIcon name="refresh" size={18} /></button>
              <button type="button" title="Consultar status" onClick={refreshStatus}><WaIcon name="bolt" size={18} /></button>
            </div>
          </header>

          <label className="wa-search">
            <WaIcon name="search" size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, telefone, etiqueta ou mensagem" />
          </label>

          <div className="wa-tabs" role="tablist" aria-label="Filtros de conversa">
            {inboxFilters.map(([id, label]) => (
              <button className={filter === id ? 'is-active' : ''} key={id} type="button" onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>

          {status.message ? <div className={`wa-status wa-status--${status.type}`}>{status.message}</div> : null}

          <div className="wa-conversations" role="list">
            {filteredConversations.map((conversation) => {
              const conversationTitle = getConversationTitle(conversation)
              const active = effectiveSelectedJid === conversation.remoteJid
              const itemState = botState(conversation)
              const itemTone = botTone(conversation)
              const itemAttendance = attendanceState(conversation)
              return (
                <button
                  className={active ? 'is-active' : ''}
                  key={conversation.id}
                  role="listitem"
                  type="button"
                  onClick={() => {
                    setSelectedJid(conversation.remoteJid)
                    setManualConversation(null)
                    setMessages([])
                  }}
                >
                  {avatarFor(conversation, conversationTitle, false, storeId)}
                  <span className="wa-conversations__main">
                    <span className="wa-conversations__topline">
                      <strong>{conversationTitle}</strong>
                      <time>{formatTime(conversation.lastMessageAt)}</time>
                    </span>
                    <small>{getConversationPreview(conversation)}</small>
                    <span className="wa-conversations__badges">
                      <em className={`wa-chip wa-chip--${itemTone}`}>{itemState.label}</em>
                      <em className={`wa-chip wa-chip--${itemAttendance.tone}`}>{itemAttendance.label}</em>
                    </span>
                  </span>
                  <span className="wa-conversations__meta">
                    {conversation.pinned ? <WaIcon name="pin" size={13} /> : null}
                    {conversation.favorite ? <WaIcon name="star" size={13} /> : null}
                    {conversation.unreadCount > 0 ? <b>{conversation.unreadCount}</b> : null}
                  </span>
                </button>
              )
            })}
            {emptyList ? (
              <div className="wa-empty wa-empty--list">
                <WaIcon name="whatsapp" size={24} />
                <strong>{conversations.length ? 'Filtro sem resultado' : 'Nenhuma conversa'}</strong>
                <button type="button" onClick={conversations.length ? () => { setSearch(''); setFilter('all') } : syncSession}>
                  {conversations.length ? 'Limpar filtros' : 'Sincronizar agora'}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="wa-chat" aria-label="Conversa selecionada">
          <header className="wa-chat__header">
            <div className="wa-chat__identity">
              {avatarFor(selectedConversation, title, true, storeId)}
              <div>
                <span className="wa-channel">WhatsApp</span>
                <strong>{title}</strong>
                <small>{displayPhone}</small>
              </div>
            </div>
            <div className="wa-chat__state">
              <span className={`wa-chip wa-chip--${selectedBotTone}`}>{state.label}</span>
              <span className={`wa-chip wa-chip--${selectedAttendance.tone}`}>{selectedAttendance.label}</span>
            </div>
            <div className="wa-chat__actions">
              <button className="wa-action wa-action--primary" type="button" disabled={!selectedConversation} onClick={assignConversation}>
                <WaIcon name="users" size={16} />
                <span>{selectedConversation?.assignedAgent ? 'Transferir' : 'Assumir'}</span>
              </button>
              {state.paused ? (
                <button className="wa-action" type="button" disabled={!selectedConversation} onClick={() => runBotAction('resume')}>Retomar bot</button>
              ) : (
                <button className="wa-action" type="button" disabled={!selectedConversation} onClick={() => runBotAction('pause_today')}>Pausar bot</button>
              )}
              <button className="wa-action wa-action--danger" type="button" disabled={!selectedConversation} onClick={() => runBotAction('pause_forever')}>Parar bot</button>
              <button className="wa-action" type="button" disabled={!selectedConversation} onClick={() => runBotAction('send_menu')}>Enviar catalogo</button>
              <button className="wa-action" type="button" disabled={!selectedConversation} onClick={labelConversation}>
                <WaIcon name="tag" size={16} />
                <span>Etiquetar</span>
              </button>
            </div>
          </header>

          <div className="wa-botbar">
            <span className={`wa-botbar__status ${state.paused ? 'is-paused' : 'is-active'}`}>{state.label}</span>
            {selectedConversation?.botPausedIndefinitely ? <span className="wa-chip wa-chip--paused">Sem prazo</span> : null}
            {selectedConversation?.assignedAgent ? <span className="wa-chip wa-chip--human">Atendimento humano</span> : null}
            {selectedConversation?.label ? <span className="wa-chip wa-chip--open">{selectedConversation.label}</span> : null}
            <span className="wa-chip wa-chip--muted">Pedido vinculado: nao encontrado</span>
          </div>

          {selectedConversation?.pinnedNote ? (
            <button className="wa-note" type="button" onClick={pinNote}>
              <WaIcon name="pin" size={16} />
              <span>{selectedConversation.pinnedNote}</span>
            </button>
          ) : null}

          <div className="wa-feed" ref={feedRef} role="log" aria-live="polite">
            {selectedConversation ? (
              <div className="wa-system-event">
                <span>Conversa aberta na central</span>
                <time>{formatTime(selectedConversation.lastMessageAt)}</time>
              </div>
            ) : null}
            {state.paused && selectedConversation ? (
              <div className="wa-system-event is-warning">
                <span>{selectedConversation.botPausedIndefinitely ? 'Bot parado sem prazo' : 'Bot pausado nesta conversa'}</span>
              </div>
            ) : null}
            {renderedMessages.map(({ message, day, showDay }) => (
              <div className="wa-message-wrap" key={message.id}>
                {showDay ? <div className="wa-day">{day}</div> : null}
                <article className={`wa-message ${message.fromMe ? 'is-outbound' : 'is-inbound'}`}>
                  <header>{message.fromMe ? 'Atendente' : 'Cliente'}</header>
                  <p>{messageText(message)}</p>
                  <footer>
                    <time>{formatTime(message.createdAt)}</time>
                    {message.fromMe ? <WaIcon name="check" size={14} /> : null}
                  </footer>
                </article>
              </div>
            ))}
            {emptyMessages ? (
              <div className="wa-empty wa-empty--chat">
                <WaIcon name="whatsapp" size={28} />
                <strong>{selectedConversation ? 'Sem mensagens carregadas' : 'Selecione uma conversa'}</strong>
                <button type="button" disabled={!selectedConversation} onClick={() => loadMessages(false)}>Atualizar mensagens</button>
              </div>
            ) : null}
          </div>

          <form className="wa-composer" onSubmit={sendText}>
            <div className="wa-composer__tools">
              <button type="button" title="Anexar" disabled={!selectedConversation}><WaIcon name="paperclip" size={20} /></button>
              <button type="button" title="Emoji" disabled={!selectedConversation}><WaIcon name="smile" size={20} /></button>
              <button type="button" title="Respostas prontas" disabled={!selectedConversation}><WaIcon name="bolt" size={20} /></button>
              <button type="button" title="Enviar catalogo" disabled={!selectedConversation} onClick={() => runBotAction('send_menu')}><WaIcon name="menu" size={20} /></button>
            </div>
            <input
              disabled={!selectedConversation}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escreva uma resposta para o cliente"
            />
            {state.paused ? (
              <button className="wa-composer__bot" type="button" disabled={!selectedConversation} onClick={() => runBotAction('resume')}>Retomar</button>
            ) : (
              <button className="wa-composer__bot" type="button" disabled={!selectedConversation} onClick={() => runBotAction('pause_today')}>Pausar</button>
            )}
            <button className="is-send" type="submit" title="Enviar" disabled={!selectedConversation || !draft.trim()}><WaIcon name="send" size={20} /></button>
          </form>
        </section>

        <aside className="wa-details" aria-label="Detalhes do cliente">
          <section className="wa-details__card">
            <div className="wa-details__profile">
              {avatarFor(selectedConversation, title, true, storeId)}
              <div>
                <strong>{title}</strong>
                <small>{displayPhone}</small>
              </div>
            </div>
            <div className="wa-details__rows">
              <span><small>Canal</small><strong>WhatsApp</strong></span>
              <span><small>Status do bot</small><strong>{state.label}</strong></span>
              <span><small>Atendimento</small><strong>{selectedAttendance.label}</strong></span>
              <span><small>Ultima interacao</small><strong>{formatTime(selectedConversation?.lastMessageAt) || 'Sem registro'}</strong></span>
            </div>
          </section>

          <section className="wa-details__card">
            <header>
              <strong>Etiquetas e notas</strong>
              <button type="button" disabled={!selectedConversation} onClick={labelConversation}>Editar</button>
            </header>
            <div className="wa-tag-list">
              {selectedConversation?.label ? <span>{selectedConversation.label}</span> : <small>Nenhuma etiqueta aplicada</small>}
            </div>
            <button className="wa-note-preview" type="button" disabled={!selectedConversation} onClick={pinNote}>
              {selectedConversation?.pinnedNote || 'Adicionar observacao interna'}
            </button>
          </section>

          <section className="wa-details__card">
            <header>
              <strong>Pedidos vinculados</strong>
              <small>Em breve</small>
            </header>
            <p className="wa-details__muted">Nenhum pedido vinculado automaticamente a esta conversa.</p>
          </section>

          <section className="wa-details__card">
            <header><strong>Acoes rapidas</strong></header>
            <div className="wa-quick-actions">
              <button type="button" disabled={!selectedConversation} onClick={() => runBotAction('send_menu')}>Enviar catalogo</button>
              <button type="button" disabled={!selectedConversation}>Criar pedido</button>
              <button type="button" disabled={!selectedConversation}>Vincular pedido</button>
              {state.paused ? (
                <button type="button" disabled={!selectedConversation} onClick={() => runBotAction('resume')}>Retomar bot</button>
              ) : (
                <button type="button" disabled={!selectedConversation} onClick={() => runBotAction('pause_today')}>Pausar bot</button>
              )}
              <button type="button" disabled={!selectedConversation} onClick={assignConversation}>Transferir atendimento</button>
              <button type="button" disabled={!selectedConversation} onClick={() => runBotAction('pause_forever')}>Encerrar com humano</button>
            </div>
          </section>
        </aside>
      </div>
    </article>
  )
}
