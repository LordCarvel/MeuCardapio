import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'meucardapio-ops-front-v3'

const stages = [
  { id: 'analysis', title: 'Entrada', action: 'Aceitar', next: 'production', tone: 'coral' },
  { id: 'production', title: 'Preparo', action: 'Pronto', next: 'ready', tone: 'amber' },
  { id: 'ready', title: 'Saida', action: 'Finalizar', next: 'completed', tone: 'green' },
]

const initialOrders = [
  {
    id: '8335',
    customer: 'Digo',
    phone: '(47) 9 643-0904',
    channel: 'pickup',
    status: 'ready',
    total: 84.99,
    payment: 'Cartao',
    time: '18:45',
    address: 'Retirada no balcao',
    note: 'Conferir embalagem antes de entregar.',
    items: ['1 Pizza grande', '1 Borda recheada', '1 Refrigerante 2L'],
  },
  {
    id: '8338',
    customer: 'Ana Paula',
    phone: '(47) 9 8811-2400',
    channel: 'delivery',
    status: 'production',
    total: 62.8,
    payment: 'Pix',
    time: '18:51',
    address: 'Rua das Flores, 120',
    note: 'Sem cebola.',
    items: ['1 Calzone', '1 Suco natural'],
  },
  {
    id: '8341',
    customer: 'Carlos Lima',
    phone: '(47) 9 7701-2010',
    channel: 'pickup',
    status: 'analysis',
    total: 39.9,
    payment: 'Dinheiro',
    time: '18:58',
    address: 'Retirada no balcao',
    note: 'Troco para R$ 50,00.',
    items: ['1 Burger duplo', '1 Batata pequena'],
  },
]

const navItems = [
  { id: 'orders', icon: 'ticket', label: 'Pedidos' },
  { id: 'service', icon: 'message', label: 'Atendimento' },
  { id: 'counter', icon: 'cash', label: 'PDV' },
  { id: 'tables', icon: 'table', label: 'Salao' },
  { id: 'menu', icon: 'menu', label: 'Cardapio' },
  { id: 'kds', icon: 'check', label: 'Cozinha KDS' },
  { id: 'delivery', icon: 'bike', label: 'Entregas' },
  { id: 'marketing', icon: 'bolt', label: 'Marketing' },
  { id: 'inventory', icon: 'bag', label: 'Estoque' },
  { id: 'finance', icon: 'card', label: 'Financeiro' },
  { id: 'fiscal', icon: 'printer', label: 'Fiscal' },
  { id: 'integrations', icon: 'settings', label: 'Integracoes' },
  { id: 'reports', icon: 'chart', label: 'Relatorios' },
]

const shortcutItems = [
  { id: 'home', icon: 'home', label: 'Inicio' },
  { id: 'whatsapp', icon: 'message', label: 'WhatsApp' },
  { id: 'boost', icon: 'bolt', label: 'Campanha' },
  { id: 'help', icon: 'bell', label: 'Central' },
]

const blankOrder = {
  customer: '',
  phone: '',
  channel: 'pickup',
  total: '',
  payment: 'Pix',
  items: '1 Pizza media',
  note: '',
}

const initialCategories = [
  { id: 'cat-pizzas', name: 'Pizzas', active: true },
  { id: 'cat-combos', name: 'Combos', active: true },
  { id: 'cat-bebidas', name: 'Bebidas', active: true },
  { id: 'cat-sobremesas', name: 'Sobremesas', active: false },
]

const initialProducts = [
  { id: 'prod-1', name: 'Pizza grande', category: 'Pizzas', price: 54.9, active: true, stock: 18 },
  { id: 'prod-2', name: 'Calzone', category: 'Pizzas', price: 38.9, active: true, stock: 11 },
  { id: 'prod-3', name: 'Combo familia', category: 'Combos', price: 89.9, active: true, stock: 7 },
  { id: 'prod-4', name: 'Refrigerante 2L', category: 'Bebidas', price: 13.9, active: true, stock: 24 },
  { id: 'prod-5', name: 'Brownie', category: 'Sobremesas', price: 15.9, active: false, stock: 5 },
]

const initialTables = [
  { id: 'mesa-1', name: 'Mesa 1', seats: 4, status: 'occupied', customer: 'Marina', total: 72.8 },
  { id: 'mesa-2', name: 'Mesa 2', seats: 2, status: 'free', customer: '', total: 0 },
  { id: 'mesa-3', name: 'Mesa 3', seats: 6, status: 'closing', customer: 'Rafael', total: 118.4 },
  { id: 'mesa-4', name: 'Balcao 1', seats: 1, status: 'free', customer: '', total: 0 },
]

const initialCouriers = [
  { id: 'mot-1', name: 'Leandro', phone: '(47) 9 9800-1001', vehicle: 'Moto', active: true, deliveries: 2 },
  { id: 'mot-2', name: 'Bianca', phone: '(47) 9 9800-1002', vehicle: 'Carro', active: true, deliveries: 1 },
  { id: 'mot-3', name: 'Caio', phone: '(47) 9 9800-1003', vehicle: 'Moto', active: false, deliveries: 0 },
]

const initialChannels = [
  { id: 'whatsapp', name: 'WhatsApp', active: true, robot: true, queue: 5 },
  { id: 'instagram', name: 'Instagram', active: true, robot: true, queue: 2 },
  { id: 'facebook', name: 'Facebook', active: false, robot: false, queue: 0 },
  { id: 'cardapio', name: 'Cardapio digital', active: true, robot: false, queue: 3 },
]

const initialCoupons = [
  { id: 'cup-1', code: 'VOLTA10', type: 'Cupom', value: 10, active: true, uses: 18 },
  { id: 'cup-2', code: 'CASH5', type: 'Cashback', value: 5, active: true, uses: 31 },
]

const initialRecoveries = [
  {
    id: 'rec-1',
    name: 'Carrinho abandonado',
    channel: 'WhatsApp',
    active: true,
    sent: 44,
    delay: 15,
    message: 'Oi, seu pedido ficou pendente. Posso te ajudar a concluir?',
  },
  {
    id: 'rec-2',
    name: 'Cliente sumido 30 dias',
    channel: 'WhatsApp',
    active: false,
    sent: 12,
    delay: 30,
    message: 'Tem cupom novo para voce voltar a pedir hoje.',
  },
]

const initialInventory = [
  { id: 'stk-1', item: 'Massa pizza', unit: 'un', quantity: 42, min: 20, cost: 3.2 },
  { id: 'stk-2', item: 'Mussarela', unit: 'kg', quantity: 8, min: 10, cost: 28 },
  { id: 'stk-3', item: 'Refrigerante 2L', unit: 'un', quantity: 24, min: 12, cost: 8.5 },
]

const initialFinance = [
  { id: 'fin-1', title: 'Venda balcao', type: 'Entrada', amount: 84.99, status: 'Pago' },
  { id: 'fin-2', title: 'Compra fornecedor', type: 'Saida', amount: 320, status: 'Pendente' },
  { id: 'fin-3', title: 'Pagamento online', type: 'Entrada', amount: 62.8, status: 'Pago' },
]

const initialInvoices = [
  { id: 'nfc-1', orderId: '8335', customer: 'Digo', amount: 84.99, status: 'Autorizada' },
  { id: 'nfc-2', orderId: '8338', customer: 'Ana Paula', amount: 62.8, status: 'Pendente' },
]

const initialIntegrations = [
  { id: 'ifood', name: 'iFood', active: true, status: 'Sincronizado' },
  { id: 'rappi', name: 'Rappi', active: false, status: 'Desconectado' },
  { id: 'meta', name: 'Meta Ads / Pixel', active: true, status: 'Eventos ativos' },
  { id: 'payments', name: 'Pagamento online', active: true, status: 'Pix e credito' },
]

const initialQrCodes = [
  { id: 'qr-1', table: 'Mesa 1', url: 'mesa-1', scans: 34 },
  { id: 'qr-2', table: 'Mesa 2', url: 'mesa-2', scans: 11 },
]

const blankProduct = {
  name: '',
  category: 'Pizzas',
  price: '',
  stock: '10',
  active: true,
}

const blankCategory = {
  name: '',
  active: true,
}

const blankTable = {
  name: '',
  seats: '4',
  customer: '',
}

const blankCoupon = {
  code: '',
  type: 'Cupom',
  value: '10',
}

const blankStock = {
  item: '',
  unit: 'un',
  quantity: '1',
  min: '1',
  cost: '0',
}

const blankFinance = {
  title: '',
  type: 'Entrada',
  amount: '',
  status: 'Pendente',
}

const initialBlockedOrders = [
  { id: '8320', customer: 'Pedido sem telefone', reason: 'Cadastro incompleto' },
]

const initialSettings = {
  autoAccept: true,
  counterTime: 25,
  deliveryTime: 45,
  printer: true,
  autoPrint: true,
  sendReadyMessage: true,
  saveDrafts: true,
  lowStockAlert: true,
}

const initialStoreProfile = {
  name: 'Tbt Pizzas Penha',
  owner: 'Deivid Laufer',
  phone: '(47) 9 9643-0904',
  email: 'operacao@tbtpizzas.local',
  taxId: '47.123.456/0001-99',
  address: 'Rua Principal, 180',
  city: 'Penha - SC',
  serviceFee: '0',
  deliveryRadius: '6',
  schedule: '18:00 - 23:30',
  note: 'Retirada e delivery ativos.',
}

const initialPrinterConfig = {
  connected: true,
  deviceName: 'POS-80 Cozinha',
  copies: 1,
  paper: '80mm',
  queue: [
    { id: 'job-1', label: 'Pedido #8335', type: 'Pedido', status: 'Pronto' },
    { id: 'job-2', label: 'Mapa de mesas', type: 'Relatorio', status: 'Pendente' },
  ],
}

const initialSecurity = {
  operator: 'Operacao',
  email: 'seguranca@meucardapio.local',
  twoFactor: true,
  sessionMinutes: 45,
  lockOnIdle: true,
  lastChange: '16/04/2026 20:40',
}

const initialBotConfig = {
  welcome: 'Oi, eu sou o atendimento automatico. Posso montar seu pedido pelo cardapio digital.',
  fallback: 'Nao entendi. Posso te direcionar para um atendente agora.',
  handoffKeywords: 'humano, atendente, ajuda, suporte',
  audio: true,
  menuHint: 'Digite sabor, categoria ou tamanho para eu sugerir combinacoes.',
  faq: [
    { id: 'faq-1', question: 'Qual o horario?', answer: 'Atendemos todos os dias das 18:00 as 23:30.' },
    { id: 'faq-2', question: 'Tem borda recheada?', answer: 'Sim. A borda recheada pode ser adicionada no fechamento do pedido.' },
  ],
}

const initialKdsConfig = {
  soundAlert: true,
  autoBump: false,
  bumpMinutes: 8,
  showCustomer: true,
  highlightRush: true,
}

const initialOrderDrafts = []
const initialSuggestionHistory = []
const initialEventLog = [
  { id: 'evt-1', message: 'Sistema pronto para operar.', time: '18:40', tone: 'neutral' },
]

const blankCourier = {
  name: '',
  phone: '',
  vehicle: 'Moto',
  active: true,
}

const blankRecovery = {
  name: '',
  channel: 'WhatsApp',
  delay: '15',
  message: 'Oi, seu pedido ficou parado. Posso continuar com voce?',
  active: true,
}

const blankPassword = {
  current: '',
  next: '',
  confirm: '',
  twoFactor: 'yes',
  sessionMinutes: '45',
  lockOnIdle: 'yes',
}

function orderToForm(order) {
  return {
    customer: order.customer,
    phone: order.phone,
    channel: order.channel,
    total: String(order.total).replace('.', ','),
    payment: order.payment,
    items: order.items.join(', '),
    note: order.note,
  }
}

function productToForm(product) {
  return {
    name: product.name,
    category: product.category,
    price: String(product.price).replace('.', ','),
    stock: String(product.stock),
    active: product.active,
  }
}

function categoryToForm(category) {
  return {
    name: category.name,
    active: category.active,
  }
}

function courierToForm(courier) {
  return {
    name: courier.name,
    phone: courier.phone || '',
    vehicle: courier.vehicle || 'Moto',
    active: courier.active,
  }
}

function recoveryToForm(recovery) {
  return {
    name: recovery.name,
    channel: recovery.channel,
    delay: String(recovery.delay ?? 15),
    message: recovery.message || '',
    active: recovery.active,
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function nowTime() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nowDateTime() {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function createDefaultAppData() {
  return cloneData({
    orders: initialOrders,
    activeNav: 'orders',
    cashOpen: false,
    noticeVisible: true,
    blockedOrders: initialBlockedOrders,
    settings: initialSettings,
    chatMessages: [
      { id: 1, author: 'Sistema', text: 'Canal de atendimento simulado ativo.' },
    ],
    categories: initialCategories,
    products: initialProducts,
    tables: initialTables,
    couriers: initialCouriers,
    channels: initialChannels,
    recoveries: initialRecoveries,
    coupons: initialCoupons,
    inventory: initialInventory,
    finance: initialFinance,
    invoices: initialInvoices,
    integrations: initialIntegrations,
    qrCodes: initialQrCodes,
    storeProfile: initialStoreProfile,
    printerConfig: initialPrinterConfig,
    security: initialSecurity,
    botConfig: initialBotConfig,
    kdsConfig: initialKdsConfig,
    orderDrafts: initialOrderDrafts,
    suggestions: initialSuggestionHistory,
    eventLog: initialEventLog,
  })
}

function loadPersistedAppData() {
  const defaults = createDefaultAppData()

  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return defaults
    }

    const parsed = JSON.parse(raw)

    return {
      ...defaults,
      ...parsed,
      orders: Array.isArray(parsed.orders) ? parsed.orders : defaults.orders,
      blockedOrders: Array.isArray(parsed.blockedOrders) ? parsed.blockedOrders : defaults.blockedOrders,
      settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
      chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : defaults.chatMessages,
      categories: Array.isArray(parsed.categories) ? parsed.categories : defaults.categories,
      products: Array.isArray(parsed.products) ? parsed.products : defaults.products,
      tables: Array.isArray(parsed.tables) ? parsed.tables : defaults.tables,
      couriers: Array.isArray(parsed.couriers) ? parsed.couriers : defaults.couriers,
      channels: Array.isArray(parsed.channels) ? parsed.channels : defaults.channels,
      recoveries: Array.isArray(parsed.recoveries) ? parsed.recoveries : defaults.recoveries,
      coupons: Array.isArray(parsed.coupons) ? parsed.coupons : defaults.coupons,
      inventory: Array.isArray(parsed.inventory) ? parsed.inventory : defaults.inventory,
      finance: Array.isArray(parsed.finance) ? parsed.finance : defaults.finance,
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : defaults.invoices,
      integrations: Array.isArray(parsed.integrations) ? parsed.integrations : defaults.integrations,
      qrCodes: Array.isArray(parsed.qrCodes) ? parsed.qrCodes : defaults.qrCodes,
      storeProfile: { ...defaults.storeProfile, ...(parsed.storeProfile ?? {}) },
      printerConfig: {
        ...defaults.printerConfig,
        ...(parsed.printerConfig ?? {}),
        queue: Array.isArray(parsed.printerConfig?.queue) ? parsed.printerConfig.queue : defaults.printerConfig.queue,
      },
      security: { ...defaults.security, ...(parsed.security ?? {}) },
      botConfig: {
        ...defaults.botConfig,
        ...(parsed.botConfig ?? {}),
        faq: Array.isArray(parsed.botConfig?.faq) ? parsed.botConfig.faq : defaults.botConfig.faq,
      },
      kdsConfig: { ...defaults.kdsConfig, ...(parsed.kdsConfig ?? {}) },
      orderDrafts: Array.isArray(parsed.orderDrafts) ? parsed.orderDrafts : defaults.orderDrafts,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : defaults.suggestions,
      eventLog: Array.isArray(parsed.eventLog) ? parsed.eventLog : defaults.eventLog,
    }
  } catch {
    return defaults
  }
}

function downloadTextFile(filename, content, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function copyText(value) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

function ordersToCsv(orders) {
  const lines = [
    ['Pedido', 'Cliente', 'Canal', 'Status', 'Pagamento', 'Total', 'Hora', 'Endereco'].join(';'),
    ...orders.map((order) => [
      order.id,
      order.customer,
      order.channel,
      order.status,
      order.payment,
      String(order.total).replace('.', ','),
      order.time,
      order.address,
    ].join(';')),
  ]

  return lines.join('\n')
}

function Icon({ name, size = 20, className = '' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    className: `icon ${className}`.trim(),
  }

  switch (name) {
    case 'home':
      return <svg {...props}><path d="m4 10 8-6 8 6" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-6h4v6" /></svg>
    case 'message':
      return <svg {...props}><path d="M20 11.7a7.8 7.8 0 0 1-11.6 6.8L4 20l1.5-4.1A7.8 7.8 0 1 1 20 11.7Z" /><path d="M8.8 9c.4 2.8 1.9 4.3 4.6 5.1l1.1-1 1.8.6c.3.1.4.3.3.6-.4 1-1.1 1.5-2 1.5-3.6-.1-6.7-3.2-6.8-6.8 0-.9.5-1.6 1.5-2 .3-.1.5 0 .6.3l.6 1.8Z" /></svg>
    case 'bolt':
      return <svg {...props}><path d="M13 2 5 14h6l-1 8 9-13h-6l0-7Z" /></svg>
    case 'bell':
      return <svg {...props}><path d="M18 9.8a6 6 0 0 0-12 0c0 5.4-2 6-2 6h16s-2-.6-2-6Z" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></svg>
    case 'ticket':
      return <svg {...props}><path d="M5 6h14v12H5z" /><path d="M8 9h5M8 12h8M8 15h6" /></svg>
    case 'cash':
      return <svg {...props}><path d="M4 8h16v10H4z" /><path d="M7 8V5h10v3" /><circle cx="12" cy="13" r="2.2" /></svg>
    case 'table':
      return <svg {...props}><path d="M4 8h16M6 8v10M18 8v10M8 18h8" /><path d="M7 5h10" /></svg>
    case 'menu':
      return <svg {...props}><path d="M5 6h14M5 12h14M5 18h14" /><path d="M8 6v12" /></svg>
    case 'bike':
      return <svg {...props}><circle cx="6.5" cy="17" r="2.4" /><circle cx="17.5" cy="17" r="2.4" /><path d="M8.8 17h4l2-5H11l-2.2 5Z" /><path d="M14.8 12 17.5 17M11 12l-1-3h2.8" /></svg>
    case 'chart':
      return <svg {...props}><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /></svg>
    case 'search':
      return <svg {...props}><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.4 15.4 4.1 4.1" /></svg>
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>
    case 'edit':
      return <svg {...props}><path d="M4 20h16" /><path d="M13.7 5.3 6 13v3h3l7.7-7.7a2.1 2.1 0 0 0-3-3Z" /></svg>
    case 'trash':
      return <svg {...props}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
    case 'user':
      return <svg {...props}><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
    case 'settings':
      return <svg {...props}><circle cx="12" cy="12" r="2.6" /><path d="m19 13.5 1.2 1.1-1.8 3.1-1.6-.5a8 8 0 0 1-1.8 1l-.4 1.7h-3.6l-.4-1.7a8 8 0 0 1-1.8-1l-1.6.5-1.8-3.1L5 13.5a8 8 0 0 1 0-3L3.8 9.4l1.8-3.1 1.6.5a8 8 0 0 1 1.8-1l.4-1.7h3.6l.4 1.7a8 8 0 0 1 1.8 1l1.6-.5 1.8 3.1L19 10.5a8 8 0 0 1 0 3Z" /></svg>
    case 'bag':
      return <svg {...props}><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>
    case 'printer':
      return <svg {...props}><path d="M7 8V4h10v4" /><path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v6H7z" /></svg>
    case 'store':
      return <svg {...props}><path d="M4 10h16l-1.3-5H5.3L4 10Z" /><path d="M5 10v9h14v-9M9 19v-5h6v5" /></svg>
    case 'clock':
      return <svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8v4.6l3.1 1.8" /></svg>
    case 'card':
      return <svg {...props}><path d="M4 6h16v12H4z" /><path d="M4 10h16" /></svg>
    case 'chain':
      return <svg {...props}><path d="M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1l-.8.8" /><path d="M14 11a5 5 0 0 0-7.1-.1l-1.4 1.4a5 5 0 0 0 7.1 7.1l.8-.8" /></svg>
    case 'check':
      return <svg {...props}><path d="m5 12.5 4.2 4L19 7" /></svg>
    case 'x':
      return <svg {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>
    case 'arrow':
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    default:
      return <svg {...props}><circle cx="12" cy="12" r="7" /></svg>
  }
}

function Button({ children, variant = 'ghost', className = '', ...props }) {
  return (
    <button className={`btn btn--${variant} ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  )
}

function Modal({ title, subtitle, children, footer, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-btn" data-testid="modal-close" type="button" onClick={onClose}>
            <Icon name="x" size={19} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </section>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function StoreBadge() {
  return (
    <span className="store-badge" aria-hidden="true">
      <span>TP</span>
    </span>
  )
}

function Sidebar({
  activeNav,
  cashOpen,
  navQuery,
  storeProfile,
  onNavQuery,
  onOpenModal,
  onSetActiveNav,
}) {
  const visibleNav = navItems.filter((item) =>
    item.label.toLowerCase().includes(navQuery.toLowerCase()),
  )

  return (
    <aside className="sidebar" aria-label="Navegacao principal">
      <button className="store-profile" data-testid="store-profile" type="button" onClick={() => onOpenModal('store')}>
        <StoreBadge />
        <span>
          <strong>{storeProfile.name}</strong>
          <small>{cashOpen ? 'Loja aberta agora' : 'Caixa fechado'}</small>
        </span>
      </button>

      <button className="cash-card" data-testid="open-cash" type="button" onClick={() => onOpenModal('cash')}>
        <span>
          <Icon name="cash" size={21} />
        </span>
        <strong>Caixa</strong>
        <small>{cashOpen ? 'Aberto' : 'Fechado'}</small>
      </button>

      <label className="sidebar-search">
        <Icon name="search" size={17} />
        <input
          value={navQuery}
          onChange={(event) => onNavQuery(event.target.value)}
          placeholder="Buscar area"
        />
      </label>

      <nav className="sidebar-nav">
        {visibleNav.map((item) => (
          <button
            className={`sidebar-nav__item ${activeNav === item.id ? 'sidebar-nav__item--active' : ''}`.trim()}
            data-testid={`nav-${item.id}`}
            type="button"
            key={item.id}
            onClick={() => onSetActiveNav(item.id)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <button className="upgrade-card" data-testid="open-register" type="button" onClick={() => onOpenModal('register')}>
        <Icon name="bolt" size={22} />
        <span>
          <strong>Cadastro comercial</strong>
          <small>Complete os dados para vender melhor</small>
        </span>
      </button>
    </aside>
  )
}

function TopBar({ onOpenModal, notificationCount }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark">MC</span>
        <span>
          <strong>MeuCardapio Ops</strong>
          <small>Painel operacional</small>
        </span>
      </div>

      <div className="quick-actions" aria-label="Atalhos">
        {shortcutItems.map((item) => (
          <button
            className="quick-action"
            data-testid={`shortcut-${item.id}`}
            type="button"
            key={item.id}
            title={item.label}
            onClick={() => onOpenModal('shortcut', item)}
          >
            <Icon name={item.icon} size={19} />
          </button>
        ))}
      </div>

      <div className="topbar-actions">
        <button className="topbar-action" data-testid="open-automations" type="button" onClick={() => onOpenModal('automations')}>
          <Icon name="bolt" size={19} />
          <span>Automacoes</span>
        </button>
        <button className="topbar-action" data-testid="open-printer" type="button" onClick={() => onOpenModal('printer')}>
          <Icon name="printer" size={19} />
          <span>Impressora</span>
        </button>
        <button
          className="topbar-action topbar-action--icon"
          data-testid="open-notifications"
          type="button"
          onClick={() => onOpenModal('notifications')}
        >
          <Icon name="bell" size={20} />
          {notificationCount > 0 ? <b>{notificationCount}</b> : null}
        </button>
      </div>
    </header>
  )
}

function Notice({ visible, onClose, onOpenPassword }) {
  if (!visible) {
    return null
  }

  return (
    <section className="notice" role="status">
      <Icon name="check" size={20} />
      <p>
        <strong>Revisao de seguranca pendente.</strong> Atualize a senha e confirme os dados de
        contato da loja.
      </p>
      <Button variant="link" onClick={onOpenPassword}>
        Atualizar
      </Button>
      <button className="icon-btn icon-btn--flat" type="button" onClick={onClose}>
        <Icon name="x" size={18} />
      </button>
    </section>
  )
}

function Metrics({ orders, cashOpen }) {
  const activeOrders = orders.filter((order) => order.status !== 'completed')
  const ready = activeOrders.filter((order) => order.status === 'ready').length
  const production = activeOrders.filter((order) => order.status === 'production').length
  const revenue = orders.reduce((sum, order) => sum + order.total, 0)

  return (
    <section className="metrics" aria-label="Resumo da operacao">
      <article className="metric-card">
        <span>Pedidos ativos</span>
        <strong>{activeOrders.length}</strong>
      </article>
      <article className="metric-card">
        <span>Em preparo</span>
        <strong>{production}</strong>
      </article>
      <article className="metric-card">
        <span>Na saida</span>
        <strong>{ready}</strong>
      </article>
      <article className="metric-card">
        <span>Movimento</span>
        <strong>{formatCurrency(revenue)}</strong>
      </article>
      <article className={`metric-card metric-card--status ${cashOpen ? 'is-open' : ''}`}>
        <span>Status</span>
        <strong>{cashOpen ? 'Aberto' : 'Fechado'}</strong>
      </article>
    </section>
  )
}

function Toolbar({
  filter,
  search,
  onFilter,
  onSearch,
  onOpenModal,
  blockedCount,
}) {
  return (
    <section className="toolbar" aria-label="Ferramentas de pedidos">
      <div className="segmented" data-testid="filter-tabs">
        {[
          { id: 'all', label: 'Todos' },
          { id: 'delivery', label: 'Delivery' },
          { id: 'pickup', label: 'Balcao' },
        ].map((item) => (
          <button
            className={filter === item.id ? 'is-active' : ''}
            data-testid={`filter-${item.id}`}
            type="button"
            key={item.id}
            onClick={() => onFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="search-box">
        <Icon name="search" size={19} />
        <input
          data-testid="order-search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Cliente, telefone ou pedido"
        />
      </label>

      <div className="toolbar-actions">
        <Button variant="primary" data-testid="new-order" onClick={() => onOpenModal('newOrder')}>
          <Icon name="plus" size={18} />
          Novo pedido
        </Button>
        <Button data-testid="blocked-orders" onClick={() => onOpenModal('blocked')}>
          <Icon name="bag" size={18} />
          Bloqueados
          {blockedCount > 0 ? <b className="pill">{blockedCount}</b> : null}
        </Button>
        <Button data-testid="open-settings" onClick={() => onOpenModal('settings')}>
          <Icon name="settings" size={18} />
          Ajustes
        </Button>
      </div>
    </section>
  )
}

function OrderCard({ order, stage, onOpenModal, onMoveOrder }) {
  const channelLabel = order.channel === 'delivery' ? 'Delivery' : 'Balcao'

  return (
    <article className="order-card" data-testid={`order-${order.id}`}>
      <header>
        <span>#{order.id}</span>
        <strong>{formatCurrency(order.total)}</strong>
      </header>
      <div className="order-card__person">
        <strong>{order.customer}</strong>
        <small>{order.phone}</small>
      </div>
      <div className="order-card__meta">
        <span>
          <Icon name={order.channel === 'delivery' ? 'bike' : 'store'} size={15} />
          {channelLabel}
        </span>
        <span>
          <Icon name="clock" size={15} />
          {order.time}
        </span>
        <span>
          <Icon name="card" size={15} />
          {order.payment}
        </span>
      </div>
      <p>{order.items.join(', ')}</p>
      <footer>
        <Button onClick={() => onOpenModal('orderDetails', order)}>Detalhes</Button>
        <Button data-testid={`edit-order-${order.id}`} onClick={() => onOpenModal('editOrder', order)}>
          <Icon name="edit" size={14} />
          Editar
        </Button>
        <Button variant="danger" data-testid={`delete-order-${order.id}`} onClick={() => onOpenModal('deleteOrder', order)}>
          <Icon name="trash" size={14} />
          Apagar
        </Button>
        {stage.id === 'ready' ? (
          <>
            <Button onClick={() => onOpenModal('invoice', order)}>NF</Button>
            <Button variant="primary" onClick={() => onOpenModal('finishOrder', order)}>
              Finalizar
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => onMoveOrder(order.id, stage.next)}>
            {stage.action}
          </Button>
        )}
      </footer>
    </article>
  )
}

function StageColumn({ stage, orders, onOpenModal, onMoveOrder }) {
  return (
    <article className={`stage-card stage-card--${stage.tone}`}>
      <header className="stage-card__header">
        <div>
          <span>{stage.title}</span>
          <strong>{orders.length}</strong>
        </div>
        {stage.id === 'ready' ? (
          <button type="button" onClick={() => onOpenModal('finishReady')}>
            Finalizar todos
          </button>
        ) : null}
      </header>
      <div className="stage-list">
        {orders.length > 0 ? (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              stage={stage}
              onOpenModal={onOpenModal}
              onMoveOrder={onMoveOrder}
            />
          ))
        ) : (
          <div className="empty-stage">
            <Icon name="ticket" size={26} />
            <strong>Nada por aqui</strong>
            <span>Os pedidos aparecem automaticamente nessa etapa.</span>
          </div>
        )}
      </div>
    </article>
  )
}

function Board({ visibleOrders, onOpenModal, onMoveOrder }) {
  return (
    <section className="board" aria-label="Fluxo de pedidos">
      {stages.map((stage) => (
        <StageColumn
          key={stage.id}
          stage={stage}
          orders={visibleOrders.filter((order) => order.status === stage.id)}
          onOpenModal={onOpenModal}
          onMoveOrder={onMoveOrder}
        />
      ))}
    </section>
  )
}

function ActivityPanel({ orders, onOpenModal }) {
  const recent = orders.slice(0, 4)

  return (
    <aside className="activity-panel">
      <header>
        <strong>Atalhos da loja</strong>
        <Button variant="link" onClick={() => onOpenModal('reports')}>
          Ver tudo
        </Button>
      </header>

      <div className="activity-actions">
        <button data-testid="open-chat" type="button" onClick={() => onOpenModal('chat')}>
          <Icon name="message" size={18} />
          Chat
        </button>
        <button data-testid="open-suggestion" type="button" onClick={() => onOpenModal('suggestion')}>
          <Icon name="check" size={18} />
          Sugestao
        </button>
      </div>

      <div className="activity-list">
        {recent.map((order) => (
          <button type="button" key={order.id} onClick={() => onOpenModal('orderDetails', order)}>
            <span>#{order.id}</span>
            <strong>{order.customer}</strong>
            <small>{formatCurrency(order.total)}</small>
          </button>
        ))}
      </div>
    </aside>
  )
}

function StatusBadge({ children, tone = 'neutral' }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>
}

function CounterSection({ products, cart, onAddCart, onRemoveCart, onClearCart, onOpenModal }) {
  const activeProducts = products.filter((product) => product.active)
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0)

  return (
    <section className="module-grid module-grid--counter">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>PDV rapido</h2>
            <p>Monte o pedido pelo caixa local.</p>
          </div>
          <Button onClick={() => onOpenModal('newProduct')}>
            <Icon name="plus" size={16} />
            Produto
          </Button>
        </header>
        <div className="product-pick-list">
          {activeProducts.map((product) => (
            <button type="button" key={product.id} onClick={() => onAddCart(product)}>
              <span>
                <strong>{product.name}</strong>
                <small>{product.category} - estoque {product.stock}</small>
              </span>
              <b>{formatCurrency(product.price)}</b>
            </button>
          ))}
        </div>
      </article>

      <article className="module-card checkout-card">
        <header className="module-card__header">
          <div>
            <h2>Carrinho</h2>
            <p>{cart.length} item(ns) no atendimento.</p>
          </div>
          <Button variant="danger" onClick={onClearCart}>Limpar</Button>
        </header>
        <div className="cart-list">
          {cart.length > 0 ? (
            cart.map((item) => (
              <div className="cart-row" key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.qty} x {formatCurrency(item.price)}</small>
                </span>
                <button type="button" onClick={() => onRemoveCart(item.id)}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))
          ) : (
            <div className="empty-modal">Clique em um produto para adicionar.</div>
          )}
        </div>
        <footer className="checkout-total">
          <span>Total</span>
          <strong>{formatCurrency(cartTotal)}</strong>
          <Button variant="primary" disabled={cart.length === 0} onClick={() => onOpenModal('checkoutCounter')}>
            Finalizar venda
          </Button>
        </footer>
      </article>
    </section>
  )
}

function MenuSection({
  categories,
  products,
  selectedCategory,
  menuSearch,
  onSelectCategory,
  onMenuSearch,
  onCopyProductLink,
  onToggleCategory,
  onToggleProduct,
  onOpenModal,
}) {
  const visibleProducts = products.filter((product) => {
    const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory
    const searchMatch = product.name.toLowerCase().includes(menuSearch.toLowerCase())
    return categoryMatch && searchMatch
  })
  const activeCategory = selectedCategory === 'all' ? categories[0] : categories.find((category) => category.name === selectedCategory)
  const activeCategoryProducts = visibleProducts.filter((product) =>
    selectedCategory === 'all' ? product.category === activeCategory?.name : true,
  )
  const qualityPercent = Math.min(98, 64 + products.filter((product) => product.active).length * 6)

  return (
    <section className="menu-manager">
      <header className="menu-manager__title">
        <div>
          <h2>Gestor de cardapio</h2>
          <p>Inicio / Gestor de cardapio / Gestor / PDV</p>
        </div>
        <button className="assistant-chip" data-testid="menu-bot-training" type="button" onClick={() => onOpenModal('botTraining')}>
          <Icon name="message" size={18} />
        </button>
      </header>

      <section className="menu-quality">
        <div>
          <strong>Qualidade do Cardapio</strong>
          <span>Voce tem <b>{qualityPercent}%</b> do cardapio otimizado</span>
        </div>
        <div className="menu-quality__bar">
          <span style={{ width: `${qualityPercent}%` }} />
        </div>
      </section>

      <section className="menu-manager__toolbar">
        <label className="menu-filter">
          <Icon name="search" size={20} />
          <select value={selectedCategory} onChange={(event) => onSelectCategory(event.target.value)}>
            <option value="all">Categorias</option>
            {categories.map((category) => <option key={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="menu-manager__search">
          <input value={menuSearch} onChange={(event) => onMenuSearch(event.target.value)} placeholder="Pesquisar" />
        </label>
        <Button className="menu-action-button" data-testid="menu-new-product" onClick={() => onOpenModal('newProduct')}>Acoes</Button>
        <Button variant="primary" data-testid="menu-new-category" onClick={() => onOpenModal('newCategory')}>
          <Icon name="plus" size={18} />
          Nova categoria
        </Button>
      </section>

      <article className="menu-category-panel">
        <header className="menu-category-panel__header">
          <span className="drag-handle">::</span>
          <div>
            <h3>{activeCategory?.name ?? 'Mais Vendidas'} <span>v</span></h3>
            <small>Itens principais</small>
          </div>
          <div className="menu-category-panel__tools">
            <span>Esgotar tudo</span>
            <button
              className={`mini-toggle ${activeCategory?.active ? '' : 'is-off'}`}
              type="button"
              aria-label="Ativar categoria"
              onClick={() => activeCategory && onToggleCategory(activeCategory.id)}
            />
            <button
              className="select-action"
              type="button"
              onClick={() => activeCategory && onOpenModal('editCategory', activeCategory)}
            >
              Editar categoria
            </button>
            <button
              className="chevron-button"
              type="button"
              aria-label="Apagar categoria"
              onClick={() => activeCategory && onOpenModal('deleteCategory', activeCategory)}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </header>

        <div className="menu-product-list">
          {activeCategoryProducts.map((product) => (
            <article className="menu-product-row" data-testid={`product-${product.id}`} key={product.id}>
              <span className="drag-handle">::</span>
              <span className="product-thumb" />
              <div className="menu-product-row__name">
                <strong>{product.name}</strong>
                <small>{product.category}</small>
              </div>
              <button className="link-button" type="button" title="Copiar link do item" onClick={() => onCopyProductLink(product)}>
                <Icon name="chain" size={17} />
              </button>
              <div className="price-cell">
                <span>A partir de</span>
                <strong>{formatCurrency(product.price)}</strong>
              </div>
              <Button onClick={() => onOpenModal('editProduct', product)}><Icon name="edit" size={15} /></Button>
              <button className={`mini-toggle ${product.active ? '' : 'is-off'}`} type="button" onClick={() => onToggleProduct(product.id)} aria-label="Esgotar item" />
              <button className="select-action" type="button" onClick={() => onOpenModal('editProduct', product)}>Editar item</button>
              <Button variant="danger" onClick={() => onOpenModal('deleteProduct', product)}><Icon name="trash" size={15} /></Button>
              <button
                className="chevron-button"
                type="button"
                onClick={() => onOpenModal('orderDetails', {
                  id: `item-${product.id}` ,
                  customer: product.name,
                  phone: 'Cardapio',
                  address: product.category,
                  payment: 'Sem venda',
                  total: product.price,
                  items: [`Estoque: ${product.stock}`],
                  note: product.active ? 'Item visivel no cardapio.' : 'Item pausado no cardapio.',
                })}
              >
                <Icon name="arrow" size={15} />
              </button>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function TablesSection({ tables, onOpenModal }) {
  return (
    <section className="module-card module-card--full">
      <header className="module-card__header">
        <div>
          <h2>Salao e mesas</h2>
          <p>Abra mesa, registre consumo e feche conta sem backend.</p>
        </div>
        <Button variant="primary" data-testid="new-table" onClick={() => onOpenModal('newTable')}>
          <Icon name="plus" size={16} />
          Mesa
        </Button>
      </header>
      <div className="table-grid">
        {tables.map((table) => (
          <article className="table-card" data-testid={`table-${table.id}`} key={table.id}>
            <header>
              <strong>{table.name}</strong>
              <StatusBadge tone={table.status === 'free' ? 'success' : table.status === 'closing' ? 'warning' : 'danger'}>
                {table.status === 'free' ? 'Livre' : table.status === 'closing' ? 'Fechando' : 'Ocupada'}
              </StatusBadge>
            </header>
            <p>{table.seats} lugar(es)</p>
            <strong>{table.customer || 'Sem cliente'}</strong>
            <small>{formatCurrency(table.total)}</small>
            <footer>
              <Button onClick={() => onOpenModal('tableOrder', table)}>Pedido</Button>
              <Button onClick={() => onOpenModal('editTable', table)}><Icon name="edit" size={15} />Editar</Button>
              <Button variant="primary" onClick={() => onOpenModal('closeTable', table)}>Fechar</Button>
              <Button variant="danger" onClick={() => onOpenModal('deleteTable', table)}><Icon name="trash" size={15} /></Button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}

function DeliverySection({ orders, couriers, onToggleCourier, onOpenModal }) {
  const deliveryOrders = orders.filter((order) => order.channel === 'delivery' && order.status !== 'completed')

  return (
    <section className="module-grid module-grid--delivery">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Fila de entregas</h2>
            <p>Atribua entregador e acompanhe status.</p>
          </div>
          <Button data-testid="delivery-map" onClick={() => onOpenModal('deliveryMap')}>Mapa</Button>
        </header>
        <div className="data-list">
          {deliveryOrders.map((order) => (
            <article className="data-row" key={order.id}>
              <span>
                <strong>#{order.id} - {order.customer}</strong>
                <small>{order.address} - {formatCurrency(order.total)}</small>
              </span>
              <StatusBadge tone={order.courier ? 'success' : 'warning'}>{order.courier || 'Sem entregador'}</StatusBadge>
              <Button variant="primary" onClick={() => onOpenModal('assignDelivery', order)}>Atribuir</Button>
              <Button onClick={() => onOpenModal('orderDetails', order)}>Detalhes</Button>
            </article>
          ))}
        </div>
      </article>

      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Entregadores</h2>
            <p>Equipe disponivel no turno.</p>
          </div>
          <Button data-testid="new-courier" onClick={() => onOpenModal('newCourier')}><Icon name="plus" size={16} />Novo</Button>
        </header>
        <div className="data-list">
          {couriers.map((courier) => (
            <article className="data-row" key={courier.id}>
              <span>
                <strong>{courier.name}</strong>
                <small>{courier.vehicle || 'Moto'} - {courier.phone || 'Sem telefone'} - {courier.deliveries} entrega(s) hoje</small>
              </span>
              <StatusBadge tone={courier.active ? 'success' : 'muted'}>{courier.active ? 'Disponivel' : 'Off'}</StatusBadge>
              <Button onClick={() => onOpenModal('editCourier', courier)}>Editar</Button>
              <Button variant={courier.active ? 'danger' : 'primary'} onClick={() => onToggleCourier(courier.id)}>
                {courier.active ? 'Pausar' : 'Ativar'}
              </Button>
              <Button variant="danger" onClick={() => onOpenModal('deleteCourier', courier)}>Apagar</Button>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function ReportsSection({ orders, products, tables, onOpenModal }) {
  const completed = orders.filter((order) => order.status === 'completed')
  const revenue = orders.reduce((sum, order) => sum + order.total, 0)

  return (
    <section className="module-grid module-grid--reports">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Relatorios</h2>
            <p>Leitura local dos dados simulados.</p>
          </div>
          <Button data-testid="export-reports" variant="primary" onClick={() => onOpenModal('exportReports')}>Exportar</Button>
        </header>
        <div className="report-grid">
          <div><span>Faturamento</span><strong>{formatCurrency(revenue)}</strong></div>
          <div><span>Concluidos</span><strong>{completed.length}</strong></div>
          <div><span>Produtos</span><strong>{products.length}</strong></div>
          <div><span>Mesas ativas</span><strong>{tables.filter((table) => table.status !== 'free').length}</strong></div>
        </div>
      </article>
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Historico recente</h2>
            <p>Pedidos criados ou finalizados nesta sessao.</p>
          </div>
        </header>
        <div className="data-list">
          {orders.map((order) => (
            <article className="data-row" key={order.id}>
              <span>
                <strong>#{order.id} - {order.customer}</strong>
                <small>{order.status} - {order.payment}</small>
              </span>
              <b>{formatCurrency(order.total)}</b>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function ServiceSection({ channels, recoveries, onToggleChannel, onToggleRobot, onToggleRecovery, onOpenModal }) {
  return (
    <section className="module-grid module-grid--service">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Robo e canais</h2>
            <p>Atendimento automatizado por canal, com fila local.</p>
          </div>
          <Button data-testid="bot-training" variant="primary" onClick={() => onOpenModal('botTraining')}>Treinar robo</Button>
        </header>
        <div className="data-list">
          {channels.map((channel) => (
            <article className="data-row" key={channel.id}>
              <span>
                <strong>{channel.name}</strong>
                <small>{channel.queue} conversa(s) na fila</small>
              </span>
              <StatusBadge tone={channel.active ? 'success' : 'muted'}>{channel.active ? 'Ativo' : 'Off'}</StatusBadge>
              <Button onClick={() => onToggleRobot(channel.id)}>{channel.robot ? 'Robo on' : 'Robo off'}</Button>
              <Button variant={channel.active ? 'danger' : 'primary'} onClick={() => onToggleChannel(channel.id)}>
                {channel.active ? 'Desligar' : 'Ligar'}
              </Button>
            </article>
          ))}
        </div>
      </article>

      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Recuperador</h2>
            <p>Campanhas automaticas para clientes parados.</p>
          </div>
          <Button data-testid="new-recovery" onClick={() => onOpenModal('newRecovery')}>Nova regra</Button>
        </header>
        <div className="data-list">
          {recoveries.map((recovery) => (
            <article className="data-row" key={recovery.id}>
              <span>
                <strong>{recovery.name}</strong>
                <small>{recovery.sent} mensagem(ns) via {recovery.channel} - atraso {recovery.delay || 15} min</small>
              </span>
              <StatusBadge tone={recovery.active ? 'success' : 'muted'}>{recovery.active ? 'Ativa' : 'Pausada'}</StatusBadge>
              <Button onClick={() => onOpenModal('editRecovery', recovery)}>Editar</Button>
              <Button variant={recovery.active ? 'danger' : 'primary'} onClick={() => onToggleRecovery(recovery.id)}>
                {recovery.active ? 'Pausar' : 'Ativar'}
              </Button>
              <Button variant="danger" onClick={() => onOpenModal('deleteRecovery', recovery)}>Apagar</Button>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function KdsSection({ orders, onMoveOrder, onOpenModal }) {
  const kitchenOrders = orders.filter((order) => ['analysis', 'production', 'ready'].includes(order.status))

  return (
    <section className="module-card module-card--full">
      <header className="module-card__header">
        <div>
          <h2>Display de cozinha</h2>
          <p>Fila KDS para producao, montagem e saida.</p>
        </div>
        <Button data-testid="kds-settings" onClick={() => onOpenModal('kdsSettings')}>Configurar telas</Button>
      </header>
      <div className="kds-grid">
        {kitchenOrders.map((order) => (
          <article className={`kds-ticket kds-ticket--${order.status}`} key={order.id}>
            <header>
              <strong>#{order.id}</strong>
              <StatusBadge tone={order.status === 'ready' ? 'success' : order.status === 'production' ? 'warning' : 'danger'}>{order.status}</StatusBadge>
            </header>
            <h3>{order.customer}</h3>
            <p>{order.items.join(', ')}</p>
            <footer>
              <Button onClick={() => onOpenModal('orderDetails', order)}>Detalhes</Button>
              {order.status !== 'ready' ? (
                <Button variant="primary" onClick={() => onMoveOrder(order.id, order.status === 'analysis' ? 'production' : 'ready')}>Avancar</Button>
              ) : (
                <Button variant="primary" onClick={() => onOpenModal('finishOrder', order)}>Finalizar</Button>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}

function MarketingSection({ coupons, qrCodes, onToggleCoupon, onOpenModal }) {
  return (
    <section className="module-grid module-grid--marketing">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Cupons e cashback</h2>
            <p>Promocoes para cardapio digital e atendimento.</p>
          </div>
          <Button variant="primary" data-testid="new-coupon" onClick={() => onOpenModal('newCoupon')}>
            <Icon name="plus" size={16} />Cupom
          </Button>
        </header>
        <div className="data-list">
          {coupons.map((coupon) => (
            <article className="data-row" data-testid={`coupon-${coupon.id}`} key={coupon.id}>
              <span>
                <strong>{coupon.code}</strong>
                <small>{coupon.type} de {coupon.value}% - {coupon.uses} uso(s)</small>
              </span>
              <StatusBadge tone={coupon.active ? 'success' : 'muted'}>{coupon.active ? 'Ativo' : 'Pausado'}</StatusBadge>
              <Button onClick={() => onOpenModal('editCoupon', coupon)}>Editar</Button>
              <Button onClick={() => onToggleCoupon(coupon.id)}>{coupon.active ? 'Pausar' : 'Ativar'}</Button>
              <Button variant="danger" onClick={() => onOpenModal('deleteCoupon', coupon)}>Apagar</Button>
            </article>
          ))}
        </div>
      </article>
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>QR Code de mesa</h2>
            <p>Links para autoatendimento no salao.</p>
          </div>
          <Button data-testid="new-qr" onClick={() => onOpenModal('newQr')}>Gerar QR</Button>
        </header>
        <div className="data-list">
          {qrCodes.map((qr) => (
            <article className="data-row" key={qr.id}>
              <span>
                <strong>{qr.table}</strong>
                <small>/cardapio/{qr.url} - {qr.scans} leitura(s)</small>
              </span>
              <Button onClick={() => onOpenModal('printQr', qr)}>Imprimir</Button>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function InventorySection({ inventory, onOpenModal, onStockAdjust }) {
  return (
    <section className="module-card module-card--full">
      <header className="module-card__header">
        <div>
          <h2>Controle de estoque</h2>
          <p>Itens, minimo, custo e entrada/baixa manual.</p>
        </div>
        <Button variant="primary" data-testid="new-stock" onClick={() => onOpenModal('newStock')}>
          <Icon name="plus" size={16} />Insumo
        </Button>
      </header>
      <div className="data-list">
        {inventory.map((stock) => (
          <article className="data-row" data-testid={`stock-${stock.id}`} key={stock.id}>
            <span>
              <strong>{stock.item}</strong>
              <small>{stock.quantity} {stock.unit} - minimo {stock.min} - custo {formatCurrency(stock.cost)}</small>
            </span>
            <StatusBadge tone={stock.quantity <= stock.min ? 'danger' : 'success'}>{stock.quantity <= stock.min ? 'Baixo' : 'Ok'}</StatusBadge>
            <Button onClick={() => onOpenModal('editStock', stock)}>Editar</Button>
            <Button onClick={() => onStockAdjust(stock.id, 1)}>Entrada</Button>
            <Button variant="danger" onClick={() => onStockAdjust(stock.id, -1)}>Baixa</Button>
            <Button variant="danger" onClick={() => onOpenModal('deleteStock', stock)}>Apagar</Button>
          </article>
        ))}
      </div>
    </section>
  )
}

function FinanceSection({ finance, onOpenModal, onPayFinance }) {
  const income = finance.filter((item) => item.type === 'Entrada').reduce((sum, item) => sum + item.amount, 0)
  const outcome = finance.filter((item) => item.type === 'Saida').reduce((sum, item) => sum + item.amount, 0)

  return (
    <section className="module-grid module-grid--finance">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Financeiro</h2>
            <p>Entradas, saidas e pendencias da operacao.</p>
          </div>
          <Button variant="primary" data-testid="new-finance" onClick={() => onOpenModal('newFinance')}>Lancamento</Button>
        </header>
        <div className="report-grid">
          <div><span>Entradas</span><strong>{formatCurrency(income)}</strong></div>
          <div><span>Saidas</span><strong>{formatCurrency(outcome)}</strong></div>
          <div><span>Saldo</span><strong>{formatCurrency(income - outcome)}</strong></div>
          <div><span>Pendentes</span><strong>{finance.filter((item) => item.status !== 'Pago').length}</strong></div>
        </div>
      </article>
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Lancamentos</h2>
            <p>Baixe ou acompanhe contas.</p>
          </div>
        </header>
        <div className="data-list">
          {finance.map((item) => (
            <article className="data-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.type} - {formatCurrency(item.amount)}</small>
              </span>
              <StatusBadge tone={item.status === 'Pago' ? 'success' : 'warning'}>{item.status}</StatusBadge>
              <Button onClick={() => onOpenModal('editFinance', item)}>Editar</Button>
              {item.status !== 'Pago' ? <Button variant="primary" onClick={() => onPayFinance(item.id)}>Dar baixa</Button> : null}
              <Button variant="danger" onClick={() => onOpenModal('deleteFinance', item)}>Apagar</Button>
            </article>
          ))}
        </div>
      </article>
    </section>
  )
}

function FiscalSection({ invoices, onOpenModal, onUpdateInvoice }) {
  return (
    <section className="module-card module-card--full">
      <header className="module-card__header">
        <div>
          <h2>Fiscal e NFC-e</h2>
          <p>Emissao, reimpressao e cancelamento simulados.</p>
        </div>
        <Button variant="primary" onClick={() => onOpenModal('issueInvoice')}>Emitir NFC-e</Button>
      </header>
      <div className="data-list">
        {invoices.map((invoice) => (
          <article className="data-row" key={invoice.id}>
            <span>
              <strong>NFC-e {invoice.orderId}</strong>
              <small>{invoice.customer} - {formatCurrency(invoice.amount)}</small>
            </span>
            <StatusBadge tone={invoice.status === 'Autorizada' ? 'success' : invoice.status === 'Cancelada' ? 'danger' : 'warning'}>{invoice.status}</StatusBadge>
            <Button onClick={() => onOpenModal('invoiceView', invoice)}>Ver</Button>
            <Button variant="primary" onClick={() => onUpdateInvoice(invoice.id, 'Autorizada')}>Autorizar</Button>
            <Button variant="danger" onClick={() => onUpdateInvoice(invoice.id, 'Cancelada')}>Cancelar</Button>
          </article>
        ))}
      </div>
    </section>
  )
}

function IntegrationsSection({ integrations, onToggleIntegration, onOpenModal }) {
  return (
    <section className="module-card module-card--full">
      <header className="module-card__header">
        <div>
          <h2>Integracoes</h2>
          <p>Marketplaces, anuncios, pagamento online e canais externos.</p>
        </div>
          <Button data-testid="integration-help" onClick={() => onOpenModal('integrationHelp')}>Ajuda</Button>
      </header>
      <div className="data-list">
        {integrations.map((integration) => (
          <article className="data-row" key={integration.id}>
            <span>
              <strong>{integration.name}</strong>
              <small>{integration.status}</small>
            </span>
            <StatusBadge tone={integration.active ? 'success' : 'muted'}>{integration.active ? 'Conectado' : 'Off'}</StatusBadge>
            <Button variant={integration.active ? 'danger' : 'primary'} onClick={() => onToggleIntegration(integration.id)}>
              {integration.active ? 'Desconectar' : 'Conectar'}
            </Button>
          </article>
        ))}
      </div>
    </section>
  )
}

function App() {
  const initialDataRef = useRef(null)

  if (!initialDataRef.current) {
    initialDataRef.current = loadPersistedAppData()
  }

  const initialData = initialDataRef.current
  const importInputRef = useRef(null)

  const [orders, setOrders] = useState(initialData.orders)
  const [activeNav, setActiveNav] = useState(initialData.activeNav)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [navQuery, setNavQuery] = useState('')
  const [cashOpen, setCashOpen] = useState(initialData.cashOpen)
  const [noticeVisible, setNoticeVisible] = useState(initialData.noticeVisible)
  const [modal, setModal] = useState(null)
  const [newOrder, setNewOrder] = useState(blankOrder)
  const [blockedOrders, setBlockedOrders] = useState(initialData.blockedOrders)
  const [toast, setToast] = useState('Pronto para operar')
  const [settings, setSettings] = useState(initialData.settings)
  const [chatMessages, setChatMessages] = useState(initialData.chatMessages)
  const [chatDraft, setChatDraft] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [suggestions, setSuggestions] = useState(initialData.suggestions)
  const [categories, setCategories] = useState(initialData.categories)
  const [products, setProducts] = useState(initialData.products)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [menuSearch, setMenuSearch] = useState('')
  const [counterCart, setCounterCart] = useState([])
  const [orderCart, setOrderCart] = useState([])
  const [selectedCartItemId, setSelectedCartItemId] = useState(null)
  const [posCategory, setPosCategory] = useState('all')
  const [posSearch, setPosSearch] = useState('')
  const [tables, setTables] = useState(initialData.tables)
  const [couriers, setCouriers] = useState(initialData.couriers)
  const [productForm, setProductForm] = useState(blankProduct)
  const [categoryForm, setCategoryForm] = useState(blankCategory)
  const [tableForm, setTableForm] = useState(blankTable)
  const [orderForm, setOrderForm] = useState(blankOrder)
  const [courierForm, setCourierForm] = useState(blankCourier)
  const [recoveryForm, setRecoveryForm] = useState(blankRecovery)
  const [channels, setChannels] = useState(initialData.channels)
  const [coupons, setCoupons] = useState(initialData.coupons)
  const [recoveries, setRecoveries] = useState(initialData.recoveries)
  const [inventory, setInventory] = useState(initialData.inventory)
  const [finance, setFinance] = useState(initialData.finance)
  const [invoices, setInvoices] = useState(initialData.invoices)
  const [integrations, setIntegrations] = useState(initialData.integrations)
  const [qrCodes, setQrCodes] = useState(initialData.qrCodes)
  const [couponForm, setCouponForm] = useState(blankCoupon)
  const [stockForm, setStockForm] = useState(blankStock)
  const [financeForm, setFinanceForm] = useState(blankFinance)
  const [storeProfile, setStoreProfile] = useState(initialData.storeProfile)
  const [storeForm, setStoreForm] = useState(initialData.storeProfile)
  const [printerConfig, setPrinterConfig] = useState(initialData.printerConfig)
  const [printerForm, setPrinterForm] = useState({
    deviceName: initialData.printerConfig.deviceName,
    copies: String(initialData.printerConfig.copies),
    paper: initialData.printerConfig.paper,
    connected: initialData.printerConfig.connected ? 'yes' : 'no',
  })
  const [security, setSecurity] = useState(initialData.security)
  const [passwordForm, setPasswordForm] = useState(blankPassword)
  const [botConfig, setBotConfig] = useState(initialData.botConfig)
  const [botForm, setBotForm] = useState(initialData.botConfig)
  const [faqForm, setFaqForm] = useState({ question: '', answer: '' })
  const [kdsConfig, setKdsConfig] = useState(initialData.kdsConfig)
  const [kdsForm, setKdsForm] = useState({
    soundAlert: initialData.kdsConfig.soundAlert ? 'yes' : 'no',
    autoBump: initialData.kdsConfig.autoBump ? 'yes' : 'no',
    bumpMinutes: String(initialData.kdsConfig.bumpMinutes),
    showCustomer: initialData.kdsConfig.showCustomer ? 'yes' : 'no',
    highlightRush: initialData.kdsConfig.highlightRush ? 'yes' : 'no',
  })
  const [qrForm, setQrForm] = useState({ table: '', url: '' })
  const [orderDrafts, setOrderDrafts] = useState(initialData.orderDrafts)
  const [eventLog, setEventLog] = useState(initialData.eventLog)
  const [dataImportError, setDataImportError] = useState('')
  const activeTitle = navItems.find((item) => item.id === activeNav)?.label ?? 'Pedidos'
  const lowStockCount = inventory.filter((item) => item.quantity <= item.min).length
  const notificationCount = Math.min(9, blockedOrders.length + lowStockCount + (noticeVisible ? 1 : 0))

  const persistedSnapshot = useMemo(() => ({
    orders,
    activeNav,
    cashOpen,
    noticeVisible,
    blockedOrders,
    settings,
    chatMessages,
    categories,
    products,
    tables,
    couriers,
    channels,
    recoveries,
    coupons,
    inventory,
    finance,
    invoices,
    integrations,
    qrCodes,
    storeProfile,
    printerConfig,
    security,
    botConfig,
    kdsConfig,
    orderDrafts,
    suggestions,
    eventLog,
  }), [
    orders,
    activeNav,
    cashOpen,
    noticeVisible,
    blockedOrders,
    settings,
    chatMessages,
    categories,
    products,
    tables,
    couriers,
    channels,
    recoveries,
    coupons,
    inventory,
    finance,
    invoices,
    integrations,
    qrCodes,
    storeProfile,
    printerConfig,
    security,
    botConfig,
    kdsConfig,
    orderDrafts,
    suggestions,
    eventLog,
  ])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedSnapshot))
  }, [persistedSnapshot])

  const visibleOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return orders
      .filter((order) => order.status !== 'completed')
      .filter((order) => filter === 'all' || order.channel === filter)
      .filter((order) => {
        if (!normalizedSearch) {
          return true
        }

        return [order.id, order.customer, order.phone, order.payment, order.address]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      })
  }, [orders, filter, search])

  function handleShortcut(shortcut) {
    if (shortcut.id === 'home') {
      setActiveNav('orders')
      notify('Atalho abriu a fila de pedidos.')
      return
    }

    if (shortcut.id === 'whatsapp') {
      setActiveNav('service')
      setModal({ type: 'chat', payload: { channel: 'WhatsApp' } })
      return
    }

    if (shortcut.id === 'boost') {
      setActiveNav('marketing')
      openModal('newCoupon')
      return
    }

    setModal({ type: 'helpCenter', payload: shortcut })
  }

  function openModal(type, payload = null) {
    if (type === 'shortcut' && payload) {
      handleShortcut(payload)
      return
    }

    if (type === 'editOrder' && payload) {
      setOrderForm(orderToForm(payload))
    }

    if (type === 'editProduct' && payload) {
      setProductForm(productToForm(payload))
    }

    if (type === 'newProduct') {
      setProductForm(blankProduct)
    }

    if (type === 'newOrder') {
      setNewOrder(blankOrder)
      setOrderCart([])
      setSelectedCartItemId(null)
      setPosCategory('all')
      setPosSearch('')
    }

    if (type === 'editCategory' && payload) {
      setCategoryForm(categoryToForm(payload))
    }

    if (type === 'newCategory') {
      setCategoryForm(blankCategory)
    }

    if (type === 'editTable' && payload) {
      setTableForm({
        name: payload.name,
        seats: String(payload.seats),
        customer: payload.customer,
      })
    }

    if (type === 'newTable') {
      setTableForm(blankTable)
    }

    if (type === 'newCoupon') {
      setCouponForm(blankCoupon)
    }

    if (type === 'editCoupon' && payload) {
      setCouponForm({
        code: payload.code,
        type: payload.type,
        value: String(payload.value),
      })
    }

    if (type === 'newStock') {
      setStockForm(blankStock)
    }

    if (type === 'editStock' && payload) {
      setStockForm({
        item: payload.item,
        unit: payload.unit,
        quantity: String(payload.quantity),
        min: String(payload.min),
        cost: String(payload.cost).replace('.', ','),
      })
    }

    if (type === 'newFinance') {
      setFinanceForm(blankFinance)
    }

    if (type === 'editFinance' && payload) {
      setFinanceForm({
        title: payload.title,
        type: payload.type,
        amount: String(payload.amount).replace('.', ','),
        status: payload.status,
      })
    }

    if (type === 'newCourier') {
      setCourierForm(blankCourier)
    }

    if (type === 'editCourier' && payload) {
      setCourierForm(courierToForm(payload))
    }

    if (type === 'newRecovery') {
      setRecoveryForm(blankRecovery)
    }

    if (type === 'editRecovery' && payload) {
      setRecoveryForm(recoveryToForm(payload))
    }

    if (type === 'store' || type === 'register') {
      setStoreForm(storeProfile)
      setDataImportError('')
    }

    if (type === 'password') {
      setPasswordForm({
        ...blankPassword,
        twoFactor: security.twoFactor ? 'yes' : 'no',
        sessionMinutes: String(security.sessionMinutes),
        lockOnIdle: security.lockOnIdle ? 'yes' : 'no',
      })
    }

    if (type === 'printer') {
      setPrinterForm({
        deviceName: printerConfig.deviceName,
        copies: String(printerConfig.copies),
        paper: printerConfig.paper,
        connected: printerConfig.connected ? 'yes' : 'no',
      })
    }

    if (type === 'botTraining') {
      setBotForm({
        ...botConfig,
        faq: botConfig.faq.map((item) => ({ ...item })),
      })
      setFaqForm({ question: '', answer: '' })
    }

    if (type === 'kdsSettings') {
      setKdsForm({
        soundAlert: kdsConfig.soundAlert ? 'yes' : 'no',
        autoBump: kdsConfig.autoBump ? 'yes' : 'no',
        bumpMinutes: String(kdsConfig.bumpMinutes),
        showCustomer: kdsConfig.showCustomer ? 'yes' : 'no',
        highlightRush: kdsConfig.highlightRush ? 'yes' : 'no',
      })
    }

    if (type === 'newQr') {
      setQrForm({
        table: `Mesa ${qrCodes.length + 1}`,
        url: `mesa-${qrCodes.length + 1}`,
      })
    }

    if (type === 'reports') {
      setDataImportError('')
    }

    setModal({ type, payload })
  }

  function closeModal() {
    setModal(null)
  }

  function notify(message, tone = 'neutral') {
    setToast(message)
    setEventLog((current) => [
      { id: `evt-${Date.now()}-${current.length}`, message, time: nowDateTime(), tone },
      ...current,
    ].slice(0, 60))
  }

  function applySnapshot(snapshot) {
    const defaults = createDefaultAppData()
    const merged = {
      ...defaults,
      ...snapshot,
      orders: Array.isArray(snapshot.orders) ? snapshot.orders : defaults.orders,
      blockedOrders: Array.isArray(snapshot.blockedOrders) ? snapshot.blockedOrders : defaults.blockedOrders,
      settings: { ...defaults.settings, ...(snapshot.settings ?? {}) },
      chatMessages: Array.isArray(snapshot.chatMessages) ? snapshot.chatMessages : defaults.chatMessages,
      categories: Array.isArray(snapshot.categories) ? snapshot.categories : defaults.categories,
      products: Array.isArray(snapshot.products) ? snapshot.products : defaults.products,
      tables: Array.isArray(snapshot.tables) ? snapshot.tables : defaults.tables,
      couriers: Array.isArray(snapshot.couriers) ? snapshot.couriers : defaults.couriers,
      channels: Array.isArray(snapshot.channels) ? snapshot.channels : defaults.channels,
      recoveries: Array.isArray(snapshot.recoveries) ? snapshot.recoveries : defaults.recoveries,
      coupons: Array.isArray(snapshot.coupons) ? snapshot.coupons : defaults.coupons,
      inventory: Array.isArray(snapshot.inventory) ? snapshot.inventory : defaults.inventory,
      finance: Array.isArray(snapshot.finance) ? snapshot.finance : defaults.finance,
      invoices: Array.isArray(snapshot.invoices) ? snapshot.invoices : defaults.invoices,
      integrations: Array.isArray(snapshot.integrations) ? snapshot.integrations : defaults.integrations,
      qrCodes: Array.isArray(snapshot.qrCodes) ? snapshot.qrCodes : defaults.qrCodes,
      storeProfile: { ...defaults.storeProfile, ...(snapshot.storeProfile ?? {}) },
      printerConfig: {
        ...defaults.printerConfig,
        ...(snapshot.printerConfig ?? {}),
        queue: Array.isArray(snapshot.printerConfig?.queue) ? snapshot.printerConfig.queue : defaults.printerConfig.queue,
      },
      security: { ...defaults.security, ...(snapshot.security ?? {}) },
      botConfig: {
        ...defaults.botConfig,
        ...(snapshot.botConfig ?? {}),
        faq: Array.isArray(snapshot.botConfig?.faq) ? snapshot.botConfig.faq : defaults.botConfig.faq,
      },
      kdsConfig: { ...defaults.kdsConfig, ...(snapshot.kdsConfig ?? {}) },
      orderDrafts: Array.isArray(snapshot.orderDrafts) ? snapshot.orderDrafts : defaults.orderDrafts,
      suggestions: Array.isArray(snapshot.suggestions) ? snapshot.suggestions : defaults.suggestions,
      eventLog: Array.isArray(snapshot.eventLog) ? snapshot.eventLog : defaults.eventLog,
    }

    setOrders(merged.orders)
    setActiveNav(merged.activeNav)
    setCashOpen(Boolean(merged.cashOpen))
    setNoticeVisible(Boolean(merged.noticeVisible))
    setBlockedOrders(merged.blockedOrders)
    setSettings(merged.settings)
    setChatMessages(merged.chatMessages)
    setCategories(merged.categories)
    setProducts(merged.products)
    setTables(merged.tables)
    setCouriers(merged.couriers)
    setChannels(merged.channels)
    setRecoveries(merged.recoveries)
    setCoupons(merged.coupons)
    setInventory(merged.inventory)
    setFinance(merged.finance)
    setInvoices(merged.invoices)
    setIntegrations(merged.integrations)
    setQrCodes(merged.qrCodes)
    setStoreProfile(merged.storeProfile)
    setStoreForm(merged.storeProfile)
    setPrinterConfig(merged.printerConfig)
    setPrinterForm({
      deviceName: merged.printerConfig.deviceName,
      copies: String(merged.printerConfig.copies),
      paper: merged.printerConfig.paper,
      connected: merged.printerConfig.connected ? 'yes' : 'no',
    })
    setSecurity(merged.security)
    setBotConfig(merged.botConfig)
    setBotForm(merged.botConfig)
    setKdsConfig(merged.kdsConfig)
    setKdsForm({
      soundAlert: merged.kdsConfig.soundAlert ? 'yes' : 'no',
      autoBump: merged.kdsConfig.autoBump ? 'yes' : 'no',
      bumpMinutes: String(merged.kdsConfig.bumpMinutes),
      showCustomer: merged.kdsConfig.showCustomer ? 'yes' : 'no',
      highlightRush: merged.kdsConfig.highlightRush ? 'yes' : 'no',
    })
    setOrderDrafts(merged.orderDrafts)
    setSuggestions(merged.suggestions)
    setEventLog(merged.eventLog)
    setCounterCart([])
    setOrderCart([])
    setSelectedCartItemId(null)
    setNewOrder(blankOrder)
    setModal(null)
    setDataImportError('')
    setToast('Backup carregado localmente.')
  }

  function exportAppBackup() {
    downloadTextFile(
      `meucardapio-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(persistedSnapshot, null, 2),
    )
    notify('Backup JSON exportado.')
  }

  function exportOrdersCsvFile() {
    downloadTextFile(
      `pedidos-${new Date().toISOString().slice(0, 10)}.csv`,
      ordersToCsv(orders),
      'text/csv;charset=utf-8',
    )
    notify('CSV de pedidos exportado.')
  }

  function openImportPicker() {
    setDataImportError('')
    importInputRef.current?.click()
  }

  async function handleImportData(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const content = await file.text()
      const parsed = JSON.parse(content)
      applySnapshot(parsed)
      notify('Backup importado com sucesso.')
    } catch {
      setDataImportError('Nao foi possivel importar este arquivo.')
    } finally {
      event.target.value = ''
    }
  }

  function resetFrontData() {
    applySnapshot(createDefaultAppData())
    notify('Base local redefinida para o estado inicial.')
  }

  function enqueuePrintJob(label, type = 'Pedido') {
    setPrinterConfig((current) => ({
      ...current,
      queue: [
        { id: `job-${Date.now()}`, label, type, status: current.connected ? 'Pronto' : 'Pendente' },
        ...current.queue,
      ].slice(0, 20),
    }))
  }

  function saveStoreProfile(event) {
    event.preventDefault()
    setStoreProfile(storeForm)
    closeModal()
    notify('Dados da loja atualizados.')
  }

  function savePasswordSettings(event) {
    event.preventDefault()

    if (!passwordForm.next || passwordForm.next.length < 6 || passwordForm.next !== passwordForm.confirm) {
      notify('Revise a senha e confirme os campos.', 'danger')
      return
    }

    setSecurity((current) => ({
      ...current,
      twoFactor: passwordForm.twoFactor === 'yes',
      sessionMinutes: Number(passwordForm.sessionMinutes) || current.sessionMinutes,
      lockOnIdle: passwordForm.lockOnIdle === 'yes',
      lastChange: nowDateTime(),
    }))
    closeModal()
    notify('Configuracoes de seguranca atualizadas.')
  }

  function savePrinterSettings(event) {
    event.preventDefault()
    setPrinterConfig((current) => ({
      ...current,
      deviceName: printerForm.deviceName || current.deviceName,
      copies: Number(printerForm.copies) || 1,
      paper: printerForm.paper,
      connected: printerForm.connected === 'yes',
    }))
    closeModal()
    notify('Impressora configurada localmente.')
  }

  function runPrinterTest() {
    enqueuePrintJob(`Teste ${nowTime()}`, 'Teste')
    notify('Teste de impressao enviado para a fila.')
  }

  function clearPrintQueue() {
    setPrinterConfig((current) => ({ ...current, queue: [] }))
    notify('Fila de impressao limpa.')
  }

  function reopenOrderEditor() {
    setModal({ type: 'newOrder' })
  }

  async function copyProductLink(product) {
    const storeSlug = storeProfile.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const productSlug = product.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
    const link = `${baseUrl}/cardapio/${storeSlug}/${productSlug}`

    try {
      const copied = await copyText(link)
      notify(copied ? 'Link do item copiado.' : `Link pronto: ${link}`)
    } catch {
      notify(`Link pronto: ${link}`, 'warning')
    }
  }

  function completePrintJob(jobId) {
    setPrinterConfig((current) => ({
      ...current,
      queue: current.queue.filter((job) => job.id !== jobId),
    }))
    notify('Item removido da fila de impressao.')
  }

  function saveBotTraining(event) {
    event.preventDefault()
    setBotConfig(botForm)
    closeModal()
    notify('Treinamento do robo atualizado.')
  }

  function addBotFaq() {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      return
    }

    setBotForm((current) => ({
      ...current,
      faq: [
        ...current.faq,
        { id: `faq-${Date.now()}`, question: faqForm.question.trim(), answer: faqForm.answer.trim() },
      ],
    }))
    setFaqForm({ question: '', answer: '' })
  }

  function removeBotFaq(faqId) {
    setBotForm((current) => ({
      ...current,
      faq: current.faq.filter((item) => item.id !== faqId),
    }))
  }

  function saveKdsSettings(event) {
    event.preventDefault()
    setKdsConfig({
      soundAlert: kdsForm.soundAlert === 'yes',
      autoBump: kdsForm.autoBump === 'yes',
      bumpMinutes: Number(kdsForm.bumpMinutes) || 8,
      showCustomer: kdsForm.showCustomer === 'yes',
      highlightRush: kdsForm.highlightRush === 'yes',
    })
    closeModal()
    notify('Configuracoes do KDS atualizadas.')
  }

  function saveOrderDraft() {
    if (!settings.saveDrafts) {
      notify('Salvamento de rascunho esta desligado nos ajustes.', 'warning')
      return
    }

    if (orderCart.length === 0 && !newOrder.customer.trim()) {
      notify('Adicione itens ou cliente antes de salvar rascunho.', 'warning')
      return
    }

    setOrderDrafts((current) => [
      {
        id: `draft-${Date.now()}`,
        label: newOrder.customer || `Rascunho ${current.length + 1}`,
        createdAt: nowDateTime(),
        data: {
          newOrder: cloneData(newOrder),
          orderCart: cloneData(orderCart),
          posCategory,
        },
      },
      ...current,
    ].slice(0, 12))
    notify('Rascunho salvo localmente.')
  }

  function loadOrderDraft(draftId) {
    const draft = orderDrafts.find((item) => item.id === draftId)

    if (!draft) {
      return
    }

    setNewOrder(cloneData(draft.data.newOrder))
    setOrderCart(cloneData(draft.data.orderCart))
    setPosCategory(draft.data.posCategory || 'all')
    setPosSearch('')
    setSelectedCartItemId(null)
    reopenOrderEditor()
    notify(`Rascunho "${draft.label}" carregado.`)
  }

  function deleteOrderDraft(draftId) {
    setOrderDrafts((current) => current.filter((item) => item.id !== draftId))
    notify('Rascunho removido.')
  }

  function moveOrder(orderId, nextStatus) {
    let updatedOrder = null

    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) {
          return order
        }

        updatedOrder = { ...order, status: nextStatus }
        return updatedOrder
      }),
    )

    if (updatedOrder && nextStatus === 'ready' && settings.autoPrint) {
      enqueuePrintJob(`Pedido #${orderId} pronto`, 'Expedicao')
    }

    notify(
      nextStatus === 'ready' && settings.sendReadyMessage
        ? `Pedido #${orderId} pronto para saida e mensagem liberada.`
        : `Pedido #${orderId} atualizado.`,
    )
  }

  function registerOrderFinanceEntry(order, titlePrefix = 'Pedido') {
    setFinance((current) => [
      {
        id: `fin-${Date.now()}-${order.id}`,
        title: `${titlePrefix} #${order.id}`,
        type: 'Entrada',
        amount: order.total,
        status: order.payment === 'Mesa' ? 'Pendente' : 'Pago',
      },
      ...current,
    ])
  }

  function createOrder(event) {
    event.preventDefault()

    const cartTotal = orderCart.reduce((sum, item) => sum + item.price * item.qty, 0)
    const total = cartTotal || Number(String(newOrder.total).replace(',', '.')) || 0
    const nextId = String(Math.max(...orders.map((order) => Number(order.id)), 8300) + 1)
    const createdOrder = {
      id: nextId,
      customer: newOrder.customer || 'Cliente balcao',
      phone: newOrder.phone || '(47) 9 0000-0000',
      channel: newOrder.channel,
      status: settings.autoAccept ? 'production' : 'analysis',
      total,
      payment: newOrder.payment,
      time: nowTime(),
      address: newOrder.channel === 'delivery' ? 'Endereco informado no pedido' : 'Retirada no balcao',
      note: newOrder.note || 'Pedido criado pelo painel.',
      items: orderCart.length
        ? orderCart.map((item) => `${item.qty}x ${item.name}`)
        : newOrder.items
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    }

    setOrders((current) => [createdOrder, ...current])
    registerOrderFinanceEntry(createdOrder)
    if (settings.autoPrint) {
      enqueuePrintJob(`Pedido #${nextId}`, 'Pedido')
    }
    setNewOrder(blankOrder)
    setOrderCart([])
    setSelectedCartItemId(null)
    closeModal()
    notify(`Pedido #${nextId} criado no front.`)
  }

  function updateOrder(event, orderId) {
    event.preventDefault()

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              customer: orderForm.customer || 'Cliente balcao',
              phone: orderForm.phone || '(47) 9 0000-0000',
              channel: orderForm.channel,
              total: Number(String(orderForm.total).replace(',', '.')) || 0,
              payment: orderForm.payment,
              address: orderForm.channel === 'delivery' ? order.address || 'Endereco informado no pedido' : 'Retirada no balcao',
              note: orderForm.note || 'Pedido editado pelo painel.',
              items: orderForm.items
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            }
          : order,
      ),
    )
    closeModal()
    notify(`Pedido #${orderId} editado.`)
  }

  function deleteOrder(orderId) {
    setOrders((current) => current.filter((order) => order.id !== orderId))
    closeModal()
    notify(`Pedido #${orderId} apagado.`)
  }

  function finishOrder(orderId) {
    moveOrder(orderId, 'completed')
    closeModal()
  }

  function finishReadyOrders() {
    const readyCount = orders.filter((order) => order.status === 'ready').length
    setOrders((current) =>
      current.map((order) => (order.status === 'ready' ? { ...order, status: 'completed' } : order)),
    )
    closeModal()
    notify(`${readyCount} pedido(s) finalizado(s).`)
  }

  function restoreBlockedOrder(id) {
    const blocked = blockedOrders.find((order) => order.id === id)

    if (!blocked) {
      return
    }

    setBlockedOrders((current) => current.filter((order) => order.id !== id))
    setOrders((current) => [
      {
        id: blocked.id,
        customer: blocked.customer,
        phone: '(47) 9 1111-2222',
        channel: 'pickup',
        status: 'analysis',
        total: 28.5,
        payment: 'Pix',
        time: '18:30',
        address: 'Retirada no balcao',
        note: blocked.reason,
        items: ['Pedido recuperado'],
      },
      ...current,
    ])
    notify(`Pedido #${id} recuperado.`)
  }

  function addCart(product) {
    setCounterCart((current) => {
      const existing = current.find((item) => item.id === product.id)

      if (existing) {
        return current.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      }

      return [...current, { ...product, qty: 1 }]
    })
  }

  function removeCart(productId) {
    setCounterCart((current) => current.filter((item) => item.id !== productId))
  }

  function clearCart() {
    setCounterCart([])
    notify('Carrinho limpo.')
  }

  function addOrderCart(product) {
    setOrderCart((current) => {
      const existing = current.find((item) => item.id === product.id)

      if (existing) {
        return current.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      }

      return [...current, { ...product, qty: 1 }]
    })
  }

  function removeOrderCart(productId) {
    if (selectedCartItemId === productId) {
      setSelectedCartItemId(null)
    }

    setOrderCart((current) => current.filter((item) => item.id !== productId))
  }

  function changeOrderCartQuantity(productId, nextQty) {
    if (nextQty <= 0) {
      removeOrderCart(productId)
      return
    }

    setOrderCart((current) =>
      current.map((item) => (item.id === productId ? { ...item, qty: nextQty } : item)),
    )
    notify('Quantidade do item atualizada.')
  }

  function checkoutCounter() {
    const total = counterCart.reduce((sum, item) => sum + item.price * item.qty, 0)
    const nextId = String(Math.max(...orders.map((order) => Number(order.id)), 8300) + 1)
    const createdOrder = {
      id: nextId,
      customer: 'Cliente PDV',
      phone: '(47) 9 0000-0000',
      channel: 'pickup',
      status: 'production',
      total,
      payment: 'Cartao',
      time: nowTime(),
      address: 'Retirada no balcao',
      note: 'Venda criada no PDV.',
      items: counterCart.map((item) => `${item.qty}x ${item.name}`),
    }

    setOrders((current) => [createdOrder, ...current])
    registerOrderFinanceEntry(createdOrder, 'Venda PDV')
    if (settings.autoPrint) {
      enqueuePrintJob(`Venda PDV #${nextId}`, 'PDV')
    }
    setCounterCart([])
    closeModal()
    setActiveNav('orders')
    notify(`Venda PDV virou pedido #${nextId}.`)
  }

  function saveProduct(event, productId = null) {
    event.preventDefault()

    const normalizedProduct = {
      name: productForm.name || 'Produto sem nome',
      category: productForm.category || categories[0]?.name || 'Geral',
      price: Number(String(productForm.price).replace(',', '.')) || 0,
      stock: Number(productForm.stock) || 0,
      active: productForm.active,
    }

    if (productId) {
      setProducts((current) =>
        current.map((product) =>
          product.id === productId ? { ...product, ...normalizedProduct } : product,
        ),
      )
      notify('Produto editado.')
    } else {
      setProducts((current) => [
        { id: `prod-${Date.now()}`, ...normalizedProduct },
        ...current,
      ])
      notify('Produto criado.')
    }

    closeModal()
  }

  function deleteProduct(productId) {
    setProducts((current) => current.filter((product) => product.id !== productId))
    closeModal()
    notify('Produto apagado.')
  }

  function toggleProduct(productId) {
    let toggledProduct = null

    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        toggledProduct = { ...product, active: !product.active }
        return toggledProduct
      }),
    )

    if (toggledProduct) {
      notify(`${toggledProduct.name} ${toggledProduct.active ? 'ativado' : 'pausado'}.`)
    }
  }

  function saveCategory(event, categoryId = null) {
    event.preventDefault()

    const name = categoryForm.name.trim()

    if (!name) {
      return
    }

    if (categoryId) {
      const currentCategory = categories.find((category) => category.id === categoryId)

      setCategories((current) =>
        current.map((category) =>
          category.id === categoryId ? { ...category, name, active: categoryForm.active } : category,
        ),
      )

      if (currentCategory && currentCategory.name !== name) {
        setProducts((current) =>
          current.map((product) =>
            product.category === currentCategory.name ? { ...product, category: name } : product,
          ),
        )
      }

      notify('Categoria atualizada.')
    } else {
      setCategories((current) => [
        { id: `cat-${Date.now()}`, name, active: categoryForm.active },
        ...current,
      ])
      notify('Categoria criada.')
    }

    closeModal()
  }

  function toggleCategory(categoryId) {
    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId ? { ...category, active: !category.active } : category,
      ),
    )
    notify('Status da categoria atualizado.')
  }

  function deleteCategory(categoryId) {
    const currentCategory = categories.find((category) => category.id === categoryId)
    const fallbackCategory = categories.find((category) => category.id !== categoryId)?.name || 'Geral'

    setCategories((current) => current.filter((category) => category.id !== categoryId))
    setProducts((current) =>
      current.map((product) =>
        product.category === currentCategory?.name ? { ...product, category: fallbackCategory } : product,
      ),
    )

    if (selectedCategory === currentCategory?.name) {
      setSelectedCategory('all')
    }

    closeModal()
    notify('Categoria apagada.')
  }

  function saveTable(event, tableId = null) {
    event.preventDefault()

    const tableData = {
      name: tableForm.name || 'Nova mesa',
      seats: Number(tableForm.seats) || 1,
      customer: tableForm.customer,
      status: tableForm.customer ? 'occupied' : 'free',
      total: tableForm.customer ? 0 : 0,
    }

    if (tableId) {
      setTables((current) =>
        current.map((table) => (table.id === tableId ? { ...table, ...tableData } : table)),
      )
      notify('Mesa editada.')
    } else {
      setTables((current) => [{ id: `mesa-${Date.now()}`, ...tableData }, ...current])
      notify('Mesa criada.')
    }

    closeModal()
  }

  function deleteTable(tableId) {
    setTables((current) => current.filter((table) => table.id !== tableId))
    closeModal()
    notify('Mesa apagada.')
  }

  function closeTable(tableId) {
    setTables((current) =>
      current.map((table) =>
        table.id === tableId ? { ...table, status: 'free', customer: '', total: 0 } : table,
      ),
    )
    closeModal()
    notify('Mesa fechada.')
  }

  function addTableOrder(table) {
    const nextId = String(Math.max(...orders.map((order) => Number(order.id)), 8300) + 1)
    const createdOrder = {
      id: nextId,
      customer: table.customer || table.name,
      phone: '(47) 9 2222-3333',
      channel: 'pickup',
      status: 'production',
      total: table.total || 49.9,
      payment: 'Mesa',
      time: nowTime(),
      address: table.name,
      note: 'Pedido vindo do salao.',
      items: ['Consumo da mesa'],
    }

    setOrders((current) => [createdOrder, ...current])
    setTables((current) =>
      current.map((item) =>
        item.id === table.id ? { ...item, status: 'occupied', total: (item.total || 0) + 49.9 } : item,
      ),
    )
    registerOrderFinanceEntry(createdOrder, 'Mesa')
    closeModal()
    notify(`Pedido #${nextId} criado para ${table.name}.`)
  }

  function assignDelivery(orderId, courierName) {
    setOrders((current) =>
      current.map((order) => (order.id === orderId ? { ...order, courier: courierName } : order)),
    )
    setCouriers((current) =>
      current.map((courier) =>
        courier.name === courierName ? { ...courier, deliveries: courier.deliveries + 1 } : courier,
      ),
    )
    if (settings.autoPrint) {
      enqueuePrintJob(`Entrega #${orderId} - ${courierName}`, 'Entrega')
    }
    closeModal()
    notify(`Entrega #${orderId} atribuida para ${courierName}.`)
  }

  function toggleChannel(channelId) {
    let updatedChannel = null

    setChannels((current) =>
      current.map((channel) => {
        if (channel.id !== channelId) {
          return channel
        }

        updatedChannel = { ...channel, active: !channel.active }
        return updatedChannel
      }),
    )

    if (updatedChannel) {
      notify(`${updatedChannel.name} ${updatedChannel.active ? 'ligado' : 'desligado'}.`)
    }
  }

  function toggleRobot(channelId) {
    let updatedChannel = null

    setChannels((current) =>
      current.map((channel) => {
        if (channel.id !== channelId) {
          return channel
        }

        updatedChannel = { ...channel, robot: !channel.robot }
        return updatedChannel
      }),
    )

    if (updatedChannel) {
      notify(`Robo de ${updatedChannel.name} ${updatedChannel.robot ? 'ativado' : 'pausado'}.`)
    }
  }

  function createRecoveryRule(recoveryId = null) {
    const normalizedRecovery = {
      name: recoveryForm.name || `Regra automatica ${recoveries.length + 1}`,
      channel: recoveryForm.channel,
      active: recoveryForm.active,
      sent: recoveryId ? recoveries.find((item) => item.id === recoveryId)?.sent || 0 : 0,
      delay: Number(recoveryForm.delay) || 15,
      message: recoveryForm.message || 'Mensagem automatica de recuperacao.',
    }

    if (recoveryId) {
      setRecoveries((current) =>
        current.map((recovery) =>
          recovery.id === recoveryId ? { ...recovery, ...normalizedRecovery } : recovery,
        ),
      )
      closeModal()
      notify('Regra de recuperacao atualizada.')
      return
    }

    setRecoveries((current) => [
      { id: `rec-${Date.now()}`, ...normalizedRecovery },
      ...current,
    ])
    closeModal()
    notify('Regra de recuperacao criada.')
    return
  }

  function toggleRecovery(recoveryId) {
    setRecoveries((current) =>
      current.map((recovery) =>
        recovery.id === recoveryId ? { ...recovery, active: !recovery.active } : recovery,
      ),
    )
    notify('Status da regra atualizado.')
  }

  function deleteRecovery(recoveryId) {
    setRecoveries((current) => current.filter((recovery) => recovery.id !== recoveryId))
    closeModal()
    notify('Regra de recuperacao apagada.')
  }

  function saveCourier(event, courierId = null) {
    event.preventDefault()

    const normalizedCourier = {
      name: courierForm.name || `Entregador ${couriers.length + 1}`,
      phone: courierForm.phone || '(47) 9 9999-9999',
      vehicle: courierForm.vehicle,
      active: courierForm.active,
      deliveries: courierId ? couriers.find((item) => item.id === courierId)?.deliveries || 0 : 0,
    }

    if (courierId) {
      setCouriers((current) =>
        current.map((courier) =>
          courier.id === courierId ? { ...courier, ...normalizedCourier } : courier,
        ),
      )
      notify('Entregador atualizado.')
    } else {
      setCouriers((current) => [{ id: `mot-${Date.now()}`, ...normalizedCourier }, ...current])
      notify('Entregador criado.')
    }

    closeModal()
  }

  function toggleCourier(courierId) {
    setCouriers((current) =>
      current.map((courier) =>
        courier.id === courierId ? { ...courier, active: !courier.active } : courier,
      ),
    )
    notify('Status do entregador atualizado.')
  }

  function deleteCourier(courierId) {
    setCouriers((current) => current.filter((courier) => courier.id !== courierId))
    closeModal()
    notify('Entregador apagado.')
  }

  function saveCoupon(event, couponId = null) {
    event.preventDefault()

    const code = couponForm.code.trim().toUpperCase()

    if (!code) {
      return
    }

    if (couponId) {
      setCoupons((current) =>
        current.map((coupon) =>
          coupon.id === couponId
            ? { ...coupon, code, type: couponForm.type, value: Number(couponForm.value) || 0 }
            : coupon,
        ),
      )
      notify('Cupom atualizado.')
    } else {
      setCoupons((current) => [
        { id: `cup-${Date.now()}`, code, type: couponForm.type, value: Number(couponForm.value) || 0, active: true, uses: 0 },
        ...current,
      ])
      notify('Cupom criado.')
    }

    closeModal()
  }

  function toggleCoupon(couponId) {
    setCoupons((current) =>
      current.map((coupon) =>
        coupon.id === couponId ? { ...coupon, active: !coupon.active } : coupon,
      ),
    )
    notify('Status da campanha atualizado.')
  }

  function deleteCoupon(couponId) {
    setCoupons((current) => current.filter((coupon) => coupon.id !== couponId))
    closeModal()
    notify('Cupom apagado.')
  }

  function saveStock(event, stockId = null) {
    event.preventDefault()

    if (!stockForm.item.trim()) {
      return
    }

    const normalizedStock = {
      item: stockForm.item,
      unit: stockForm.unit,
      quantity: Number(stockForm.quantity) || 0,
      min: Number(stockForm.min) || 0,
      cost: Number(String(stockForm.cost).replace(',', '.')) || 0,
    }

    if (stockId) {
      setInventory((current) =>
        current.map((stock) => (stock.id === stockId ? { ...stock, ...normalizedStock } : stock)),
      )
      notify('Insumo atualizado.')
    } else {
      setInventory((current) => [
        { id: `stk-${Date.now()}`, ...normalizedStock },
        ...current,
      ])
      notify('Insumo criado.')
    }

    closeModal()
  }

  function stockAdjust(stockId, delta) {
    let nextStock = null

    setInventory((current) =>
      current.map((stock) => {
        if (stock.id !== stockId) {
          return stock
        }

        nextStock = { ...stock, quantity: Math.max(0, stock.quantity + delta) }
        return nextStock
      }),
    )

    if (nextStock && settings.lowStockAlert && nextStock.quantity <= nextStock.min) {
      notify(`Alerta: ${nextStock.item} ficou abaixo do minimo.`, 'warning')
    }
  }

  function deleteStock(stockId) {
    setInventory((current) => current.filter((stock) => stock.id !== stockId))
    closeModal()
    notify('Insumo apagado.')
  }

  function saveFinance(event, financeId = null) {
    event.preventDefault()

    if (!financeForm.title.trim()) {
      return
    }

    const normalizedFinance = {
      title: financeForm.title,
      type: financeForm.type,
      amount: Number(String(financeForm.amount).replace(',', '.')) || 0,
      status: financeForm.status,
    }

    if (financeId) {
      setFinance((current) =>
        current.map((item) => (item.id === financeId ? { ...item, ...normalizedFinance } : item)),
      )
      closeModal()
      notify('Lancamento atualizado.')
      return
    }

    setFinance((current) => [
      { id: `fin-${Date.now()}`, ...normalizedFinance },
      ...current,
    ])
    closeModal()
    notify('Lancamento criado.')
    return

  }

  function payFinance(financeId) {
    setFinance((current) =>
      current.map((item) => (item.id === financeId ? { ...item, status: 'Pago' } : item)),
    )
    notify('Lancamento baixado.')
  }

  function deleteFinance(financeId) {
    setFinance((current) => current.filter((item) => item.id !== financeId))
    closeModal()
    notify('Lancamento apagado.')
  }

  function updateInvoice(invoiceId, status) {
    setInvoices((current) =>
      current.map((invoice) => (invoice.id === invoiceId ? { ...invoice, status } : invoice)),
    )
    notify(`Nota ${status.toLowerCase()}.`)
  }

  function issueInvoiceFromFirstOrder() {
    const sourceOrder = orders.find((order) => !invoices.some((invoice) => invoice.orderId === order.id))

    if (!sourceOrder) {
      notify('Nenhum pedido novo para emitir NFC-e.')
      closeModal()
      return
    }

    setInvoices((current) => [
      {
        id: `nfc-${Date.now()}`,
        orderId: sourceOrder.id,
        customer: sourceOrder.customer,
        amount: sourceOrder.total,
        status: 'Autorizada',
      },
      ...current,
    ])
    if (settings.autoPrint) {
      enqueuePrintJob(`NFC-e #${sourceOrder.id}`, 'Fiscal')
    }
    closeModal()
    notify(`NFC-e do pedido #${sourceOrder.id} emitida.`)
  }

  function toggleIntegration(integrationId) {
    let updatedIntegration = null

    setIntegrations((current) =>
      current.map((integration) => {
        if (integration.id !== integrationId) {
          return integration
        }

        updatedIntegration = {
          ...integration,
          active: !integration.active,
          status: integration.active ? 'Desconectado' : 'Sincronizado',
        }

        return updatedIntegration
      }),
    )

    if (updatedIntegration) {
      notify(`${updatedIntegration.name} ${updatedIntegration.active ? 'conectado' : 'desconectado'}.`)
    }
  }

  function createQrCode() {
    if (!qrForm.table.trim() || !qrForm.url.trim()) {
      return
    }

    setQrCodes((current) => [
      { id: `qr-${Date.now()}`, table: qrForm.table.trim(), url: qrForm.url.trim(), scans: 0 },
      ...current,
    ])
    closeModal()
    notify('QR Code gerado.')
  }


  function sendChatMessage(event) {
    event.preventDefault()

    if (!chatDraft.trim()) {
      return
    }

    setChatMessages((current) => [
      ...current,
      { id: current.length + 1, author: 'Atendente', text: chatDraft.trim() },
    ])
    setChatDraft('')
    notify('Mensagem enviada no chat.')
  }

  function saveSuggestion(event) {
    event.preventDefault()

    if (!suggestion.trim()) {
      return
    }

    setSuggestions((current) => [
      { id: `sug-${Date.now()}`, text: suggestion.trim(), createdAt: nowDateTime() },
      ...current,
    ])
    setSuggestion('')
    closeModal()
    notify('Sugestao registrada localmente.')
  }

  function saveSettings(event) {
    event.preventDefault()
    closeModal()
    notify('Ajustes salvos localmente.')
  }

  function renderWorkArea() {
    if (activeNav === 'service') {
      return (
        <ServiceSection
          channels={channels}
          recoveries={recoveries}
          onToggleChannel={toggleChannel}
          onToggleRobot={toggleRobot}
          onToggleRecovery={toggleRecovery}
          onOpenModal={openModal}
        />
      )
    }

    if (activeNav === 'counter') {
      return (
        <CounterSection
          products={products}
          cart={counterCart}
          onAddCart={addCart}
          onRemoveCart={removeCart}
          onClearCart={clearCart}
          onOpenModal={openModal}
        />
      )
    }

    if (activeNav === 'menu') {
      return (
        <MenuSection
          categories={categories}
          products={products}
          selectedCategory={selectedCategory}
          menuSearch={menuSearch}
          onSelectCategory={setSelectedCategory}
          onMenuSearch={setMenuSearch}
          onCopyProductLink={copyProductLink}
          onToggleCategory={toggleCategory}
          onToggleProduct={toggleProduct}
          onOpenModal={openModal}
        />
      )
    }

    if (activeNav === 'tables') {
      return <TablesSection tables={tables} onOpenModal={openModal} />
    }

    if (activeNav === 'kds') {
      return <KdsSection orders={orders} onMoveOrder={moveOrder} onOpenModal={openModal} />
    }

    if (activeNav === 'delivery') {
      return <DeliverySection orders={orders} couriers={couriers} onToggleCourier={toggleCourier} onOpenModal={openModal} />
    }

    if (activeNav === 'marketing') {
      return (
        <MarketingSection
          coupons={coupons}
          qrCodes={qrCodes}
          onToggleCoupon={toggleCoupon}
          onOpenModal={openModal}
        />
      )
    }

    if (activeNav === 'inventory') {
      return <InventorySection inventory={inventory} onOpenModal={openModal} onStockAdjust={stockAdjust} />
    }

    if (activeNav === 'finance') {
      return <FinanceSection finance={finance} onOpenModal={openModal} onPayFinance={payFinance} />
    }

    if (activeNav === 'fiscal') {
      return <FiscalSection invoices={invoices} onOpenModal={openModal} onUpdateInvoice={updateInvoice} />
    }

    if (activeNav === 'integrations') {
      return (
        <IntegrationsSection
          integrations={integrations}
          onToggleIntegration={toggleIntegration}
          onOpenModal={openModal}
        />
      )
    }

    if (activeNav === 'reports') {
      return <ReportsSection orders={orders} products={products} tables={tables} onOpenModal={openModal} />
    }

    return (
      <>
        <Toolbar
          filter={filter}
          search={search}
          onFilter={setFilter}
          onSearch={setSearch}
          onOpenModal={openModal}
          blockedCount={blockedOrders.length}
        />

        <div className="operations-grid">
          <Board visibleOrders={visibleOrders} onOpenModal={openModal} onMoveOrder={moveOrder} />
          <ActivityPanel orders={orders} onOpenModal={openModal} />
        </div>
      </>
    )
  }

  function renderModal() {
    if (!modal) {
      return null
    }

    const payload = modal.payload

    if (modal.type === 'newOrder') {
      const activeProducts = products
        .filter((product) => product.active)
        .filter((product) => posCategory === 'all' || product.category === posCategory)
        .filter((product) => product.name.toLowerCase().includes(posSearch.toLowerCase()))
      const orderSubtotal = orderCart.reduce((sum, item) => sum + item.price * item.qty, 0)
      const selectedCartItem = orderCart.find((item) => item.id === selectedCartItemId) || null

      return (
        <div className="pos-backdrop" role="presentation">
          <section className="pos-shell" role="dialog" aria-modal="true" aria-label="Criar pedido no PDV">
            <form id="new-order-form" onSubmit={createOrder} className="pos-shell__form">
              <main className="pos-catalog">
                <header className="pos-tabs">
                  <button className={newOrder.channel === 'pickup' ? 'is-active' : ''} type="button" onClick={() => setNewOrder({ ...newOrder, channel: 'pickup' })}>Pedidos balcao (PDV)</button>
                  <button className={newOrder.channel === 'delivery' ? 'is-active' : ''} type="button" onClick={() => setNewOrder({ ...newOrder, channel: 'delivery' })}>[ D ] Delivery e Balao</button>
                  <button type="button" onClick={() => setActiveNav('tables')}>[ M ] Mesas e Comandas</button>
                </header>

                <section className="pos-catalog__toolbar">
                  <button type="button" className="pos-filter" onClick={() => setPosCategory('all')}>{posCategory === 'all' ? '[F] Filtros' : posCategory}</button>
                  <label>
                    <input value={posSearch} onChange={(event) => setPosSearch(event.target.value)} placeholder="[ P ] Pesquisar" />
                    <Icon name="search" size={22} />
                  </label>
                </section>

                <div className="pos-hints">
                  <span>Navegacao rapida</span>
                  <span>ENTER seleciona item</span>
                </div>

                <section className="pos-product-grid">
                  {categories.slice(0, 8).map((category) => (
                    <button className="pos-product-tile" type="button" key={category.id} onClick={() => setPosCategory(category.name)}>
                      <span className="tile-pattern" />
                      <strong>{category.name}</strong>
                    </button>
                  ))}
                  {activeProducts.slice(0, 8).map((product) => (
                    <button className="pos-product-tile" data-testid={`pos-product-${product.id}`} type="button" key={product.id} onClick={() => addOrderCart(product)}>
                      <span className="tile-pattern tile-pattern--food" />
                      <strong>{product.name}</strong>
                      <small>{formatCurrency(product.price)}</small>
                    </button>
                  ))}
                </section>

                <footer className="pos-next-row">
                  <button type="button" onClick={closeModal}>Cancelar</button>
                  <button type="button" onClick={() => setPosCategory('all')}>[ A ] Proximo</button>
                </footer>
              </main>

              <aside className="pos-summary">
                <header className="pos-summary__header">
                  <button type="button" onClick={() => openModal('orderDrafts')}>[CTRL+X] Rascunhos <b>{orderDrafts.length}</b></button>
                  <button type="button" disabled={!selectedCartItem} onClick={() => selectedCartItem && openModal('editCartItem', selectedCartItem)}>Editar</button>
                  <button type="button" disabled={!selectedCartItem} onClick={() => selectedCartItem && removeOrderCart(selectedCartItem.id)}>Excluir</button>
                  <button type="button" className="summary-settings" onClick={() => openModal('automations')}><Icon name="settings" size={22} /></button>
                </header>

                <div className="pos-summary__items">
                  <div className="pos-summary__title">
                    <strong>Itens do pedido</strong>
                    <span>Subtotal</span>
                  </div>
                  {orderCart.length > 0 ? (
                    orderCart.map((item) => (
                      <article className={`summary-item ${selectedCartItemId === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => setSelectedCartItemId(item.id)}>
                        <span>
                          <strong>{item.qty}x {item.name}</strong>
                          <small>{formatCurrency(item.price)}</small>
                        </span>
                        <button type="button" onClick={() => removeOrderCart(item.id)}>
                          <Icon name="trash" size={16} />
                        </button>
                      </article>
                    ))
                  ) : (
                    <p>Finalize o item ao lado, ele vai aparecer aqui</p>
                  )}
                </div>

                <label className="order-note">
                  <span>[O] Observacao do pedido</span>
                  <textarea value={newOrder.note} onChange={(event) => setNewOrder({ ...newOrder, note: event.target.value })} />
                </label>

                <div className="pos-total">
                  <span>Subtotal <b>{formatCurrency(orderSubtotal)}</b></span>
                  <span>Entrega <b>Gratis</b></span>
                  <strong>Total <b>{formatCurrency(orderSubtotal || Number(String(newOrder.total).replace(',', '.')) || 0)}</b></strong>
                </div>

                <div className="customer-grid">
                  <input data-testid="new-total" inputMode="decimal" value={newOrder.total} onChange={(event) => setNewOrder({ ...newOrder, total: event.target.value })} placeholder="Valor manual" />
                  <input value={newOrder.phone} onChange={(event) => setNewOrder({ ...newOrder, phone: event.target.value })} placeholder="(XX) X XXXX-XXXX" />
                  <input data-testid="new-customer" value={newOrder.customer} onChange={(event) => setNewOrder({ ...newOrder, customer: event.target.value })} placeholder="Nome do cliente" />
                  <select data-testid="new-channel" value={newOrder.channel} onChange={(event) => setNewOrder({ ...newOrder, channel: event.target.value })}>
                    <option value="pickup">Balcao</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>

                <div className="payment-grid">
                  <button type="button" className={newOrder.payment === 'Pix' ? 'is-active' : ''} onClick={() => setNewOrder({ ...newOrder, payment: 'Pix' })}>[ X ] Pix</button>
                  <button type="button" className={newOrder.payment === 'Cartao' ? 'is-active' : ''} onClick={() => setNewOrder({ ...newOrder, payment: 'Cartao' })}>[ R ] Cartao</button>
                  <button type="button" className={newOrder.payment === 'Entrega' ? 'is-active' : ''} onClick={() => setNewOrder({ ...newOrder, payment: 'Entrega' })}>[ E ] Entrega</button>
                  <button type="button" className={newOrder.payment === 'CPF/CNPJ' ? 'is-active' : ''} onClick={() => setNewOrder({ ...newOrder, payment: 'CPF/CNPJ' })}>[ T ] CPF/CNPJ</button>
                </div>

                <footer className="pos-submit-row">
                  <Button variant="primary" form="new-order-form" type="submit">[ ENTER ] Gerar pedido</Button>
                  <button type="button" className="save-draft" onClick={saveOrderDraft}><Icon name="printer" size={22} /></button>
                </footer>
              </aside>
            </form>
          </section>
        </div>
      )
    }

    if (modal.type === 'editOrder') {
      return (
        <Modal
          title={`Editar pedido #${payload.id}`}
          subtitle="Ajuste os dados do pedido no estado local."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" form="edit-order-form" type="submit">Salvar pedido</Button>
            </>
          }
        >
          <form className="form-grid" id="edit-order-form" onSubmit={(event) => updateOrder(event, payload.id)}>
            <Field label="Cliente">
              <input data-testid="edit-customer" value={orderForm.customer} onChange={(event) => setOrderForm({ ...orderForm, customer: event.target.value })} />
            </Field>
            <Field label="Telefone">
              <input value={orderForm.phone} onChange={(event) => setOrderForm({ ...orderForm, phone: event.target.value })} />
            </Field>
            <Field label="Canal">
              <select value={orderForm.channel} onChange={(event) => setOrderForm({ ...orderForm, channel: event.target.value })}>
                <option value="pickup">Balcao</option>
                <option value="delivery">Delivery</option>
              </select>
            </Field>
            <Field label="Pagamento">
              <select value={orderForm.payment} onChange={(event) => setOrderForm({ ...orderForm, payment: event.target.value })}>
                <option>Pix</option>
                <option>Cartao</option>
                <option>Dinheiro</option>
                <option>Mesa</option>
              </select>
            </Field>
            <Field label="Total">
              <input value={orderForm.total} onChange={(event) => setOrderForm({ ...orderForm, total: event.target.value })} />
            </Field>
            <Field label="Itens">
              <input value={orderForm.items} onChange={(event) => setOrderForm({ ...orderForm, items: event.target.value })} />
            </Field>
            <Field label="Observacao">
              <textarea value={orderForm.note} onChange={(event) => setOrderForm({ ...orderForm, note: event.target.value })} />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteOrder') {
      return (
        <Modal
          title={`Apagar pedido #${payload.id}`}
          subtitle="Essa remocao vale apenas nesta sessao."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="danger" onClick={() => deleteOrder(payload.id)}>Apagar pedido</Button>
            </>
          }
        >
          <div className="modal-summary">
            <span>Cliente</span>
            <strong>{payload.customer}</strong>
            <p>{payload.items.join(', ')}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'checkoutCounter') {
      const total = counterCart.reduce((sum, item) => sum + item.price * item.qty, 0)

      return (
        <Modal
          title="Finalizar venda PDV"
          subtitle="Converte o carrinho em um pedido de balcao."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Voltar</Button>
              <Button variant="primary" onClick={checkoutCounter}>Confirmar venda</Button>
            </>
          }
        >
          <div className="stack-list">
            {counterCart.map((item) => (
              <article className="list-row" key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.qty} x {formatCurrency(item.price)}</small>
                </span>
                <b>{formatCurrency(item.price * item.qty)}</b>
              </article>
            ))}
            <div className="modal-summary">
              <span>Total do PDV</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newProduct' || modal.type === 'editProduct') {
      const isEdit = modal.type === 'editProduct'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.name}` : 'Novo produto'}
          subtitle="Produto salvo no cardapio local."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" form="product-form" type="submit">{isEdit ? 'Salvar' : 'Criar'}</Button>
            </>
          }
        >
          <form className="form-grid" id="product-form" onSubmit={(event) => saveProduct(event, isEdit ? payload.id : null)}>
            <Field label="Nome">
              <input data-testid="product-name" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="Nome do produto" />
            </Field>
            <Field label="Categoria">
              <select value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>
                {categories.map((category) => <option key={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Preco">
              <input data-testid="product-price" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} placeholder="49,90" />
            </Field>
            <Field label="Estoque">
              <input type="number" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} />
            </Field>
            <Field label="Visibilidade">
              <select value={productForm.active ? 'yes' : 'no'} onChange={(event) => setProductForm({ ...productForm, active: event.target.value === 'yes' })}>
                <option value="yes">Visivel</option>
                <option value="no">Pausado</option>
              </select>
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteProduct') {
      return (
        <Modal
          title={`Apagar ${payload.name}`}
          subtitle="Remove o produto do cardapio local."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteProduct(payload.id)}>Apagar</Button></>}
        >
          <div className="modal-summary">
            <span>Produto</span>
            <strong>{payload.name}</strong>
            <p>{payload.category} - {formatCurrency(payload.price)}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newCategory' || modal.type === 'editCategory') {
      const isEdit = modal.type === 'editCategory'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.name}` : 'Nova categoria'}
          subtitle="Crie ou ajuste uma secao para o cardapio."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="category-form" type="submit">{isEdit ? 'Salvar categoria' : 'Criar categoria'}</Button></>}
        >
          <form className="form-grid" id="category-form" onSubmit={(event) => saveCategory(event, isEdit ? payload.id : null)}>
            <Field label="Nome">
              <input data-testid="category-name" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Ex: Promocoes" />
            </Field>
            <Field label="Status">
              <select value={categoryForm.active ? 'yes' : 'no'} onChange={(event) => setCategoryForm({ ...categoryForm, active: event.target.value === 'yes' })}>
                <option value="yes">Ativa</option>
                <option value="no">Pausada</option>
              </select>
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteCategory') {
      return (
        <Modal
          title={`Apagar ${payload.name}`}
          subtitle="Os produtos dessa categoria serao realocados para outra secao."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteCategory(payload.id)}>Apagar categoria</Button></>}
        >
          <div className="modal-summary">
            <span>Categoria</span>
            <strong>{payload.name}</strong>
            <p>Essa acao reorganiza apenas os dados locais.</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newCoupon' || modal.type === 'editCoupon') {
      const isEdit = modal.type === 'editCoupon'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.code}` : 'Novo cupom ou cashback'}
          subtitle="Campanha local para cardapio e atendimento."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="coupon-form" type="submit">{isEdit ? 'Salvar campanha' : 'Criar campanha'}</Button></>}
        >
          <form className="form-grid" id="coupon-form" onSubmit={(event) => saveCoupon(event, isEdit ? payload.id : null)}>
            <Field label="Codigo">
              <input data-testid="coupon-code" value={couponForm.code} onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value })} placeholder="PIZZA10" />
            </Field>
            <Field label="Tipo">
              <select value={couponForm.type} onChange={(event) => setCouponForm({ ...couponForm, type: event.target.value })}>
                <option>Cupom</option>
                <option>Cashback</option>
              </select>
            </Field>
            <Field label="Valor %">
              <input value={couponForm.value} onChange={(event) => setCouponForm({ ...couponForm, value: event.target.value })} />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteCoupon') {
      return (
        <Modal
          title={`Apagar ${payload.code}`}
          subtitle="Remove a campanha local."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteCoupon(payload.id)}>Apagar</Button></>}
        >
          <div className="modal-summary">
            <span>Campanha</span>
            <strong>{payload.code}</strong>
            <p>{payload.type} de {payload.value}%.</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newStock' || modal.type === 'editStock') {
      const isEdit = modal.type === 'editStock'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.item}` : 'Novo insumo'}
          subtitle="Entrada inicial para controle de estoque."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="stock-form" type="submit">{isEdit ? 'Salvar insumo' : 'Criar insumo'}</Button></>}
        >
          <form className="form-grid" id="stock-form" onSubmit={(event) => saveStock(event, isEdit ? payload.id : null)}>
            <Field label="Item">
              <input data-testid="stock-item" value={stockForm.item} onChange={(event) => setStockForm({ ...stockForm, item: event.target.value })} placeholder="Farinha" />
            </Field>
            <Field label="Unidade">
              <select value={stockForm.unit} onChange={(event) => setStockForm({ ...stockForm, unit: event.target.value })}>
                <option>un</option>
                <option>kg</option>
                <option>lt</option>
              </select>
            </Field>
            <Field label="Quantidade">
              <input value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: event.target.value })} />
            </Field>
            <Field label="Minimo">
              <input value={stockForm.min} onChange={(event) => setStockForm({ ...stockForm, min: event.target.value })} />
            </Field>
            <Field label="Custo">
              <input value={stockForm.cost} onChange={(event) => setStockForm({ ...stockForm, cost: event.target.value })} />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'newFinance' || modal.type === 'editFinance') {
      const isEdit = modal.type === 'editFinance'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.title}` : 'Novo lancamento financeiro'}
          subtitle="Entrada, saida ou compra manual."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="finance-form" type="submit">{isEdit ? 'Salvar lancamento' : 'Salvar lancamento'}</Button></>}
        >
          <form className="form-grid" id="finance-form" onSubmit={(event) => saveFinance(event, isEdit ? payload.id : null)}>
            <Field label="Descricao">
              <input data-testid="finance-title" value={financeForm.title} onChange={(event) => setFinanceForm({ ...financeForm, title: event.target.value })} placeholder="Compra de insumos" />
            </Field>
            <Field label="Tipo">
              <select value={financeForm.type} onChange={(event) => setFinanceForm({ ...financeForm, type: event.target.value })}>
                <option>Entrada</option>
                <option>Saida</option>
              </select>
            </Field>
            <Field label="Valor">
              <input value={financeForm.amount} onChange={(event) => setFinanceForm({ ...financeForm, amount: event.target.value })} placeholder="120,00" />
            </Field>
            <Field label="Status">
              <select value={financeForm.status} onChange={(event) => setFinanceForm({ ...financeForm, status: event.target.value })}>
                <option>Pendente</option>
                <option>Pago</option>
              </select>
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteStock') {
      return (
        <Modal
          title={`Apagar ${payload.item}`}
          subtitle="Remove o insumo do controle local."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteStock(payload.id)}>Apagar insumo</Button></>}
        >
          <div className="modal-summary">
            <span>Insumo</span>
            <strong>{payload.item}</strong>
            <p>{payload.quantity} {payload.unit} disponivel(is).</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'deleteFinance') {
      return (
        <Modal
          title={`Apagar ${payload.title}`}
          subtitle="Remove o lancamento financeiro local."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteFinance(payload.id)}>Apagar lancamento</Button></>}
        >
          <div className="modal-summary">
            <span>Lancamento</span>
            <strong>{payload.title}</strong>
            <p>{payload.type} - {formatCurrency(payload.amount)}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'issueInvoice') {
      return (
        <Modal
          title="Emitir NFC-e"
          subtitle="Emite a proxima nota de pedido sem nota."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" onClick={issueInvoiceFromFirstOrder}>Emitir</Button></>}
        >
          <div className="modal-summary">
            <span>Fila fiscal</span>
            <strong>{orders.length} pedido(s)</strong>
            <p>A emissao e simulada e fica apenas no front.</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'invoiceView') {
      return (
        <Modal title={`NFC-e ${payload.orderId}`} subtitle={payload.status} onClose={closeModal}>
          <div className="invoice-preview">
            <strong>TBT PIZZAS PENHA</strong>
            <span>Cliente: {payload.customer}</span>
            <span>Total: {formatCurrency(payload.amount)}</span>
            <span>Status: {payload.status}</span>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newQr') {
      return (
        <Modal
          title="Gerar QR Code"
          subtitle="Cria um link de mesa para autoatendimento."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="qr-form" type="submit">Gerar QR</Button></>}
        >
          <form className="form-grid" id="qr-form" onSubmit={(event) => { event.preventDefault(); createQrCode() }}>
            <Field label="Mesa">
              <input data-testid="qr-table" value={qrForm.table} onChange={(event) => setQrForm({ ...qrForm, table: event.target.value })} />
            </Field>
            <Field label="Slug">
              <input data-testid="qr-url" value={qrForm.url} onChange={(event) => setQrForm({ ...qrForm, url: event.target.value })} />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'printQr') {
      return (
        <Modal title={`Imprimir QR - ${payload.table}`} subtitle="Previa visual do QR de mesa." onClose={closeModal}>
          <div className="qr-preview">
            <span>{payload.table}</span>
            <b>QR</b>
            <small>/cardapio/{payload.url}</small>
            <Button variant="primary" onClick={() => notify(`QR de ${payload.table} enviado para impressao.`)}>Imprimir</Button>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newRecovery' || modal.type === 'editRecovery') {
      const isEdit = modal.type === 'editRecovery'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.name}` : 'Nova regra de recuperacao'}
          subtitle="Crie uma regra automatica para retomar clientes."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="recovery-form" type="submit">{isEdit ? 'Salvar regra' : 'Criar regra'}</Button></>}
        >
          <form className="form-grid" id="recovery-form" onSubmit={(event) => { event.preventDefault(); createRecoveryRule(isEdit ? payload.id : null) }}>
            <Field label="Nome">
              <input value={recoveryForm.name} onChange={(event) => setRecoveryForm({ ...recoveryForm, name: event.target.value })} placeholder="Carrinho parado" />
            </Field>
            <Field label="Canal">
              <select value={recoveryForm.channel} onChange={(event) => setRecoveryForm({ ...recoveryForm, channel: event.target.value })}>
                <option>WhatsApp</option>
                <option>Instagram</option>
                <option>Cardapio digital</option>
              </select>
            </Field>
            <Field label="Atraso (min)">
              <input value={recoveryForm.delay} onChange={(event) => setRecoveryForm({ ...recoveryForm, delay: event.target.value })} />
            </Field>
            <Field label="Status">
              <select value={recoveryForm.active ? 'yes' : 'no'} onChange={(event) => setRecoveryForm({ ...recoveryForm, active: event.target.value === 'yes' })}>
                <option value="yes">Ativa</option>
                <option value="no">Pausada</option>
              </select>
            </Field>
            <Field label="Mensagem">
              <textarea value={recoveryForm.message} onChange={(event) => setRecoveryForm({ ...recoveryForm, message: event.target.value })} />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteRecovery') {
      return (
        <Modal
          title={`Apagar ${payload.name}`}
          subtitle="Remove a regra automatica do recuperador."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteRecovery(payload.id)}>Apagar regra</Button></>}
        >
          <div className="modal-summary">
            <span>Regra</span>
            <strong>{payload.name}</strong>
            <p>{payload.channel} - atraso {payload.delay || 15} min.</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'botTraining') {
      return (
        <Modal
          title="Treinar robo"
          subtitle="Ajuste mensagens, FAQ e acionamento manual do atendimento."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="bot-form" type="submit">Salvar treino</Button></>}
        >
          <form className="form-grid" id="bot-form" onSubmit={saveBotTraining}>
            <Field label="Mensagem inicial">
              <textarea value={botForm.welcome} onChange={(event) => setBotForm({ ...botForm, welcome: event.target.value })} />
            </Field>
            <Field label="Fallback">
              <textarea value={botForm.fallback} onChange={(event) => setBotForm({ ...botForm, fallback: event.target.value })} />
            </Field>
            <Field label="Palavras de transferencia">
              <input value={botForm.handoffKeywords} onChange={(event) => setBotForm({ ...botForm, handoffKeywords: event.target.value })} />
            </Field>
            <Field label="Audio">
              <select value={botForm.audio ? 'yes' : 'no'} onChange={(event) => setBotForm({ ...botForm, audio: event.target.value === 'yes' })}>
                <option value="yes">Ativo</option>
                <option value="no">Desligado</option>
              </select>
            </Field>
            <Field label="Dica do cardapio">
              <input value={botForm.menuHint} onChange={(event) => setBotForm({ ...botForm, menuHint: event.target.value })} />
            </Field>
          </form>
          <div className="stack-list">
            <div className="list-row list-row--stack">
              <span>
                <strong>FAQ do atendimento</strong>
                <small>{botForm.faq.length} resposta(s) salvas</small>
              </span>
            </div>
            {botForm.faq.map((item) => (
              <article className="list-row list-row--stack" key={item.id}>
                <span>
                  <strong>{item.question}</strong>
                  <small>{item.answer}</small>
                </span>
                <Button variant="danger" onClick={() => removeBotFaq(item.id)}>Apagar</Button>
              </article>
            ))}
            <div className="inline-form inline-form--column">
              <input value={faqForm.question} onChange={(event) => setFaqForm({ ...faqForm, question: event.target.value })} placeholder="Pergunta" />
              <input value={faqForm.answer} onChange={(event) => setFaqForm({ ...faqForm, answer: event.target.value })} placeholder="Resposta" />
              <Button variant="primary" onClick={addBotFaq}>Adicionar FAQ</Button>
            </div>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'kdsSettings') {
      return (
        <Modal
          title="Configurar KDS"
          subtitle="Controle alertas, destaque e bump automatico das telas."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="kds-form" type="submit">Salvar KDS</Button></>}
        >
          <form className="form-grid" id="kds-form" onSubmit={saveKdsSettings}>
            <Field label="Som de alerta">
              <select value={kdsForm.soundAlert} onChange={(event) => setKdsForm({ ...kdsForm, soundAlert: event.target.value })}>
                <option value="yes">Ativo</option>
                <option value="no">Desligado</option>
              </select>
            </Field>
            <Field label="Bump automatico">
              <select value={kdsForm.autoBump} onChange={(event) => setKdsForm({ ...kdsForm, autoBump: event.target.value })}>
                <option value="yes">Ativo</option>
                <option value="no">Manual</option>
              </select>
            </Field>
            <Field label="Tempo de bump (min)">
              <input value={kdsForm.bumpMinutes} onChange={(event) => setKdsForm({ ...kdsForm, bumpMinutes: event.target.value })} />
            </Field>
            <Field label="Mostrar cliente">
              <select value={kdsForm.showCustomer} onChange={(event) => setKdsForm({ ...kdsForm, showCustomer: event.target.value })}>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
            </Field>
            <Field label="Destacar urgentes">
              <select value={kdsForm.highlightRush} onChange={(event) => setKdsForm({ ...kdsForm, highlightRush: event.target.value })}>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'integrationHelp') {
      return (
        <Modal
          title="Ajuda de integracoes"
          subtitle="Checklist local para marketplaces, anuncios e pagamento online."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Fechar</Button><Button variant="primary" onClick={exportAppBackup}>Exportar backup</Button></>}
        >
          <div className="stack-list">
            {integrations.map((integration) => (
              <article className="list-row" key={integration.id}>
                <span>
                  <strong>{integration.name}</strong>
                  <small>{integration.active ? 'Conexao pronta' : 'Conexao pendente'}</small>
                </span>
                <Button variant={integration.active ? 'danger' : 'primary'} onClick={() => toggleIntegration(integration.id)}>{integration.active ? 'Desconectar' : 'Conectar'}</Button>
              </article>
            ))}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'cash') {
      return (
        <Modal
          title="Caixa da loja"
          subtitle="Simula abertura e fechamento do caixa."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Fechar janela</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setCashOpen((current) => !current)
                  notify(cashOpen ? 'Caixa fechado.' : 'Caixa aberto.')
                  closeModal()
                }}
              >
                {cashOpen ? 'Fechar caixa' : 'Abrir caixa'}
              </Button>
            </>
          }
        >
          <div className="modal-summary">
            <span>Status atual</span>
            <strong>{cashOpen ? 'Aberto para vendas' : 'Fechado para conferencia'}</strong>
            <p>Pedidos e recebimentos continuam mockados no front.</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'settings') {
      return (
        <Modal
          title="Ajustes de operacao"
          subtitle="Configuracoes salvas apenas no estado local."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" form="settings-form" type="submit">
                Salvar ajustes
              </Button>
            </>
          }
        >
          <form className="form-grid" id="settings-form" onSubmit={saveSettings}>
            <Field label="Aceitar automaticamente">
              <select value={settings.autoAccept ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, autoAccept: event.target.value === 'yes' })}>
                <option value="yes">Ativo</option>
                <option value="no">Manual</option>
              </select>
            </Field>
            <Field label="Tempo balcao">
              <input type="number" min="5" value={settings.counterTime} onChange={(event) => setSettings({ ...settings, counterTime: Number(event.target.value) })} />
            </Field>
            <Field label="Tempo delivery">
              <input type="number" min="10" value={settings.deliveryTime} onChange={(event) => setSettings({ ...settings, deliveryTime: Number(event.target.value) })} />
            </Field>
            <Field label="Impressao automatica">
              <select value={settings.printer ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, printer: event.target.value === 'yes' })}>
                <option value="yes">Ligada</option>
                <option value="no">Desligada</option>
              </select>
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'blocked') {
      return (
        <Modal title="Pedidos bloqueados" subtitle="Fila simulada de pedidos com pendencia." onClose={closeModal}>
          <div className="stack-list">
            {blockedOrders.length > 0 ? (
              blockedOrders.map((order) => (
                <article className="list-row" key={order.id}>
                  <span>
                    <strong>#{order.id} - {order.customer}</strong>
                    <small>{order.reason}</small>
                  </span>
                  <Button variant="primary" onClick={() => restoreBlockedOrder(order.id)}>
                    Recuperar
                  </Button>
                </article>
              ))
            ) : (
              <div className="empty-modal">Nenhum pedido bloqueado.</div>
            )}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newTable' || modal.type === 'editTable') {
      const isEdit = modal.type === 'editTable'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.name}` : 'Nova mesa'}
          subtitle="Gerencie mesas e comandas do salao."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="table-form" type="submit">{isEdit ? 'Salvar mesa' : 'Criar mesa'}</Button></>}
        >
          <form className="form-grid" id="table-form" onSubmit={(event) => saveTable(event, isEdit ? payload.id : null)}>
            <Field label="Nome">
              <input data-testid="table-name" value={tableForm.name} onChange={(event) => setTableForm({ ...tableForm, name: event.target.value })} placeholder="Mesa 5" />
            </Field>
            <Field label="Lugares">
              <input type="number" min="1" value={tableForm.seats} onChange={(event) => setTableForm({ ...tableForm, seats: event.target.value })} />
            </Field>
            <Field label="Cliente">
              <input value={tableForm.customer} onChange={(event) => setTableForm({ ...tableForm, customer: event.target.value })} placeholder="Opcional" />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteTable') {
      return (
        <Modal
          title={`Apagar ${payload.name}`}
          subtitle="Remove a mesa do mapa local."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteTable(payload.id)}>Apagar mesa</Button></>}
        >
          <div className="modal-summary">
            <span>Mesa</span>
            <strong>{payload.name}</strong>
            <p>{payload.status === 'free' ? 'Livre' : 'Possui movimento simulado.'}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'closeTable') {
      return (
        <Modal
          title={`Fechar ${payload.name}`}
          subtitle="Zera a comanda local e libera a mesa."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" onClick={() => closeTable(payload.id)}>Fechar mesa</Button></>}
        >
          <div className="modal-summary">
            <span>Total da comanda</span>
            <strong>{formatCurrency(payload.total)}</strong>
            <p>{payload.customer || 'Sem cliente identificado'}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'tableOrder') {
      return (
        <Modal
          title={`Pedido para ${payload.name}`}
          subtitle="Cria um pedido de preparo ligado ao salao."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" onClick={() => addTableOrder(payload)}>Criar pedido</Button></>}
        >
          <div className="modal-summary">
            <span>Cliente</span>
            <strong>{payload.customer || payload.name}</strong>
            <p>Valor sugerido: {formatCurrency(payload.total || 49.9)}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'assignDelivery') {
      return (
        <Modal title={`Atribuir entrega #${payload.id}`} subtitle={payload.address} onClose={closeModal}>
          <div className="stack-list">
            {couriers.filter((courier) => courier.active).map((courier) => (
              <article className="list-row" key={courier.id}>
                <span>
                  <strong>{courier.name}</strong>
                  <small>{courier.deliveries} entrega(s) hoje</small>
                </span>
                <Button variant="primary" onClick={() => assignDelivery(payload.id, courier.name)}>Atribuir</Button>
              </article>
            ))}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'deliveryMap') {
      return (
        <Modal title="Mapa de entregas" subtitle="Visualizacao simulada para as rotas abertas." onClose={closeModal}>
          <div className="fake-map">
            <span>Loja</span>
            <span>Rota A</span>
            <span>Rota B</span>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newCourier' || modal.type === 'editCourier') {
      const isEdit = modal.type === 'editCourier'

      return (
        <Modal
          title={isEdit ? `Editar ${payload.name}` : 'Novo entregador'}
          subtitle="Cadastre ou ajuste a equipe de entrega."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="courier-form" type="submit">{isEdit ? 'Salvar entregador' : 'Criar entregador'}</Button></>}
        >
          <form className="form-grid" id="courier-form" onSubmit={(event) => saveCourier(event, isEdit ? payload.id : null)}>
            <Field label="Nome">
              <input value={courierForm.name} onChange={(event) => setCourierForm({ ...courierForm, name: event.target.value })} placeholder="Nome do entregador" />
            </Field>
            <Field label="Telefone">
              <input value={courierForm.phone} onChange={(event) => setCourierForm({ ...courierForm, phone: event.target.value })} placeholder="(47) 9 9999-9999" />
            </Field>
            <Field label="Veiculo">
              <select value={courierForm.vehicle} onChange={(event) => setCourierForm({ ...courierForm, vehicle: event.target.value })}>
                <option>Moto</option>
                <option>Carro</option>
                <option>Bicicleta</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={courierForm.active ? 'yes' : 'no'} onChange={(event) => setCourierForm({ ...courierForm, active: event.target.value === 'yes' })}>
                <option value="yes">Disponivel</option>
                <option value="no">Off</option>
              </select>
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'deleteCourier') {
      return (
        <Modal
          title={`Apagar ${payload.name}`}
          subtitle="Remove o entregador do time local."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="danger" onClick={() => deleteCourier(payload.id)}>Apagar entregador</Button></>}
        >
          <div className="modal-summary">
            <span>Entregador</span>
            <strong>{payload.name}</strong>
            <p>{payload.vehicle || 'Moto'} - {payload.phone || 'Sem telefone'}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'exportReports') {
      return (
        <Modal title="Exportar relatorios" subtitle="Simulacao de exportacao local." onClose={closeModal}>
          <div className="stack-list">
            <article className="list-row">
              <span>
                <strong>CSV de pedidos</strong>
                <small>{orders.length} pedido(s) em memoria</small>
              </span>
              <Button variant="primary" onClick={exportOrdersCsvFile}>Gerar</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Backup completo</strong>
                <small>Pedidos, cardapio, estoque, caixa e configuracoes</small>
              </span>
              <Button variant="primary" onClick={exportAppBackup}>Gerar</Button>
            </article>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'orderDrafts') {
      return (
        <Modal title="Rascunhos de pedido" subtitle="Pedidos salvos localmente para continuar depois." onClose={reopenOrderEditor}>
          <div className="stack-list">
            {orderDrafts.length > 0 ? (
              orderDrafts.map((draft) => (
                <article className="list-row" key={draft.id}>
                  <span>
                    <strong>{draft.label}</strong>
                    <small>{draft.createdAt}</small>
                  </span>
                  <div className="modal-actions">
                    <Button onClick={() => loadOrderDraft(draft.id)}>Carregar</Button>
                    <Button variant="danger" onClick={() => deleteOrderDraft(draft.id)}>Apagar</Button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-modal">Nenhum rascunho salvo.</div>
            )}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'editCartItem') {
      return (
        <Modal
          title={`Editar ${payload.name}`}
          subtitle="Ajuste a quantidade deste item no pedido."
          onClose={reopenOrderEditor}
          footer={<><Button onClick={reopenOrderEditor}>Cancelar</Button><Button variant="primary" onClick={() => { changeOrderCartQuantity(payload.id, payload.qty + 1); reopenOrderEditor() }}>+1 unidade</Button></>}
        >
          <div className="modal-summary">
            <span>Quantidade atual</span>
            <strong>{payload.qty}</strong>
            <p>{formatCurrency(payload.price)} por unidade.</p>
            <div className="modal-actions">
              <Button onClick={() => { changeOrderCartQuantity(payload.id, payload.qty - 1); reopenOrderEditor() }}>-1 unidade</Button>
              <Button variant="danger" onClick={() => { removeOrderCart(payload.id); reopenOrderEditor() }}>Remover item</Button>
            </div>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'orderDetails') {
      return (
        <Modal title={`Pedido #${payload.id}`} subtitle={payload.customer} onClose={closeModal}>
          <div className="order-detail">
            <div><span>Contato</span><strong>{payload.phone}</strong></div>
            <div><span>Entrega</span><strong>{payload.address}</strong></div>
            <div><span>Pagamento</span><strong>{payload.payment} - {formatCurrency(payload.total)}</strong></div>
            <div><span>Itens</span><strong>{payload.items.join(', ')}</strong></div>
            <div><span>Observacao</span><strong>{payload.note}</strong></div>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'finishOrder') {
      return (
        <Modal
          title={`Finalizar pedido #${payload.id}`}
          subtitle="A acao altera apenas o estado local."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Voltar</Button><Button variant="primary" onClick={() => finishOrder(payload.id)}>Confirmar entrega</Button></>}
        >
          <div className="modal-summary">
            <span>Cliente</span>
            <strong>{payload.customer}</strong>
            <p>{payload.address}</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'finishReady') {
      return (
        <Modal
          title="Finalizar pedidos de saida"
          subtitle="Todos os pedidos prontos serao marcados como concluidos."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" onClick={finishReadyOrders}>Finalizar todos</Button></>}
        >
          <div className="modal-summary">
            <span>Prontos agora</span>
            <strong>{orders.filter((order) => order.status === 'ready').length}</strong>
            <p>O historico fica apenas em memoria enquanto a pagina estiver aberta.</p>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'invoice') {
      return (
        <Modal title={`Nota fiscal #${payload.id}`} subtitle="Pre-visualizacao fake da NF." onClose={closeModal}>
          <div className="invoice-preview">
            <strong>TBT PIZZAS PENHA</strong>
            <span>Cliente: {payload.customer}</span>
            <span>Itens: {payload.items.join(', ')}</span>
            <span>Total: {formatCurrency(payload.total)}</span>
            <Button
              variant="primary"
              onClick={() => {
                notify(`NF do pedido #${payload.id} enviada para fila de impressao.`)
                closeModal()
              }}
            >
              Simular impressao
            </Button>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'chat') {
      return (
        <Modal title="Chat do atendimento" subtitle="Mensagens simuladas no front." onClose={closeModal}>
          <div className="chat-box" data-testid="chat-box">
            {chatMessages.map((message) => (
              <p key={message.id}>
                <strong>{message.author}:</strong> {message.text}
              </p>
            ))}
          </div>
          <form className="inline-form" onSubmit={sendChatMessage}>
            <input data-testid="chat-input" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Digite uma mensagem" />
            <Button variant="primary" type="submit">Enviar</Button>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'suggestion') {
      return (
        <Modal title="Enviar sugestao" subtitle="Registro local para validar o fluxo." onClose={closeModal}>
          <form className="form-grid" id="suggestion-form" onSubmit={saveSuggestion}>
            <Field label="Sugestao">
              <textarea data-testid="suggestion-input" value={suggestion} onChange={(event) => setSuggestion(event.target.value)} placeholder="Descreva uma melhoria para a operacao" />
            </Field>
            <Button variant="primary" type="submit">Registrar sugestao</Button>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'notifications') {
      return (
        <Modal title="Notificacoes" subtitle="Eventos recentes do prototipo." onClose={closeModal}>
          <div className="stack-list">
            {eventLog.map((entry) => (
              <article className="list-row" key={entry.id}>
                <Icon name={entry.tone === 'danger' ? 'x' : entry.tone === 'warning' ? 'bell' : 'check'} size={18} />
                <span>
                  <strong>{entry.message}</strong>
                  <small>{entry.time}</small>
                </span>
              </article>
            ))}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'helpCenter') {
      return (
        <Modal
          title="Central de ajuda"
          subtitle={`Atalho aberto: ${payload?.label || 'Ajuda'}`}
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Fechar</Button><Button variant="primary" onClick={() => { setActiveNav('reports'); closeModal() }}>Abrir relatorios</Button></>}
        >
          <div className="stack-list">
            <article className="list-row">
              <span>
                <strong>Operacao atual</strong>
                <small>{orders.filter((order) => order.status !== 'completed').length} pedido(s) em aberto</small>
              </span>
            </article>
            <article className="list-row">
              <span>
                <strong>Estoque em alerta</strong>
                <small>{lowStockCount} item(ns) abaixo do minimo</small>
              </span>
            </article>
            <article className="list-row">
              <span>
                <strong>Backup local</strong>
                <small>Exporte os dados antes de trocar de maquina ou limpar o navegador.</small>
              </span>
              <Button variant="primary" onClick={exportAppBackup}>Exportar</Button>
            </article>
          </div>
        </Modal>
      )
    }

    if (modal.type === 'store') {
      return (
        <Modal
          title="Dados da loja"
          subtitle="Perfil comercial usado em todo o front."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="store-form" type="submit">Salvar loja</Button></>}
        >
          <form className="form-grid" id="store-form" onSubmit={saveStoreProfile}>
            <Field label="Nome da loja">
              <input value={storeForm.name} onChange={(event) => setStoreForm({ ...storeForm, name: event.target.value })} />
            </Field>
            <Field label="Responsavel">
              <input value={storeForm.owner} onChange={(event) => setStoreForm({ ...storeForm, owner: event.target.value })} />
            </Field>
            <Field label="Telefone">
              <input value={storeForm.phone} onChange={(event) => setStoreForm({ ...storeForm, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <input value={storeForm.email} onChange={(event) => setStoreForm({ ...storeForm, email: event.target.value })} />
            </Field>
            <Field label="CNPJ">
              <input value={storeForm.taxId} onChange={(event) => setStoreForm({ ...storeForm, taxId: event.target.value })} />
            </Field>
            <Field label="Cidade">
              <input value={storeForm.city} onChange={(event) => setStoreForm({ ...storeForm, city: event.target.value })} />
            </Field>
            <Field label="Endereco">
              <input value={storeForm.address} onChange={(event) => setStoreForm({ ...storeForm, address: event.target.value })} />
            </Field>
            <Field label="Horario">
              <input value={storeForm.schedule} onChange={(event) => setStoreForm({ ...storeForm, schedule: event.target.value })} />
            </Field>
            <Field label="Taxa de entrega">
              <input value={storeForm.serviceFee} onChange={(event) => setStoreForm({ ...storeForm, serviceFee: event.target.value })} />
            </Field>
            <Field label="Raio de entrega (km)">
              <input value={storeForm.deliveryRadius} onChange={(event) => setStoreForm({ ...storeForm, deliveryRadius: event.target.value })} />
            </Field>
            <Field label="Observacao">
              <textarea value={storeForm.note} onChange={(event) => setStoreForm({ ...storeForm, note: event.target.value })} />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'register' || modal.type === 'reports') {
      return (
        <Modal
          title={modal.type === 'register' ? 'Cadastro comercial' : 'Central de dados'}
          subtitle="Backup, importacao, exportacao e reinicio da base local."
          onClose={closeModal}
        >
          <div className="stack-list">
            <article className="list-row">
              <span>
                <strong>Loja</strong>
                <small>{storeProfile.name} - {storeProfile.city}</small>
              </span>
              <Button onClick={() => openModal('store')}>Editar</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Exportar JSON</strong>
                <small>Salva toda a operacao local em um arquivo.</small>
              </span>
              <Button variant="primary" onClick={exportAppBackup}>Exportar</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Exportar pedidos CSV</strong>
                <small>Arquivo simples para conferencia externa.</small>
              </span>
              <Button variant="primary" onClick={exportOrdersCsvFile}>Gerar CSV</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Importar backup</strong>
                <small>Carrega um arquivo exportado anteriormente.</small>
              </span>
              <Button onClick={openImportPicker}>Importar</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Resetar base local</strong>
                <small>Volta ao estado inicial de demonstracao.</small>
              </span>
              <Button variant="danger" onClick={resetFrontData}>Resetar</Button>
            </article>
            {dataImportError ? <div className="empty-modal">{dataImportError}</div> : null}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'password') {
      return (
        <Modal
          title="Atualizar seguranca"
          subtitle="Senha local, dois fatores e tempo de sessao."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="password-form" type="submit">Salvar seguranca</Button></>}
        >
          <form className="form-grid" id="password-form" onSubmit={savePasswordSettings}>
            <Field label="Senha atual">
              <input type="password" value={passwordForm.current} onChange={(event) => setPasswordForm({ ...passwordForm, current: event.target.value })} />
            </Field>
            <Field label="Nova senha">
              <input type="password" value={passwordForm.next} onChange={(event) => setPasswordForm({ ...passwordForm, next: event.target.value })} />
            </Field>
            <Field label="Confirmar senha">
              <input type="password" value={passwordForm.confirm} onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })} />
            </Field>
            <Field label="2FA">
              <select value={passwordForm.twoFactor} onChange={(event) => setPasswordForm({ ...passwordForm, twoFactor: event.target.value })}>
                <option value="yes">Ativo</option>
                <option value="no">Desligado</option>
              </select>
            </Field>
            <Field label="Timeout da sessao (min)">
              <input value={passwordForm.sessionMinutes} onChange={(event) => setPasswordForm({ ...passwordForm, sessionMinutes: event.target.value })} />
            </Field>
            <Field label="Bloquear em inatividade">
              <select value={passwordForm.lockOnIdle} onChange={(event) => setPasswordForm({ ...passwordForm, lockOnIdle: event.target.value })}>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
            </Field>
            <Field label="Ultima troca">
              <input value={security.lastChange} readOnly />
            </Field>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'printer') {
      return (
        <Modal
          title="Impressora"
          subtitle="Dispositivo local, fila e testes de impressao."
          onClose={closeModal}
          footer={<><Button onClick={clearPrintQueue}>Limpar fila</Button><Button variant="primary" form="printer-form" type="submit">Salvar impressora</Button></>}
        >
          <form className="form-grid" id="printer-form" onSubmit={savePrinterSettings}>
            <Field label="Dispositivo">
              <input value={printerForm.deviceName} onChange={(event) => setPrinterForm({ ...printerForm, deviceName: event.target.value })} />
            </Field>
            <Field label="Conectada">
              <select value={printerForm.connected} onChange={(event) => setPrinterForm({ ...printerForm, connected: event.target.value })}>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
            </Field>
            <Field label="Copias">
              <input value={printerForm.copies} onChange={(event) => setPrinterForm({ ...printerForm, copies: event.target.value })} />
            </Field>
            <Field label="Bobina">
              <select value={printerForm.paper} onChange={(event) => setPrinterForm({ ...printerForm, paper: event.target.value })}>
                <option>58mm</option>
                <option>80mm</option>
              </select>
            </Field>
          </form>
          <div className="stack-list">
            <article className="list-row">
              <span>
                <strong>Fila atual</strong>
                <small>{printerConfig.queue.length} item(ns) aguardando ou prontos</small>
              </span>
              <Button variant="primary" onClick={runPrinterTest}>Teste</Button>
            </article>
            {printerConfig.queue.map((job) => (
              <article className="list-row" key={job.id}>
                <span>
                  <strong>{job.label}</strong>
                  <small>{job.type} - {job.status}</small>
                </span>
                <Button variant="danger" onClick={() => completePrintJob(job.id)}>Remover</Button>
              </article>
            ))}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'automations') {
      return (
        <Modal
          title="Automacoes"
          subtitle="Aceite, fila, impressao, rascunho e alertas."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="settings-form" type="submit">Salvar automacoes</Button></>}
        >
          <form className="form-grid" id="settings-form" onSubmit={saveSettings}>
            <Field label="Aceite automatico">
              <select value={settings.autoAccept ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, autoAccept: event.target.value === 'yes' })}>
                <option value="yes">Ativo</option>
                <option value="no">Manual</option>
              </select>
            </Field>
            <Field label="Impressao automatica">
              <select value={settings.autoPrint ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, autoPrint: event.target.value === 'yes' })}>
                <option value="yes">Ativa</option>
                <option value="no">Desligada</option>
              </select>
            </Field>
            <Field label="Mensagem de pedido pronto">
              <select value={settings.sendReadyMessage ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, sendReadyMessage: event.target.value === 'yes' })}>
                <option value="yes">Ativa</option>
                <option value="no">Desligada</option>
              </select>
            </Field>
            <Field label="Salvar rascunhos">
              <select value={settings.saveDrafts ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, saveDrafts: event.target.value === 'yes' })}>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
            </Field>
            <Field label="Alerta de estoque baixo">
              <select value={settings.lowStockAlert ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, lowStockAlert: event.target.value === 'yes' })}>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
            </Field>
          </form>
        </Modal>
      )
    }

    const genericTitles = {
      automations: ['Automacoes', 'Configure aceite automatico, alertas e impressao.'],
      printer: ['Impressora', 'Teste de conexao e fila local de pedidos.'],
      store: ['Dados da loja', 'Perfil comercial usado neste prototipo.'],
      register: ['Cadastro comercial', 'Fluxo fake de atualizacao de cadastro.'],
      password: ['Atualizar seguranca', 'Formulario visual sem alteracao real de senha.'],
      reports: ['Relatorios', 'Resumo local dos pedidos em memoria.'],
    }

    if (modal.type === 'section' || modal.type === 'shortcut') {
      return (
        <Modal title={payload.label} subtitle="Area demonstrativa. Sem integracao externa." onClose={closeModal}>
          <div className="modal-summary">
            <span>Modulo</span>
            <strong>{payload.label}</strong>
            <p>Este botao ja possui fluxo visual e pode receber backend depois.</p>
          </div>
        </Modal>
      )
    }

    const [title, subtitle] = genericTitles[modal.type] || ['Acao', 'Fluxo demonstrativo.']

    return (
      <Modal title={title} subtitle={subtitle} onClose={closeModal}>
        <div className="modal-summary">
          <span>Status</span>
          <strong>Disponivel no front</strong>
          <p>Botao testavel, modal funcional e pronto para conectar ao backend real.</p>
        </div>
      </Modal>
    )
  }

  return (
    <main className="app-frame">
      <TopBar onOpenModal={openModal} notificationCount={notificationCount} />

      <div className="workspace">
        <Sidebar
          activeNav={activeNav}
          cashOpen={cashOpen}
          navQuery={navQuery}
          storeProfile={storeProfile}
          onNavQuery={setNavQuery}
          onOpenModal={openModal}
          onSetActiveNav={setActiveNav}
        />

        <section className="content">
          <div className="content__top">
            <div>
              <h1>{activeTitle}</h1>
              <p>{toast}</p>
            </div>
            <Button variant="primary" onClick={() => openModal('newOrder')}>
              <Icon name="plus" size={18} />
              Novo pedido
            </Button>
          </div>

          <Notice
            visible={noticeVisible}
            onClose={() => setNoticeVisible(false)}
            onOpenPassword={() => openModal('password')}
          />

          <Metrics orders={orders} cashOpen={cashOpen} />

          {renderWorkArea()}
        </section>
      </div>

      <input ref={importInputRef} type="file" accept="application/json" className="sr-only-input" onChange={handleImportData} />
      {renderModal()}
    </main>
  )
}

export default App
