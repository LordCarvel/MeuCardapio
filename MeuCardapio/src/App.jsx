import { useEffect, useMemo, useRef, useState } from 'react'
import { StoreAccess } from './modules/store/StoreAccess'
import { StoreDeletePrompt } from './modules/store/StoreDeletePrompt'
import { StoreProfileForm } from './modules/store/StoreProfileForm'
import { BackendDiagnostics } from './modules/backend/BackendDiagnostics'
import { CustomerStorefront } from './modules/customer/CustomerStorefront'
import {
  API_BASE_URL,
  checkBackendHealth,
  createBackendLog,
  createBackendOrder,
  deleteBackendOrder,
  getBackendStore,
  loadBackendWorkspace,
  loadBackendWorkspaceByAccessKey,
  connectWhatsappSession,
  createWhatsappSession,
  getWhatsappConfig,
  getWhatsappConversations,
  getWhatsappMessages,
  getWhatsappQrCode,
  getWhatsappStatus,
  loginBackendUser,
  markWhatsappConversationRead,
  requestPasswordResetCode,
  requestSignupCode,
  resetBackendPassword,
  saveWhatsappConfig,
  sendWhatsappMessage,
  signupBackendAccount,
  patchBackendStore,
  updateBackendStore,
  updateBackendMenuSnapshot,
  updateBackendOrder,
  updateBackendOrderStatus,
} from './modules/backend/backendApi'
import { STORAGE_KEY } from './modules/storage/browserStorage'
import {
  authenticateStoreUser,
  buildStoreSession,
  createStoreUser as createStoreUserRecord,
  normalizeStoreUser,
} from './modules/store/storeAuth'
import {
  buildStoreAddressForGeocoding,
  createEmptyStoreProfile,
  getStoreInitials,
  isStoreConfigured,
  normalizeStoreProfile,
} from './modules/store/storeProfile'
import { parseMenuImportContent } from './modules/menu/menuImport'
import './App.css'

function getCustomerStoreIdFromPath() {
  if (typeof window === 'undefined') {
    return ''
  }

  const match = window.location.pathname.match(/\/loja\/([^/?#]+)/i)

  return match ? decodeURIComponent(match[1]) : ''
}

function getStoreAccessFromPath() {
  if (typeof window === 'undefined') {
    return { storeId: '', accessKey: '' }
  }

  const match = window.location.pathname.match(/\/acesso\/([^/?#]+)(?:\/([^/?#]+))?/i)
  const queryKey = new URLSearchParams(window.location.search).get('chave') || ''
  const queryStoreId = new URLSearchParams(window.location.search).get('loja') || ''

  return {
    storeId: match?.[2] ? decodeURIComponent(match[1]) : queryStoreId,
    accessKey: match ? decodeURIComponent(match[2] || match[1]) : queryKey,
  }
}

function normalizePublicBasePath(value = '') {
  const normalized = `/${String(value).trim().replace(/^\/+|\/+$/g, '')}`

  return normalized === '/' ? '' : normalized
}

function getPublicBasePath() {
  if (typeof window === 'undefined') {
    return ''
  }

  const viteBase = import.meta.env.BASE_URL || ''
  if (viteBase && viteBase !== '/' && viteBase !== './') {
    return normalizePublicBasePath(viteBase)
  }

  const pathname = window.location.pathname || '/'
  const routeMatch = pathname.match(/^(.*?)(?:\/(?:loja|cardapio)(?:\/|$).*)/i)
  if (routeMatch) {
    return normalizePublicBasePath(routeMatch[1])
  }

  const withoutFile = pathname.replace(/\/[^/]*\.[^/]*$/, '/').replace(/\/$/, '')
  return normalizePublicBasePath(withoutFile)
}

function buildPublicAppUrl(path = '/') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

  return `${origin}${getPublicBasePath()}${cleanPath}`
}

function normalizeStoreAccessKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function generateStoreAccessKey(profile = {}) {
  const base = String(profile.name || profile.tradeName || 'loja')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'loja'
  const suffix = Math.random().toString(36).slice(2, 8)

  return `${base}-${suffix}`
}

function buildStoreAccessUrl(accessKey = '') {
  const normalizedKey = String(accessKey || '').trim()

  if (!normalizedKey) {
    return ''
  }

  return buildPublicAppUrl(`/acesso/${encodeURIComponent(normalizedKey)}`)
}

function buildQrImageUrl(value = '') {
  return value
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(value)}`
    : ''
}

const NOMINATIM_MIN_INTERVAL_MS = 1100
const DEFAULT_MAP_COORDINATES = { lat: -26.7693, lng: -48.6452 }
const OSM_TILE_SIZE = 256
const DELIVERY_ZONE_COLORS = ['#248a72', '#d94f3d', '#0b84e3', '#c28a20', '#7c5cc4', '#4f7d8a']

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
    source: 'Balcao',
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
    source: 'WhatsApp',
    status: 'production',
    total: 62.8,
    payment: 'Cartao',
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
    source: 'Instagram',
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
  { id: 'finance', icon: 'card', label: 'Financeiro' },
  { id: 'fiscal', icon: 'printer', label: 'Fiscal' },
  { id: 'integrations', icon: 'settings', label: 'Integracoes' },
  { id: 'reports', icon: 'chart', label: 'Relatorios' },
]

const tutorialSteps = [
  {
    nav: 'orders',
    title: 'Visao geral da operacao',
    body: 'Este painel concentra sua operacao diaria. No topo ficam o status do piloto, notificacoes e o usuario logado. A lateral troca entre pedidos, atendimento, PDV, cardapio, cozinha, entregas, financeiro e relatorios. Comece sempre conferindo se a loja esta aberta e se o piloto esta online.',
  },
  {
    nav: 'orders',
    title: 'Pedidos',
    body: 'Aqui entram os pedidos da loja. Use as colunas para acompanhar entrada, preparo, entrega e finalizacao. Cada pedido pode carregar cliente, telefone, endereco, itens, pagamento, observacoes, impressao e sincronizacao com a API. Em uma conta nova, esta area comeca vazia para voce montar a operacao real.',
  },
  {
    nav: 'service',
    title: 'Atendimento',
    body: 'Esta area organiza conversas e sinais do atendimento. Ela foi pensada para WhatsApp, cardapio digital, recuperacao de carrinho e mensagens operacionais. Quando a loja estiver integrada, use esta tela para acompanhar pendencias humanas e automatizadas.',
  },
  {
    nav: 'counter',
    title: 'PDV',
    body: 'O PDV serve para venda de balcao e retirada. Selecione produtos, monte o carrinho, escolha pagamento e finalize o pedido. Ele compartilha a mesma base de produtos e pedidos do restante do sistema, entao tudo aparece nos relatorios depois.',
  },
  {
    nav: 'tables',
    title: 'Salao',
    body: 'Em Salao voce gerencia mesas, QR codes e consumo local. Use quando a loja atende clientes no local. As mesas podem receber pedidos separados e depois entrar no fluxo de cozinha, pagamento e fiscal.',
  },
  {
    nav: 'menu',
    title: 'Cardapio',
    body: 'Cadastre categorias, produtos, precos, estoque, horarios de disponibilidade, sabores e complementos. Conta nova nao recebe produtos ficticios; a demo continua com exemplos para estudo. Antes de vender, esta e uma das primeiras areas que voce deve preencher.',
  },
  {
    nav: 'kds',
    title: 'Cozinha KDS',
    body: 'O KDS e a tela de producao da cozinha. Ela ajuda a separar o que entrou, o que esta em preparo, o que esta pronto e o que precisa de atencao. Configure alertas e tempos para reduzir atraso e retrabalho.',
  },
  {
    nav: 'delivery',
    title: 'Entregas',
    body: 'Aqui voce controla entregadores, enderecos, zonas, taxas e andamento das rotas. Use zonas de entrega para padronizar taxas e evitar prometer entrega fora da area atendida.',
  },
  {
    nav: 'marketing',
    title: 'Marketing',
    body: 'Esta area concentra cupons, recuperacao de clientes e campanhas. Use com cuidado: campanhas funcionam melhor quando cardapio, horarios, taxa de entrega e estoque estao corretos.',
  },
  {
    nav: 'finance',
    title: 'Financeiro',
    body: 'Acompanhe entradas, pagamentos, totais, taxas e movimentos da loja. O financeiro depende dos pedidos finalizados e do preenchimento correto de forma de pagamento.',
  },
  {
    nav: 'fiscal',
    title: 'Fiscal e impressao',
    body: 'Aqui ficam rotinas fiscais, comprovantes e impressao. Configure impressora, papel, margens, numero de vias e comportamento da fila antes de operar no balcao ou na cozinha.',
  },
  {
    nav: 'integrations',
    title: 'Integracoes',
    body: 'Este modulo concentra conexoes externas: API, automacoes, canais de venda e servicos futuros. Sempre valide credenciais e URLs antes de ativar sincronizacao automatica em producao.',
  },
  {
    nav: 'reports',
    title: 'Relatorios e backend',
    body: 'Em Relatorios voce confere indicadores e o diagnostico do backend. O bloco Backend mostra se GitHub Pages, Render e Supabase estao conversando. Use Atualizar e Gerar log para validar a conexao completa.',
  },
  {
    nav: 'reports',
    title: 'Configuracoes e seguranca',
    body: 'Use os botoes do topo e da lateral para abrir configuracoes da loja, piloto, impressora, automacoes e senha. Se trocar de dispositivo, este tutorial aparece de novo para a mesma conta, porque ele e controlado por navegador.',
  },
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
  address: '',
  addressId: '',
  addressLat: '',
  addressLng: '',
  deliveryZoneId: '',
  deliveryZoneName: '',
  document: '',
  channel: 'pickup',
  fulfillment: 'pickup',
  subtotal: '',
  deliveryFee: '0,00',
  total: '',
  payment: 'Cartao',
  discountType: 'fixed',
  discountValue: '',
  surchargeType: 'fixed',
  surchargeValue: '',
  items: '',
  note: '',
}

const ORDER_PAYMENT_OPTIONS = [
  { id: 'Cartao', hotkey: 'C', label: 'Cartao', description: 'debito ou credito na maquininha', icon: 'card' },
  { id: 'Dinheiro', hotkey: 'D', label: 'Dinheiro', description: 'pagamento em especie no balcao', icon: 'cash' },
  { id: 'Dividir', hotkey: 'R', label: 'Dividir', description: 'combinar formas de pagamento', icon: 'card' },
]

const ORDER_FULFILLMENT_OPTIONS = [
  { id: 'delivery', hotkey: 'E', label: 'Entrega (delivery)' },
  { id: 'pickup', hotkey: 'R', label: 'Retirar no local' },
  { id: 'dinein', hotkey: 'C', label: 'Consumir no local' },
]

const blankDeliveryAddress = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  lat: '',
  lng: '',
  mapLabel: '',
  deliveryZoneId: '',
  deliveryZoneName: '',
  deliveryFee: '0,00',
  deliveryAvailable: false,
  verifiedAt: '',
}

const initialOrderAddresses = []

const initialDeliveryZones = [
  {
    id: 'zone-centro',
    name: 'Centro / Praia Alegre',
    fee: '5,00',
    active: true,
    color: '#248a72',
    polygon: [
      [-48.6578, -26.7806],
      [-48.6358, -26.7812],
      [-48.6349, -26.7664],
      [-48.6587, -26.7648],
      [-48.6578, -26.7806],
    ],
  },
  {
    id: 'zone-armacao',
    name: 'Armacao / Beto Carrero',
    fee: '8,00',
    active: true,
    color: '#d94f3d',
    polygon: [
      [-48.6466, -26.8068],
      [-48.6206, -26.8075],
      [-48.6199, -26.7835],
      [-48.6475, -26.7828],
      [-48.6466, -26.8068],
    ],
  },
  {
    id: 'zone-gravata',
    name: 'Gravata / Santa Lidia',
    fee: '12,00',
    active: true,
    color: '#0b84e3',
    polygon: [
      [-48.6768, -26.7577],
      [-48.6387, -26.7592],
      [-48.6374, -26.7352],
      [-48.6759, -26.7318],
      [-48.6768, -26.7577],
    ],
  },
]

const blankDeliveryZone = {
  name: '',
  fee: '0,00',
  active: 'yes',
  color: '#248a72',
  coordinates: '',
}

const WEEK_DAY_OPTIONS = [
  { id: 'mon', label: 'Seg' },
  { id: 'tue', label: 'Ter' },
  { id: 'wed', label: 'Qua' },
  { id: 'thu', label: 'Qui' },
  { id: 'fri', label: 'Sex' },
  { id: 'sat', label: 'Sab' },
  { id: 'sun', label: 'Dom' },
]

const initialCategories = [
  { id: 'cat-pizzas', name: 'Pizzas', active: true },
  { id: 'cat-combos', name: 'Combos', active: true },
  { id: 'cat-bebidas', name: 'Bebidas', active: true },
  { id: 'cat-sobremesas', name: 'Sobremesas', active: false },
]

const initialProducts = [
  { id: 'prod-1', name: 'Pizza grande', category: 'Pizzas', price: 54.9, active: true, addonGroups: getDefaultAddonGroupTemplates({ category: 'Pizzas', name: 'Pizza grande' }) },
  { id: 'prod-2', name: 'Calzone', category: 'Pizzas', price: 38.9, active: true, addonGroups: getDefaultAddonGroupTemplates({ category: 'Pizzas', name: 'Calzone' }) },
  { id: 'prod-3', name: 'Combo familia', category: 'Combos', price: 89.9, active: true },
  { id: 'prod-4', name: 'Refrigerante 2L', category: 'Bebidas', price: 13.9, active: true },
  { id: 'prod-5', name: 'Brownie', category: 'Sobremesas', price: 15.9, active: false },
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
  { id: 'payments', name: 'Pagamento online', active: true, status: 'cartao e credito' },
]

const initialQrCodes = [
  { id: 'qr-1', table: 'Mesa 1', url: 'mesa-1', scans: 34 },
  { id: 'qr-2', table: 'Mesa 2', url: 'mesa-2', scans: 11 },
]

const blankProduct = {
  name: '',
  description: '',
  category: 'Pizzas',
  extraCategories: [],
  price: '',
  imageUrl: '',
  maxFlavors: '2',
  availableFrom: '18:00',
  availableTo: '23:30',
  availableDays: WEEK_DAY_OPTIONS.map((day) => day.id),
}

const blankImportProducts = {
  sourceCategory: '',
  productIds: [],
}

const blankFlavor = {
  name: '',
  price: '0,00',
  active: true,
}

const blankCategory = {
  name: '',
  imageUrl: '',
  active: true,
}

const blankCartItemForm = {
  lineId: '',
  productId: '',
  qty: '1',
  flavorIds: [],
  addonSelections: {},
  note: '',
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
  cost: '0,00',
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

const initialPilotSync = {
  enabled: false,
  autoSyncOrders: true,
  syncOnStatusChange: true,
  status: 'idle',
  storeId: '',
  storeName: '',
  lastCheckedAt: '',
  lastSyncedAt: '',
  message: 'Modo piloto ainda nao conectado.',
}

const initialStoreProfile = createEmptyStoreProfile()

const PRINTER_PAPER_OPTIONS = [
  { id: '58mm', label: 'Bobina 58mm', widthMm: 58 },
  { id: '80mm', label: 'Bobina 80mm', widthMm: 80 },
  { id: 'A4', label: 'Folha A4', widthMm: 210 },
]

const PRINTER_FONT_OPTIONS = [
  { id: 'mono', label: 'Monoespacada', family: '"Courier New", Consolas, monospace' },
  { id: 'system', label: 'Sistema', family: 'Arial, Helvetica, sans-serif' },
  { id: 'condensed', label: 'Compacta', family: '"Arial Narrow", Arial, sans-serif' },
]

const PRINTER_DENSITY_OPTIONS = [
  { id: 'compact', label: 'Compacta', lineHeight: 1.12 },
  { id: 'normal', label: 'Normal', lineHeight: 1.25 },
  { id: 'wide', label: 'Espacada', lineHeight: 1.38 },
]

const PRINTER_DARKNESS_OPTIONS = [
  { id: 'normal', label: 'Normal', level: 12 },
  { id: 'strong', label: 'Forte', level: 26 },
  { id: 'extra', label: 'Extra escuro', level: 52 },
  { id: 'maximum', label: 'Maximo', level: 78 },
]

const initialPrinterConfig = {
  connected: true,
  deviceName: 'POS-80 Cozinha',
  copies: 1,
  paper: '80mm',
  fontFamily: 'mono',
  fontSize: 12,
  marginMm: 3,
  density: 'normal',
  darkness: 'strong',
  darknessLevel: 24,
  cutPaper: true,
  showStoreHeader: true,
  showCustomerPhone: true,
  showFinancials: true,
  showNotes: true,
  printMode: 'browser',
  queue: [
    { id: 'job-1', label: 'Pedido #8335', type: 'Pedido', status: 'Pronto', createdAt: '18:45' },
    { id: 'job-2', label: 'Mapa de mesas', type: 'Relatorio', status: 'Pendente', createdAt: '18:40' },
  ],
}

const initialSecurity = {
  operator: 'Conta principal',
  email: 'seguranca@meucardapio.local',
  twoFactor: true,
  sessionMinutes: 45,
  lockOnIdle: true,
  lastChange: '16/04/2026 20:40',
}

const initialStoreUsers = []

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

function normalizeOrderPayment(payment) {
  if (payment === 'Pix') {
    return 'Cartao'
  }

  return ORDER_PAYMENT_OPTIONS.some((option) => option.id === payment) || payment === 'Mesa'
    ? payment
    : 'Cartao'
}

function inferOrderFulfillment(order = {}) {
  if (ORDER_FULFILLMENT_OPTIONS.some((option) => option.id === order.fulfillment)) {
    return order.fulfillment
  }

  if (order.channel === 'delivery') {
    return 'delivery'
  }

  if (
    order.payment === 'Mesa'
    || /^mesa/i.test(order.address || '')
    || /consumir no local/i.test(order.address || '')
    || order.source === 'Mesa'
    || order.source === 'Salao'
  ) {
    return 'dinein'
  }

  return 'pickup'
}

function resolveOrderSourceForFulfillment(fulfillment, currentSource = '') {
  if (fulfillment === 'delivery') {
    return ['WhatsApp', 'Instagram', 'iFood', 'Cardapio Digital'].includes(currentSource) ? currentSource : 'WhatsApp'
  }

  if (fulfillment === 'dinein') {
    return currentSource === 'Mesa' ? 'Mesa' : 'Salao'
  }

  return 'Balcao'
}

function normalizePostalCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 8)
}

function formatCepInput(value) {
  const digits = normalizePostalCode(value)

  if (digits.length <= 5) {
    return digits
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function splitCityAndState(value = '') {
  const [city = '', state = ''] = String(value)
    .split(/\s*-\s*/)
    .map((part) => part.trim())

  return { city, state }
}

function normalizeCoordinate(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function formatCoordinate(value) {
  const parsed = normalizeCoordinate(value)
  return parsed === null ? '' : parsed.toFixed(6)
}

function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getAddressCoordinates(address = {}) {
  const lat = normalizeCoordinate(address.lat ?? address.addressLat)
  const lng = normalizeCoordinate(address.lng ?? address.addressLng)

  if (lat === null || lng === null) {
    return null
  }

  return { lat, lng }
}

function resetDeliveryAddressVerification(address = {}) {
  return {
    ...address,
    lat: '',
    lng: '',
    mapLabel: '',
    deliveryZoneId: '',
    deliveryZoneName: '',
    deliveryFee: '0,00',
    deliveryAvailable: false,
    verifiedAt: '',
  }
}

function createOrderAddress(address = {}) {
  return {
    id: address.id || `addr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cep: address.cep || '',
    street: address.street || '',
    number: address.number || '',
    complement: address.complement || '',
    district: address.district || '',
    city: address.city || '',
    lat: address.lat || '',
    lng: address.lng || '',
    mapLabel: address.mapLabel || '',
    deliveryZoneId: address.deliveryZoneId || '',
    deliveryZoneName: address.deliveryZoneName || '',
    deliveryFee: address.deliveryFee || '0,00',
    deliveryAvailable: address.deliveryAvailable === true,
    verifiedAt: address.verifiedAt || '',
  }
}

function normalizeOrderAddress(address, index = 0) {
  return createOrderAddress({
    ...address,
    id: address?.id || `addr-${Date.now()}-${index}`,
  })
}

function formatMapCoordinateLabel(lat, lng) {
  const parsedLat = formatCoordinate(lat)
  const parsedLng = formatCoordinate(lng)

  if (!parsedLat || !parsedLng) {
    return 'Ponto no mapa'
  }

  return `Ponto no mapa (${parsedLat}, ${parsedLng})`
}

function formatOrderAddress(address) {
  if (!address) {
    return ''
  }

  const mainLine = [address.street, address.number].filter(Boolean).join(', ')
  const formatted = [
    mainLine,
    address.complement,
    address.district,
    address.city,
    address.cep,
  ].filter(Boolean).join(' - ')

  if (formatted) {
    return formatted
  }

  if (address.mapLabel) {
    return address.mapLabel
  }

  const coordinates = getAddressCoordinates(address)
  return coordinates ? formatMapCoordinateLabel(coordinates.lat, coordinates.lng) : ''
}

function parseCurrencyInput(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')

  return Number(normalized) || 0
}

function formatCurrencyInput(value) {
  return formatNumber(Number(value) || 0)
}

function formatCurrencyTypingInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')

  if (!digits) {
    return ''
  }

  return formatCurrencyInput(Number(digits) / 100)
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2).replace('.', ',')
}

function closeDeliveryPolygon(polygon = []) {
  const normalized = polygon
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null
      }

      const lng = normalizeCoordinate(point[0])
      const lat = normalizeCoordinate(point[1])
      return lng === null || lat === null ? null : [lng, lat]
    })
    .filter(Boolean)

  if (normalized.length === 0) {
    return []
  }

  const first = normalized[0]
  const last = normalized[normalized.length - 1]

  if (first[0] !== last[0] || first[1] !== last[1]) {
    normalized.push([...first])
  }

  return normalized
}

function getDeliveryPolygonVertices(polygon = []) {
  const normalized = polygon
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null
      }

      const lng = normalizeCoordinate(point[0])
      const lat = normalizeCoordinate(point[1])
      return lng === null || lat === null ? null : [lng, lat]
    })
    .filter(Boolean)

  if (normalized.length < 2) {
    return normalized
  }

  const first = normalized[0]
  const last = normalized[normalized.length - 1]

  if (first[0] === last[0] && first[1] === last[1]) {
    return normalized.slice(0, -1)
  }

  return normalized
}

function normalizeDeliveryZone(zone = {}, index = 0) {
  return {
    id: zone.id || `zone-${Date.now()}-${index}`,
    name: zone.name || `Zona ${index + 1}`,
    fee: formatCurrencyInput(parseCurrencyInput(zone.fee)),
    active: zone.active !== false,
    color: zone.color || DELIVERY_ZONE_COLORS[index % DELIVERY_ZONE_COLORS.length],
    polygon: closeDeliveryPolygon(zone.polygon),
  }
}

function deliveryZoneToForm(zone = {}) {
  return {
    name: zone.name || '',
    fee: zone.fee || '0,00',
    active: zone.active === false ? 'no' : 'yes',
    color: zone.color || DELIVERY_ZONE_COLORS[0],
    coordinates: formatDeliveryZoneCoordinates(zone.polygon),
  }
}

function formatDeliveryZoneCoordinates(polygon = []) {
  return getDeliveryPolygonVertices(polygon)
    .map(([lng, lat]) => `${formatCoordinate(lat)}, ${formatCoordinate(lng)}`)
    .join('\n')
}

function parseDeliveryZoneCoordinates(value = '') {
  const polygon = String(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [latValue, lngValue] = line.split(/[,;]/).map((part) => part.trim())
      const lat = normalizeCoordinate(latValue)
      const lng = normalizeCoordinate(lngValue)
      return lat === null || lng === null ? null : [lng, lat]
    })

  if (polygon.some((point) => !point)) {
    return null
  }

  return closeDeliveryPolygon(polygon)
}

function getDeliveryZoneDraftPolygon(editorPoints = [], coordinates = '') {
  if (editorPoints.length >= 3) {
    return closeDeliveryPolygon(editorPoints)
  }

  return parseDeliveryZoneCoordinates(coordinates)
}

function getDeliveryZoneEditorOutline(editorPoints = []) {
  const vertices = getDeliveryPolygonVertices(editorPoints)

  if (vertices.length >= 3) {
    return closeDeliveryPolygon(vertices)
  }

  return vertices
}

function isPointInDeliveryPolygon(lat, lng, polygon = []) {
  if (polygon.length < 4) {
    return false
  }

  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi)

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function findDeliveryZoneForCoordinates(lat, lng, zones = []) {
  return zones.find((zone) => zone.active !== false && isPointInDeliveryPolygon(lat, lng, zone.polygon))
}

function getDeliveryZoneCentroid(zone = {}) {
  const points = getDeliveryPolygonVertices(zone.polygon)

  if (points.length === 0) {
    return null
  }

  const sum = points.reduce((acc, [lng, lat]) => ({
    lat: acc.lat + lat,
    lng: acc.lng + lng,
  }), { lat: 0, lng: 0 })

  return {
    lat: sum.lat / points.length,
    lng: sum.lng / points.length,
  }
}

function findDeliveryZoneByDistrict(address = {}, zones = []) {
  const district = normalizeSearchText(address.district)

  if (!district) {
    return null
  }

  return zones.find((zone) => {
    if (zone.active === false) {
      return false
    }

    const zoneName = normalizeSearchText(zone.name)
    return zoneName.includes(district) || district.includes(zoneName)
  }) || null
}

function getFallbackGeocodeForAddress(address = {}, zones = []) {
  const zone = findDeliveryZoneByDistrict(address, zones)
  const coordinates = zone ? getDeliveryZoneCentroid(zone) : null

  if (!zone || !coordinates) {
    return null
  }

  return {
    lat: String(coordinates.lat),
    lon: String(coordinates.lng),
    display_name: `Ponto aproximado pela zona ${zone.name}`,
    fallbackZone: zone,
  }
}

function getDeliveryAddressSummary(address = {}) {
  if (address.deliveryAvailable && address.deliveryZoneName) {
    return `${address.deliveryZoneName} - taxa ${address.deliveryFee || '0,00'}`
  }

  if (address.mapLabel) {
    return address.mapLabel
  }

  if (address.verifiedAt) {
    return 'Fora das zonas de entrega'
  }

  return 'Endereco ainda nao verificado no mapa'
}

function getPointLabelFromCoordinates(lat, lng, prefix = 'Ponto no mapa') {
  const parsedLat = formatCoordinate(lat)
  const parsedLng = formatCoordinate(lng)

  if (!parsedLat || !parsedLng) {
    return prefix
  }

  return `${prefix} (${parsedLat}, ${parsedLng})`
}

function getCurrentBrowserPosition(options = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('geolocation-unavailable'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
      ...options,
    })
  })
}

function buildOsmEmbedUrl(coordinates, zoom = 16) {
  const lat = normalizeCoordinate(coordinates?.lat) ?? DEFAULT_MAP_COORDINATES.lat
  const lng = normalizeCoordinate(coordinates?.lng) ?? DEFAULT_MAP_COORDINATES.lng
  const delta = zoom >= 16 ? 0.004 : 0.02
  const params = new URLSearchParams({
    bbox: [
      (lng - delta).toFixed(6),
      (lat - delta).toFixed(6),
      (lng + delta).toFixed(6),
      (lat + delta).toFixed(6),
    ].join(','),
    layer: 'mapnik',
    marker: `${lat.toFixed(6)},${lng.toFixed(6)}`,
  })

  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}

function buildOsmViewUrl(coordinates) {
  const lat = normalizeCoordinate(coordinates?.lat) ?? DEFAULT_MAP_COORDINATES.lat
  const lng = normalizeCoordinate(coordinates?.lng) ?? DEFAULT_MAP_COORDINATES.lng
  const params = new URLSearchParams({
    mlat: lat.toFixed(6),
    mlon: lng.toFixed(6),
    zoom: '16',
  })

  return `https://www.openstreetmap.org/?${params.toString()}`
}

function latLngToWorldPoint(lat, lng, zoom) {
  const boundedLat = Math.max(Math.min(normalizeCoordinate(lat) ?? DEFAULT_MAP_COORDINATES.lat, 85.05112878), -85.05112878)
  const boundedLng = normalizeCoordinate(lng) ?? DEFAULT_MAP_COORDINATES.lng
  const scale = OSM_TILE_SIZE * (2 ** zoom)
  const sinLat = Math.sin((boundedLat * Math.PI) / 180)

  return {
    x: ((boundedLng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  }
}

function worldPointToLatLng(x, y, zoom) {
  const scale = OSM_TILE_SIZE * (2 ** zoom)
  const lng = (x / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / scale
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))

  return { lat, lng }
}

function normalizeWorldX(x, zoom) {
  const scale = OSM_TILE_SIZE * (2 ** zoom)
  return ((x % scale) + scale) % scale
}

function clampMapCenterWorld(centerWorld, mapSize, zoom) {
  const scale = OSM_TILE_SIZE * (2 ** zoom)
  const halfHeight = mapSize.height / 2
  const minY = halfHeight
  const maxY = Math.max(halfHeight, scale - halfHeight)

  return {
    x: normalizeWorldX(centerWorld.x, zoom),
    y: Math.min(maxY, Math.max(minY, centerWorld.y)),
  }
}

function getPointPositionOnMap(point, topLeft, mapSize, zoom) {
  const worldPoint = latLngToWorldPoint(point.lat, point.lng, zoom)

  return {
    x: worldPoint.x - topLeft.x,
    y: worldPoint.y - topLeft.y,
  }
}

function getPolygonSvgPoints(polygon = [], topLeft, mapSize, zoom) {
  return polygon
    .map(([lng, lat]) => getPointPositionOnMap({ lat, lng }, topLeft, mapSize, zoom))
    .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
    .join(' ')
}

function getStoreCoordinates(store = {}) {
  return getAddressCoordinates(store) || DEFAULT_MAP_COORDINATES
}

function getDeliveryMapCenter({ storeProfile, routes = [], zones = [], address = null } = {}) {
  const addressCoordinates = address ? getAddressCoordinates(address) : null
  const routeCoordinates = routes.map(getAddressCoordinates).find(Boolean)
  const zoneCoordinates = getDeliveryZoneCentroid(zones.find((zone) => zone.polygon?.length >= 4) || {})

  return addressCoordinates || routeCoordinates || zoneCoordinates || getStoreCoordinates(storeProfile)
}

function buildNominatimSearchUrls(address = {}) {
  const { city, state } = splitCityAndState(address.city)
  const postalCode = normalizePostalCode(address.cep)
  const streetLine = [address.number, address.street].filter(Boolean).join(' ')
  const urls = []
  const structuredParams = new URLSearchParams({
    format: 'jsonv2',
    limit: '3',
    addressdetails: '1',
    countrycodes: 'br',
    country: 'Brasil',
  })

  if (streetLine) {
    structuredParams.set('street', streetLine)
  }

  if (city) {
    structuredParams.set('city', city)
  }

  if (state) {
    structuredParams.set('state', state)
  }

  if (postalCode.length === 8) {
    structuredParams.set('postalcode', postalCode)
  }

  urls.push(`https://nominatim.openstreetmap.org/search?${structuredParams.toString()}`)

  const queryWithDistrict = [
    address.street,
    address.number,
    address.district,
    city || address.city,
    state,
    postalCode,
    'Brasil',
  ].filter(Boolean).join(', ')
  const queryWithoutDistrict = [
    address.street,
    address.number,
    city || address.city,
    state,
    postalCode,
    'Brasil',
  ].filter(Boolean).join(', ')

  ;[queryWithDistrict, queryWithoutDistrict].forEach((query) => {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '3',
      addressdetails: '1',
      countrycodes: 'br',
    })
    urls.push(`https://nominatim.openstreetmap.org/search?${params.toString()}`)
  })

  return [...new Set(urls)]
}

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timer)
  }
}

function normalizeOrderAdjustmentFields(orderLike = {}) {
  const hasNewFields = ['discountType', 'discountValue', 'surchargeType', 'surchargeValue']
    .some((key) => Object.prototype.hasOwnProperty.call(orderLike, key))

  if (hasNewFields) {
    return {
      discountType: orderLike.discountType || 'fixed',
      discountValue: orderLike.discountValue || '',
      surchargeType: orderLike.surchargeType || 'fixed',
      surchargeValue: orderLike.surchargeValue || '',
    }
  }

  const legacyMode = orderLike.adjustmentMode || 'discount'
  const legacyType = orderLike.adjustmentType || 'fixed'
  const legacyValue = orderLike.adjustmentValue || ''

  return {
    discountType: legacyMode === 'discount' ? legacyType : 'fixed',
    discountValue: legacyMode === 'discount' ? legacyValue : '',
    surchargeType: legacyMode === 'surcharge' ? legacyType : 'fixed',
    surchargeValue: legacyMode === 'surcharge' ? legacyValue : '',
  }
}

function getOrderDiscountAmount(subtotal, orderLike = {}) {
  const adjustments = normalizeOrderAdjustmentFields(orderLike)
  const discountValue = parseCurrencyInput(adjustments.discountValue)

  if (discountValue <= 0) {
    return 0
  }

  const rawAmount = adjustments.discountType === 'percent'
    ? subtotal * (Math.min(discountValue, 100) / 100)
    : discountValue

  return Math.min(rawAmount, subtotal)
}

function getOrderSurchargeAmount(subtotal, orderLike = {}) {
  const adjustments = normalizeOrderAdjustmentFields(orderLike)
  const surchargeValue = parseCurrencyInput(adjustments.surchargeValue)

  if (surchargeValue <= 0) {
    return 0
  }

  return adjustments.surchargeType === 'percent'
    ? subtotal * (surchargeValue / 100)
    : surchargeValue
}

function getOrderFinancialBreakdown(subtotal, orderLike = {}) {
  const deliveryFee = inferOrderFulfillment(orderLike) === 'delivery' ? parseCurrencyInput(orderLike.deliveryFee) : 0
  const discountAmount = getOrderDiscountAmount(subtotal, orderLike)
  const surchargeAmount = getOrderSurchargeAmount(subtotal, orderLike)

  return {
    subtotal,
    deliveryFee,
    discountAmount,
    surchargeAmount,
    total: Math.max(0, subtotal + deliveryFee + surchargeAmount - discountAmount),
  }
}

function normalizeOrderRecord(order = {}) {
  const adjustments = normalizeOrderAdjustmentFields(order)
  const fulfillment = inferOrderFulfillment(order)
  const deliveryFee = fulfillment === 'delivery' ? formatCurrencyInput(parseCurrencyInput(order.deliveryFee)) : '0,00'
  const parsedSubtotal = parseCurrencyInput(order.subtotal)
  const hasStoredSubtotal = String(order.subtotal ?? '').trim() !== ''
  const rawTotal = parseCurrencyInput(order.total)
  const fallbackSubtotal = Math.max(rawTotal - (fulfillment === 'delivery' ? parseCurrencyInput(deliveryFee) : 0), 0)
  const subtotal = hasStoredSubtotal && parsedSubtotal > 0 ? parsedSubtotal : fallbackSubtotal
  const normalizedItems = Array.isArray(order.items)
    ? order.items
    : String(order.items || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  const financialBreakdown = getOrderFinancialBreakdown(subtotal, {
    fulfillment,
    deliveryFee,
    ...adjustments,
  })
  const discountAmount = order.discountAmount || formatCurrencyInput(financialBreakdown.discountAmount)
  const surchargeAmount = order.surchargeAmount || formatCurrencyInput(financialBreakdown.surchargeAmount)

  return {
    ...order,
    channel: fulfillment === 'delivery' ? 'delivery' : 'pickup',
    source: order.source || (order.payment === 'Mesa' ? 'Mesa' : resolveOrderSourceForFulfillment(fulfillment)),
    total: financialBreakdown.total,
    items: normalizedItems,
    payment: normalizeOrderPayment(order.payment),
    fulfillment,
    subtotal,
    deliveryFee,
    addressId: order.addressId || '',
    addressLat: order.addressLat || order.lat || '',
    addressLng: order.addressLng || order.lng || '',
    deliveryZoneId: order.deliveryZoneId || '',
    deliveryZoneName: order.deliveryZoneName || '',
    document: order.document || '',
    discountType: adjustments.discountType,
    discountValue: adjustments.discountValue,
    discountAmount,
    surchargeType: adjustments.surchargeType,
    surchargeValue: adjustments.surchargeValue,
    surchargeAmount,
  }
}

function getOrderFulfillmentLabel(fulfillment) {
  if (fulfillment === 'delivery') {
    return 'Entrega'
  }

  if (fulfillment === 'dinein') {
    return 'Consumir no local'
  }

  return 'Retirar no local'
}

function getOrderFulfillmentMeta(order = {}) {
  const fulfillment = inferOrderFulfillment(order)

  if (fulfillment === 'delivery') {
    return { fulfillment, label: 'Delivery', icon: 'bike' }
  }

  if (fulfillment === 'dinein') {
    return { fulfillment, label: 'Salao', icon: 'table' }
  }

  return { fulfillment, label: 'Balcao', icon: 'store' }
}

function productToForm(product) {
  return {
    name: product.name,
    description: product.description || '',
    category: product.category,
    extraCategories: Array.isArray(product.extraCategories) ? product.extraCategories : [],
    price: formatCurrencyInput(product.price),
    imageUrl: product.imageUrl || '',
    maxFlavors: String(product.maxFlavors ?? 2),
    availableFrom: product.availableFrom || '18:00',
    availableTo: product.availableTo || '23:30',
    availableDays: Array.isArray(product.availableDays) ? product.availableDays : WEEK_DAY_OPTIONS.map((day) => day.id),
  }
}

function flavorToForm(flavor) {
  return {
    name: flavor?.name || '',
    price: formatCurrencyInput(flavor?.price ?? 0),
    active: flavor?.active !== false,
  }
}

function categoryToForm(category) {
  return {
    name: category.name,
    imageUrl: category.imageUrl || '',
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

function getAllWeekDays() {
  return WEEK_DAY_OPTIONS.map((day) => day.id)
}

function isComboProduct(product) {
  return `${product?.category || ''} ${product?.name || ''}`.toLowerCase().includes('combo')
}

function getFlavorEntityLabel(product, plural = false) {
  if (isComboProduct(product)) {
    return plural ? 'subsabores' : 'subsabor'
  }

  return plural ? 'sabores' : 'sabor'
}

function createProductFlavor(name = 'Novo sabor', price = 0, active = true, id = `flavor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`) {
  return {
    id,
    name,
    price,
    active,
  }
}

function createProductAddonOption(name = 'Novo adicional', price = 0, active = true, id = `addon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`) {
  return {
    id,
    name,
    price,
    active,
  }
}

function createProductAddonGroup({
  id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name = 'Adicionais',
  required = false,
  minSelect = 0,
  maxSelect = 1,
  options = [],
} = {}) {
  return {
    id,
    name,
    required,
    minSelect,
    maxSelect,
    options,
  }
}

function getDefaultMaxFlavors(product) {
  const fingerprint = `${product.category} ${product.name}`.toLowerCase()

  if (fingerprint.includes('refrigerante') || fingerprint.includes('bebida') || fingerprint.includes('suco')) {
    return 1
  }

  if (fingerprint.includes('combo')) {
    return 2
  }

  if (fingerprint.includes('gigante') || fingerprint.includes('40')) {
    return 3
  }

  return 2
}

function getDefaultFlavorTemplates(product) {
  const fingerprint = `${product.category} ${product.name}`.toLowerCase()

  if (fingerprint.includes('combo')) {
    return [
      createProductFlavor('Pizza familia', 0, true, 'flavor-combo-1'),
      createProductFlavor('Calzone recheado', 4, true, 'flavor-combo-2'),
      createProductFlavor('Refrigerante 2L', 0, false, 'flavor-combo-3'),
    ]
  }

  if (fingerprint.includes('bebida') || fingerprint.includes('refrigerante') || fingerprint.includes('suco')) {
    return [
      createProductFlavor('Bem gelado', 0, true, 'flavor-drink-1'),
      createProductFlavor('Sem gelo', 0, true, 'flavor-drink-2'),
      createProductFlavor('Copo extra', 1.5, false, 'flavor-drink-3'),
    ]
  }

  if (fingerprint.includes('doce') || fingerprint.includes('brownie') || fingerprint.includes('sobremesa')) {
    return [
      createProductFlavor('Brigadeiro', 0, true, 'flavor-dessert-1'),
      createProductFlavor('Morango', 3, true, 'flavor-dessert-2'),
      createProductFlavor('Leite ninho', 2.5, false, 'flavor-dessert-3'),
    ]
  }

  if (fingerprint.includes('calzone')) {
    return [
      createProductFlavor('Frango com catupiry', 0, true, 'flavor-pizza-1'),
      createProductFlavor('Calabresa acebolada', 0, true, 'flavor-pizza-2'),
      createProductFlavor('Portuguesa', 2, false, 'flavor-pizza-3'),
    ]
  }

  if (fingerprint.includes('grande')) {
    return [
      createProductFlavor('Mussarela especial', 0, true, 'flavor-pizza-4'),
      createProductFlavor('Bacon crocante', 0, true, 'flavor-pizza-5'),
      createProductFlavor('Pepperoni', 4, true, 'flavor-pizza-6'),
    ]
  }

  return [
    createProductFlavor('Atum', 0, true, 'flavor-default-1'),
    createProductFlavor('Bacon', 0, true, 'flavor-default-2'),
    createProductFlavor('Quatro queijos', 3.5, false, 'flavor-default-3'),
  ]
}

function isPizzaStyleProduct(product) {
  const fingerprint = `${product?.category || ''} ${product?.name || ''}`.toLowerCase()

  return ['pizza', 'grande', 'familia', 'gigante', 'tradicional'].some((term) => fingerprint.includes(term))
}

function getDefaultAddonGroupTemplates(product) {
  if (!isPizzaStyleProduct(product)) {
    return []
  }

  return [
    createProductAddonGroup({
      id: 'addon-group-extras',
      name: 'Adicionais',
      required: false,
      minSelect: 0,
      maxSelect: 2,
      options: [
        createProductAddonOption('Cheddar', 6, true, 'addon-extra-cheddar'),
        createProductAddonOption('Catupiry', 10, true, 'addon-extra-catupiry'),
        createProductAddonOption('Bacon', 8, true, 'addon-extra-bacon'),
        createProductAddonOption('Milho', 5, true, 'addon-extra-milho'),
        createProductAddonOption('Cebola', 5, true, 'addon-extra-cebola'),
      ],
    }),
    createProductAddonGroup({
      id: 'addon-group-border',
      name: 'Borda',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        createProductAddonOption('Borda cheddar', 12, true, 'addon-border-cheddar'),
        createProductAddonOption('Borda catupiry', 14, true, 'addon-border-catupiry'),
        createProductAddonOption('Borda cream cheese', 14, true, 'addon-border-cream-cheese'),
        createProductAddonOption('Borda chocolate', 13, true, 'addon-border-chocolate'),
      ],
    }),
  ]
}

function normalizeProductFlavor(flavor, index = 0) {
  return createProductFlavor(
    flavor?.name || `Sabor ${index + 1}`,
    Number(flavor?.price) || 0,
    flavor?.active !== false,
    flavor?.id || `flavor-${Date.now()}-${index}`,
  )
}

function normalizeProductAddonOption(option, index = 0) {
  return createProductAddonOption(
    option?.name || `Adicional ${index + 1}`,
    Number(option?.price) || 0,
    option?.active !== false,
    option?.id || `addon-${Date.now()}-${index}`,
  )
}

function normalizeProductAddonGroup(group, index = 0) {
  const normalizedOptions = Array.isArray(group?.options)
    ? group.options.map(normalizeProductAddonOption)
    : []
  const required = group?.required === true
  const minSelect = Math.max(required ? 1 : 0, Number(group?.minSelect) || 0)
  const maxSelect = Math.max(1, Number(group?.maxSelect) || 1)

  return createProductAddonGroup({
    id: group?.id || `group-${Date.now()}-${index}`,
    name: group?.name || `Grupo ${index + 1}`,
    required,
    minSelect: Math.min(minSelect, maxSelect),
    maxSelect,
    options: normalizedOptions,
  })
}

function normalizeProduct(product, fallbackCategory = 'Pizzas') {
  const defaultDays = getAllWeekDays()
  const category = product?.category || fallbackCategory
  const extraCategories = Array.isArray(product?.extraCategories)
    ? [...new Set(product.extraCategories.filter((extraCategory) => extraCategory && extraCategory !== category))]
    : []
  const displayCategories = [category, ...extraCategories]
  const exhaustedCategories = Array.isArray(product?.exhaustedCategories)
    ? [...new Set(product.exhaustedCategories.filter((exhaustedCategory) => displayCategories.includes(exhaustedCategory)))]
    : product?.active === false ? displayCategories : []
  const initialFlavors = Array.isArray(product?.flavors)
    ? product.flavors.map(normalizeProductFlavor)
    : getDefaultFlavorTemplates(product ?? {})
  const initialAddonGroups = Array.isArray(product?.addonGroups)
    ? product.addonGroups.map(normalizeProductAddonGroup)
    : []

  return {
    id: product?.id,
    name: product?.name || 'Produto sem nome',
    description: product?.description || '',
    imageUrl: product?.imageUrl || '',
    category,
    extraCategories,
    exhaustedCategories,
    price: Number(product?.price) || 0,
    active: displayCategories.some((displayCategory) => !exhaustedCategories.includes(displayCategory)),
    maxFlavors: Math.max(1, Number(product?.maxFlavors) || getDefaultMaxFlavors(product ?? {})),
    availableFrom: product?.availableFrom || '18:00',
    availableTo: product?.availableTo || '23:30',
    availableDays: Array.isArray(product?.availableDays) && product.availableDays.length > 0
      ? product.availableDays.filter((day) => defaultDays.includes(day))
      : defaultDays,
    flavors: initialFlavors,
    addonGroups: initialAddonGroups,
  }
}

function getProductDisplayCategories(product) {
  return [product.category, ...(Array.isArray(product.extraCategories) ? product.extraCategories : [])]
    .filter(Boolean)
    .filter((category, index, list) => list.indexOf(category) === index)
}

function productAppearsInCategory(product, categoryName) {
  return getProductDisplayCategories(product).includes(categoryName)
}

function isProductExhaustedInCategory(product, categoryName) {
  return Array.isArray(product?.exhaustedCategories) && product.exhaustedCategories.includes(categoryName)
}

function isProductAvailableInCategory(product, categoryName) {
  return productAppearsInCategory(product, categoryName) && !isProductExhaustedInCategory(product, categoryName)
}

function isProductAvailable(product) {
  return getProductDisplayCategories(product).some((categoryName) => isProductAvailableInCategory(product, categoryName))
}

function getActiveProductFlavors(product) {
  return Array.isArray(product?.flavors)
    ? product.flavors.filter((flavor) => flavor.active !== false)
    : []
}

function getActiveProductAddonGroups(product) {
  return Array.isArray(product?.addonGroups)
    ? product.addonGroups
      .map((group) => ({
        ...group,
        options: Array.isArray(group.options) ? group.options.filter((option) => option.active !== false) : [],
      }))
      .filter((group) => group.options.length > 0)
    : []
}

function normalizeCartAddonSelections(product, addonSelections = {}) {
  const normalizedSelections = {}

  getActiveProductAddonGroups(product).forEach((group) => {
    const selectedIds = Array.isArray(addonSelections[group.id]) ? addonSelections[group.id] : []
    const validIds = selectedIds
      .filter((optionId) => group.options.some((option) => option.id === optionId))
      .slice(0, Math.max(1, Number(group.maxSelect) || 1))

    if (validIds.length > 0) {
      normalizedSelections[group.id] = validIds
    }
  })

  return normalizedSelections
}

function getSelectedCartAddonEntries(product, addonSelections = {}) {
  const normalizedSelections = normalizeCartAddonSelections(product, addonSelections)

  return getActiveProductAddonGroups(product)
    .map((group) => {
      const selectedIds = normalizedSelections[group.id] || []
      const optionById = new Map(group.options.map((option) => [option.id, option]))
      const selectedOptions = selectedIds.map((optionId) => optionById.get(optionId)).filter(Boolean)

      if (selectedOptions.length === 0) {
        return null
      }

      const optionCounts = Array.from(selectedOptions.reduce((counts, option) => {
        const current = counts.get(option.id) || { id: option.id, name: option.name, price: Number(option.price) || 0, count: 0 }
        counts.set(option.id, { ...current, count: current.count + 1 })
        return counts
      }, new Map()).values())

      return {
        groupId: group.id,
        groupName: group.name,
        optionIds: selectedIds,
        optionNames: selectedOptions.map((option) => option.name),
        optionCounts,
        label: formatRepeatedCartNames(selectedOptions.map((option) => option.name)),
      }
    })
    .filter(Boolean)
}

function getCartConfigurationSteps(product) {
  const steps = []
  const activeFlavors = getActiveProductFlavors(product)

  if (activeFlavors.length > 0) {
    steps.push({
      id: 'step-flavors',
      type: 'flavors',
      name: getFlavorEntityLabel(product, true),
      title: isComboProduct(product) ? 'Escolha os subsabores' : 'Escolha os sabores',
      required: true,
      minSelect: 1,
      maxSelect: Math.max(1, Number(product?.maxFlavors) || 1),
      options: activeFlavors,
    })
  }

  getActiveProductAddonGroups(product).forEach((group) => {
    steps.push({
      id: group.id,
      type: 'addons',
      name: group.name,
      title: group.name,
      required: group.required === true,
      minSelect: Math.max(group.required ? 1 : 0, Number(group.minSelect) || 0),
      maxSelect: Math.max(1, Number(group.maxSelect) || 1),
      options: group.options,
    })
  })

  return steps
}

function getCartStepSelectedIds(cartForm, step) {
  if (!step) {
    return []
  }

  if (step.type === 'flavors') {
    return Array.isArray(cartForm?.flavorIds) ? cartForm.flavorIds : []
  }

  return Array.isArray(cartForm?.addonSelections?.[step.id]) ? cartForm.addonSelections[step.id] : []
}

function isCartStepSelectionValid(step, cartForm) {
  if (!step) {
    return true
  }

  const selectedCount = getCartStepSelectedIds(cartForm, step).length
  const minSelect = Math.max(step.required ? 1 : 0, Number(step.minSelect) || 0)
  const maxSelect = Math.max(1, Number(step.maxSelect) || 1)

  return selectedCount >= minSelect && selectedCount <= maxSelect
}

function getSelectedCartFlavorNames(product, flavorIds = []) {
  const activeFlavorById = new Map(getActiveProductFlavors(product).map((flavor) => [flavor.id, flavor]))

  return (Array.isArray(flavorIds) ? flavorIds : [])
    .map((flavorId) => activeFlavorById.get(flavorId)?.name || '')
    .filter(Boolean)
}

function formatRepeatedCartNames(names = []) {
  const counts = new Map()

  names.forEach((name) => {
    counts.set(name, (counts.get(name) || 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${count}x ${name}` : name))
    .join(', ')
}

function getCartItemFlavorLabel(product, flavorIds = []) {
  return formatRepeatedCartNames(getSelectedCartFlavorNames(product, flavorIds))
}

function getCartItemUnitPrice(product, flavorIds = [], addonSelections = {}) {
  const activeFlavorById = new Map(getActiveProductFlavors(product).map((flavor) => [flavor.id, flavor]))
  const flavorExtras = (Array.isArray(flavorIds) ? flavorIds : [])
    .reduce((sum, flavorId) => sum + (Number(activeFlavorById.get(flavorId)?.price) || 0), 0)
  const addonExtras = getSelectedCartAddonEntries(product, addonSelections)
    .reduce((sum, entry) => sum + entry.optionCounts.reduce((groupSum, option) => groupSum + (option.price * option.count), 0), 0)

  return (Number(product?.price) || 0) + flavorExtras + addonExtras
}

function createOrderCartLine(product, { lineId = `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, qty = 1, flavorIds = [], addonSelections = {}, note = '' } = {}) {
  const activeFlavorIds = new Set(getActiveProductFlavors(product).map((flavor) => flavor.id))
  const maxFlavors = Math.max(1, Number(product?.maxFlavors) || 1)
  const selectedFlavorIds = (Array.isArray(flavorIds) ? flavorIds : [])
    .filter((flavorId) => activeFlavorIds.has(flavorId))
  const normalizedFlavorIds = selectedFlavorIds.slice(0, maxFlavors)
  const flavorNames = getSelectedCartFlavorNames(product, normalizedFlavorIds)
  const normalizedAddonSelections = normalizeCartAddonSelections(product, addonSelections)
  const addonEntries = getSelectedCartAddonEntries(product, normalizedAddonSelections)

  return {
    id: lineId,
    productId: product.id,
    name: product.name,
    category: product.category,
    qty: Math.max(1, Number(qty) || 1),
    basePrice: Number(product.price) || 0,
    price: getCartItemUnitPrice(product, normalizedFlavorIds, normalizedAddonSelections),
    flavorIds: normalizedFlavorIds,
    flavorNames,
    flavorLabel: formatRepeatedCartNames(flavorNames),
    addonSelections: normalizedAddonSelections,
    addonEntries,
    maxFlavors: Math.max(1, Number(product.maxFlavors) || 1),
    note: String(note || '').trim(),
  }
}

function normalizeStoredOrderCartItem(item, productList = []) {
  const lineId = item?.id || `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const productId = item?.productId || item?.id || ''
  const product = productList.find((current) => current.id === productId)

  if (product) {
    return createOrderCartLine(product, {
      lineId,
      qty: Number(item?.qty) || 1,
      flavorIds: Array.isArray(item?.flavorIds) ? item.flavorIds : [],
      addonSelections: item?.addonSelections || {},
      note: item?.note || '',
    })
  }

  const flavorNames = Array.isArray(item?.flavorNames) ? item.flavorNames.filter(Boolean) : []
  const unitPrice = Number(item?.price ?? item?.basePrice) || 0
  const addonEntries = Array.isArray(item?.addonEntries) ? item.addonEntries.filter(Boolean) : []

  return {
    id: lineId,
    productId,
    name: item?.name || 'Item do pedido',
    category: item?.category || '',
    qty: Math.max(1, Number(item?.qty) || 1),
    basePrice: Number(item?.basePrice ?? unitPrice) || 0,
    price: unitPrice,
    flavorIds: Array.isArray(item?.flavorIds) ? item.flavorIds : [],
    flavorNames,
    flavorLabel: item?.flavorLabel || flavorNames.join(', '),
    addonSelections: item?.addonSelections || {},
    addonEntries,
    maxFlavors: Math.max(1, Number(item?.maxFlavors) || 1),
    note: String(item?.note || '').trim(),
  }
}

function inferOrderCartSelectionsFromReceiptItem(product, receiptItem = {}) {
  const details = Array.isArray(receiptItem.details)
    ? receiptItem.details.map((detail) => String(detail || '').trim()).filter(Boolean)
    : []
  const normalizedDetails = details.map(normalizeSearchText)
  const noteDetail = details.find((detail) => /^obs(?:ervacao)?\s*:/i.test(detail))
  const flavorIds = getActiveProductFlavors(product)
    .filter((flavor) => normalizedDetails.includes(normalizeSearchText(flavor.name)))
    .map((flavor) => flavor.id)
    .slice(0, Math.max(1, Number(product?.maxFlavors) || 1))
  const addonSelections = {}

  getActiveProductAddonGroups(product).forEach((group) => {
    const optionIds = group.options
      .filter((option) => normalizedDetails.includes(normalizeSearchText(option.name)))
      .map((option) => option.id)
      .slice(0, Math.max(1, Number(group.maxSelect) || 1))

    if (optionIds.length > 0) {
      addonSelections[group.id] = optionIds
    }
  })

  return {
    flavorIds,
    addonSelections,
    note: noteDetail ? noteDetail.replace(/^obs(?:ervacao)?\s*:\s*/i, '').trim() : '',
  }
}

function orderToCartItems(order = {}, productList = []) {
  const normalizedOrder = normalizeOrderRecord(order)
  const storedCartItems = Array.isArray(normalizedOrder.cartItems)
    ? normalizedOrder.cartItems
    : []

  if (storedCartItems.length > 0) {
    return storedCartItems.map((item) => normalizeStoredOrderCartItem(item, productList))
  }

  const receiptItems = getReceiptItems(normalizedOrder)
  const totalQuantity = receiptItems.reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0) || 1
  const fallbackUnitPrice = normalizedOrder.subtotal > 0 ? normalizedOrder.subtotal / totalQuantity : 0

  return receiptItems.map((item, index) => {
    const qty = Math.max(1, Number(item.qty) || 1)
    const matchedProduct = productList.find((product) => normalizeSearchText(product.name) === normalizeSearchText(item.name))
    const inferredSelections = matchedProduct ? inferOrderCartSelectionsFromReceiptItem(matchedProduct, item) : {}
    const lineTotal = item.price === null || item.price === undefined
      ? ((matchedProduct ? Number(matchedProduct.price) || 0 : fallbackUnitPrice) * qty)
      : Number(item.price) || 0

    return normalizeStoredOrderCartItem({
      id: `cart-${normalizedOrder.id}-${index + 1}`,
      productId: matchedProduct?.id || '',
      name: item.name || matchedProduct?.name || 'Item do pedido',
      category: matchedProduct?.category || '',
      qty,
      basePrice: qty > 0 ? lineTotal / qty : lineTotal,
      price: qty > 0 ? lineTotal / qty : lineTotal,
      flavorIds: inferredSelections.flavorIds || [],
      addonSelections: inferredSelections.addonSelections || {},
      flavorNames: matchedProduct ? [] : Array.isArray(item.details) ? item.details.filter(Boolean) : [],
      flavorLabel: matchedProduct ? '' : Array.isArray(item.details) ? item.details.filter(Boolean).join(', ') : '',
      note: item.note || inferredSelections.note || '',
    }, productList)
  })
}

function orderToPosDraft(order = {}) {
  const normalizedOrder = normalizeOrderRecord(order)
  const editableNote = String(normalizedOrder.note || '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => !/^CPF\/CNPJ:/i.test(part))
    .join(' | ')

  return {
    ...blankOrder,
    customer: normalizedOrder.customer || '',
    phone: normalizedOrder.phone || '',
    channel: normalizedOrder.fulfillment === 'delivery' ? 'delivery' : 'pickup',
    fulfillment: normalizedOrder.fulfillment,
    total: formatCurrencyInput(normalizedOrder.total),
    payment: normalizedOrder.payment || blankOrder.payment,
    items: normalizedOrder.items,
    note: editableNote,
    addressId: normalizedOrder.addressId || '',
    addressLat: normalizedOrder.addressLat || '',
    addressLng: normalizedOrder.addressLng || '',
    deliveryZoneId: normalizedOrder.deliveryZoneId || '',
    deliveryZoneName: normalizedOrder.deliveryZoneName || '',
    address: normalizedOrder.address || '',
    deliveryFee: normalizedOrder.deliveryFee || '0,00',
    document: normalizedOrder.document || '',
    discountType: normalizedOrder.discountType,
    discountValue: normalizedOrder.discountValue,
    surchargeType: normalizedOrder.surchargeType,
    surchargeValue: normalizedOrder.surchargeValue,
  }
}

function orderCartItemToForm(product, item = null) {
  return {
    lineId: item?.id || '',
    productId: product?.id || '',
    qty: String(item?.qty || 1),
    flavorIds: Array.isArray(item?.flavorIds) ? [...item.flavorIds] : [],
    addonSelections: item?.addonSelections ? cloneData(item.addonSelections) : {},
    note: item?.note || '',
  }
}

function getInitialCartItemEditStep(product, item = null) {
  const steps = getCartConfigurationSteps(product)

  if (steps.length <= 1 || !item) {
    return 0
  }

  const lastSelectedStepIndex = steps.reduce((lastIndex, step, index) => (
    getCartStepSelectedIds(orderCartItemToForm(product, item), step).length > 0 ? index : lastIndex
  ), 0)

  return Math.max(0, lastSelectedStepIndex)
}

function getOrderCartItemLabel(item) {
  const detailParts = [
    item?.flavorLabel ? `Sabores: ${item.flavorLabel}` : '',
    ...(Array.isArray(item?.addonEntries) ? item.addonEntries.map((entry) => `${entry.groupName}: ${entry.label}`) : []),
    item?.note ? `Obs: ${item.note}` : '',
  ].filter(Boolean)

  return detailParts.length > 0
    ? `${item.qty}x ${item.name} (${detailParts.join(' | ')})`
    : `${item.qty}x ${item.name}`
}

function getOrderCartChildRows(item) {
  const flavorRows = Array.from((Array.isArray(item?.flavorNames) ? item.flavorNames : []).reduce((counts, name) => {
    counts.set(name, (counts.get(name) || 0) + 1)
    return counts
  }, new Map()).entries())
    .map(([name, count]) => ({
      id: `flavor-${name}`,
      groupName: getFlavorEntityLabel({ category: item?.category, name: item?.name }, count > 1),
      name,
      count,
    }))

  const addonRows = (Array.isArray(item?.addonEntries) ? item.addonEntries : [])
    .flatMap((entry) => (Array.isArray(entry.optionCounts) && entry.optionCounts.length > 0
      ? entry.optionCounts.map((option) => ({
        id: `${entry.groupId}-${option.id}`,
        groupName: entry.groupName,
        name: option.name,
        count: option.count,
      }))
      : (Array.isArray(entry.optionNames) ? entry.optionNames : [])
        .map((name, index) => ({
          id: `${entry.groupId}-${name}-${index}`,
          groupName: entry.groupName,
          name,
          count: 1,
        }))))

  return [...flavorRows, ...addonRows]
}

function getOrderCartPrintItem(item) {
  const addonDetails = Array.isArray(item?.addonEntries)
    ? item.addonEntries.flatMap((entry) => (
      Array.isArray(entry.optionNames) && entry.optionNames.length > 0
        ? entry.optionNames
        : String(entry.label || '').split(',').map((option) => option.trim()).filter(Boolean)
    ))
    : []

  return {
    qty: item?.qty || 1,
    name: item?.name || 'Item do pedido',
    details: [
      ...(Array.isArray(item?.flavorNames) ? item.flavorNames : []),
      ...addonDetails,
      item?.note ? `Obs: ${item.note}` : '',
    ].filter(Boolean),
    price: (Number(item?.price) || 0) * (Number(item?.qty) || 1),
  }
}

function getProductAvailabilityLabel(product) {
  const activeDays = Array.isArray(product.availableDays) ? product.availableDays : []

  if (activeDays.length === WEEK_DAY_OPTIONS.length) {
    return `Todos os dias, ${product.availableFrom} - ${product.availableTo}`
  }

  const labels = WEEK_DAY_OPTIONS
    .filter((day) => activeDays.includes(day.id))
    .map((day) => day.label)
    .join(', ')

  return `${labels || 'Sem dias'} - ${product.availableFrom} - ${product.availableTo}`
}

function getMenuProductThumbClass(product) {
  const fingerprint = `${product.category} ${product.name}`.toLowerCase()

  if (fingerprint.includes('combo')) {
    return 'product-thumb--combo'
  }

  if (fingerprint.includes('bebida') || fingerprint.includes('refrigerante') || fingerprint.includes('suco')) {
    return 'product-thumb--drink'
  }

  if (fingerprint.includes('doce') || fingerprint.includes('brownie') || fingerprint.includes('sobremesa')) {
    return 'product-thumb--dessert'
  }

  return 'product-thumb--pizza'
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

function formatDateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function parseRecordDate(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  const text = String(value).trim()
  const brDateTime = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*)?(\d{2})?:?(\d{2})?/)
  if (brDateTime) {
    const [, day, month, year, hour = '00', minute = '00'] = brDateTime
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getRecordDate(record = {}) {
  return parseRecordDate(record.createdAt || record.backendCreatedAt || record.time || record.paidAt) || new Date()
}

function getDayRange(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function isRecordInRange(record = {}, startDate = null, endDate = null) {
  const recordDate = getRecordDate(record)
  const start = parseRecordDate(startDate)
  const end = parseRecordDate(endDate)

  if (start && recordDate < start) {
    return false
  }

  if (end) {
    const exclusiveEnd = new Date(end)
    exclusiveEnd.setDate(exclusiveEnd.getDate() + 1)
    if (recordDate >= exclusiveEnd) {
      return false
    }
  }

  return true
}

function filterRecordsByPeriod(records = [], period = 'all', customStart = '', customEnd = '') {
  const now = new Date()
  let start = null
  let end = null

  if (period === 'today') {
    const range = getDayRange(now)
    start = range.start
    end = now
  } else if (period === 'week') {
    start = new Date(now)
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    end = now
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end = now
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1)
    end = now
  } else if (period === 'custom') {
    start = customStart || null
    end = customEnd || null
  }

  return records.filter((record) => isRecordInRange(record, start, end))
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, parsed))
}

function normalizePrintJob(job = {}, index = 0) {
  return {
    id: job.id || `job-${Date.now()}-${index}`,
    label: job.label || 'Impressao',
    type: job.type || 'Pedido',
    status: job.status || 'Pendente',
    createdAt: job.createdAt || nowDateTime(),
    printedAt: job.printedAt || '',
    printer: job.printer || '',
    document: job.document || null,
  }
}

function normalizePrinterConfig(config = {}) {
  const merged = { ...initialPrinterConfig, ...(config ?? {}) }
  const paper = PRINTER_PAPER_OPTIONS.some((option) => option.id === merged.paper) ? merged.paper : initialPrinterConfig.paper
  const fontFamily = PRINTER_FONT_OPTIONS.some((option) => option.id === merged.fontFamily) ? merged.fontFamily : initialPrinterConfig.fontFamily
  const density = PRINTER_DENSITY_OPTIONS.some((option) => option.id === merged.density) ? merged.density : initialPrinterConfig.density
  const darkness = PRINTER_DARKNESS_OPTIONS.some((option) => option.id === merged.darkness) ? merged.darkness : initialPrinterConfig.darkness
  const fallbackDarknessLevel = PRINTER_DARKNESS_OPTIONS.find((option) => option.id === darkness)?.level ?? initialPrinterConfig.darknessLevel

  return {
    ...merged,
    connected: merged.connected !== false,
    deviceName: String(merged.deviceName || initialPrinterConfig.deviceName),
    copies: clampNumber(merged.copies, 1, 5, initialPrinterConfig.copies),
    paper,
    fontFamily,
    fontSize: clampNumber(merged.fontSize, 9, 18, initialPrinterConfig.fontSize),
    marginMm: clampNumber(merged.marginMm, 0, 12, initialPrinterConfig.marginMm),
    density,
    darkness,
    darknessLevel: clampNumber(merged.darknessLevel ?? fallbackDarknessLevel, 0, 100, initialPrinterConfig.darknessLevel),
    cutPaper: merged.cutPaper !== false,
    showStoreHeader: merged.showStoreHeader !== false,
    showCustomerPhone: merged.showCustomerPhone !== false,
    showFinancials: merged.showFinancials !== false,
    showNotes: merged.showNotes !== false,
    printMode: merged.printMode || 'browser',
    queue: Array.isArray(merged.queue) ? merged.queue.map(normalizePrintJob).slice(0, 30) : [],
  }
}

function normalizePilotSync(config = {}) {
  const merged = { ...initialPilotSync, ...(config ?? {}) }
  const validStatuses = ['idle', 'checking', 'online', 'syncing', 'offline', 'error']

  return {
    enabled: merged.enabled === true,
    autoSyncOrders: merged.autoSyncOrders !== false,
    syncOnStatusChange: merged.syncOnStatusChange !== false,
    status: validStatuses.includes(merged.status) ? merged.status : initialPilotSync.status,
    storeId: String(merged.storeId || ''),
    storeName: String(merged.storeName || ''),
    lastCheckedAt: String(merged.lastCheckedAt || ''),
    lastSyncedAt: String(merged.lastSyncedAt || ''),
    message: String(merged.message || initialPilotSync.message),
  }
}

function printerConfigToForm(config = {}) {
  const normalized = normalizePrinterConfig(config)

  return {
    deviceName: normalized.deviceName,
    copies: String(normalized.copies),
    paper: normalized.paper,
    connected: normalized.connected ? 'yes' : 'no',
    fontFamily: normalized.fontFamily,
    fontSize: String(normalized.fontSize),
    marginMm: String(normalized.marginMm),
    density: normalized.density,
    darkness: normalized.darkness,
    darknessLevel: String(normalized.darknessLevel),
    cutPaper: normalized.cutPaper ? 'yes' : 'no',
    showStoreHeader: normalized.showStoreHeader ? 'yes' : 'no',
    showCustomerPhone: normalized.showCustomerPhone ? 'yes' : 'no',
    showFinancials: normalized.showFinancials ? 'yes' : 'no',
    showNotes: normalized.showNotes ? 'yes' : 'no',
  }
}

function printerFormToConfig(form = {}, current = initialPrinterConfig) {
  return normalizePrinterConfig({
    ...current,
    deviceName: form.deviceName || current.deviceName,
    copies: Number(form.copies),
    paper: form.paper,
    connected: form.connected === 'yes',
    fontFamily: form.fontFamily,
    fontSize: Number(form.fontSize),
    marginMm: Number(form.marginMm),
    density: form.density,
    darkness: form.darkness,
    darknessLevel: Number(form.darknessLevel),
    cutPaper: form.cutPaper === 'yes',
    showStoreHeader: form.showStoreHeader === 'yes',
    showCustomerPhone: form.showCustomerPhone === 'yes',
    showFinancials: form.showFinancials === 'yes',
    showNotes: form.showNotes === 'yes',
  })
}

function createDefaultAppData() {
  return cloneData({
    orders: initialOrders.map((order) => ({
      ...normalizeOrderRecord(order),
    })),
    orderSequence: getLastOrderNumber(initialOrders),
    activeNav: 'orders',
    storeOpen: true,
    cashOpen: false,
    cashOpenedAt: '',
    noticeVisible: false,
    blockedOrders: initialBlockedOrders,
    settings: initialSettings,
    chatMessages: [
      { id: 1, author: 'Sistema', text: 'Canal de atendimento simulado ativo.' },
    ],
    categories: initialCategories,
    products: initialProducts.map((product) => normalizeProduct(product, initialCategories[0]?.name || 'Pizzas')),
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
    orderAddresses: initialOrderAddresses,
    deliveryZones: initialDeliveryZones.map(normalizeDeliveryZone),
    storeProfile: normalizeStoreProfile(initialStoreProfile),
    printerConfig: normalizePrinterConfig(initialPrinterConfig),
    pilotSync: normalizePilotSync(initialPilotSync),
    security: initialSecurity,
    storeUsers: initialStoreUsers.map(normalizeStoreUser),
    currentStoreUser: null,
    botConfig: initialBotConfig,
    kdsConfig: initialKdsConfig,
    orderDrafts: initialOrderDrafts,
    suggestions: initialSuggestionHistory,
    eventLog: initialEventLog,
  })
}

function createBlankAppData() {
  const defaults = createDefaultAppData()

  return cloneData({
    ...defaults,
    orders: [],
    orderSequence: 8300,
    cashOpenedAt: '',
    blockedOrders: [],
    chatMessages: [],
    categories: [],
    products: [],
    tables: [],
    couriers: [],
    channels: [],
    recoveries: [],
    coupons: [],
    inventory: [],
    finance: [],
    invoices: [],
    integrations: [],
    qrCodes: [],
    orderAddresses: [],
    deliveryZones: [],
    storeProfile: normalizeStoreProfile(createEmptyStoreProfile()),
    printerConfig: normalizePrinterConfig({ ...initialPrinterConfig, queue: [] }),
    pilotSync: normalizePilotSync({ enabled: false, status: 'idle', message: 'Modo piloto ainda nao conectado.' }),
    storeUsers: [],
    currentStoreUser: null,
    orderDrafts: [],
    suggestions: [],
    eventLog: [],
  })
}

function normalizeAppSnapshot(snapshot = {}) {
  const defaults = createDefaultAppData()
  const parsed = snapshot ?? {}
  const normalizedOrders = Array.isArray(parsed.orders)
    ? parsed.orders.map((order) => normalizeOrderRecord(order))
    : defaults.orders
  const parsedOrderSequence = Number(parsed.orderSequence)
  const fallbackOrderSequence = Array.isArray(parsed.orders) ? 8300 : defaults.orderSequence
  const orderSequence = Math.max(
    Number.isFinite(parsedOrderSequence) ? parsedOrderSequence : fallbackOrderSequence,
    getLastOrderNumber(normalizedOrders),
  )

  return {
    ...defaults,
    ...parsed,
    orders: normalizedOrders,
    orderSequence,
    cashOpenedAt: parsed.cashOpenedAt || defaults.cashOpenedAt,
    blockedOrders: Array.isArray(parsed.blockedOrders) ? parsed.blockedOrders : defaults.blockedOrders,
    settings: {
      ...defaults.settings,
      ...(parsed.settings ?? {}),
      autoPrint: parsed.settings?.autoPrint ?? parsed.settings?.printer ?? defaults.settings.autoPrint,
      printer: parsed.settings?.printer ?? parsed.settings?.autoPrint ?? defaults.settings.printer,
    },
    chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : defaults.chatMessages,
    categories: Array.isArray(parsed.categories) ? parsed.categories : defaults.categories,
    products: Array.isArray(parsed.products)
      ? parsed.products.map((product) => normalizeProduct(product, defaults.categories[0]?.name || 'Pizzas'))
      : defaults.products,
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
    orderAddresses: Array.isArray(parsed.orderAddresses)
      ? parsed.orderAddresses.map(normalizeOrderAddress)
      : defaults.orderAddresses,
    deliveryZones: Array.isArray(parsed.deliveryZones)
      ? parsed.deliveryZones.map(normalizeDeliveryZone)
      : defaults.deliveryZones,
    storeProfile: normalizeStoreProfile({ ...defaults.storeProfile, ...(parsed.storeProfile ?? {}) }),
    printerConfig: normalizePrinterConfig({
      ...defaults.printerConfig,
      ...(parsed.printerConfig ?? {}),
      queue: Array.isArray(parsed.printerConfig?.queue) ? parsed.printerConfig.queue : defaults.printerConfig.queue,
    }),
    pilotSync: normalizePilotSync({ ...defaults.pilotSync, ...(parsed.pilotSync ?? {}) }),
    security: { ...defaults.security, ...(parsed.security ?? {}) },
    storeUsers: Array.isArray(parsed.storeUsers)
      ? parsed.storeUsers.map(normalizeStoreUser)
      : defaults.storeUsers,
    currentStoreUser: parsed.currentStoreUser || defaults.currentStoreUser,
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
}

function createStoreRecord({ profile, owner, demo = false }, index = 0) {
  const baseSnapshot = normalizeAppSnapshot(demo ? createDefaultAppData() : createBlankAppData())
  const nextProfile = normalizeStoreProfile({
    ...profile,
    owner: profile.owner || owner.name,
    email: profile.email || owner.email,
    configuredAt: nowDateTime(),
  })
  const result = createStoreUserRecord([], owner, nowDateTime)

  if (result.ok === false) {
    return result
  }

  return {
    ok: true,
    store: {
      id: `store-${Date.now()}-${index}`,
      snapshot: {
        ...baseSnapshot,
        storeProfile: nextProfile,
        storeUsers: result.users,
        security: {
          ...baseSnapshot.security,
          operator: nextProfile.owner || baseSnapshot.security.operator,
          email: nextProfile.supportEmail || nextProfile.email || result.user.email,
        },
        currentStoreUser: null,
      },
    },
    user: result.user,
  }
}

function createDemoStoreRecord(index = 0) {
  return createStoreRecord({
    demo: true,
    profile: {
      tradeName: 'Loja Demo MeuCardapio',
      legalName: 'Loja Demo MeuCardapio LTDA',
      owner: 'Conta Demo',
      manager: 'Gerente Demo',
      phone: '(11) 99999-0000',
      whatsapp: '(11) 99999-0000',
      email: 'contato@demo.meucardapio.local',
      supportEmail: 'suporte@demo.meucardapio.local',
      taxId: '12.345.678/0001-90',
      stateRegistration: '123456789',
      category: 'Restaurante',
      description: 'Ambiente demonstrativo do MeuCardapio para explorar pedidos, atendimento, delivery e PDV.',
      cep: '88385-000',
      street: 'Avenida Demo',
      number: '123',
      district: 'Centro',
      cityName: 'Penha',
      state: 'SC',
      schedule: '11:00 - 23:00',
      minimumOrder: '25,00',
      serviceFee: '5,00',
      deliveryRadius: '8',
      averagePrepTime: '30',
      deliveryLeadTime: '45',
      serviceModes: {
        delivery: true,
        pickup: true,
        dineIn: true,
      },
      website: 'https://meucardapio.app/demo',
      instagram: '@meucardapio.demo',
      note: 'Loja local criada automaticamente para demonstracao do produto.',
      lat: String(DEFAULT_MAP_COORDINATES.lat),
      lng: String(DEFAULT_MAP_COORDINATES.lng),
      mapLabel: 'Loja demo centralizada no mapa',
      verifiedAt: nowDateTime(),
    },
    owner: {
      name: 'Conta Demo',
      email: 'demo@meucardapio.local',
      password: 'demo123',
    },
  }, index)
}

function normalizeStoreRecord(record = {}, index = 0) {
  const normalizedSnapshot = normalizeAppSnapshot(record.snapshot ?? record)

  return {
    id: record.id || `store-${Date.now()}-${index}`,
    snapshot: {
      ...normalizedSnapshot,
      currentStoreUser: null,
    },
  }
}

function hasConfiguredStoreRecord(record) {
  const snapshot = normalizeAppSnapshot(record?.snapshot ?? record)

  return isStoreConfigured(snapshot.storeProfile) || snapshot.storeUsers.length > 0
}

function loadPersistedWorkspaceFromRaw(parsed) {
  const emptyWorkspace = {
    stores: [],
    activeStoreId: null,
    currentStoreUser: null,
    activeSnapshot: createDefaultAppData(),
  }

  if (Array.isArray(parsed?.stores)) {
    const stores = parsed.stores
      .map((store, index) => normalizeStoreRecord(store, index))
      .filter(hasConfiguredStoreRecord)
    const activeStoreId = stores.some((store) => store.id === parsed.activeStoreId)
      ? parsed.activeStoreId
      : stores[0]?.id || null
    const activeSnapshot = stores.find((store) => store.id === activeStoreId)?.snapshot || createDefaultAppData()
    const currentStoreUser = parsed.currentStoreUser && stores.some((store) => store.id === parsed.currentStoreUser.storeId)
      ? parsed.currentStoreUser
      : null

    return {
      stores,
      activeStoreId,
      currentStoreUser,
      activeSnapshot,
    }
  }

  const legacySnapshot = normalizeAppSnapshot(parsed)

  if (!hasConfiguredStoreRecord(legacySnapshot)) {
    return emptyWorkspace
  }

  const legacyStore = normalizeStoreRecord({
    id: `store-${Date.now()}-legacy`,
    snapshot: legacySnapshot,
  })
  const currentStoreUser = parsed.currentStoreUser
    ? { ...parsed.currentStoreUser, storeId: legacyStore.id }
    : null

  return {
    stores: [legacyStore],
    activeStoreId: legacyStore.id,
    currentStoreUser,
    activeSnapshot: legacyStore.snapshot,
  }
}

function loadPersistedWorkspace() {
  const emptyWorkspace = {
    stores: [],
    activeStoreId: null,
    currentStoreUser: null,
    activeSnapshot: createDefaultAppData(),
  }

  if (typeof window === 'undefined') {
    return emptyWorkspace
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return emptyWorkspace
    }

    return loadPersistedWorkspaceFromRaw(JSON.parse(raw))
  } catch {
    return emptyWorkspace
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getPrinterPaperOption(paper) {
  return PRINTER_PAPER_OPTIONS.find((option) => option.id === paper) || PRINTER_PAPER_OPTIONS[1]
}

function getPrinterFontOption(fontFamily) {
  return PRINTER_FONT_OPTIONS.find((option) => option.id === fontFamily) || PRINTER_FONT_OPTIONS[0]
}

function getPrinterDensityOption(density) {
  return PRINTER_DENSITY_OPTIONS.find((option) => option.id === density) || PRINTER_DENSITY_OPTIONS[1]
}

function getPrinterDarknessOption(darknessLevel) {
  const level = clampNumber(darknessLevel, 0, 100, initialPrinterConfig.darknessLevel)
  const shadowAmount = level <= 28 ? 0 : ((level - 28) / 72) * 0.22
  const fontWeight = Math.round(470 + (level * 2.2))
  const textShadow = shadowAmount <= 0
    ? 'none'
    : `${shadowAmount.toFixed(2)}px 0 #000000, -${shadowAmount.toFixed(2)}px 0 #000000`

  return {
    level,
    fontWeight,
    textShadow,
  }
}

function getStorePrintAddress(storeProfile = {}) {
  return [
    [storeProfile.street, storeProfile.number].filter(Boolean).join(', '),
    storeProfile.district,
    storeProfile.city || [storeProfile.cityName, storeProfile.state].filter(Boolean).join(' - '),
  ].filter(Boolean).join(' - ')
}

function buildStorePrintHeader(storeProfile = {}) {
  const storeName = storeProfile.name || storeProfile.tradeName || 'MeuCardapio'
  const storeAddress = getStorePrintAddress(storeProfile)
  const contact = storeProfile.whatsapp || storeProfile.phone || storeProfile.supportEmail || storeProfile.email || ''

  return `
    <header class="receipt-header">
      <strong>${escapeHtml(storeName)}</strong>
      ${storeProfile.taxId ? `<span>CNPJ/CPF: ${escapeHtml(storeProfile.taxId)}</span>` : ''}
      ${storeAddress ? `<span>${escapeHtml(storeAddress)}</span>` : ''}
      ${contact ? `<span>${escapeHtml(contact)}</span>` : ''}
    </header>
  `
}

function buildReceiptRow(label, value, className = '') {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const rowClass = ['receipt-row', className].filter(Boolean).join(' ')

  return `
    <div class="${rowClass}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `
}

function buildReceiptDivider(className = '') {
  return `<div class="receipt-divider ${className}"></div>`
}

function formatReceiptCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  return formatCurrency(value).replace(/\u00a0/g, ' ')
}

function getReceiptModeLabel(order = {}, variant = 'order') {
  if (variant === 'kitchen') {
    return 'COZINHA'
  }

  if (variant === 'dispatch') {
    return inferOrderFulfillment(order) === 'delivery' ? 'PARA ENTREGA' : 'PARA SAIDA'
  }

  if (variant === 'fiscal') {
    return 'NFC-E'
  }

  if (inferOrderFulfillment(order) === 'delivery') {
    return 'PARA ENTREGA'
  }

  if (inferOrderFulfillment(order) === 'dinein') {
    return 'PARA MESA'
  }

  return 'PARA RETIRADA'
}

function getReceiptExpectedWindow(order = {}) {
  if (order.expectedAt) {
    return order.expectedAt
  }

  if (order.status === 'ready') {
    return 'Pronto'
  }

  return getOrderEta(order)
}

function splitReceiptItemLabel(label = '') {
  const trimmed = String(label || '').trim()
  const qtyMatch = trimmed.match(/^(\d+)\s*x\s*(.+)$/i)
  const qty = qtyMatch?.[1] || '1'
  const itemText = qtyMatch?.[2]?.trim() || trimmed || 'Item do pedido'
  const detailStartIndex = itemText.endsWith(')') ? itemText.lastIndexOf(' (') : -1
  const name = detailStartIndex > -1
    ? itemText.slice(0, detailStartIndex).trim()
    : itemText
  const detailsText = detailStartIndex > -1
    ? itemText.slice(detailStartIndex + 2, -1).trim()
    : ''
  const details = detailsText
    .split(/\s+\|\s+/)
    .map((detail) => detail.trim())
    .filter(Boolean)
    .flatMap((detail) => {
      const [, detailList] = detail.match(/^(?:Sabores?|Sabor|Adicionais?|Adicional|Borda|Extras?|Complementos?):\s*(.+)$/i) || []

      if (!detailList) {
        return [detail]
      }

      return detailList.split(',').map((item) => item.trim()).filter(Boolean)
    })

  return { qty, name, details, price: null }
}

function parseReceiptProductName(value = '') {
  const parts = String(value || '')
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const name = parts.shift() || 'Item do pedido'
  const details = parts.flatMap((part) => {
    const [, rawValue = ''] = part.match(/:\s*(.+)$/) || []
    const detail = (rawValue || part).trim()

    return detail
      .split(/\s*,\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
  })

  return { name, details }
}

function backendItemToReceiptItem(item = {}) {
  const parsed = parseReceiptProductName(item.productName || item.name || 'Item do pedido')
  const note = String(item.note || '').trim()
  const quantity = item.quantity || item.qty || 1
  const price = item.totalPrice !== undefined && item.totalPrice !== null
    ? item.totalPrice
    : item.unitPrice !== undefined && item.unitPrice !== null
      ? (Number(item.unitPrice) || 0) * (Number(quantity) || 1)
      : item.price ?? 0

  return {
    qty: quantity,
    name: parsed.name,
    details: [...parsed.details, note ? `Obs: ${note}` : ''].filter(Boolean),
    price: Number(price) || 0,
  }
}

function getReceiptItems(order = {}) {
  if (Array.isArray(order.printItems) && order.printItems.length > 0) {
    return order.printItems.map((item) => ({
      qty: item.qty || 1,
      name: item.name || 'Item do pedido',
      details: Array.isArray(item.details) ? item.details.filter(Boolean) : [],
      price: item.price ?? null,
    }))
  }

  return (Array.isArray(order.items) ? order.items : []).map(splitReceiptItemLabel)
}

function getNoteSegmentLabel(segment = '') {
  const [, label = ''] = String(segment || '').match(/^([^:]+):\s*(.*)$/) || []
  return normalizeSearchText(label)
}

function splitOrderNoteSegments(note = '') {
  return String(note || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
}

function getReceiptDetailRows(details = []) {
  const counts = new Map()

  details.filter(Boolean).forEach((detail) => {
    counts.set(detail, (counts.get(detail) || 0) + 1)
  })

  return Array.from(counts.entries()).map(([detail, qty]) => ({ detail, qty }))
}

function buildReceiptItemsHtml(order = {}) {
  const receiptItems = getReceiptItems(order)

  if (receiptItems.length === 0) {
    return '<div class="receipt-item"><div class="receipt-item__line"><span>(1) Item nao informado</span><strong>-</strong></div></div>'
  }

  return receiptItems.map((item, index) => `
    <div class="receipt-item">
      ${index > 0 ? '<div class="receipt-item__separator"></div>' : ''}
      <div class="receipt-item__line">
        <span>(${escapeHtml(item.qty)}) ${escapeHtml(item.name)}</span>
        <strong>${item.price === null ? '-' : formatReceiptCurrency(item.price)}</strong>
      </div>
      ${getReceiptDetailRows(item.details).map(({ detail, qty }) => `<div class="receipt-item__detail">(${escapeHtml(qty)}) ${escapeHtml(detail)} <span>-</span></div>`).join('')}
    </div>
  `).join('')
}

function getPrintableOrderNote(order = {}) {
  const ignoredLabels = new Set([
    'pedido local',
    'origem',
    'endereco',
    'mapa',
    'area',
    'zona',
    'documento',
    'itens',
  ])
  const ignoredExactNotes = new Set([
    'pedido criado pelo painel.',
    'pedido editado pelo painel.',
    'pedido vindo do cardapio digital.',
    'venda criada no pdv.',
    'pedido vindo do salao.',
  ])

  const noteSegments = splitOrderNoteSegments(order.note)
  const printableParts = []

  for (let index = 0; index < noteSegments.length; index += 1) {
    const part = noteSegments[index]

    if (/^pedido local\s*#/i.test(part)) {
      continue
    }

    const parsedPart = (() => {
      const [, label = '', value = ''] = part.match(/^([^:]+):\s*(.*)$/) || []
      const normalizedLabel = normalizeSearchText(label)

      if (ignoredLabels.has(normalizedLabel)) {
        while (
          normalizedLabel === 'endereco'
          && index + 1 < noteSegments.length
          && !getNoteSegmentLabel(noteSegments[index + 1])
          && !/^pedido local\s*#/i.test(noteSegments[index + 1])
        ) {
          index += 1
        }

        return ''
      }

      if (normalizedLabel === 'obs' || normalizedLabel === 'observacao') {
        return value.trim()
      }

      return part
    })()

    if (parsedPart && !ignoredExactNotes.has(normalizeSearchText(parsedPart))) {
      printableParts.push(parsedPart)
    }
  }

  return printableParts.join(' | ')
}

function getReceiptCustomerAddress(order = {}) {
  const normalizedAddress = String(order.address || '').trim()
  const noteAddress = getBackendNoteValue(order.note, 'Endereco')
  const fallbackAddress = order.fulfillment === 'pickup' ? 'Retirada no balcao' : ''
  const receiptAddress = noteAddress && (!normalizedAddress || noteAddress.length > normalizedAddress.length)
    ? noteAddress
    : normalizedAddress || fallbackAddress

  return receiptAddress.replace(/\s*\|\s*/g, ' - ')
}

function createPrinterTestOrder() {
  return normalizeOrderRecord({
    id: '8459',
    customer: 'Camila',
    phone: '(47) 9 8877-0867',
    channel: 'delivery',
    fulfillment: 'delivery',
    source: 'Cardapio Digital',
    status: 'production',
    subtotal: 89.98,
    deliveryFee: '5,00',
    total: 94.98,
    payment: 'Cartao (Cartao)',
    time: nowTime(),
    expectedAt: '19:27 - 19:37',
    address: 'Rua Jovino Manoel Francisco, N 842, Casa 2 - Bairro: Armacao, Penha | CEP: 88385-000',
    customerOrderCount: '02',
    note: '* Cobrar do cliente *',
    items: ['1x Frigideira 40cm', '1x Broto Baby 20cm'],
    printItems: [
      {
        qty: 1,
        name: 'Frigideira 40cm',
        price: 69.99,
        details: ['Calabresa com Cebola', 'Frango com Requeijao Cremoso', 'Mussarela', 'Marguerita', 'Borda Sem Recheio'],
      },
      {
        qty: 1,
        name: 'Broto Baby 20cm',
        price: 19.99,
        details: ['Prestigio'],
      },
    ],
  })
}

function buildOrderPrintBody(order, storeProfile, config = {}, variant = 'order') {
  const normalizedConfig = normalizePrinterConfig(config)
  const normalizedOrder = normalizeOrderRecord(order)
  const financialBreakdown = getOrderFinancialBreakdown(normalizedOrder.subtotal, normalizedOrder)
  const showFinancials = normalizedConfig.showFinancials && variant !== 'kitchen'
  const storeName = storeProfile.name || storeProfile.tradeName || 'MeuCardapio'
  const customerAddress = getReceiptCustomerAddress(normalizedOrder)
  const printableNote = getPrintableOrderNote(normalizedOrder)
  const note = printableNote && normalizedConfig.showNotes
    ? `
      ${buildReceiptDivider()}
      <section class="receipt-section receipt-note">
        <strong>${escapeHtml(printableNote)}</strong>
      </section>
    `
    : ''
  const cut = normalizedConfig.cutPaper ? '<div class="receipt-cut">Corte aqui</div>' : ''

  return `
    <article class="receipt receipt--order">
      ${buildReceiptDivider('receipt-divider--top')}
      <section class="receipt-title">
        <span>${getReceiptModeLabel(normalizedOrder, variant)}</span>
        <small>${escapeHtml(nowDateTime())}</small>
        <small>Entrega prevista: <b>${escapeHtml(getReceiptExpectedWindow(normalizedOrder))}</b></small>
        ${normalizedConfig.showStoreHeader ? `<small>${escapeHtml(storeName)}</small>` : ''}
      </section>
      ${buildReceiptDivider()}
      <section class="receipt-order-number">Pedido ${escapeHtml(normalizedOrder.id)}</section>
      ${buildReceiptDivider()}

      <section class="receipt-section">
        <h3>Itens</h3>
        <div class="receipt-items">${buildReceiptItemsHtml(normalizedOrder)}</div>
      </section>

      <section class="receipt-section">
        <h3>Cliente</h3>
        <p><span>Nome:</span> ${escapeHtml(normalizedOrder.customer || 'Cliente balcao')}</p>
        ${normalizedConfig.showCustomerPhone ? `<p><span>Telefone:</span> ${escapeHtml(normalizedOrder.phone)}</p>` : ''}
        ${normalizedOrder.customerOrderCount ? `<p><span>Quantidade de pedidos:</span> ${escapeHtml(normalizedOrder.customerOrderCount)}</p>` : ''}
        ${customerAddress ? `<p><span>Endereco:</span> ${escapeHtml(customerAddress)}</p>` : ''}
      </section>

      ${note}

      ${showFinancials ? `
        <section class="receipt-section">
          <h3>Pagamento</h3>
          <p><span>Forma de Pagamento:</span> ${escapeHtml(normalizedOrder.payment)}</p>
          ${normalizedOrder.document ? `<p><span>CPF/CNPJ:</span> ${escapeHtml(normalizedOrder.document)}</p>` : ''}
        </section>
        ${buildReceiptDivider()}
        <section class="receipt-section receipt-totals">
          ${buildReceiptRow('Subtotal:', formatReceiptCurrency(financialBreakdown.subtotal))}
          ${financialBreakdown.deliveryFee > 0 ? buildReceiptRow('Taxa de entrega:', formatReceiptCurrency(financialBreakdown.deliveryFee)) : ''}
          ${financialBreakdown.discountAmount > 0 ? buildReceiptRow('Desconto:', formatReceiptCurrency(financialBreakdown.discountAmount)) : ''}
          ${financialBreakdown.surchargeAmount > 0 ? buildReceiptRow('Acrescimo:', formatReceiptCurrency(financialBreakdown.surchargeAmount)) : ''}
          ${buildReceiptRow('Total:', formatReceiptCurrency(financialBreakdown.total), 'receipt-row--total')}
        </section>
      ` : ''}

      ${variant === 'dispatch' && normalizedOrder.courier ? `
        <section class="receipt-section">
          ${buildReceiptRow('Entregador', normalizedOrder.courier)}
        </section>
      ` : ''}

      ${buildReceiptDivider()}
      <footer class="receipt-powered">
        <strong>Powered By: MeuCardapio</strong>
        <span>Acesse: https://meucardapio.local</span>
      </footer>
      ${cut}
    </article>
  `
}

function buildInvoicePrintBody(invoice, order, storeProfile, config = {}) {
  const fallbackOrder = normalizeOrderRecord(order || {
    id: invoice.orderId,
    customer: invoice.customer,
    phone: '',
    fulfillment: 'pickup',
    payment: 'Cartao',
    subtotal: invoice.amount,
    total: invoice.amount,
    address: 'Retirada no balcao',
    note: `Status fiscal: ${invoice.status}`,
    items: ['Consumo registrado'],
  })
  const invoiceHeader = `
    <section class="receipt-section receipt-fiscal">
      ${buildReceiptRow('Documento', invoice.id || `NFC-e ${invoice.orderId}`)}
      ${buildReceiptRow('Status fiscal', invoice.status || 'Autorizada')}
    </section>
  `

  return buildOrderPrintBody({
    ...fallbackOrder,
    note: [fallbackOrder.note, `Status fiscal: ${invoice.status || 'Autorizada'}`].filter(Boolean).join(' | '),
  }, storeProfile, config, 'fiscal').replace('<section class="receipt-section">', `${invoiceHeader}<section class="receipt-section">`)
}

function buildQrPrintBody(qr, storeProfile, config = {}) {
  const normalizedConfig = normalizePrinterConfig(config)
  const cut = normalizedConfig.cutPaper ? '<div class="receipt-cut">Corte aqui</div>' : ''

  return `
    <article class="receipt">
      ${normalizedConfig.showStoreHeader ? buildStorePrintHeader(storeProfile) : ''}
      <section class="receipt-title">
        <span>QR DE MESA</span>
        <strong>${escapeHtml(qr.table || 'Mesa')}</strong>
        <small>${escapeHtml(nowDateTime())}</small>
      </section>
      <section class="receipt-qr">
        <div class="receipt-qr__code">QR</div>
        <strong>${escapeHtml(qr.table || 'Mesa')}</strong>
        <span>Autoatendimento da mesa</span>
      </section>
      ${cut}
    </article>
  `
}

function buildGenericPrintBody(label, type, storeProfile, config = {}) {
  const normalizedConfig = normalizePrinterConfig(config)
  const cut = normalizedConfig.cutPaper ? '<div class="receipt-cut">Corte aqui</div>' : ''

  return `
    <article class="receipt">
      ${normalizedConfig.showStoreHeader ? buildStorePrintHeader(storeProfile) : ''}
      <section class="receipt-title">
        <span>${escapeHtml(type || 'IMPRESSAO')}</span>
        <strong>${escapeHtml(label || 'Documento')}</strong>
        <small>${escapeHtml(nowDateTime())}</small>
      </section>
      <section class="receipt-section">
        ${buildReceiptRow('Impressora', normalizedConfig.deviceName)}
        ${buildReceiptRow('Papel', normalizedConfig.paper)}
        ${buildReceiptRow('Fonte', `${normalizedConfig.fontSize}px`)}
      </section>
      ${cut}
    </article>
  `
}

function buildPrintHtml(printDocument, config = {}) {
  const normalizedConfig = normalizePrinterConfig(config)
  const paper = getPrinterPaperOption(normalizedConfig.paper)
  const font = getPrinterFontOption(normalizedConfig.fontFamily)
  const density = getPrinterDensityOption(normalizedConfig.density)
  const darkness = getPrinterDarknessOption(normalizedConfig.darknessLevel)
  const copies = Math.max(1, normalizedConfig.copies)
  const paperSize = normalizedConfig.paper === 'A4' ? 'A4' : `${paper.widthMm}mm auto`
  const bodyWidth = normalizedConfig.paper === 'A4' ? '210mm' : `${paper.widthMm}mm`
  const copyWidth = normalizedConfig.paper === 'A4' ? '190mm' : `${paper.widthMm}mm`
  const copyHtml = Array.from({ length: copies }, (_, index) => `
    <section class="receipt-copy">
      ${copies > 1 ? `<div class="receipt-copy__meta">Via ${index + 1} de ${copies}</div>` : ''}
      ${printDocument.bodyHtml}
    </section>
  `).join('')

  return `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(printDocument.title || printDocument.label || 'Impressao')}</title>
        <style>
          @page {
            size: ${paperSize};
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          body {
            width: ${bodyWidth};
            margin: 0 auto;
            background: #ffffff;
            color: #000000;
            font-family: ${font.family};
            font-size: ${normalizedConfig.fontSize}px;
            font-weight: ${darkness.fontWeight};
            line-height: ${density.lineHeight};
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .receipt-copy {
            width: ${copyWidth};
            min-height: 0;
            padding: ${normalizedConfig.marginMm}mm;
            background: #ffffff;
          }

          .receipt-copy + .receipt-copy {
            margin-top: 6mm;
            padding-top: ${Math.max(2, normalizedConfig.marginMm)}mm;
            border-top: 1px dashed #000000;
          }

          .receipt-copy__meta,
          .receipt-cut {
            margin: 2mm 0;
            text-align: center;
            font-size: 0.86em;
            text-transform: uppercase;
          }

          .receipt-header,
          .receipt-title,
          .receipt-section,
          .receipt-qr {
            display: grid;
            gap: 1.5mm;
            padding: 2mm 0;
            border-bottom: 0;
          }

          .receipt-header,
          .receipt-title,
          .receipt-qr {
            text-align: center;
          }

          .receipt {
            letter-spacing: 0;
            color: #000000;
            text-shadow: ${darkness.textShadow};
          }

          .receipt-divider {
            height: 1px;
            margin: 1.5mm 0;
            border-top: 1px dashed #000000;
          }

          .receipt-divider--top {
            margin-top: 0;
          }

          .receipt-header strong,
          .receipt-title strong {
            font-size: 1.2em;
            text-transform: uppercase;
          }

          .receipt-title span {
            font-size: 1.55em;
            font-weight: 700;
            text-transform: uppercase;
          }

          .receipt-title small {
            font-size: 0.95em;
          }

          .receipt-order-number {
            padding: 1mm 0;
            text-align: center;
            font-size: 2.2em;
            line-height: 1;
          }

          .receipt-header span,
          .receipt-title span,
          .receipt-title small,
          .receipt-qr span,
          .receipt-qr small {
            overflow-wrap: anywhere;
          }

          .receipt-section h3 {
            margin: 0;
            font-size: 1.42em;
            font-weight: 400;
          }

          .receipt-section p {
            margin: 0;
            overflow-wrap: anywhere;
          }

          .receipt-section p span {
            font-weight: 700;
          }

          .receipt-row {
            display: grid;
            grid-template-columns: minmax(0, 0.42fr) minmax(0, 0.58fr);
            gap: 2mm;
            align-items: start;
          }

          .receipt-row span {
            text-transform: uppercase;
          }

          .receipt-row strong {
            text-align: right;
            overflow-wrap: anywhere;
          }

          .receipt-row--total {
            margin-top: 1mm;
            padding-top: 1.5mm;
            border-top: 1px solid #000000;
            font-size: 1.15em;
          }

          .receipt-items {
            display: grid;
            gap: 2mm;
            margin: 0;
            padding: 0;
            list-style: none;
          }

          .receipt-item {
            display: grid;
            gap: 0.6mm;
          }

          .receipt-item__line {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 3mm;
            align-items: start;
          }

          .receipt-item__line span,
          .receipt-item__line strong {
            font-weight: 700;
          }

          .receipt-item__line span {
            overflow-wrap: anywhere;
          }

          .receipt-item__detail {
            display: flex;
            justify-content: space-between;
            gap: 3mm;
            padding-left: 3mm;
            overflow-wrap: anywhere;
          }

          .receipt-item__separator {
            width: 36%;
            margin: 1mm auto;
            border-top: 1px dashed #000000;
          }

          .receipt-powered {
            display: grid;
            gap: 0.6mm;
            padding-top: 2mm;
            text-align: center;
          }

          .receipt-note strong {
            overflow-wrap: anywhere;
          }

          .receipt-qr__code {
            display: grid;
            place-items: center;
            justify-self: center;
            width: min(45mm, 70vw);
            aspect-ratio: 1;
            border: 3mm solid #000000;
            background:
              linear-gradient(90deg, #000 10%, transparent 10% 20%, #000 20% 30%, transparent 30% 40%, #000 40% 50%, transparent 50% 60%, #000 60% 70%, transparent 70% 80%, #000 80% 90%, transparent 90%),
              linear-gradient(#000 10%, transparent 10% 20%, #000 20% 30%, transparent 30% 40%, #000 40% 50%, transparent 50% 60%, #000 60% 70%, transparent 70% 80%, #000 80% 90%, transparent 90%),
              #ffffff;
            background-size: 9mm 9mm;
            color: #000000;
            font-weight: 900;
            font-size: 1.4em;
          }

          @media print {
            body {
              margin: 0;
            }

            .receipt-copy + .receipt-copy {
              break-before: page;
            }
          }
        </style>
      </head>
      <body>${copyHtml}</body>
    </html>`
}

function openPrintWindow(printDocument, config = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !printDocument?.bodyHtml) {
    return false
  }

  const printFrame = document.createElement('iframe')
  printFrame.title = `Impressao pedido ${printDocument.title || ''}`.trim()
  printFrame.style.position = 'fixed'
  printFrame.style.right = '0'
  printFrame.style.bottom = '0'
  printFrame.style.width = '0'
  printFrame.style.height = '0'
  printFrame.style.border = '0'
  printFrame.style.opacity = '0'
  printFrame.setAttribute('aria-hidden', 'true')
  document.body.appendChild(printFrame)

  const printWindow = printFrame.contentWindow
  const printDocumentRef = printFrame.contentDocument || printWindow?.document

  if (!printWindow || !printDocumentRef) {
    printFrame.remove()
    return false
  }

  printDocumentRef.open()
  printDocumentRef.write(buildPrintHtml(printDocument, config))
  printDocumentRef.close()
  let cleanupTimer = null
  const cleanupPrintFrame = () => {
    if (cleanupTimer) {
      window.clearTimeout(cleanupTimer)
    }
    printWindow.removeEventListener('afterprint', cleanupPrintFrame)
    printFrame.remove()
  }

  printWindow.addEventListener('afterprint', cleanupPrintFrame, { once: true })
  window.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
    cleanupTimer = window.setTimeout(cleanupPrintFrame, 60000)
  }, 180)
  return true
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

function getLastOrderNumber(orders = [], fallback = 8300) {
  return orders
    .map((order) => Number(order.id))
    .filter(Number.isFinite)
    .reduce((max, orderNumber) => Math.max(max, orderNumber), fallback)
}

function toBackendMoney(value) {
  return Number((Number(value) || 0).toFixed(2))
}

function truncateText(value, maxLength = 180) {
  const text = String(value ?? '').trim()

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function isBackendUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function formatBackendOrderTime(value) {
  const parsed = value ? new Date(value) : null

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return nowTime()
  }

  return parsed.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getBackendLocalReference(order = {}) {
  const note = String(order.note || '')
  const [, localId] = note.match(/Pedido local #([^|\n]+)/i) || []

  return localId ? localId.trim() : ''
}

function getBackendNoteValue(note = '', label = '') {
  const normalizedTargetLabel = normalizeSearchText(label)
  const noteSegments = splitOrderNoteSegments(note)

  for (let index = 0; index < noteSegments.length; index += 1) {
    const segment = noteSegments[index]
    const [, currentLabel = '', currentValue = ''] = segment.match(/^([^:]+):\s*(.*)$/) || []

    if (normalizeSearchText(currentLabel) !== normalizedTargetLabel) {
      continue
    }

    const valueParts = [currentValue.trim()].filter(Boolean)

    while (
      index + 1 < noteSegments.length
      && !getNoteSegmentLabel(noteSegments[index + 1])
      && !/^pedido local\s*#/i.test(noteSegments[index + 1])
    ) {
      index += 1
      valueParts.push(noteSegments[index])
    }

    return valueParts.join(' | ').trim()
  }

  return ''
}

function getPilotStatusMeta(sync = {}) {
  const normalized = normalizePilotSync(sync)

  if (!normalized.enabled) {
    return { tone: 'muted', label: 'Piloto off', description: 'Sincronizacao desligada' }
  }

  const byStatus = {
    checking: { tone: 'warning', label: 'Checando API', description: normalized.message },
    syncing: { tone: 'warning', label: 'Sincronizando', description: normalized.message },
    online: { tone: 'success', label: 'Piloto online', description: normalized.message },
    offline: { tone: 'danger', label: 'API offline', description: normalized.message },
    error: { tone: 'danger', label: 'Erro no piloto', description: normalized.message },
  }

  return byStatus[normalized.status] || { tone: 'neutral', label: 'Piloto pronto', description: normalized.message }
}

function getOrderSyncMeta(order = {}) {
  if (order.backendId && order.syncStatus !== 'pending' && order.syncStatus !== 'failed') {
    return { tone: 'success', label: 'API', description: order.syncedAt ? `Sincronizado ${order.syncedAt}` : 'Sincronizado com backend' }
  }

  if (order.syncStatus === 'pending') {
    return { tone: 'warning', label: 'Pendente', description: order.syncMessage || 'Aguardando sincronizacao' }
  }

  if (order.syncStatus === 'failed') {
    return { tone: 'danger', label: 'Falhou', description: order.syncMessage || 'Falha ao sincronizar' }
  }

  return { tone: 'muted', label: 'Local', description: 'Salvo apenas no navegador' }
}

function buildBackendOrderNote(order = {}) {
  const receiptItems = getReceiptItems(order)
  const itemDetails = receiptItems
    .map((item) => {
      const details = Array.isArray(item.details) && item.details.length > 0
        ? ` (${item.details.join(', ')})`
        : ''

      return `${item.qty}x ${item.name}${details}`
    })
    .join(' | ')
  const noteParts = [
    `Pedido local #${order.id}`,
    `Origem: ${getOrderSource(order)}`,
    order.address ? `Endereco: ${order.address}` : '',
    order.deliveryZoneName ? `Zona: ${order.deliveryZoneName}` : '',
    order.document ? `Documento: ${order.document}` : '',
    order.note ? `Obs: ${order.note}` : '',
    itemDetails ? `Itens: ${itemDetails}` : '',
  ].filter(Boolean)

  return truncateText(noteParts.join(' | '), 1200)
}

function frontOrderToBackendRequest(order = {}) {
  const normalizedOrder = normalizeOrderRecord(order)
  const financialBreakdown = getOrderFinancialBreakdown(normalizedOrder.subtotal, normalizedOrder)
  const receiptItems = getReceiptItems(normalizedOrder)
  const fallbackSubtotal = financialBreakdown.subtotal || normalizedOrder.total || 0
  const totalQuantity = receiptItems.reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0) || 1
  const fallbackUnitPrice = fallbackSubtotal / totalQuantity
  const items = receiptItems.length > 0
    ? receiptItems.map((item) => {
        const quantity = Math.max(1, Number(item.qty) || 1)
        const totalPrice = item.price === null || item.price === undefined
          ? fallbackUnitPrice * quantity
          : Number(item.price) || 0
        const details = Array.isArray(item.details) && item.details.length > 0 ? ` - ${item.details.join(', ')}` : ''

        return {
          productName: truncateText(`${item.name || 'Item do pedido'}${details}`, 220),
          quantity,
          unitPrice: toBackendMoney(totalPrice / quantity),
        }
      })
    : [{
        productName: 'Item do pedido',
        quantity: 1,
        unitPrice: toBackendMoney(fallbackSubtotal),
      }]

  return {
    customerName: truncateText(normalizedOrder.customer || 'Cliente balcao', 120),
    customerPhone: truncateText(normalizedOrder.phone || '', 40),
    fulfillment: inferOrderFulfillment(normalizedOrder),
    payment: truncateText(String(normalizedOrder.payment || 'Cartao'), 80),
    note: buildBackendOrderNote(normalizedOrder),
    deliveryFee: toBackendMoney(financialBreakdown.deliveryFee),
    items,
  }
}

function backendOrderToFrontOrder(order = {}) {
  const localReference = getBackendLocalReference(order)
  const noteAddress = getBackendNoteValue(order.note, 'Endereco')
  const noteSource = getBackendNoteValue(order.note, 'Origem')
  const items = Array.isArray(order.items) ? order.items : []
  const printItems = items.map(backendItemToReceiptItem)
  const mappedItems = printItems.map((item) => {
    const details = item.details.length > 0 ? ` (${item.details.join(' | ')})` : ''

    return `${item.qty}x ${item.name}${details}`
  })
  const fulfillment = order.fulfillment || 'pickup'

  return normalizeOrderRecord({
    id: localReference || `api-${String(order.id || Date.now()).slice(0, 8)}`,
    backendId: order.id || '',
    backendCreatedAt: order.createdAt || '',
    backendUpdatedAt: order.updatedAt || '',
    customer: order.customerName || 'Cliente API',
    phone: order.customerPhone || '',
    channel: fulfillment === 'delivery' ? 'delivery' : 'pickup',
    fulfillment,
    source: noteSource || 'API',
    status: order.status || 'analysis',
    subtotal: Number(order.subtotal) || 0,
    deliveryFee: formatCurrencyInput(Number(order.deliveryFee) || 0),
    total: Number(order.total) || 0,
    payment: order.payment || 'Cartao',
    time: formatBackendOrderTime(order.createdAt),
    address: noteAddress || (fulfillment === 'delivery' ? 'Endereco registrado na API' : fulfillment === 'dinein' ? 'Consumir no local' : 'Retirada no balcao'),
    note: order.note || 'Pedido carregado da API.',
    items: mappedItems.length > 0 ? mappedItems : ['Item do pedido'],
    printItems,
    syncStatus: 'synced',
    syncMessage: 'Sincronizado com API',
    syncedAt: nowDateTime(),
  })
}

function backendStoreToProfile(store = {}) {
  return normalizeStoreProfile({
    tradeName: store.tradeName || '',
    owner: store.ownerName || '',
    phone: store.phone || '',
    whatsapp: store.phone || '',
    email: store.email || '',
    taxId: store.taxId || '',
    category: store.category || 'Restaurante',
    street: store.street || '',
    number: store.number || '',
    district: store.district || '',
    cityName: store.cityName || '',
    state: store.state || 'SC',
    schedule: store.schedule || '',
    accessKey: store.accessKey || '',
    minimumOrder: formatCurrencyInput(store.minimumOrder || 0),
    serviceFee: formatCurrencyInput(store.serviceFee || 0),
    deliveryRadius: String(store.deliveryRadiusKm || 5),
    lat: store.lat || '',
    lng: store.lng || '',
    mapLabel: store.mapLabel || '',
    verifiedAt: store.verifiedAt || '',
  })
}

function storeProfileToBackendRequest(profile = {}) {
  const normalized = normalizeStoreProfile(profile)

  return {
    tradeName: normalized.tradeName || normalized.name || 'Minha loja',
    ownerName: normalized.owner || normalized.manager || 'Responsavel',
    email: normalized.email || normalized.supportEmail || 'loja@meucardapio.local',
    phone: normalized.phone || normalized.whatsapp || '(00) 00000-0000',
    taxId: normalized.taxId || '00.000.000/0001-00',
    category: normalized.category || 'Restaurante',
    street: normalized.street || '',
    number: normalized.number || '',
    district: normalized.district || '',
    cityName: normalized.cityName || '',
    state: normalized.state || 'SC',
    schedule: normalized.schedule || '',
    accessKey: normalized.accessKey || '',
    minimumOrder: parseCurrencyInput(normalized.minimumOrder),
    deliveryRadiusKm: Number(normalized.deliveryRadius) || 5,
    serviceFee: parseCurrencyInput(normalized.serviceFee),
    lat: normalized.lat || '',
    lng: normalized.lng || '',
    mapLabel: normalized.mapLabel || '',
    verifiedAt: normalized.verifiedAt || '',
  }
}

function buildStoreProfilePatch(baseProfile = {}, nextProfile = {}) {
  const base = storeProfileToBackendRequest(baseProfile)
  const next = storeProfileToBackendRequest(nextProfile)

  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key])),
  )
}

function buildMenuSnapshot({ categories = [], products = [], deliveryZones = [] } = {}) {
  return {
    version: 1,
    categories: cloneData(categories),
    products: cloneData(products),
    deliveryZones: cloneData(deliveryZones),
  }
}

function hasMenuSnapshotContent(snapshot = {}) {
  return (
    (Array.isArray(snapshot.categories) && snapshot.categories.length > 0)
    || (Array.isArray(snapshot.products) && snapshot.products.length > 0)
    || (Array.isArray(snapshot.deliveryZones) && snapshot.deliveryZones.length > 0)
  )
}

function serializeMenuSnapshot({ categories = [], products = [], deliveryZones = [] } = {}) {
  return JSON.stringify(buildMenuSnapshot({ categories, products, deliveryZones }))
}

function getWorkspaceMenuSnapshot(workspace = {}) {
  const snapshot = workspace.menuSnapshot || {}

  return {
    categories: Array.isArray(snapshot.categories) ? snapshot.categories : null,
    products: Array.isArray(snapshot.products) ? snapshot.products : null,
    deliveryZones: Array.isArray(snapshot.deliveryZones) ? snapshot.deliveryZones : null,
  }
}

function backendWorkspaceToStoreRecord(workspace = {}, accessKey = '') {
  const profile = backendStoreToProfile({
    ...(workspace.store || {}),
    accessKey: workspace.store?.accessKey || accessKey,
  })
  const menuSnapshot = getWorkspaceMenuSnapshot(workspace)
  const categories = menuSnapshot.categories
    ? menuSnapshot.categories.map((category) => ({
        id: category.id,
        name: category.name,
        imageUrl: category.imageUrl || '',
        active: category.active !== false,
      }))
    : Array.isArray(workspace.categories)
    ? workspace.categories.map((category) => ({
        id: category.id,
        name: category.name,
        imageUrl: category.imageUrl || '',
        active: category.active !== false,
      }))
    : []
  const fallbackCategory = categories[0]?.name || 'Cardapio'
  const products = menuSnapshot.products
    ? menuSnapshot.products.map((product) => normalizeProduct(product, fallbackCategory))
    : Array.isArray(workspace.products)
    ? workspace.products.map((product) => normalizeProduct({
        id: product.id,
        name: product.name,
        description: product.description || '',
        imageUrl: product.imageUrl || '',
        category: product.categoryName || categories.find((category) => category.id === product.categoryId)?.name || fallbackCategory,
        price: Number(product.price) || 0,
        active: product.active !== false,
      }, fallbackCategory))
    : []
  const deliveryZones = menuSnapshot.deliveryZones || []
  const orders = Array.isArray(workspace.orders) ? workspace.orders.map(backendOrderToFrontOrder) : []
  const accessUser = normalizeStoreUser({
    id: `access-${workspace.store?.id || Date.now()}`,
    name: 'Dispositivo autorizado',
    email: profile.email || 'acesso@meucardapio.local',
    password: '',
    role: 'owner',
    createdAt: nowDateTime(),
  })
  const snapshot = normalizeAppSnapshot({
    ...createDefaultAppData(),
    storeProfile: profile,
    categories,
    products,
    deliveryZones,
    orders,
    storeUsers: [accessUser],
    pilotSync: normalizePilotSync({
      ...initialPilotSync,
      enabled: true,
      status: 'online',
      storeId: workspace.store?.id || '',
      storeName: profile.name,
      lastCheckedAt: nowDateTime(),
      lastSyncedAt: nowDateTime(),
      message: 'Loja carregada pela chave de acesso.',
    }),
  })

  return {
    id: workspace.store?.id || `store-access-${Date.now()}`,
    snapshot,
    user: accessUser,
  }
}

function mergeBackendOrderIntoLocal(localOrder, backendOrder) {
  const mapped = backendOrderToFrontOrder(backendOrder)

  return normalizeOrderRecord({
    ...localOrder,
    backendId: mapped.backendId,
    backendCreatedAt: mapped.backendCreatedAt,
    backendUpdatedAt: mapped.backendUpdatedAt,
    status: mapped.status || localOrder.status,
    syncStatus: 'synced',
    syncMessage: 'Sincronizado com API',
    syncedAt: nowDateTime(),
  })
}

function mergeBackendOrders(localOrders = [], backendOrders = []) {
  const backendById = new Map(backendOrders.map((order) => [order.id, order]))
  const backendByLocalReference = new Map(
    backendOrders
      .map((order) => [getBackendLocalReference(order), order])
      .filter(([localReference]) => Boolean(localReference)),
  )
  const usedBackendIds = new Set()
  const mergedLocalOrders = localOrders.map((localOrder) => {
    const backendOrder = (localOrder.backendId && backendById.get(localOrder.backendId))
      || backendByLocalReference.get(String(localOrder.id))

    if (!backendOrder) {
      return localOrder
    }

    usedBackendIds.add(backendOrder.id)
    return mergeBackendOrderIntoLocal(localOrder, backendOrder)
  })
  const addedBackendOrders = backendOrders
    .filter((order) => !usedBackendIds.has(order.id))
    .map(backendOrderToFrontOrder)

  return [...mergedLocalOrders, ...addedBackendOrders]
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
    case 'filter':
      return <svg {...props}><path d="M4 6h16l-6.4 7.4V19l-3.2-1.7v-3.9L4 6Z" /></svg>
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>
    case 'upload':
      return <svg {...props}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></svg>
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
    case 'share':
      return <svg {...props}><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="m8.3 10.7 7.4-4.4M8.3 13.3l7.4 4.4" /></svg>
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

function OrderUtilitySheet({ title, children, footer, onClose }) {
  return (
    <div className="pos-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="pos-sheet" role="dialog" aria-modal="true" aria-labelledby="pos-sheet-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="pos-sheet__header">
          <h3 id="pos-sheet-title">{title}</h3>
          <button className="icon-btn" type="button" onClick={onClose}>
            <Icon name="x" size={19} />
          </button>
        </header>
        <div className="pos-sheet__body">{children}</div>
        {footer ? <footer className="pos-sheet__footer">{footer}</footer> : null}
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

function OsmDeliveryMap({
  title = 'Mapa',
  center,
  zoom = 14,
  storeProfile,
  zones = [],
  routes = [],
  address = null,
  editorPoints = [],
  editingZoneId = '',
  onMapClick,
  onMoveEditorPoint,
  onSelectEditorPoint,
  selectedEditorPointIndex = null,
}) {
  const canvasRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 520 })
  const mapSize = canvasSize.width > 0 && canvasSize.height > 0 ? canvasSize : { width: 1000, height: 520 }
  const initialCenter = center || DEFAULT_MAP_COORDINATES
  const [viewCenter, setViewCenter] = useState({
    lat: normalizeCoordinate(initialCenter.lat) ?? DEFAULT_MAP_COORDINATES.lat,
    lng: normalizeCoordinate(initialCenter.lng) ?? DEFAULT_MAP_COORDINATES.lng,
  })
  const [viewZoom, setViewZoom] = useState(zoom)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const dragRef = useRef(null)
  const pointDragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const centerPoint = latLngToWorldPoint(viewCenter.lat, viewCenter.lng, viewZoom)
  const topLeft = {
    x: centerPoint.x - mapSize.width / 2,
    y: centerPoint.y - mapSize.height / 2,
  }
  const scaleTiles = 2 ** viewZoom
  const firstTileX = Math.floor(topLeft.x / OSM_TILE_SIZE)
  const lastTileX = Math.floor((topLeft.x + mapSize.width) / OSM_TILE_SIZE)
  const firstTileY = Math.floor(topLeft.y / OSM_TILE_SIZE)
  const lastTileY = Math.floor((topLeft.y + mapSize.height) / OSM_TILE_SIZE)
  const tiles = []
  const storeCoordinates = getStoreCoordinates(storeProfile)
  const storePosition = getPointPositionOnMap(storeCoordinates, topLeft, mapSize, viewZoom)
  const selectedAddressCoordinates = address ? getAddressCoordinates(address) : null
  const selectedAddressPosition = selectedAddressCoordinates
    ? getPointPositionOnMap(selectedAddressCoordinates, topLeft, mapSize, viewZoom)
    : null

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setViewCenter({
        lat: normalizeCoordinate(center?.lat) ?? DEFAULT_MAP_COORDINATES.lat,
        lng: normalizeCoordinate(center?.lng) ?? DEFAULT_MAP_COORDINATES.lng,
      })
      setViewZoom(zoom)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [center?.lat, center?.lng, zoom])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return undefined
    }

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect()
      const nextSize = {
        width: Math.max(Math.round(rect.width), 1),
        height: Math.max(Math.round(rect.height), 1),
      }

      setCanvasSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
      )
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver(() => {
      updateSize()
    })

    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  function getCoordinatesFromClientPosition(clientX, clientY) {
    const canvas = canvasRef.current

    if (!canvas) {
      return DEFAULT_MAP_COORDINATES
    }

    const rect = canvas.getBoundingClientRect()
    const x = topLeft.x + ((clientX - rect.left) / rect.width) * mapSize.width
    const y = topLeft.y + ((clientY - rect.top) / rect.height) * mapSize.height
    return worldPointToLatLng(x, y, viewZoom)
  }

  for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
      if (tileY < 0 || tileY >= scaleTiles) {
        continue
      }

      const wrappedTileX = ((tileX % scaleTiles) + scaleTiles) % scaleTiles
      tiles.push({
        key: `${tileX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${viewZoom}/${wrappedTileX}/${tileY}.png`,
        left: tileX * OSM_TILE_SIZE - topLeft.x,
        top: tileY * OSM_TILE_SIZE - topLeft.y,
        width: OSM_TILE_SIZE,
        height: OSM_TILE_SIZE,
      })
    }
  }

  function setZoomAt(nextZoom, event = null) {
    const normalizedZoom = Math.max(11, Math.min(18, nextZoom))

    if (normalizedZoom === viewZoom) {
      return
    }

    if (!event?.currentTarget) {
      setViewZoom(normalizedZoom)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const ratioX = (event.clientX - rect.left) / rect.width
    const ratioY = (event.clientY - rect.top) / rect.height
    const currentWorldX = topLeft.x + ratioX * mapSize.width
    const currentWorldY = topLeft.y + ratioY * mapSize.height
    const anchor = worldPointToLatLng(currentWorldX, currentWorldY, viewZoom)
    const anchorWorldAtNextZoom = latLngToWorldPoint(anchor.lat, anchor.lng, normalizedZoom)
    const nextCenterWorld = clampMapCenterWorld({
      x: anchorWorldAtNextZoom.x - (ratioX - 0.5) * mapSize.width,
      y: anchorWorldAtNextZoom.y - (ratioY - 0.5) * mapSize.height,
    }, mapSize, normalizedZoom)

    setViewCenter(worldPointToLatLng(nextCenterWorld.x, nextCenterWorld.y, normalizedZoom))
    setViewZoom(normalizedZoom)
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || event.target.closest('button') || pointDragRef.current) {
      return
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerWorld: latLngToWorldPoint(viewCenter.lat, viewCenter.lng, viewZoom),
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
  }

  function handlePointerMove(event) {
    const drag = dragRef.current

    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY

    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
      drag.moved = true
    }

    const nextWorld = {
      x: drag.centerWorld.x - (deltaX / rect.width) * mapSize.width,
      y: drag.centerWorld.y - (deltaY / rect.height) * mapSize.height,
    }

    const nextCenterWorld = clampMapCenterWorld(nextWorld, mapSize, viewZoom)
    setViewCenter(worldPointToLatLng(nextCenterWorld.x, nextCenterWorld.y, viewZoom))
  }

  function finishPointerInteraction(event) {
    const drag = dragRef.current

    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    suppressClickRef.current = drag.moved
    dragRef.current = null
    setIsDragging(false)

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture can already be released by the browser.
    }
  }

  function handleWheel(event) {
    event.preventDefault()
    event.stopPropagation()
    setZoomAt(viewZoom + (event.deltaY < 0 ? 1 : -1), event)
  }

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return undefined
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  })

  function handleMapClick(event) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }

    if (!onMapClick) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const x = topLeft.x + ((event.clientX - rect.left) / rect.width) * mapSize.width
    const y = topLeft.y + ((event.clientY - rect.top) / rect.height) * mapSize.height
    const coordinates = worldPointToLatLng(x, y, viewZoom)

    onMapClick([coordinates.lng, coordinates.lat])
  }

  function handleEditorPointPointerDown(event, index) {
    if (!onMoveEditorPoint && !onSelectEditorPoint) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    pointDragRef.current = {
      pointerId: event.pointerId,
      index,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    suppressClickRef.current = false
    setIsDraggingPoint(Boolean(onMoveEditorPoint))
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleEditorPointPointerMove(event, index) {
    const pointDrag = pointDragRef.current

    if (!pointDrag || pointDrag.pointerId !== event.pointerId || pointDrag.index !== index || !onMoveEditorPoint) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const deltaX = event.clientX - pointDrag.startX
    const deltaY = event.clientY - pointDrag.startY

    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      pointDrag.moved = true
      suppressClickRef.current = true
    }

    const coordinates = getCoordinatesFromClientPosition(event.clientX, event.clientY)
    onMoveEditorPoint(index, [coordinates.lng, coordinates.lat])
  }

  function finishEditorPointPointer(event, index) {
    const pointDrag = pointDragRef.current

    if (!pointDrag || pointDrag.pointerId !== event.pointerId || pointDrag.index !== index) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (!pointDrag.moved) {
      onSelectEditorPoint?.(index)
    }

    pointDragRef.current = null
    setIsDraggingPoint(false)

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture can already be released by the browser.
    }
  }

  return (
    <section className={`osm-map ${onMapClick ? 'osm-map--editable' : ''} ${isDragging || isDraggingPoint ? 'is-dragging' : ''}`.trim()}>
      <div
        className="osm-map__canvas"
        ref={canvasRef}
        role="application"
        tabIndex={0}
        aria-label={title}
        onClick={handleMapClick}
        onPointerCancel={finishPointerInteraction}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
      >
        {tiles.map((tile) => (
          <img
            alt=""
            className="osm-map__tile"
            draggable="false"
            key={tile.key}
            src={tile.src}
            style={{
              left: `${tile.left}px`,
              top: `${tile.top}px`,
              width: `${tile.width}px`,
              height: `${tile.height}px`,
            }}
          />
        ))}

        <svg
          className="osm-map__overlay"
          viewBox={`0 0 ${mapSize.width} ${mapSize.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {zones
            .filter((zone) => zone.polygon?.length >= 4)
            .map((zone) => (
              <polygon
                className={`osm-map__zone ${zone.id === editingZoneId ? 'is-editing' : ''}`.trim()}
                fill={zone.color || DELIVERY_ZONE_COLORS[0]}
                key={zone.id}
                points={getPolygonSvgPoints(zone.polygon, topLeft, mapSize, viewZoom)}
                stroke={zone.color || DELIVERY_ZONE_COLORS[0]}
              />
            ))}

          {editorPoints.length >= 2 ? (
            <polyline
              className="osm-map__editor-line"
              points={getPolygonSvgPoints(getDeliveryZoneEditorOutline(editorPoints), topLeft, mapSize, viewZoom)}
            />
          ) : null}
        </svg>

        <span className="osm-map__marker osm-map__marker--store" style={{ left: `${storePosition.x}px`, top: `${storePosition.y}px` }}>
          Loja
        </span>

        {selectedAddressPosition ? (
          <span
            className="osm-map__marker osm-map__marker--address"
            style={{
              left: `${selectedAddressPosition.x}px`,
              top: `${selectedAddressPosition.y}px`,
            }}
          >
            Cliente
          </span>
        ) : null}

        {routes.map((route, index) => {
          const routeCoordinates = getAddressCoordinates(route)

          if (!routeCoordinates) {
            return null
          }

          const position = getPointPositionOnMap(routeCoordinates, topLeft, mapSize, viewZoom)

          return (
            <span className="osm-map__marker osm-map__marker--route" key={route.id} style={{ left: `${position.x}px`, top: `${position.y}px` }}>
              {String.fromCharCode(65 + index)}
            </span>
          )
        })}

        {editorPoints.map(([lng, lat], index) => {
          const position = getPointPositionOnMap({ lat, lng }, topLeft, mapSize, viewZoom)
          const isSelected = selectedEditorPointIndex === index

          return (
            <button
              aria-pressed={isSelected}
              className={`osm-map__point ${isSelected ? 'is-selected' : ''}`.trim()}
              key={`${lng}-${lat}-${index}`}
              style={{ left: `${position.x}px`, top: `${position.y}px` }}
              type="button"
              onPointerCancel={(event) => finishEditorPointPointer(event, index)}
              onPointerDown={(event) => handleEditorPointPointerDown(event, index)}
              onPointerMove={(event) => handleEditorPointPointerMove(event, index)}
              onPointerUp={(event) => finishEditorPointPointer(event, index)}
              title={isSelected ? 'Ponto selecionado' : 'Selecionar ponto'}
            >
              {index + 1}
            </button>
          )
        })}

        <div className="osm-map__controls">
          <button type="button" onClick={(event) => { event.stopPropagation(); setZoomAt(viewZoom + 1) }}>+</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); setZoomAt(viewZoom - 1) }}>-</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); setViewCenter(storeCoordinates); setViewZoom(15) }}>Loja</button>
        </div>
      </div>

      <footer className="osm-map__footer">
        <span>{formatCoordinate(viewCenter.lat)}, {formatCoordinate(viewCenter.lng)} - zoom {viewZoom}</span>
        <a href={buildOsmViewUrl(viewCenter)} target="_blank" rel="noreferrer">Abrir OpenStreetMap</a>
      </footer>
    </section>
  )
}

function DeliveryAddressMap({ address, title = 'Mapa do endereco' }) {
  const coordinates = getAddressCoordinates(address)

  if (!coordinates) {
    return null
  }

  return (
    <section className="delivery-map-card">
      <iframe
        title={title}
        src={buildOsmEmbedUrl(coordinates)}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <footer>
        <span>{formatCoordinate(coordinates.lat)}, {formatCoordinate(coordinates.lng)}</span>
        <a href={buildOsmViewUrl(coordinates)} target="_blank" rel="noreferrer">Abrir OpenStreetMap</a>
      </footer>
    </section>
  )
}

function DeliveryRouteMap({ routes, storeProfile, zones }) {
  const center = getDeliveryMapCenter({ storeProfile, routes, zones })

  return (
    <OsmDeliveryMap
      center={center}
      routes={routes}
      storeProfile={storeProfile}
      title="Mapa de entregas"
      zones={zones}
      zoom={14}
    />
  )
}

function StoreBadge({ label = 'MC' }) {
  return (
    <span className="store-badge" aria-hidden="true">
      <span>{label}</span>
    </span>
  )
}

function Sidebar({
  activeNav,
  storeOpen,
  cashOpen,
  storeProfile,
  onOpenModal,
  onSetActiveNav,
}) {
  return (
    <aside className="sidebar" aria-label="Navegacao principal">
      <button className="store-profile" data-testid="store-profile" type="button" onClick={() => onOpenModal('store')}>
        <StoreBadge label={getStoreInitials(storeProfile)} />
        <span>
          <strong>{storeProfile.name || 'Nova loja'}</strong>
          <small>{storeOpen ? 'Loja aberta agora' : 'Loja fechada para pedidos'}</small>
        </span>
      </button>

      <button
        className={`store-card ${storeOpen ? 'is-open' : 'is-closed'}`}
        data-testid="open-store-status"
        type="button"
        onClick={() => onOpenModal('storeStatus')}
      >
        <span>
          <Icon name="store" size={18} />
        </span>
        <strong>Loja</strong>
        <small>{storeOpen ? 'Aberta' : 'Fechada'}</small>
      </button>

      <button className="cash-card" data-testid="open-cash" type="button" onClick={() => onOpenModal('cash')}>
        <span>
          <Icon name="cash" size={21} />
        </span>
        <strong>Caixa</strong>
        <small>{cashOpen ? 'Aberto' : 'Fechado'}</small>
      </button>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
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
          <strong>Conta e dados</strong>
          <small>Cadastro, backup e ambiente demo</small>
        </span>
      </button>
    </aside>
  )
}

function TopBar({ currentStoreUser, onLogout, onOpenModal, notificationCount, pilotSync }) {
  const pilotStatus = getPilotStatusMeta(pilotSync)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark">MC</span>
        <span>
          <strong>MeuCardapio</strong>
          <small>PDV e gestao para restaurantes</small>
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
        <button
          className={`topbar-action topbar-action--pilot topbar-action--${pilotStatus.tone}`.trim()}
          data-testid="open-pilot"
          type="button"
          onClick={() => onOpenModal('pilot')}
        >
          <Icon name="chain" size={19} />
          <span>{pilotStatus.label}</span>
        </button>
        <button className="topbar-action" data-testid="open-automations" type="button" onClick={() => onOpenModal('automations')}>
          <Icon name="bolt" size={19} />
          <span>Automacoes</span>
        </button>
        <button className="topbar-action" data-testid="open-printer" type="button" onClick={() => onOpenModal('printer')}>
          <Icon name="printer" size={19} />
          <span>Impressora</span>
        </button>
        <button className="topbar-action" data-testid="logout-store" type="button" onClick={onLogout}>
          <Icon name="user" size={19} />
          <span>{currentStoreUser?.name || 'Usuario'}</span>
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

function Metrics({ orders, storeOpen }) {
  const todayOrders = filterRecordsByPeriod(orders, 'today')
  const activeOrders = todayOrders.filter((order) => order.status !== 'completed')
  const ready = activeOrders.filter((order) => order.status === 'ready').length
  const production = activeOrders.filter((order) => order.status === 'production').length
  const revenue = todayOrders.reduce((sum, order) => sum + order.total, 0)

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
      <article className={`metric-card metric-card--status ${storeOpen ? 'is-open' : ''}`}>
        <span>Status</span>
        <strong>{storeOpen ? 'Loja aberta' : 'Loja fechada'}</strong>
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

function OrderCard({ order, stage, onOpenModal, onMoveOrder, onPrintOrder }) {
  const fulfillmentMeta = getOrderFulfillmentMeta(order)
  const syncMeta = getOrderSyncMeta(order)

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
          <Icon name={fulfillmentMeta.icon} size={15} />
          {fulfillmentMeta.label}
        </span>
        <span>
          <Icon name="clock" size={15} />
          {order.time}
        </span>
        <span>
          <Icon name="card" size={15} />
          {order.payment}
        </span>
        <span className={`order-card__sync order-card__sync--${syncMeta.tone}`.trim()} title={syncMeta.description}>
          <Icon name={syncMeta.tone === 'success' ? 'check' : syncMeta.tone === 'danger' ? 'x' : 'chain'} size={15} />
          {syncMeta.label}
        </span>
      </div>
      <p>{order.items.join(', ')}</p>
      <footer>
        <Button onClick={() => onOpenModal('orderDetails', order)}>Detalhes</Button>
        <Button onClick={() => onPrintOrder(order, 'order')}>
          <Icon name="printer" size={14} />
          Imprimir
        </Button>
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

function StageColumn({ stage, orders, onOpenModal, onMoveOrder, onPrintOrder }) {
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
              onPrintOrder={onPrintOrder}
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

function Board({ visibleOrders, onOpenModal, onMoveOrder, onPrintOrder }) {
  return (
    <section className="board" aria-label="Fluxo de pedidos">
      {stages.map((stage) => (
        <StageColumn
          key={stage.id}
          stage={stage}
          orders={visibleOrders.filter((order) => order.status === stage.id)}
          onOpenModal={onOpenModal}
          onMoveOrder={onMoveOrder}
          onPrintOrder={onPrintOrder}
        />
      ))}
    </section>
  )
}

function OrdersSideRail({ orders, blockedOrders, suggestions, onOpenModal }) {
  const serviceAlerts = orders
    .filter((order) => order.status !== 'completed' && (getOrderSource(order) === 'WhatsApp' || order.status === 'analysis'))
    .slice(0, 3)
  const pendingAlerts = [
    ...blockedOrders.map((order) => ({
      id: `blocked-${order.id}`,
      title: `#${order.id} - ${order.customer}`,
      detail: order.reason,
      action: () => onOpenModal('blocked'),
    })),
    ...orders
      .filter((order) => order.status === 'ready')
      .slice(0, 2)
      .map((order) => ({
        id: `ready-${order.id}`,
        title: `#${order.id} - ${order.customer}`,
        detail: 'Pedido pronto aguardando finalizacao.',
        action: () => onOpenModal('orderDetails', order),
      })),
  ].slice(0, 4)
  const requestAlerts = suggestions.length > 0
    ? suggestions.slice(0, 3).map((item) => ({
      id: item.id,
      title: 'Solicitacao interna',
      detail: item.text,
      action: () => onOpenModal('suggestion'),
    }))
    : orders
      .filter((order) => order.note)
      .slice(0, 3)
      .map((order) => ({
        id: `note-${order.id}`,
        title: `#${order.id} - ${order.customer}`,
        detail: order.note,
        action: () => onOpenModal('orderDetails', order),
      }))

  return (
    <aside className="activity-panel activity-panel--rail">
      <header>
        <strong>Central lateral</strong>
        <small>{serviceAlerts.length + pendingAlerts.length + requestAlerts.length} alerta(s)</small>
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

      <div className="activity-stack">
        <section className="activity-group">
          <div className="activity-group__header">
            <strong>Atendimento</strong>
            <small>{serviceAlerts.length}</small>
          </div>
          <div className="activity-list">
            {serviceAlerts.map((order) => (
              <button type="button" key={order.id} onClick={() => onOpenModal('orderDetails', order)}>
                <span>#{order.id} - {order.customer}</span>
                <strong>{getOrderStageLabel(order.status)}</strong>
                <small>{getOrderSource(order)} - ETA {getOrderEta(order)}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="activity-group">
          <div className="activity-group__header">
            <strong>Pendencias</strong>
            <small>{pendingAlerts.length}</small>
          </div>
          <div className="activity-list">
            {pendingAlerts.length > 0 ? pendingAlerts.map((item) => (
              <button type="button" key={item.id} onClick={item.action}>
                <span>{item.title}</span>
                <strong>Pendente</strong>
                <small>{item.detail}</small>
              </button>
            )) : <div className="empty-modal">Sem pendencias agora.</div>}
          </div>
        </section>

        <section className="activity-group">
          <div className="activity-group__header">
            <strong>Solicitacoes</strong>
            <small>{requestAlerts.length}</small>
          </div>
          <div className="activity-list">
            {requestAlerts.length > 0 ? requestAlerts.map((item) => (
              <button type="button" key={item.id} onClick={item.action}>
                <span>{item.title}</span>
                <strong>Solicitacao</strong>
                <small>{item.detail}</small>
              </button>
            )) : <div className="empty-modal">Nenhuma solicitacao registrada.</div>}
          </div>
        </section>
      </div>
    </aside>
  )
}

function StatusBadge({ children, tone = 'neutral' }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>
}

function sourceKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function getOrderSource(order) {
  if (order.source) {
    return order.source
  }

  if (inferOrderFulfillment(order) === 'dinein') {
    return order.payment === 'Mesa' ? 'Mesa' : 'Salao'
  }

  if (order.payment === 'Mesa' || /^mesa/i.test(order.address || '')) {
    return 'Mesa'
  }

  if (order.channel === 'pickup') {
    return Number(order.id) % 2 === 0 ? 'Balcao' : 'WhatsApp'
  }

  const remoteSources = ['WhatsApp', 'iFood', 'Instagram', 'Cardapio Digital']
  return remoteSources[Number(order.id) % remoteSources.length]
}

function getOrderStageLabel(status) {
  const labels = {
    analysis: 'Em analise',
    production: 'Em preparo',
    ready: 'Pronto',
    completed: 'Concluido',
  }

  return labels[status] || status
}

function getOrderEta(order) {
  const fulfillment = inferOrderFulfillment(order)

  const etaMap = {
    analysis: fulfillment === 'delivery' ? '8 min' : '4 min',
    production: fulfillment === 'delivery' ? '26 min' : fulfillment === 'dinein' ? '12 min' : '14 min',
    ready: fulfillment === 'delivery' ? '12 min' : fulfillment === 'dinein' ? 'Servir na mesa' : 'Retirada imediata',
    completed: 'Encerrado',
  }

  return etaMap[order.status] || 'A conferir'
}

function getRouteProgress(order) {
  const progressMap = {
    analysis: 24,
    production: 58,
    ready: order.courier ? 86 : 74,
    completed: 100,
  }

  return progressMap[order.status] || 0
}

function SourceBadge({ source }) {
  return <span className={`source-badge source-badge--${sourceKey(source)}`}>{source}</span>
}

function OrdersCommandCenter({ orders, blockedOrders, onOpenModal, onSetActiveNav }) {
  const activeOrders = orders.filter((order) => order.status !== 'completed')
  const whatsappOrders = activeOrders.filter((order) => getOrderSource(order) === 'WhatsApp')
  const counterOrders = activeOrders.filter((order) => getOrderSource(order) === 'Balcao')
  const awaitingReview = activeOrders.filter((order) => order.status === 'analysis')
  const readyOrders = activeOrders.filter((order) => order.status === 'ready')
  const averageTicket = activeOrders.length > 0
    ? activeOrders.reduce((sum, order) => sum + order.total, 0) / activeOrders.length
    : 0

  return (
    <section className="command-center" aria-label="Central omnichannel">
      <article className="command-card command-card--compact">
        <div className="command-card__eyebrow">Operacao rapida</div>
        <div className="command-metrics">
          <div>
            <span>WhatsApp</span>
            <strong>{whatsappOrders.length}</strong>
          </div>
          <div>
            <span>Balcao</span>
            <strong>{counterOrders.length}</strong>
          </div>
          <div>
            <span>Em analise</span>
            <strong>{awaitingReview.length}</strong>
          </div>
          <div>
            <span>Na saida</span>
            <strong>{readyOrders.length}</strong>
          </div>
          <div>
            <span>Ticket medio</span>
            <strong>{formatCurrency(averageTicket || 0)}</strong>
          </div>
          <div>
            <span>Bloqueados</span>
            <strong>{blockedOrders.length}</strong>
          </div>
          <div>
            <span>Pedidos ativos</span>
            <strong>{activeOrders.length}</strong>
          </div>
        </div>
        <div className="command-actions">
          <Button variant="primary" onClick={() => onOpenModal('newOrder')}>Novo pedido</Button>
          <Button onClick={() => onSetActiveNav('service')}>Atendimento</Button>
          <Button onClick={() => onOpenModal('blocked')}>Pendencias</Button>
        </div>
      </article>
    </section>
  )
}

function ServiceInbox({ orders, chatMessages, onOpenModal }) {
  const inbox = orders
    .filter((order) => order.status !== 'completed')
    .slice(0, 6)
    .map((order, index) => ({
      id: order.id,
      order,
      customer: order.customer,
      source: getOrderSource(order),
      status: order.status === 'analysis' ? 'Precisa de aceite' : order.status === 'ready' ? 'Cliente esperando' : 'Robo conduzindo',
      owner: order.status === 'analysis' ? 'Fila humana' : 'Robo + operacao',
      wait: index === 0 ? 'Agora' : `${index * 3 + 2} min`,
      preview: order.note || 'Cliente aguardando retorno sobre o pedido.',
    }))
  const [selectedConversationId, setSelectedConversationId] = useState(inbox[0]?.id || null)

  const selectedConversation = inbox.find((conversation) => conversation.id === selectedConversationId) || inbox[0] || null
  const latestChat = chatMessages[chatMessages.length - 1]

  if (!selectedConversation) {
    return null
  }

  const transcript = [
    { id: 'bot', author: 'Robo', text: `Oi ${selectedConversation.customer}, posso te ajudar com o pedido #${selectedConversation.order.id}?`, tone: 'bot' },
    { id: 'client', author: selectedConversation.customer, text: selectedConversation.preview, tone: 'client' },
    { id: 'team', author: 'Equipe', text: latestChat?.text || 'Tudo certo por aqui. Vamos confirmar o melhor fluxo para voce.', tone: 'team' },
  ]

  return (
    <article className="module-card module-card--span">
      <header className="module-card__header">
        <div>
          <h2>Inbox humano + robo</h2>
          <p>Visual de atendimento com conversa, handoff e acesso ao pedido.</p>
        </div>
        <Button variant="primary" onClick={() => onOpenModal('chat')}>Abrir chat</Button>
      </header>

      <div className="inbox-layout">
        <aside className="inbox-list">
          {inbox.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              className={`inbox-list__item ${conversation.id === selectedConversation.id ? 'is-active' : ''}`.trim()}
              onClick={() => setSelectedConversationId(conversation.id)}
            >
              <span>
                <strong>{conversation.customer}</strong>
                <small>{conversation.status}</small>
              </span>
              <span>
                <SourceBadge source={conversation.source} />
                <small>{conversation.wait}</small>
              </span>
            </button>
          ))}
        </aside>

        <section className="inbox-thread">
          <header className="inbox-thread__header">
            <div>
              <strong>{selectedConversation.customer}</strong>
              <small>{selectedConversation.owner} - {selectedConversation.status}</small>
            </div>
            <div className="inbox-thread__actions">
              <Button onClick={() => onOpenModal('orderDetails', selectedConversation.order)}>Pedido</Button>
              <Button onClick={() => onOpenModal('newCoupon')}>Cupom</Button>
              <Button variant="primary" onClick={() => onOpenModal('chat')}>Assumir</Button>
            </div>
          </header>

          <div className="thread-messages">
            {transcript.map((message) => (
              <article className={`thread-message thread-message--${message.tone}`} key={message.id}>
                <strong>{message.author}</strong>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <footer className="thread-replies">
            <button type="button">Confirmar endereco</button>
            <button type="button">Oferecer upsell</button>
            <button type="button">Transferir para humano</button>
          </footer>
        </section>
      </div>
    </article>
  )
}

function MenuPreviewPanel({ storeProfile, categories, products, coupons, qrCodes, onOpenModal }) {
  const activeProducts = products.filter(isProductAvailable)
  const [previewProductId, setPreviewProductId] = useState(activeProducts[0]?.id || null)

  const previewProduct = activeProducts.find((product) => product.id === previewProductId) || activeProducts[0] || null
  const upsellProducts = activeProducts.filter((product) => product.id !== previewProduct?.id).slice(0, 3)
  const activeCoupon = coupons.find((coupon) => coupon.active) || null
  const leadQr = qrCodes[0] || null

  if (!previewProduct) {
    return null
  }

  return (
    <section className="menu-preview-grid">
      <article className="menu-preview-card">
        <header className="menu-preview-card__header">
          <div>
            <span>Modo cliente</span>
            <strong>{storeProfile.name}</strong>
          </div>
          <Button onClick={() => onOpenModal('newQr')}>QR</Button>
        </header>
        <div className="menu-phone">
          <div className="menu-phone__hero">
            <small>{storeProfile.schedule}</small>
            <strong>{previewProduct.name}</strong>
            <p>{previewProduct.category} com pagamento online, agendamento e retirada.</p>
          </div>
          <div className="menu-phone__chips">
            {categories.slice(0, 4).map((category) => (
              <span key={category.id}>{category.name}</span>
            ))}
          </div>
          <article className="menu-phone__product">
            <span className="product-thumb" />
            <div>
              <strong>{previewProduct.name}</strong>
              <small>A partir de {formatCurrency(previewProduct.price)}</small>
            </div>
            <Button variant="primary" onClick={() => setPreviewProductId(previewProduct.id)}>Ver item</Button>
          </article>
          <div className="menu-phone__upsell">
            <span>Pece tambem</span>
            {upsellProducts.map((product) => (
              <button type="button" key={product.id} onClick={() => setPreviewProductId(product.id)}>
                <strong>{product.name}</strong>
                <small>{formatCurrency(product.price)}</small>
              </button>
            ))}
          </div>
        </div>
      </article>

      <article className="menu-preview-card">
        <header className="menu-preview-card__header">
          <div>
            <span>Checkout e fidelizacao</span>
            <strong>O que ainda faltava no visual ja aparece aqui</strong>
          </div>
          <Button variant="primary" onClick={() => onOpenModal('newCoupon')}>Cupom</Button>
        </header>
        <div className="checkout-preview">
          <div className="checkout-preview__summary">
            <span>Total estimado</span>
            <strong>{formatCurrency(previewProduct.price + upsellProducts.slice(0, 1).reduce((sum, product) => sum + product.price, 0))}</strong>
            <small>Cartao, dinheiro, carteiras digitais e pagamento dividido.</small>
          </div>
          <div className="checkout-preview__blocks">
            <article>
              <strong>Agendamento</strong>
              <small>Hoje 20:15 ou retirada imediata.</small>
            </article>
            <article>
              <strong>Taxa de entrega</strong>
              <small>Raio de {storeProfile.deliveryRadius} km com bairros e regioes.</small>
            </article>
            <article>
              <strong>Peça de novo</strong>
              <small>Historico do cliente com repeticao rapida e sugestoes.</small>
            </article>
            <article>
              <strong>Cashback</strong>
              <small>{activeCoupon ? `${activeCoupon.code} ativo para recompra.` : 'Pronto para ativar campanhas.'}</small>
            </article>
          </div>
          <div className="checkout-preview__footer">
            <div>
              <span>Autoatendimento</span>
              <strong>{leadQr ? `${leadQr.table} com QR ativo` : 'Gerar QR para mesa'}</strong>
            </div>
            <Button onClick={() => onOpenModal('botTraining')}>Treinar robo</Button>
          </div>
        </div>
      </article>
    </section>
  )
}

function WaiterConsole({ tables, orders, qrCodes, onOpenModal }) {
  const [activeTableId, setActiveTableId] = useState(tables[0]?.id || null)

  const activeTable = tables.find((table) => table.id === activeTableId) || tables[0] || null

  if (!activeTable) {
    return null
  }

  const tableOrders = orders.filter((order) =>
    order.address === activeTable.name
    || order.customer === activeTable.customer
    || (order.payment === 'Mesa' && order.customer === activeTable.customer),
  )
  const qrCode = qrCodes.find((qr) => qr.table === activeTable.name) || null

  return (
    <section className="waiter-console">
      <article className="waiter-console__device">
        <header>
          <div>
            <span>Modo garcom</span>
            <strong>Aplicacao de mesa e comanda</strong>
          </div>
          <Button onClick={() => onOpenModal('newQr')}>Novo QR</Button>
        </header>
        <div className="waiter-phone">
          {tables.map((table) => (
            <button
              type="button"
              key={table.id}
              className={`waiter-phone__table ${table.id === activeTable.id ? 'is-active' : ''}`.trim()}
              onClick={() => setActiveTableId(table.id)}
            >
              <span>{table.name}</span>
              <strong>{table.customer || 'Livre'}</strong>
              <small>{formatCurrency(table.total)}</small>
            </button>
          ))}
        </div>
      </article>

      <article className="waiter-console__detail">
        <header>
          <div>
            <span>Mesa selecionada</span>
            <strong>{activeTable.name}</strong>
          </div>
          <StatusBadge tone={activeTable.status === 'free' ? 'success' : activeTable.status === 'closing' ? 'warning' : 'danger'}>
            {activeTable.status === 'free' ? 'Livre' : activeTable.status === 'closing' ? 'Fechando' : 'Ativa'}
          </StatusBadge>
        </header>
        <div className="waiter-stats">
          <article>
            <span>Cliente</span>
            <strong>{activeTable.customer || 'Aguardando abertura'}</strong>
          </article>
          <article>
            <span>Pedidos ligados</span>
            <strong>{tableOrders.length}</strong>
          </article>
          <article>
            <span>QR na mesa</span>
            <strong>{qrCode ? `${qrCode.scans} leitura(s)` : 'Sem QR'}</strong>
          </article>
          <article>
            <span>Fechamento</span>
            <strong>{formatCurrency(activeTable.total)}</strong>
          </article>
        </div>
        <div className="waiter-actions">
          <Button variant="primary" onClick={() => onOpenModal('tableOrder', activeTable)}>Adicionar pedido</Button>
          <Button onClick={() => onOpenModal(qrCode ? 'printQr' : 'newQr', qrCode || null)}>
            {qrCode ? 'Imprimir QR' : 'Gerar QR'}
          </Button>
          <Button onClick={() => onOpenModal('closeTable', activeTable)}>Fechar conta</Button>
        </div>
      </article>
    </section>
  )
}

function DeliveryRadar({ orders, couriers, onOpenModal }) {
  const routes = orders
    .filter((order) => order.channel === 'delivery' && order.status !== 'completed')
    .map((order, index) => ({
      ...order,
      source: getOrderSource(order),
      eta: getOrderEta(order),
      route: `Rota ${String.fromCharCode(65 + index)}`,
      progress: getRouteProgress(order),
    }))

  if (routes.length === 0) {
    return null
  }

  return (
    <article className="module-card module-card--span">
      <header className="module-card__header">
        <div>
          <h2>Radar de entrega</h2>
          <p>Rota, ETA, origem e entregador em uma visualizacao mais apresentavel.</p>
        </div>
        <Button onClick={() => onOpenModal('deliveryMap')}>Mapa expandido</Button>
      </header>

      <div className="delivery-radar">
        <div className="delivery-radar__summary">
          <article>
            <span>Rotas abertas</span>
            <strong>{routes.length}</strong>
          </article>
          <article>
            <span>Entregadores ativos</span>
            <strong>{couriers.filter((courier) => courier.active).length}</strong>
          </article>
          <article>
            <span>Pedidos sem motoboy</span>
            <strong>{routes.filter((route) => !route.courier).length}</strong>
          </article>
        </div>

        <div className="route-grid">
          {routes.map((route) => (
            <article className="route-card" key={route.id}>
              <header>
                <div>
                  <strong>{route.route}</strong>
                  <small>Pedido #{route.id} - {route.customer}</small>
                </div>
                <SourceBadge source={route.source} />
              </header>
              <div className="route-card__progress">
                <span style={{ width: `${route.progress}%` }} />
              </div>
              <div className="route-card__meta">
                <span>ETA {route.eta}</span>
                <span>{route.courier || 'Aguardando atribuicao'}</span>
                <span>{getOrderStageLabel(route.status)}</span>
              </div>
              <footer>
                <Button onClick={() => onOpenModal('orderDetails', route)}>Detalhes</Button>
                {!route.courier ? <Button variant="primary" onClick={() => onOpenModal('assignDelivery', route)}>Atribuir</Button> : null}
              </footer>
            </article>
          ))}
        </div>
      </div>
    </article>
  )
}

function CashDeskPanel({ orders, finance, cashOpen, cashOpenedAt, onOpenModal }) {
  const cashOrders = cashOpenedAt ? orders.filter((order) => isRecordInRange(order, parseRecordDate(cashOpenedAt), null)) : orders
  const cashFinance = cashOpenedAt ? finance.filter((item) => isRecordInRange(item, parseRecordDate(cashOpenedAt), null)) : finance
  const paymentMix = ['Cartao', 'Dinheiro', 'Dividir', 'Mesa'].map((payment) => ({
    payment,
    amount: cashOrders
      .filter((order) => order.payment === payment)
      .reduce((sum, order) => sum + order.total, 0),
  }))
  const pendingFinance = cashFinance.filter((item) => item.status !== 'Pago')
  const drawerEstimate = paymentMix.find((item) => item.payment === 'Dinheiro')?.amount || 0

  return (
    <article className="module-card module-card--span">
      <header className="module-card__header">
        <div>
          <h2>Frente de caixa</h2>
          <p>Abertura, recebimentos por forma de pagamento e fechamento visual.</p>
        </div>
        <Button variant="primary" onClick={() => onOpenModal('cash')}>{cashOpen ? 'Fechar caixa' : 'Abrir caixa'}</Button>
      </header>

      <div className="cash-grid">
        <div className="cash-grid__status">
          <span>Status atual</span>
          <strong>{cashOpen ? 'Caixa aberto para operacao' : 'Caixa fechado para conferencia'}</strong>
          <small>Dinheiro estimado no gaveteiro: {formatCurrency(drawerEstimate)}</small>
        </div>

        <div className="cash-grid__payments">
          {paymentMix.map((item) => (
            <article key={item.payment}>
              <span>{item.payment}</span>
              <strong>{formatCurrency(item.amount)}</strong>
            </article>
          ))}
        </div>

        <div className="cash-grid__pending">
          <span>Pendencias do turno</span>
          <strong>{pendingFinance.length} lancamento(s)</strong>
          <small>Use o fechamento para conferir dinheiro, pix, cartao e comandas.</small>
        </div>
      </div>
    </article>
  )
}

function ReportsDeepDive({ orders, products, tables, finance, coupons, recoveries, onOpenModal }) {
  const bySource = ['WhatsApp', 'iFood', 'Instagram', 'Cardapio Digital', 'Balcao', 'Mesa'].map((source) => ({
    source,
    total: orders
      .filter((order) => getOrderSource(order) === source)
      .reduce((sum, order) => sum + order.total, 0),
  })).filter((item) => item.total > 0)
  const maxSourceTotal = Math.max(...bySource.map((item) => item.total), 1)
  const topProducts = Object.entries(
    orders.reduce((accumulator, order) => {
      order.items.forEach((item) => {
        accumulator[item] = (accumulator[item] || 0) + 1
      })
      return accumulator
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
  const balance = finance.filter((item) => item.type === 'Entrada').reduce((sum, item) => sum + item.amount, 0)
    - finance.filter((item) => item.type === 'Saida').reduce((sum, item) => sum + item.amount, 0)

  return (
    <article className="module-card module-card--span">
      <header className="module-card__header">
        <div>
          <h2>Dashboard executivo</h2>
          <p>Graficos e resumos para apresentar desempenho por canal, produto e operacao.</p>
        </div>
        <Button onClick={() => onOpenModal('exportReports')}>Exportar</Button>
      </header>

      <div className="insights-grid">
        <section className="insights-panel">
          <strong>Vendas por origem</strong>
          <div className="bar-list">
            {bySource.map((item) => (
              <article className="bar-row" key={item.source}>
                <span>{item.source}</span>
                <div>
                  <b style={{ width: `${(item.total / maxSourceTotal) * 100}%` }} />
                </div>
                <strong>{formatCurrency(item.total)}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="insights-panel">
          <strong>Top itens e operacao</strong>
          <div className="mini-kpi-grid">
            <article>
              <span>Saldo</span>
              <strong>{formatCurrency(balance)}</strong>
            </article>
            <article>
              <span>Produtos ativos</span>
              <strong>{products.filter(isProductAvailable).length}</strong>
            </article>
            <article>
              <span>Mesas ocupadas</span>
              <strong>{tables.filter((table) => table.status !== 'free').length}</strong>
            </article>
            <article>
              <span>Campanhas ativas</span>
              <strong>{coupons.filter((coupon) => coupon.active).length + recoveries.filter((recovery) => recovery.active).length}</strong>
            </article>
          </div>
          <div className="top-items">
            {topProducts.map(([label, count]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{count} pedido(s)</strong>
              </article>
            ))}
          </div>
        </section>
      </div>
    </article>
  )
}

function IntegrationStudio({ integrations, onOpenModal }) {
  const setupPhases = [
    { id: 'channels', title: 'Canais de venda', count: integrations.filter((integration) => ['iFood', 'Rappi'].includes(integration.name)).length },
    { id: 'marketing', title: 'Ads e pixel', count: integrations.filter((integration) => /Ads|Pixel/i.test(integration.name)).length },
    { id: 'payments', title: 'Pagamento online', count: integrations.filter((integration) => /Pagamento/i.test(integration.name)).length },
  ]

  return (
    <article className="module-card module-card--span">
      <header className="module-card__header">
        <div>
          <h2>Studio de integracoes</h2>
          <p>Checklist, status de sincronizacao e visao de implantacao por parceiro.</p>
        </div>
        <Button onClick={() => onOpenModal('integrationHelp')}>Checklist</Button>
      </header>

      <div className="integration-studio">
        <div className="integration-studio__phases">
          {setupPhases.map((phase) => (
            <article key={phase.id}>
              <span>{phase.title}</span>
              <strong>{phase.count} frente(s)</strong>
            </article>
          ))}
        </div>

        <div className="integration-log">
          {integrations.map((integration, index) => (
            <article className="integration-log__row" key={integration.id}>
              <span>
                <strong>{integration.name}</strong>
                <small>{integration.status}</small>
              </span>
              <small>{integration.active ? `Sincronizado ha ${index + 1} min` : 'Aguardando credenciais'}</small>
            </article>
          ))}
        </div>
      </div>
    </article>
  )
}

function CounterSection({ products, cart, onAddCart, onRemoveCart, onClearCart, onOpenModal }) {
  const activeProducts = products.filter(isProductAvailable)
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
                <small>{product.category}</small>
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
  onToggleCategory,
  onToggleProduct,
  onUpdateProductConfig,
  onUpdateProductFlavor,
  onRemoveProductFlavor,
  onAddProductAddonGroup,
  onUpdateProductAddonGroup,
  onRemoveProductAddonGroup,
  onAddProductAddonOption,
  onUpdateProductAddonOption,
  onRemoveProductAddonOption,
  onToggleProductAvailabilityDay,
  onImportMenu,
  onOpenModal,
}) {
  const [expandedCategories, setExpandedCategories] = useState(() =>
    Object.fromEntries(categories.map((category, index) => [category.id, index === 0])),
  )
  const [expandedProducts, setExpandedProducts] = useState(() =>
    Object.fromEntries(products.map((product, index) => [product.id, index === 0])),
  )

  const normalizedSearch = menuSearch.trim().toLowerCase()
  const resolvedExpandedCategories = useMemo(() => (
    Object.fromEntries(categories.map((category, index) => [category.id, expandedCategories[category.id] ?? index === 0]))
  ), [categories, expandedCategories])
  const resolvedExpandedProducts = useMemo(() => (
    Object.fromEntries(products.map((product, index) => [product.id, expandedProducts[product.id] ?? index === 0]))
  ), [expandedProducts, products])
  const qualityPercent = Math.min(
    98,
    Math.round(
      ((products.filter(isProductAvailable).length + categories.filter((category) => category.active).length) /
        Math.max(products.length + categories.length, 1)) *
        100,
    ),
  )

  const categoryCards = useMemo(() => (
    categories
      .map((category) => {
        if (selectedCategory !== 'all' && category.name !== selectedCategory) {
          return null
        }

        const allCategoryProducts = products.filter((product) => productAppearsInCategory(product, category.name))
        const categoryNameMatches = normalizedSearch.length > 0 && category.name.toLowerCase().includes(normalizedSearch)
        const visibleProducts = normalizedSearch && !categoryNameMatches
          ? allCategoryProducts.filter((product) => product.name.toLowerCase().includes(normalizedSearch))
          : allCategoryProducts

        if (normalizedSearch && visibleProducts.length === 0 && !categoryNameMatches) {
          return null
        }

        return {
          category,
          visibleProducts,
          totalProducts: allCategoryProducts.length,
        }
      })
      .filter(Boolean)
  ), [categories, normalizedSearch, products, selectedCategory])

  function toggleCategoryExpansion(categoryId) {
    setExpandedCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }))
  }

  function toggleProductExpansion(productId) {
    setExpandedProducts((current) => ({ ...current, [productId]: !current[productId] }))
  }

  return (
    <section className="menu-manager">
      <header className="menu-manager__title">
        <div>
          <h2>Gestor de cardapio</h2>
          <p>Inicio / Gestor de cardapio / Gestor / PDV</p>
        </div>
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
        <Button
          className="menu-action-button"
          data-testid="menu-new-product"
          onClick={() => onOpenModal('newProduct', selectedCategory === 'all' ? null : { category: selectedCategory })}
        >
          Acoes
        </Button>
        <Button className="menu-action-button" data-testid="menu-import-catalog" onClick={onImportMenu}>
          <Icon name="upload" size={18} />
          Importar cardapio
        </Button>
        <Button variant="primary" data-testid="menu-new-category" onClick={() => onOpenModal('newCategory')}>
          <Icon name="plus" size={18} />
          Nova categoria
        </Button>
      </section>

      <div className="menu-manager__scroll">
        <div className="menu-category-stack">
          {categoryCards.length > 0 ? categoryCards.map(({ category, visibleProducts, totalProducts }) => {
            const isCategoryExpanded = normalizedSearch ? true : Boolean(resolvedExpandedCategories[category.id])

            return (
              <article className={`menu-category-card ${isCategoryExpanded ? 'is-open' : ''}`.trim()} key={category.id}>
                <header className="menu-category-card__header">
                  <span className="drag-handle" aria-hidden="true" />
                  <span
                    className={`menu-category-image ${category.imageUrl ? 'menu-category-image--photo' : ''}`.trim()}
                    style={category.imageUrl ? { backgroundImage: `url("${category.imageUrl}")` } : undefined}
                    aria-hidden="true"
                  />

                  <div className="menu-category-card__lead">
                    <div className="menu-category-card__meta">
                      <h3>{category.name}</h3>
                      <small>{totalProducts} item(ns) exibidos</small>
                    </div>

                    <button
                      className="menu-inline-action"
                      type="button"
                      onClick={() => onOpenModal('newProduct', { category: category.name })}
                    >
                      <Icon name="plus" size={16} />
                      Adicionar item
                    </button>
                    <button
                      className="menu-inline-action"
                      type="button"
                      onClick={() => onOpenModal('importProducts', { category: category.name })}
                    >
                      <Icon name="plus" size={16} />
                      Importar de
                    </button>
                  </div>

                  <div className="menu-category-card__tools">
                    <div className="menu-toggle-group">
                      <span>{category.active ? 'Esgotar tudo' : 'Esgotada'}</span>
                      <button
                        className={`mini-toggle ${category.active ? 'is-off' : ''}`.trim()}
                        type="button"
                        aria-label={`${category.active ? 'Esgotar' : 'Disponibilizar'} categoria ${category.name}`}
                        onClick={() => onToggleCategory(category.id)}
                      />
                    </div>

                    <button className="select-action" type="button" onClick={() => onOpenModal('editCategory', category)}>
                      Editar categoria
                    </button>

                    <Button
                      className="menu-row-icon-button menu-row-icon-button--danger"
                      variant="danger"
                      onClick={() => onOpenModal('deleteCategory', category)}
                    >
                      <Icon name="trash" size={15} />
                    </Button>

                    <button
                      className={`chevron-button ${isCategoryExpanded ? 'is-open' : ''}`.trim()}
                      type="button"
                      aria-label={isCategoryExpanded ? 'Recolher categoria' : 'Expandir categoria'}
                      onClick={() => toggleCategoryExpansion(category.id)}
                    >
                      <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </header>

                {isCategoryExpanded ? (
                  <div className="menu-category-card__body">
                    {visibleProducts.length > 0 ? visibleProducts.map((product) => {
      const thumbClass = getMenuProductThumbClass(product)
      const isProductExpanded = normalizedSearch ? true : Boolean(resolvedExpandedProducts[product.id])
      const isProductExhausted = isProductExhaustedInCategory(product, category.name)
      const sourceLabel = product.category === category.name ? 'Principal' : `Importado de ${product.category}`

      return (
                        <article className={`menu-product-card ${isProductExpanded ? 'is-open' : ''}`.trim()} key={product.id}>
                          <div className="menu-product-row" data-testid={`product-${product.id}`}>
                            <span className="drag-handle" aria-hidden="true" />
                            <span
                              className={`product-thumb ${thumbClass} ${product.imageUrl ? 'product-thumb--photo' : ''}`.trim()}
                              style={product.imageUrl ? { backgroundImage: `url("${product.imageUrl}")` } : undefined}
                            />

                            <div className="menu-product-row__name">
                              <strong>{product.name}</strong>
                              <small>{sourceLabel}</small>
                            </div>

                            <div className="menu-product-row__controls">
                              <div className="price-cell">
                                <span>A partir de</span>
                                <strong>{formatCurrency(product.price)}</strong>
                              </div>

                              <button className="menu-row-icon-button" type="button" aria-label={`Editar ${product.name}`} onClick={() => onOpenModal('editProduct', product)}>
                                <Icon name="edit" size={15} />
                              </button>

                              <Button
                                className="menu-row-icon-button menu-row-icon-button--danger"
                                variant="danger"
                                onClick={() => onOpenModal('deleteProduct', product)}
                              >
                                <Icon name="trash" size={15} />
                              </Button>

                              <div className="menu-toggle-group menu-toggle-group--compact">
                                <span>{isProductExhausted ? 'Esgotado' : 'Esgotar'}</span>
                                <button
                                  className={`mini-toggle ${isProductExhausted ? '' : 'is-off'}`.trim()}
                                  type="button"
                                  aria-label={`${isProductExhausted ? 'Disponibilizar' : 'Esgotar'} ${product.name} em ${category.name}`}
                                  onClick={() => onToggleProduct(product.id, category.name)}
                                />
                              </div>

                              <button className="select-action" type="button" onClick={() => onOpenModal('editProduct', product)}>
                                Editar item
                              </button>

                              <button
                                className={`chevron-button ${isProductExpanded ? 'is-open' : ''}`.trim()}
                                type="button"
                                aria-label={isProductExpanded ? 'Recolher item' : 'Expandir item'}
                                onClick={() => toggleProductExpansion(product.id)}
                              >
                                <Icon name="arrow" size={16} />
                              </button>
                            </div>
                          </div>

                          {isProductExpanded ? (
                            <div className="menu-product-editor">
                              <section className="menu-product-settings">
                                <label className="menu-setting-field">
                                  <span>Maximo de sabores</span>
                                  <input
                                    min="1"
                                    type="number"
                                    value={product.maxFlavors}
                                    onChange={(event) => onUpdateProductConfig(product.id, { maxFlavors: Number(event.target.value) || 1 })}
                                  />
                                </label>

                                <label className="menu-setting-field">
                                  <span>Disponivel das</span>
                                  <input
                                    type="time"
                                    value={product.availableFrom}
                                    onChange={(event) => onUpdateProductConfig(product.id, { availableFrom: event.target.value })}
                                  />
                                </label>

                                <label className="menu-setting-field">
                                  <span>Ate</span>
                                  <input
                                    type="time"
                                    value={product.availableTo}
                                    onChange={(event) => onUpdateProductConfig(product.id, { availableTo: event.target.value })}
                                  />
                                </label>

                                <div className="menu-setting-field menu-setting-field--wide">
                                  <span>Dias da semana</span>
                                  <div className="menu-day-selector">
                                    {WEEK_DAY_OPTIONS.map((day) => (
                                      <button
                                        className={product.availableDays.includes(day.id) ? 'is-active' : ''}
                                        key={`${product.id}-${day.id}`}
                                        type="button"
                                        onClick={() => onToggleProductAvailabilityDay(product.id, day.id)}
                                      >
                                        {day.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="menu-product-summary">
                                  <strong>{getProductAvailabilityLabel(product)}</strong>
                                  <small>{product.flavors.length} {getFlavorEntityLabel(product, true)} cadastrados neste item</small>
                                </div>

                                <button
                                  className="menu-inline-action menu-inline-action--panel"
                                  type="button"
                                  onClick={() => onOpenModal('newFlavor', { productId: product.id, product })}
                                >
                                  <Icon name="plus" size={16} />
                                  Adicionar {getFlavorEntityLabel(product)}
                                </button>
                              </section>

                              <section className="menu-option-table">
                                <header className="menu-option-table__header">
                                  <strong>{isComboProduct(product) ? 'Subsabores do combo' : 'Sabores e variacoes do item'}</strong>
                                  <span className="menu-option-table__qty">
                                    <small>Qtd</small>
                                    <b>De 1 a {product.maxFlavors}</b>
                                  </span>
                                  <span className="menu-option-table__stock-label">Esgotar</span>
                                </header>

                                {product.flavors.map((flavor) => (
                                  <div className="menu-option-row" key={flavor.id}>
                                    <span className={`menu-option-thumb ${thumbClass}`.trim()} />
                                    <input
                                      value={flavor.name}
                                      onChange={(event) => onUpdateProductFlavor(product.id, flavor.id, { name: event.target.value })}
                                    />
                                    <input
                                      className="menu-option-row__price"
                                      inputMode="decimal"
                                      value={formatCurrencyInput(flavor.price)}
                                      onChange={(event) => onUpdateProductFlavor(product.id, flavor.id, {
                                        price: parseCurrencyInput(formatCurrencyTypingInput(event.target.value)),
                                      })}
                                    />
                                    <span className="menu-option-row__limit">Max. {product.maxFlavors}</span>
                                    <button
                                      className={`mini-toggle ${flavor.active ? '' : 'is-off'}`.trim()}
                                      type="button"
                                      aria-label={`Alternar sabor ${flavor.name}`}
                                      onClick={() => onUpdateProductFlavor(product.id, flavor.id, { active: !flavor.active })}
                                    />
                                    <button
                                      className="menu-option-row__delete"
                                      type="button"
                                      aria-label={`Excluir ${getFlavorEntityLabel(product)} ${flavor.name}`}
                                      onClick={() => onRemoveProductFlavor(product.id, flavor.id)}
                                    >
                                      <Icon name="trash" size={15} />
                                    </button>
                                  </div>
                                ))}
                              </section>

                              <section className="menu-addon-stack">
                                <header className="menu-addon-stack__header">
                                  <div>
                                    <strong>Grupos de adicionais</strong>
                                    <p>A ordem abaixo define a sequencia exibida no pedido deste item.</p>
                                  </div>

                                  <button
                                    className="menu-inline-action"
                                    data-testid={`add-addon-group-${product.id}`}
                                    type="button"
                                    onClick={() => onAddProductAddonGroup(product.id)}
                                  >
                                    <Icon name="plus" size={16} />
                                    Adicionar grupo
                                  </button>
                                </header>

                                {product.addonGroups.length > 0 ? (
                                  <div className="menu-addon-stack__list">
                                    {product.addonGroups.map((group, groupIndex) => (
                                      <article className="menu-addon-card" data-testid={`addon-group-${group.id}`} key={group.id}>
                                        <header className="menu-addon-card__header">
                                          <div>
                                            <strong>{groupIndex + 1}. {group.name || `Grupo ${groupIndex + 1}`}</strong>
                                            <small>
                                              {group.required ? 'Etapa obrigatoria' : 'Etapa opcional'} - {group.options.length} opcao(oes)
                                            </small>
                                          </div>

                                          <div className="menu-addon-card__actions">
                                            <button
                                              className="menu-inline-action"
                                              data-testid={`add-addon-option-${group.id}`}
                                              type="button"
                                              onClick={() => onAddProductAddonOption(product.id, group.id)}
                                            >
                                              <Icon name="plus" size={16} />
                                              Adicionar opcao
                                            </button>

                                            <button
                                              className="menu-option-row__delete"
                                              data-testid={`remove-addon-group-${group.id}`}
                                              type="button"
                                              aria-label={`Excluir grupo ${group.name}`}
                                              onClick={() => onRemoveProductAddonGroup(product.id, group.id)}
                                            >
                                              <Icon name="trash" size={15} />
                                            </button>
                                          </div>
                                        </header>

                                        <div className="menu-addon-grid">
                                          <label className="menu-setting-field menu-addon-grid__name">
                                            <span>Nome do grupo</span>
                                            <input
                                              data-testid={`addon-group-name-${group.id}`}
                                              value={group.name}
                                              onChange={(event) => onUpdateProductAddonGroup(product.id, group.id, { name: event.target.value })}
                                            />
                                          </label>

                                          <label className="menu-setting-field">
                                            <span>Minimo</span>
                                            <input
                                              min={group.required ? '1' : '0'}
                                              type="number"
                                              value={group.minSelect}
                                              onChange={(event) => onUpdateProductAddonGroup(product.id, group.id, {
                                                minSelect: Number(event.target.value) || 0,
                                              })}
                                            />
                                          </label>

                                          <label className="menu-setting-field">
                                            <span>Maximo</span>
                                            <input
                                              min="1"
                                              type="number"
                                              value={group.maxSelect}
                                              onChange={(event) => onUpdateProductAddonGroup(product.id, group.id, {
                                                maxSelect: Number(event.target.value) || 1,
                                              })}
                                            />
                                          </label>

                                          <div className="menu-setting-field menu-setting-field--toggle">
                                            <span>Obrigatorio</span>
                                            <div className="menu-setting-switch">
                                              <strong>{group.required ? 'Sim' : 'Nao'}</strong>
                                              <button
                                                className={`mini-toggle ${group.required ? '' : 'is-off'}`.trim()}
                                                data-testid={`addon-group-required-${group.id}`}
                                                type="button"
                                                aria-label={`Alternar obrigatoriedade do grupo ${group.name}`}
                                                onClick={() => onUpdateProductAddonGroup(product.id, group.id, { required: !group.required })}
                                              />
                                            </div>
                                          </div>
                                        </div>

                                        <section className="menu-option-table menu-option-table--addons">
                                          <header className="menu-option-table__header">
                                            <strong>Opcoes deste grupo</strong>
                                            <span className="menu-option-table__qty">
                                              <small>Selecao</small>
                                              <b>{group.required ? `De ${Math.max(1, group.minSelect)} a ${group.maxSelect}` : `Ate ${group.maxSelect}`}</b>
                                            </span>
                                            <span className="menu-option-table__stock-label">Ativo</span>
                                          </header>

                                          {group.options.length > 0 ? group.options.map((option) => (
                                            <div className="menu-option-row" key={option.id}>
                                              <span className={`menu-option-thumb ${thumbClass}`.trim()} />
                                              <input
                                                data-testid={`addon-option-name-${option.id}`}
                                                value={option.name}
                                                onChange={(event) => onUpdateProductAddonOption(product.id, group.id, option.id, { name: event.target.value })}
                                              />
                                              <input
                                                className="menu-option-row__price"
                                                inputMode="decimal"
                                                value={formatCurrencyInput(option.price)}
                                                onChange={(event) => onUpdateProductAddonOption(product.id, group.id, option.id, {
                                                  price: parseCurrencyInput(formatCurrencyTypingInput(event.target.value)),
                                                })}
                                              />
                                              <span className="menu-option-row__limit">Max. {group.maxSelect}</span>
                                              <button
                                                className={`mini-toggle ${option.active ? '' : 'is-off'}`.trim()}
                                                data-testid={`addon-option-active-${option.id}`}
                                                type="button"
                                                aria-label={`Alternar adicional ${option.name}`}
                                                onClick={() => onUpdateProductAddonOption(product.id, group.id, option.id, { active: !option.active })}
                                              />
                                              <button
                                                className="menu-option-row__delete"
                                                data-testid={`remove-addon-option-${option.id}`}
                                                type="button"
                                                aria-label={`Excluir adicional ${option.name}`}
                                                onClick={() => onRemoveProductAddonOption(product.id, group.id, option.id)}
                                              >
                                                <Icon name="trash" size={15} />
                                              </button>
                                            </div>
                                          )) : (
                                            <div className="menu-addon-empty">
                                              <strong>Nenhuma opcao cadastrada neste grupo.</strong>
                                              <p>Adicione opcoes para que esta etapa apareca no pedido.</p>
                                            </div>
                                          )}
                                        </section>
                                      </article>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="menu-addon-empty">
                                    <strong>Nenhum grupo de adicional configurado.</strong>
                                    <p>Crie etapas como adicionais, borda, molhos, ponto da carne ou qualquer outra escolha deste produto.</p>
                                  </div>
                                )}
                              </section>
                            </div>
                          ) : null}
                        </article>
                      )
                    }) : (
                      <div className="menu-category-card__empty">
                        <strong>Nenhum item localizado nesta categoria.</strong>
                        <button type="button" onClick={() => onOpenModal('newProduct', { category: category.name })}>
                          Criar primeiro item
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            )
          }) : (
            <article className="menu-category-card menu-category-card--empty">
              <div className="menu-category-card__empty">
                <strong>Nenhuma categoria encontrada.</strong>
                <button type="button" onClick={() => onSelectCategory('all')}>
                  Limpar filtro
                </button>
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  )
}

function TablesSection({ tables, orders, qrCodes, onOpenModal }) {
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

      <WaiterConsole tables={tables} orders={orders} qrCodes={qrCodes} onOpenModal={onOpenModal} />
    </section>
  )
}

function DeliverySection({ orders, couriers, deliveryZones, onToggleCourier, onOpenModal }) {
  const deliveryOrders = orders.filter((order) => order.channel === 'delivery' && order.status !== 'completed')
  const activeZoneCount = deliveryZones.filter((zone) => zone.active !== false).length

  return (
    <section className="module-grid module-grid--delivery">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Fila de entregas</h2>
            <p>Atribua entregador e acompanhe status.</p>
          </div>
          <div className="module-header-actions">
            <Button onClick={() => onOpenModal('deliveryZones')}>Zonas ({activeZoneCount})</Button>
            <Button data-testid="delivery-map" onClick={() => onOpenModal('deliveryMap')}>Mapa</Button>
          </div>
        </header>
        <div className="data-list">
          {deliveryOrders.map((order) => (
            <article className="data-row" key={order.id}>
              <span>
                <strong>#{order.id} - {order.customer}</strong>
                <small>{order.address} - {order.deliveryZoneName || 'Sem zona'} - {formatCurrency(order.total)}</small>
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

      <DeliveryRadar orders={orders} couriers={couriers} onOpenModal={onOpenModal} />
    </section>
  )
}

function ReportsSection({ orders, products, tables, finance, coupons, recoveries, pilotSync, onOpenModal }) {
  const completed = orders.filter((order) => order.status === 'completed')
  const revenue = orders.reduce((sum, order) => sum + order.total, 0)
  const pendingSyncCount = orders.filter((order) => !order.backendId || order.syncStatus === 'pending' || order.syncStatus === 'failed').length
  const pilotStatus = getPilotStatusMeta(pilotSync)

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
            <h2>Teste controlado</h2>
            <p>Status do backend, backup e fila de sincronizacao.</p>
          </div>
          <Button variant="primary" onClick={() => onOpenModal('pilot')}>Abrir piloto</Button>
        </header>
        <div className="pilot-mini">
          <div>
            <span>API</span>
            <strong>{pilotStatus.label}</strong>
            <small>{pilotSync.storeName || API_BASE_URL}</small>
          </div>
          <div>
            <span>Pendentes</span>
            <strong>{pendingSyncCount}</strong>
            <small>{pilotSync.lastSyncedAt ? `Ultimo sync ${pilotSync.lastSyncedAt}` : 'Ainda sem sync'}</small>
          </div>
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

      <ReportsDeepDive
        orders={orders}
        products={products}
        tables={tables}
        finance={finance}
        coupons={coupons}
        recoveries={recoveries}
        onOpenModal={onOpenModal}
      />
    </section>
  )
}

function WhatsappInbox({ storeId, orders, chatMessages, onOpenModal }) {
  const [whatsappConfig, setWhatsappConfig] = useState(null)
  const [whatsappStatus, setWhatsappStatus] = useState({ type: 'idle', message: '' })
  const [whatsappConversations, setWhatsappConversations] = useState([])
  const [selectedWhatsappJid, setSelectedWhatsappJid] = useState('')
  const [whatsappMessages, setWhatsappMessages] = useState([])
  const [whatsappDraft, setWhatsappDraft] = useState('')

  useEffect(() => {
    if (!storeId) {
      return undefined
    }

    let cancelled = false
    async function loadWhatsapp() {
      try {
        const [config, conversations] = await Promise.all([
          getWhatsappConfig(storeId),
          getWhatsappConversations(storeId),
        ])
        if (cancelled) return
        setWhatsappConfig(config)
        setWhatsappConversations(conversations)
        setSelectedWhatsappJid((current) => current || conversations[0]?.remoteJid || '')
      } catch (err) {
        if (!cancelled) {
          setWhatsappStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel carregar WhatsApp.' })
        }
      }
    }
    void loadWhatsapp()
    const interval = window.setInterval(loadWhatsapp, 8000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeId || !selectedWhatsappJid) {
      return
    }

    let cancelled = false
    async function loadMessages() {
      try {
        const loaded = await getWhatsappMessages(storeId, selectedWhatsappJid)
        if (!cancelled) {
          setWhatsappMessages(loaded)
          void markWhatsappConversationRead(storeId, selectedWhatsappJid)
        }
      } catch (err) {
        if (!cancelled) {
          setWhatsappStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel carregar mensagens.' })
        }
      }
    }
    void loadMessages()
    const interval = window.setInterval(loadMessages, 6000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [selectedWhatsappJid, storeId])

  async function refreshWhatsappStatus() {
    if (!storeId) return
    try {
      const status = await getWhatsappStatus(storeId)
      setWhatsappStatus({ type: 'success', message: status.status || 'Status consultado.' })
    } catch (err) {
      setWhatsappStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel consultar status.' })
    }
  }

  async function sendWhatsapp(event) {
    event.preventDefault()
    if (!storeId || !selectedWhatsappJid || !whatsappDraft.trim()) return
    try {
      await sendWhatsappMessage(storeId, selectedWhatsappJid, whatsappDraft.trim())
      setWhatsappDraft('')
      setWhatsappMessages(await getWhatsappMessages(storeId, selectedWhatsappJid))
      setWhatsappConversations(await getWhatsappConversations(storeId))
    } catch (err) {
      setWhatsappStatus({ type: 'danger', message: err instanceof Error ? err.message : 'Nao foi possivel enviar.' })
    }
  }

  return (
    <article className="module-card module-card--full whatsapp-mirror whatsapp-mirror--pure">
      <header className="module-card__header">
        <div>
          <h2>WhatsApp</h2>
          <p>{whatsappConfig?.status || 'Aguardando conexao'}</p>
        </div>
        <div className="module-header-actions">
          <Button onClick={refreshWhatsappStatus}>Status</Button>
          <Button variant="primary" onClick={() => onOpenModal('whatsappSetup')}>Conectar</Button>
          <a className="btn" href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">WhatsApp Web</a>
        </div>
      </header>
      {whatsappStatus.message ? <div className={`whatsapp-status whatsapp-status--${whatsappStatus.type}`}>{whatsappStatus.message}</div> : null}
      <div className="whatsapp-mirror__body">
        <div className="whatsapp-mirror__sidebar">
          {whatsappConversations.length > 0 ? whatsappConversations.map((conversation) => (
            <button
              className={selectedWhatsappJid === conversation.remoteJid ? 'is-active' : ''}
              key={conversation.id}
              type="button"
              onClick={() => setSelectedWhatsappJid(conversation.remoteJid)}
            >
              <strong>{conversation.contactName || conversation.phone || conversation.remoteJid}</strong>
              <small>{conversation.lastMessage || 'Sem mensagens'} {conversation.unreadCount > 0 ? `(${conversation.unreadCount})` : ''}</small>
            </button>
          )) : orders.slice(0, 6).map((order) => (
            <button key={order.id} type="button" onClick={() => onOpenModal('orderDetails', order)}>
              <strong>#{order.id} - {order.customer}</strong>
              <small>{order.phone} - {getOrderStageLabel(order.status)}</small>
            </button>
          ))}
        </div>
        <div className="whatsapp-mirror__conversation">
          <header>
            <strong>{selectedWhatsappJid || 'WhatsApp'}</strong>
            <small>{whatsappConfig?.status || 'Aguardando conexao'}</small>
          </header>
          <div>
            {(whatsappMessages.length > 0 ? whatsappMessages : chatMessages.slice(-4)).map((message) => (
              <p className={message.fromMe ? 'is-outbound' : ''} key={message.id}>
                <b>{message.fromMe ? 'Voce' : message.author || 'Cliente'}:</b> {message.body || message.text}
              </p>
            ))}
          </div>
          <form className="whatsapp-reply" onSubmit={sendWhatsapp}>
            <input value={whatsappDraft} onChange={(event) => setWhatsappDraft(event.target.value)} placeholder="Responder pelo WhatsApp" />
            <Button variant="primary" type="submit">Enviar</Button>
          </form>
        </div>
      </div>
    </article>
  )
}

function WhatsappSetupPanel({ storeId }) {
  const [whatsappConfig, setWhatsappConfig] = useState(null)
  const [whatsappForm, setWhatsappForm] = useState({
    personalAccessToken: '',
    apiKey: '',
    sessionId: '',
    sessionName: 'MeuCardapio',
    phoneNumber: '',
    webhookSecret: '',
  })
  const [whatsappStatus, setWhatsappStatus] = useState({ type: 'idle', message: '' })
  const [whatsappQr, setWhatsappQr] = useState('')
  const webhookUrl = storeId ? `${API_BASE_URL}/stores/${storeId}/whatsapp/webhook` : ''

  useEffect(() => {
    if (!storeId) {
      return
    }

    let cancelled = false
    async function loadWhatsappConfig() {
      try {
        const config = await getWhatsappConfig(storeId)
        if (cancelled) return
        setWhatsappConfig(config)
        setWhatsappForm((current) => ({
          ...current,
          sessionId: config.sessionId || current.sessionId,
          sessionName: config.sessionName || current.sessionName,
          phoneNumber: config.phoneNumber || current.phoneNumber,
          webhookSecret: current.webhookSecret,
          apiKey: '',
          personalAccessToken: '',
        }))
      } catch (err) {
        if (!cancelled) {
          setWhatsappStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel carregar WhatsApp.' })
        }
      }
    }

    void loadWhatsappConfig()
    return () => {
      cancelled = true
    }
  }, [storeId])

  async function saveWhatsapp() {
    if (!storeId) return
    try {
      const saved = await saveWhatsappConfig(storeId, { ...whatsappForm, webhookUrl })
      setWhatsappConfig(saved)
      setWhatsappStatus({ type: 'success', message: 'Credenciais salvas.' })
    } catch (err) {
      setWhatsappStatus({ type: 'danger', message: err instanceof Error ? err.message : 'Falha ao salvar.' })
    }
  }

  async function startWhatsappSession() {
    if (!storeId) return
    try {
      await saveWhatsappConfig(storeId, { ...whatsappForm, webhookUrl })
      await createWhatsappSession(storeId, {
        sessionName: whatsappForm.sessionName,
        phoneNumber: whatsappForm.phoneNumber,
        webhookUrl,
      })
      await connectWhatsappSession(storeId)
      const qr = await getWhatsappQrCode(storeId)
      const config = await getWhatsappConfig(storeId)
      setWhatsappConfig(config)
      setWhatsappQr(qr.qrCode || '')
      setWhatsappStatus({ type: 'success', message: qr.status || 'Sessao criada. Escaneie o QR Code.' })
    } catch (err) {
      setWhatsappStatus({ type: 'danger', message: err instanceof Error ? err.message : 'Falha ao conectar WhatsApp.' })
    }
  }

  async function refreshWhatsappStatus() {
    if (!storeId) return
    try {
      const status = await getWhatsappStatus(storeId)
      setWhatsappStatus({ type: 'success', message: status.status || 'Status consultado.' })
    } catch (err) {
      setWhatsappStatus({ type: 'warning', message: err instanceof Error ? err.message : 'Nao foi possivel consultar status.' })
    }
  }

  return (
    <div className="whatsapp-setup">
      {!storeId ? <div className="whatsapp-status whatsapp-status--warning">Abra uma loja conectada ao servidor antes de configurar o WhatsApp.</div> : null}
      <div className="whatsapp-config">
        <input value={whatsappForm.personalAccessToken} onChange={(event) => setWhatsappForm({ ...whatsappForm, personalAccessToken: event.target.value })} placeholder="Personal Access Token" type="password" />
        <input value={whatsappForm.apiKey} onChange={(event) => setWhatsappForm({ ...whatsappForm, apiKey: event.target.value })} placeholder={whatsappConfig?.hasApiKey ? 'API key salva' : 'API key da sessao'} type="password" />
        <input value={whatsappForm.sessionName} onChange={(event) => setWhatsappForm({ ...whatsappForm, sessionName: event.target.value })} placeholder="Nome da sessao" />
        <input value={whatsappForm.phoneNumber} onChange={(event) => setWhatsappForm({ ...whatsappForm, phoneNumber: event.target.value.replace(/\D/g, '') })} placeholder="Telefone com DDI, ex: 5547999999999" />
        <input value={whatsappForm.sessionId} onChange={(event) => setWhatsappForm({ ...whatsappForm, sessionId: event.target.value })} placeholder={whatsappConfig?.sessionId ? `Sessao: ${whatsappConfig.sessionId}` : 'ID da sessao existente'} />
        <input value={whatsappForm.webhookSecret} onChange={(event) => setWhatsappForm({ ...whatsappForm, webhookSecret: event.target.value })} placeholder={whatsappConfig?.hasWebhookSecret ? 'Webhook secret salvo' : 'Webhook secret'} type="password" />
        <input readOnly value={webhookUrl} />
      </div>
      {whatsappStatus.message ? <div className={`whatsapp-status whatsapp-status--${whatsappStatus.type}`}>{whatsappStatus.message}</div> : null}
      {whatsappQr ? (
        <div className="whatsapp-qr">
          {whatsappQr.startsWith('data:image') ? <img alt="QR Code WhatsApp" src={whatsappQr} /> : <code>{whatsappQr}</code>}
        </div>
      ) : null}
      <div className="module-header-actions">
        <Button onClick={saveWhatsapp}>Salvar</Button>
        <Button onClick={refreshWhatsappStatus}>Status</Button>
        <Button variant="primary" onClick={startWhatsappSession}>Criar/conectar</Button>
      </div>
    </div>
  )
}

function ServiceSection({ storeId, orders, chatMessages, onOpenModal }) {
  return (
    <section className="module-grid module-grid--service">
      <WhatsappInbox storeId={storeId} orders={orders} chatMessages={chatMessages} onOpenModal={onOpenModal} />
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
            <p>Autoatendimento no salao.</p>
          </div>
          <Button data-testid="new-qr" onClick={() => onOpenModal('newQr')}>Gerar QR</Button>
        </header>
        <div className="data-list">
          {qrCodes.map((qr) => (
            <article className="data-row" key={qr.id}>
              <span>
                <strong>{qr.table}</strong>
                <small>{qr.scans} leitura(s)</small>
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
  const lowItems = inventory.filter((stock) => stock.quantity <= stock.min)

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

      <div className="inventory-insights">
        <article className="inventory-insights__card">
          <span>Reposicao urgente</span>
          <strong>{lowItems.length} item(ns)</strong>
          <small>Itens abaixo do minimo para o comprador agir antes do pico.</small>
        </article>
        <div className="inventory-insights__list">
          {(lowItems.length > 0 ? lowItems : inventory.slice(0, 3)).map((stock) => (
            <article key={stock.id}>
              <strong>{stock.item}</strong>
              <small>{stock.quantity} {stock.unit} disponivel(is) - alvo {stock.min}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinanceSection({ finance, orders, onOpenModal, onPayFinance }) {
  const [period, setPeriod] = useState('month')
  const [customStart, setCustomStart] = useState(formatDateInputValue(new Date()))
  const [customEnd, setCustomEnd] = useState(formatDateInputValue(new Date()))
  const filteredFinance = filterRecordsByPeriod(finance, period, customStart, customEnd)
  const filteredOrders = filterRecordsByPeriod(orders, period, customStart, customEnd)
  const income = filteredFinance.filter((item) => item.type === 'Entrada').reduce((sum, item) => sum + item.amount, 0)
  const outcome = filteredFinance.filter((item) => item.type === 'Saida').reduce((sum, item) => sum + item.amount, 0)
  const earningsBySource = ['WhatsApp', 'Balcao', 'Mesa'].map((source) => ({
    source,
    total: filteredOrders
      .filter((order) => getOrderSource(order) === source)
      .reduce((sum, order) => sum + order.total, 0),
  })).filter((item) => item.total > 0)
  const earningsPeak = Math.max(...earningsBySource.map((item) => item.total), 1)
  const paidRevenue = filteredFinance
    .filter((item) => item.type === 'Entrada' && item.status === 'Pago')
    .reduce((sum, item) => sum + item.amount, 0)
  const averageOrder = filteredOrders.length > 0 ? filteredOrders.reduce((sum, order) => sum + order.total, 0) / filteredOrders.length : 0

  return (
    <section className="module-grid module-grid--finance">
      <article className="module-card">
        <header className="module-card__header">
          <div>
            <h2>Relatorio de ganhos</h2>
            <p>Entradas, despesas e resultado da operacao.</p>
          </div>
          <Button variant="primary" data-testid="new-finance" onClick={() => onOpenModal('newFinance')}>Lancamento</Button>
        </header>
        <div className="finance-filter">
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="today">Hoje</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
            <option value="year">Ano</option>
            <option value="all">Tudo</option>
            <option value="custom">Periodo</option>
          </select>
          {period === 'custom' ? (
            <>
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            </>
          ) : null}
        </div>
        <div className="report-grid">
          <div><span>Ganhos brutos</span><strong>{formatCurrency(income)}</strong></div>
          <div><span>Despesas</span><strong>{formatCurrency(outcome)}</strong></div>
          <div><span>Resultado</span><strong>{formatCurrency(income - outcome)}</strong></div>
          <div><span>Pedidos pagos</span><strong>{formatCurrency(paidRevenue)}</strong></div>
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
          {filteredFinance.map((item) => (
            <article className="data-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.type} - {formatCurrency(item.amount)} - {item.createdAt || 'Sem data'}</small>
              </span>
              <StatusBadge tone={item.status === 'Pago' ? 'success' : 'warning'}>{item.status}</StatusBadge>
              <Button onClick={() => onOpenModal('editFinance', item)}>Editar</Button>
              {item.status !== 'Pago' ? <Button variant="primary" onClick={() => onPayFinance(item.id)}>Dar baixa</Button> : null}
              <Button variant="danger" onClick={() => onOpenModal('deleteFinance', item)}>Apagar</Button>
            </article>
          ))}
        </div>
      </article>

      <article className="module-card module-card--span">
        <header className="module-card__header">
          <div>
            <h2>Ganhos por origem</h2>
            <p>Leitura simples do que mais trouxe receita para a operacao.</p>
          </div>
          <Button onClick={() => onOpenModal('exportReports')}>Exportar</Button>
        </header>
        <div className="finance-workbench">
          <div className="finance-workbench__bars">
            {earningsBySource.map((item) => (
              <article className="bar-row" key={item.source}>
                <span>{item.source}</span>
                <div>
                  <b style={{ width: `${(item.total / earningsPeak) * 100}%` }} />
                </div>
                <strong>{formatCurrency(item.total)}</strong>
              </article>
            ))}
          </div>
          <div className="finance-workbench__summary">
            <article>
              <span>Resultado estimado</span>
              <strong>{formatCurrency(income - outcome)}</strong>
            </article>
            <article>
              <span>Ticket medio</span>
              <strong>{formatCurrency(averageOrder)}</strong>
            </article>
            <article>
              <span>Lancamentos pendentes</span>
              <strong>{filteredFinance.filter((item) => item.status !== 'Pago').length}</strong>
            </article>
          </div>
        </div>
      </article>
    </section>
  )
}

function FiscalSection({ invoices, onOpenModal, onUpdateInvoice }) {
  const authorized = invoices.filter((invoice) => invoice.status === 'Autorizada').length
  const pending = invoices.filter((invoice) => invoice.status === 'Pendente').length
  const canceled = invoices.filter((invoice) => invoice.status === 'Cancelada').length

  return (
    <section className="module-card module-card--full">
      <header className="module-card__header">
        <div>
          <h2>Fiscal e NFC-e</h2>
          <p>Emissao, reimpressao e cancelamento simulados.</p>
        </div>
        <Button variant="primary" onClick={() => onOpenModal('issueInvoice')}>Emitir NFC-e</Button>
      </header>
      <div className="fiscal-overview">
        <article>
          <span>Autorizadas</span>
          <strong>{authorized}</strong>
        </article>
        <article>
          <span>Pendentes</span>
          <strong>{pending}</strong>
        </article>
        <article>
          <span>Canceladas</span>
          <strong>{canceled}</strong>
        </article>
      </div>
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

      <IntegrationStudio integrations={integrations} onOpenModal={onOpenModal} />
    </section>
  )
}

function GuidedTutorial({ step, stepIndex, totalSteps, onBack, onClose, onNext }) {
  if (!step) {
    return null
  }

  const isLast = stepIndex >= totalSteps - 1

  return (
    <div className="guided-tutorial" role="dialog" aria-modal="true" aria-label="Tutorial guiado">
      <div className="guided-tutorial__backdrop" />
      <section className="guided-tutorial__panel">
        <header>
          <span>Tutorial guiado</span>
          <strong>{step.title}</strong>
        </header>
        <p>{step.body}</p>
        <div className="guided-tutorial__progress">
          <span>Passo {stepIndex + 1} de {totalSteps}</span>
          <div>
            {Array.from({ length: totalSteps }).map((_, index) => (
              <i className={index <= stepIndex ? 'is-active' : ''} key={index} />
            ))}
          </div>
        </div>
        <footer>
          <Button onClick={onClose}>Encerrar</Button>
          <Button disabled={stepIndex === 0} onClick={onBack}>Voltar</Button>
          <Button variant="primary" onClick={onNext}>{isLast ? 'Concluir' : 'Proximo'}</Button>
        </footer>
      </section>
    </div>
  )
}

function App() {
  const initialWorkspaceRef = useRef(null)

  if (!initialWorkspaceRef.current) {
    initialWorkspaceRef.current = loadPersistedWorkspace()
  }

  const initialWorkspace = initialWorkspaceRef.current
  const initialData = initialWorkspace.activeSnapshot
  const importInputRef = useRef(null)
  const menuImportInputRef = useRef(null)
  const geocodeCacheRef = useRef(new Map())
  const nominatimLastRequestRef = useRef(0)
  const refreshPilotFromBackendRef = useRef(null)
  const [stores, setStores] = useState(initialWorkspace.stores)
  const [activeStoreId, setActiveStoreId] = useState(initialWorkspace.activeStoreId)

  const [orders, setOrders] = useState(initialData.orders)
  const [orderSequence, setOrderSequence] = useState(initialData.orderSequence)
  const orderSequenceRef = useRef(initialData.orderSequence)
  const [activeNav, setActiveNav] = useState(initialData.activeNav)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [storeOpen, setStoreOpen] = useState(initialData.storeOpen)
  const [cashOpen, setCashOpen] = useState(initialData.cashOpen)
  const [cashOpenedAt, setCashOpenedAt] = useState(initialData.cashOpenedAt)
  const [noticeVisible, setNoticeVisible] = useState(false)
  const [modal, setModal] = useState(null)
  const [newOrder, setNewOrder] = useState(blankOrder)
  const [showManualTotalInput, setShowManualTotalInput] = useState(false)
  const [orderPanel, setOrderPanel] = useState(null)
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [paymentDraft, setPaymentDraft] = useState(blankOrder.payment)
  const [deliveryTabDraft, setDeliveryTabDraft] = useState(blankOrder.fulfillment)
  const [deliveryFeeDraft, setDeliveryFeeDraft] = useState(blankOrder.deliveryFee)
  const [selectedAddressDraftId, setSelectedAddressDraftId] = useState('')
  const [deliveryAddressForm, setDeliveryAddressForm] = useState(blankDeliveryAddress)
  const [deliveryAddressLookup, setDeliveryAddressLookup] = useState({ status: 'idle', message: '' })
  const [editingDeliveryAddressId, setEditingDeliveryAddressId] = useState(null)
  const [deliveryAddressMapMode, setDeliveryAddressMapMode] = useState('view')
  const deliveryAddressFormRef = useRef(blankDeliveryAddress)
  const [documentDraft, setDocumentDraft] = useState(blankOrder.document)
  const [adjustmentDraft, setAdjustmentDraft] = useState({
    discountType: blankOrder.discountType,
    discountValue: blankOrder.discountValue,
    surchargeType: blankOrder.surchargeType,
    surchargeValue: blankOrder.surchargeValue,
  })
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
  const [cartItemForm, setCartItemForm] = useState(blankCartItemForm)
  const [cartItemStepIndex, setCartItemStepIndex] = useState(0)
  const [cartItemNoteOpen, setCartItemNoteOpen] = useState(false)
  const [posCategory, setPosCategory] = useState('all')
  const [posSearch, setPosSearch] = useState('')
  const [tables, setTables] = useState(initialData.tables)
  const [couriers, setCouriers] = useState(initialData.couriers)
  const [productForm, setProductForm] = useState(blankProduct)
  const [importProductsForm, setImportProductsForm] = useState(blankImportProducts)
  const [flavorForm, setFlavorForm] = useState(blankFlavor)
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
  const [orderAddresses, setOrderAddresses] = useState(initialData.orderAddresses)
  const [deliveryZones, setDeliveryZones] = useState(initialData.deliveryZones)
  const [deliveryZoneForm, setDeliveryZoneForm] = useState(blankDeliveryZone)
  const [editingDeliveryZoneId, setEditingDeliveryZoneId] = useState(null)
  const [deliveryZoneStep, setDeliveryZoneStep] = useState(1)
  const [deliveryZonePoints, setDeliveryZonePoints] = useState([])
  const [selectedDeliveryZonePointIndex, setSelectedDeliveryZonePointIndex] = useState(null)
  const [deliveryZoneFeedback, setDeliveryZoneFeedback] = useState('')
  const [couponForm, setCouponForm] = useState(blankCoupon)
  const [stockForm, setStockForm] = useState(blankStock)
  const [financeForm, setFinanceForm] = useState(blankFinance)
  const [storeProfile, setStoreProfile] = useState(initialData.storeProfile)
  const [storeForm, setStoreForm] = useState(initialData.storeProfile)
  const [storeAddressLookup, setStoreAddressLookup] = useState({ status: 'idle', message: '' })
  const [storeMapMode, setStoreMapMode] = useState('view')
  const storeFormRef = useRef(initialData.storeProfile)
  const storeFormBaseRef = useRef(initialData.storeProfile)
  const accessKeyAttemptRef = useRef('')
  const backendLinkAttemptRef = useRef('')
  const lastMenuSnapshotRef = useRef(serializeMenuSnapshot(initialData))
  const pendingMenuSnapshotRef = useRef('')
  const menuSyncInFlightRef = useRef(false)
  const menuSyncRetryTimerRef = useRef(null)
  const menuSyncFailureNotifiedRef = useRef(false)
  const [menuSyncRetry, setMenuSyncRetry] = useState(0)
  const [printerConfig, setPrinterConfig] = useState(normalizePrinterConfig(initialData.printerConfig))
  const [printerForm, setPrinterForm] = useState(printerConfigToForm(initialData.printerConfig))
  const [pilotSync, setPilotSync] = useState(normalizePilotSync(initialData.pilotSync))
  const [security, setSecurity] = useState(initialData.security)
  const [storeUsers, setStoreUsers] = useState(initialData.storeUsers)
  const [currentStoreUser, setCurrentStoreUser] = useState(initialWorkspace.currentStoreUser)
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
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)
  const activeTitle = navItems.find((item) => item.id === activeNav)?.label ?? 'Pedidos'
  const notificationCount = Math.min(9, blockedOrders.length)
  const isStoreReady = Boolean(activeStoreId) && isStoreConfigured(storeProfile) && storeUsers.length > 0
  const hasValidStoreSession = currentStoreUser?.storeId === activeStoreId
  const tutorialStorageKey = activeStoreId ? `${STORAGE_KEY}:tutorial:v1:${activeStoreId}` : ''
  const currentTutorialStep = tutorialOpen ? tutorialSteps[tutorialStepIndex] : null

  function finishTutorial() {
    if (tutorialStorageKey) {
      localStorage.setItem(tutorialStorageKey, 'done')
    }
    setTutorialOpen(false)
    setTutorialStepIndex(0)
  }

  function advanceTutorial() {
    if (tutorialStepIndex >= tutorialSteps.length - 1) {
      finishTutorial()
      return
    }

    setTutorialStepIndex((current) => current + 1)
  }

  function backTutorial() {
    setTutorialStepIndex((current) => Math.max(0, current - 1))
  }

  useEffect(() => {
    const nextCoordinates = formatDeliveryZoneCoordinates(deliveryZonePoints)

    setDeliveryZoneForm((current) =>
      current.coordinates === nextCoordinates ? current : { ...current, coordinates: nextCoordinates },
    )
  }, [deliveryZonePoints])

  useEffect(() => {
    if (!hasValidStoreSession || !isStoreReady || !tutorialStorageKey) {
      return
    }

    if (localStorage.getItem(tutorialStorageKey) !== 'done') {
      setTutorialOpen(true)
      setTutorialStepIndex(0)
    }
  }, [hasValidStoreSession, isStoreReady, tutorialStorageKey])

  useEffect(() => {
    if (currentTutorialStep?.nav && currentTutorialStep.nav !== activeNav) {
      setActiveNav(currentTutorialStep.nav)
    }
  }, [activeNav, currentTutorialStep])

  useEffect(() => {
    setSelectedDeliveryZonePointIndex((current) => {
      if (current === null) {
        return null
      }

      return current < deliveryZonePoints.length ? current : null
    })
  }, [deliveryZonePoints])

  useEffect(() => {
    deliveryAddressFormRef.current = deliveryAddressForm
  }, [deliveryAddressForm])

  useEffect(() => {
    storeFormRef.current = storeForm
  }, [storeForm])

  const currentStoreSnapshot = useMemo(() => ({
    orders,
    orderSequence,
    activeNav,
    storeOpen,
    cashOpen,
    cashOpenedAt,
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
    orderAddresses,
    deliveryZones,
    storeProfile,
    printerConfig,
    pilotSync,
    security,
    storeUsers,
    botConfig,
    kdsConfig,
    orderDrafts,
    suggestions,
    eventLog,
  }), [
    orders,
    orderSequence,
    activeNav,
    storeOpen,
    cashOpen,
    cashOpenedAt,
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
    orderAddresses,
    deliveryZones,
    storeProfile,
    printerConfig,
    pilotSync,
    security,
    storeUsers,
    botConfig,
    kdsConfig,
    orderDrafts,
    suggestions,
    eventLog,
  ])

  const resolvedStores = useMemo(() => (
    stores.map((store) => (
      store.id === activeStoreId
        ? {
            ...store,
            snapshot: {
              ...currentStoreSnapshot,
              currentStoreUser: null,
            },
          }
        : store
    ))
  ), [activeStoreId, currentStoreSnapshot, stores])

  const workspaceSnapshot = useMemo(() => ({
    stores: resolvedStores,
    activeStoreId,
    currentStoreUser,
  }), [resolvedStores, activeStoreId, currentStoreUser])
  const storefrontShareId = pilotSync.storeId || activeStoreId || ''
  const storefrontUrl = storefrontShareId && typeof window !== 'undefined'
    ? buildPublicAppUrl(`/loja/${encodeURIComponent(storefrontShareId)}`)
    : ''
  const storeAccessUrl = buildStoreAccessUrl(storeProfile.accessKey)
  const storeAccessFromPath = getStoreAccessFromPath()
  const storeAccessKeyFromPath = storeAccessFromPath.accessKey
  const storeAccessIdFromPath = storeAccessFromPath.storeId
  const customerStoreId = getCustomerStoreIdFromPath()
  const customerStore = customerStoreId
    ? resolvedStores.find((store) => store.id === customerStoreId) || null
    : null

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaceSnapshot))
  }, [workspaceSnapshot])

  useEffect(() => {
    const backendStoreId = pilotSync.storeId || (/^[0-9a-f-]{36}$/i.test(String(activeStoreId || '')) ? activeStoreId : '')

    if (!backendStoreId || !hasValidStoreSession || !isStoreReady) {
      return undefined
    }

    const snapshot = buildMenuSnapshot({ categories, products, deliveryZones })
    const serialized = JSON.stringify(snapshot)

    if (serialized === lastMenuSnapshotRef.current) {
      return undefined
    }

    pendingMenuSnapshotRef.current = serialized

    const timeoutId = window.setTimeout(() => {
      menuSyncInFlightRef.current = true
      updateBackendMenuSnapshot(backendStoreId, snapshot)
        .then(() => {
          if (menuSyncRetryTimerRef.current) {
            window.clearTimeout(menuSyncRetryTimerRef.current)
            menuSyncRetryTimerRef.current = null
          }
          menuSyncFailureNotifiedRef.current = false
          lastMenuSnapshotRef.current = serialized
          if (pendingMenuSnapshotRef.current === serialized) {
            pendingMenuSnapshotRef.current = ''
          }
        })
        .catch((err) => {
          if (!menuSyncFailureNotifiedRef.current) {
            notify(`Cardapio salvo localmente, mas nao sincronizou com a API: ${err instanceof Error ? err.message : 'erro desconhecido'}. Vou tentar novamente.`, 'warning')
            menuSyncFailureNotifiedRef.current = true
          }
          if (!menuSyncRetryTimerRef.current) {
            menuSyncRetryTimerRef.current = window.setTimeout(() => {
              menuSyncRetryTimerRef.current = null
              setMenuSyncRetry((current) => current + 1)
            }, 5000)
          }
        })
        .finally(() => {
          menuSyncInFlightRef.current = false
        })
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [activeStoreId, categories, deliveryZones, hasValidStoreSession, isStoreReady, menuSyncRetry, pilotSync.storeId, products])

  useEffect(() => () => {
    if (menuSyncRetryTimerRef.current) {
      window.clearTimeout(menuSyncRetryTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const backendStoreId = pilotSync.storeId || (/^[0-9a-f-]{36}$/i.test(String(activeStoreId || '')) ? activeStoreId : '')

    if (backendStoreId || !hasValidStoreSession || !isStoreReady) {
      return
    }

    const sessionUser = storeUsers.find((user) => user.email === currentStoreUser?.email && user.password)
    const localMenu = buildMenuSnapshot({ categories, products, deliveryZones })

    if (!sessionUser || !hasMenuSnapshotContent(localMenu)) {
      return
    }

    const attemptKey = `${activeStoreId}:${sessionUser.email}`
    if (backendLinkAttemptRef.current === attemptKey) {
      return
    }

    backendLinkAttemptRef.current = attemptKey
    void linkLocalStoreToBackend(sessionUser, localMenu)
    // linkLocalStoreToBackend uses the current local store snapshot as the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId, categories, currentStoreUser?.email, deliveryZones, hasValidStoreSession, isStoreReady, pilotSync.storeId, products, storeUsers])

  useEffect(() => {
    const accessAttemptKey = `${storeAccessIdFromPath}:${storeAccessKeyFromPath}`
    if (!storeAccessKeyFromPath || hasValidStoreSession || accessKeyAttemptRef.current === accessAttemptKey) {
      return
    }

    accessKeyAttemptRef.current = accessAttemptKey
    void openDemoStore({ source: 'accessKey', accessKey: storeAccessKeyFromPath, storeId: storeAccessIdFromPath, silent: true })
    // openDemoStore reads the current workspace; accessKeyAttemptRef prevents repeated attempts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeAccessKeyFromPath, storeAccessIdFromPath, hasValidStoreSession])

  useEffect(() => {
    if (!orderCart.some((item) => item.id === selectedCartItemId)) {
      setSelectedCartItemId(orderCart[0]?.id || null)
    }
  }, [orderCart, selectedCartItemId])

  useEffect(() => {
    if (selectedCategory !== 'all' && !categories.some((category) => category.name === selectedCategory)) {
      setSelectedCategory('all')
    }

    if (posCategory !== 'all' && !categories.some((category) => category.name === posCategory)) {
      setPosCategory('all')
    }
  }, [categories, posCategory, selectedCategory])

  useEffect(() => {
    if (deliveryTabDraft !== 'delivery' || !selectedAddressDraftId) {
      return
    }

    const selectedAddress = orderAddresses.find((address) => address.id === selectedAddressDraftId)

    if (selectedAddress?.deliveryFee) {
      setDeliveryFeeDraft(selectedAddress.deliveryFee)
    }
  }, [deliveryTabDraft, orderAddresses, selectedAddressDraftId])

  refreshPilotFromBackendRef.current = refreshPilotFromBackend

  useEffect(() => {
    if (customerStoreId || !hasValidStoreSession || !isStoreReady || !pilotSync.enabled || !pilotSync.storeId) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      void refreshPilotFromBackendRef.current?.({ silent: true })
    }, 6000)

    return () => window.clearInterval(intervalId)
  }, [customerStoreId, hasValidStoreSession, isStoreReady, pilotSync.enabled, pilotSync.storeId])

  async function copyStorefrontShareUrl() {
    if (!storefrontUrl) {
      notify('Vincule a loja ao backend antes de compartilhar o perfil publico.', 'warning')
      return
    }

    try {
      const copied = await copyText(storefrontUrl)
      notify(copied ? 'Link do perfil publico copiado.' : `Link pronto: ${storefrontUrl}`)
    } catch {
      notify(`Link pronto: ${storefrontUrl}`, 'warning')
    }
  }

  async function copyStoreAccessUrl() {
    if (!storeAccessUrl) {
      notify('Cadastre uma chave unica de acesso antes de copiar o link.', 'warning')
      return
    }

    try {
      const copied = await copyText(storeAccessUrl)
      notify(copied ? 'Link de acesso copiado.' : `Link pronto: ${storeAccessUrl}`)
    } catch {
      notify(`Link pronto: ${storeAccessUrl}`, 'warning')
    }
  }

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
      setModal({ type: 'whatsappSetup', payload: null })
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
      const editableCart = orderToCartItems(payload, products)

      setEditingOrderId(payload.id)
      setNewOrder(orderToPosDraft(payload))
      setOrderCart(editableCart)
      setSelectedCartItemId(editableCart[0]?.id || null)
      setCartItemForm(blankCartItemForm)
      setCartItemStepIndex(0)
      setCartItemNoteOpen(false)
      setPosCategory('all')
      setPosSearch('')
      setShowManualTotalInput(false)
      setOrderPanel(null)
      setModal({ type: 'newOrder', payload })
      return
    }

    if (type === 'editProduct' && payload) {
      setProductForm(productToForm(payload))
    }

    if (type === 'newProduct') {
      if (categories.length === 0) {
        setCategoryForm(blankCategory)
        setModal({ type: 'newCategory', payload: null })
        notify('Crie uma categoria antes de cadastrar um item.', 'warning')
        return
      }

      const fallbackCategory = payload?.category ?? (selectedCategory === 'all' ? categories[0]?.name : selectedCategory) ?? blankProduct.category
      setProductForm({ ...blankProduct, category: fallbackCategory })
    }

    if (type === 'importProducts' && payload?.category) {
      const sourceCategory = categories.find((category) => category.name !== payload.category)?.name || ''
      setImportProductsForm({ sourceCategory, productIds: [] })
    }

    if (type === 'newFlavor') {
      setFlavorForm(blankFlavor)
    }

    if (type === 'editFlavor' && payload?.flavor) {
      setFlavorForm(flavorToForm(payload.flavor))
    }

    if (type === 'editCartItem' && payload) {
      const product = products.find((item) => item.id === payload.productId)

      if (!product) {
        notify('Produto nao encontrado no cardapio.', 'warning')
        return
      }

      setCartItemForm(orderCartItemToForm(product, payload))
      setCartItemStepIndex(getInitialCartItemEditStep(product, payload))
      setCartItemNoteOpen(Boolean(payload.note))
    }

    if (type === 'newOrder') {
      setEditingOrderId(null)
      setNewOrder(blankOrder)
      setOrderCart([])
      setSelectedCartItemId(null)
      setCartItemForm(blankCartItemForm)
      setCartItemStepIndex(0)
      setCartItemNoteOpen(false)
      setPosCategory('all')
      setPosSearch('')
      setShowManualTotalInput(false)
      setOrderPanel(null)
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
        cost: formatCurrencyInput(payload.cost),
      })
    }

    if (type === 'newFinance') {
      setFinanceForm(blankFinance)
    }

    if (type === 'editFinance' && payload) {
      setFinanceForm({
        title: payload.title,
        type: payload.type,
        amount: formatCurrencyInput(payload.amount),
        status: payload.status,
      })
    }

    if (type === 'newCourier') {
      setCourierForm(blankCourier)
    }

    if (type === 'editCourier' && payload) {
      setCourierForm(courierToForm(payload))
    }

    if (type === 'newDeliveryZone') {
      setDeliveryZoneForm(blankDeliveryZone)
      setEditingDeliveryZoneId(null)
      setDeliveryZoneStep(1)
      setDeliveryZonePoints([])
      setSelectedDeliveryZonePointIndex(null)
      setDeliveryZoneFeedback('')
    }

    if (type === 'editDeliveryZone' && payload) {
      setDeliveryZoneForm(deliveryZoneToForm(payload))
      setEditingDeliveryZoneId(payload.id)
      setDeliveryZoneStep(1)
      setDeliveryZonePoints((payload.polygon || []).slice(0, -1))
      setSelectedDeliveryZonePointIndex(null)
      setDeliveryZoneFeedback('')
    }

    if (type === 'newRecovery') {
      setRecoveryForm(blankRecovery)
    }

    if (type === 'editRecovery' && payload) {
      setRecoveryForm(recoveryToForm(payload))
    }

    if (type === 'store' || type === 'register') {
      const nextStoreForm = normalizeStoreProfile(storeProfile)
      setStoreForm(nextStoreForm)
      storeFormRef.current = nextStoreForm
      storeFormBaseRef.current = nextStoreForm
      setStoreAddressLookup({ status: 'idle', message: '' })
      setStoreMapMode('view')
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
      setPrinterForm(printerConfigToForm(printerConfig))
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
    setOrderPanel(null)
    setEditingOrderId(null)
    setModal(null)
  }

  function handleStoreFormChange(nextStore) {
    storeFormRef.current = nextStore
    setStoreForm(nextStore)
  }

  function generateAccessKeyForStore() {
    const nextStore = normalizeStoreProfile({
      ...storeFormRef.current,
      accessKey: generateStoreAccessKey(storeFormRef.current),
    })

    storeFormRef.current = nextStore
    setStoreForm(nextStore)
    notify('Chave unica gerada. Salve a loja para liberar o link.')
  }

  function notify(message, tone = 'neutral') {
    setToast(message)
    setEventLog((current) => [
      { id: `evt-${Date.now()}-${current.length}`, message, time: nowDateTime(), tone },
      ...current,
    ].slice(0, 60))
  }

  function updatePilotSync(partial) {
    setPilotSync((current) => normalizePilotSync({ ...current, ...partial }))
  }

  function markOrderSyncState(orderId, partial) {
    setOrders((current) =>
      current.map((order) => (
        order.id === orderId
          ? normalizeOrderRecord({ ...order, ...partial })
          : order
      )),
    )
  }

  async function ensurePilotStoreId() {
    if (pilotSync.storeId) {
      return pilotSync.storeId
    }

    const workspace = await loadBackendWorkspace()

    if (!workspace.store) {
      throw new Error('Nenhuma loja cadastrada no backend.')
    }

    updatePilotSync({
      enabled: true,
      status: 'online',
      storeId: workspace.store.id,
      storeName: workspace.store.tradeName,
      lastCheckedAt: nowDateTime(),
      message: `Conectado em ${workspace.store.tradeName}.`,
    })

    return workspace.store.id
  }

  async function refreshPilotFromBackend({ enable = false, silent = false } = {}) {
    updatePilotSync({
      enabled: enable ? true : pilotSync.enabled,
      status: 'checking',
      message: 'Consultando API e pedidos recentes...',
    })

    try {
      const workspace = await loadBackendWorkspace(pilotSync.storeId)

      if (!workspace.store) {
        throw new Error('Backend respondeu, mas nao encontrou loja cadastrada.')
      }

      setOrders((current) => mergeBackendOrders(current, workspace.orders))
      const snapshot = getWorkspaceMenuSnapshot(workspace)
      const remoteMenuSerialized = serializeMenuSnapshot({
        categories: snapshot.categories || categories,
        products: snapshot.products || products,
        deliveryZones: snapshot.deliveryZones || deliveryZones,
      })
      const hasPendingMenuWrite = Boolean(
        menuSyncInFlightRef.current
        || (pendingMenuSnapshotRef.current && pendingMenuSnapshotRef.current !== remoteMenuSerialized),
      )

      if (snapshot.categories && !hasPendingMenuWrite) {
        setCategories(snapshot.categories)
      }
      if (snapshot.products && !hasPendingMenuWrite) {
        const fallbackCategory = snapshot.categories?.[0]?.name || categories[0]?.name || 'Cardapio'
        setProducts(snapshot.products.map((product) => normalizeProduct(product, fallbackCategory)))
      }
      if (snapshot.deliveryZones && !hasPendingMenuWrite) {
        setDeliveryZones(snapshot.deliveryZones)
      }
      if ((snapshot.categories || snapshot.products || snapshot.deliveryZones) && !hasPendingMenuWrite) {
        lastMenuSnapshotRef.current = remoteMenuSerialized
      }
      updatePilotSync({
        enabled: enable ? true : pilotSync.enabled,
        status: 'online',
        storeId: workspace.store.id,
        storeName: workspace.store.tradeName,
        lastCheckedAt: nowDateTime(),
        lastSyncedAt: nowDateTime(),
        message: `${workspace.orders.length} pedido(s) lido(s) da API.`,
      })

      if (!silent) {
        notify(`API conectada: ${workspace.store.tradeName}.`)
      }

      return workspace
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nao foi possivel consultar a API.'
      updatePilotSync({
        enabled: enable ? true : pilotSync.enabled,
        status: 'offline',
        lastCheckedAt: nowDateTime(),
        message,
      })

      if (!silent) {
        notify(`Backend indisponivel: ${message}`, 'warning')
      }

      return null
    }
  }

  async function connectPilotSync() {
    await refreshPilotFromBackend({ enable: true })
  }

  function disablePilotSync() {
    setPilotSync((current) => normalizePilotSync({
      ...current,
      enabled: false,
      status: 'idle',
      message: 'Modo piloto desligado. Os proximos pedidos ficarao locais.',
    }))
    notify('Modo piloto desligado.')
  }

  async function syncSingleOrderToBackend(order, { storeId = '', silent = false } = {}) {
    const normalizedOrder = normalizeOrderRecord(order)
    const localOrderId = normalizedOrder.id

    if (!pilotSync.enabled && !storeId) {
      markOrderSyncState(localOrderId, {
        syncStatus: 'pending',
        syncMessage: 'Modo piloto desligado.',
      })
      return false
    }

    markOrderSyncState(localOrderId, {
      syncStatus: 'pending',
      syncMessage: 'Sincronizando com API...',
    })
    updatePilotSync({
      status: 'syncing',
      message: `Sincronizando pedido #${localOrderId}...`,
    })

    try {
      const targetStoreId = storeId || await ensurePilotStoreId()
      const requestBody = frontOrderToBackendRequest(normalizedOrder)
      let savedOrder = null

      if (isBackendUuid(normalizedOrder.backendId)) {
        savedOrder = await updateBackendOrder(targetStoreId, normalizedOrder.backendId, requestBody)
      } else {
        savedOrder = await createBackendOrder(targetStoreId, requestBody)
      }

      if (savedOrder?.id && savedOrder.status !== normalizedOrder.status) {
        savedOrder = await updateBackendOrderStatus(targetStoreId, savedOrder.id, normalizedOrder.status)
      }

      markOrderSyncState(localOrderId, {
        backendId: savedOrder?.id || normalizedOrder.backendId,
        backendCreatedAt: savedOrder?.createdAt || normalizedOrder.backendCreatedAt || '',
        backendUpdatedAt: savedOrder?.updatedAt || normalizedOrder.backendUpdatedAt || '',
        status: savedOrder?.status || normalizedOrder.status,
        syncStatus: 'synced',
        syncMessage: 'Sincronizado com API',
        syncedAt: nowDateTime(),
      })
      updatePilotSync({
        status: 'online',
        lastSyncedAt: nowDateTime(),
        message: `Pedido #${localOrderId} sincronizado.`,
      })

      if (!silent) {
        notify(`Pedido #${localOrderId} sincronizado com a API.`)
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao sincronizar pedido.'
      markOrderSyncState(localOrderId, {
        syncStatus: 'failed',
        syncMessage: message,
      })
      updatePilotSync({
        status: 'error',
        lastCheckedAt: nowDateTime(),
        message,
      })

      if (!silent) {
        notify(`Pedido #${localOrderId} ficou pendente: ${message}`, 'warning')
      }

      return false
    }
  }

  async function syncOrderStatusToBackend(order, nextStatus) {
    const normalizedOrder = normalizeOrderRecord({ ...order, status: nextStatus })

    if (!pilotSync.enabled || !pilotSync.syncOnStatusChange) {
      markOrderSyncState(normalizedOrder.id, {
        syncStatus: normalizedOrder.backendId ? normalizedOrder.syncStatus : 'pending',
        syncMessage: 'Status alterado apenas localmente.',
      })
      return false
    }

    if (!isBackendUuid(normalizedOrder.backendId)) {
      return syncSingleOrderToBackend(normalizedOrder, { silent: true })
    }

    try {
      const targetStoreId = await ensurePilotStoreId()
      const savedOrder = await updateBackendOrderStatus(targetStoreId, normalizedOrder.backendId, nextStatus)
      markOrderSyncState(normalizedOrder.id, {
        backendUpdatedAt: savedOrder?.updatedAt || normalizedOrder.backendUpdatedAt || '',
        status: savedOrder?.status || nextStatus,
        syncStatus: 'synced',
        syncMessage: 'Status sincronizado com API',
        syncedAt: nowDateTime(),
      })
      updatePilotSync({
        status: 'online',
        lastSyncedAt: nowDateTime(),
        message: `Status do pedido #${normalizedOrder.id} sincronizado.`,
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao sincronizar status.'
      markOrderSyncState(normalizedOrder.id, {
        syncStatus: 'failed',
        syncMessage: message,
      })
      updatePilotSync({
        status: 'error',
        message,
      })
      notify(`Status do pedido #${normalizedOrder.id} ficou pendente.`, 'warning')
      return false
    }
  }

  async function deleteOrderFromBackend(order) {
    if (!pilotSync.enabled || !isBackendUuid(order?.backendId)) {
      return true
    }

    try {
      const targetStoreId = await ensurePilotStoreId()
      await deleteBackendOrder(targetStoreId, order.backendId)
      updatePilotSync({
        status: 'online',
        lastSyncedAt: nowDateTime(),
        message: `Pedido #${order.id} removido da API.`,
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao remover pedido na API.'
      updatePilotSync({ status: 'error', message })
      notify(`Pedido apagado localmente, mas a API nao removeu: ${message}`, 'warning')
      return false
    }
  }

  async function syncPendingOrders() {
    const pendingOrders = orders.filter((order) => !order.backendId || order.syncStatus === 'pending' || order.syncStatus === 'failed')

    if (pendingOrders.length === 0) {
      notify('Nao ha pedidos pendentes para sincronizar.')
      return
    }

    updatePilotSync({
      enabled: true,
      status: 'syncing',
      message: `Sincronizando ${pendingOrders.length} pedido(s)...`,
    })

    try {
      const targetStoreId = await ensurePilotStoreId()
      let syncedCount = 0

      for (const order of pendingOrders) {
        const synced = await syncSingleOrderToBackend(order, { storeId: targetStoreId, silent: true })
        if (synced) {
          syncedCount += 1
        }
      }

      await refreshPilotFromBackend({ silent: true, enable: true })
      notify(`${syncedCount}/${pendingOrders.length} pedido(s) sincronizado(s) com a API.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao iniciar sincronizacao.'
      updatePilotSync({ status: 'error', message })
      notify(`Sincronizacao interrompida: ${message}`, 'warning')
    }
  }

  async function sendPilotLog() {
    try {
      const targetStoreId = await ensurePilotStoreId()
      await createBackendLog({
        storeId: targetStoreId,
        level: 'INFO',
        area: 'pilot',
        message: `Teste controlado pelo front em ${nowDateTime()}`,
      })
      updatePilotSync({
        status: 'online',
        lastCheckedAt: nowDateTime(),
        message: 'Log de teste gravado na API.',
      })
      notify('Log de teste gravado no backend.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao gravar log de teste.'
      updatePilotSync({ status: 'error', message })
      notify(`Nao foi possivel gravar log: ${message}`, 'warning')
    }
  }

  async function quickHealthCheck() {
    updatePilotSync({ status: 'checking', message: 'Checando saude da API...' })

    try {
      const health = await checkBackendHealth()
      updatePilotSync({
        status: 'online',
        lastCheckedAt: nowDateTime(),
        message: `API respondeu ${health.status || 'OK'}.`,
      })
      notify('API respondeu ao teste de saude.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'API nao respondeu.'
      updatePilotSync({ status: 'offline', lastCheckedAt: nowDateTime(), message })
      notify(`API offline: ${message}`, 'warning')
    }
  }

  async function createOnlineStoreAccount(account) {
    if (account.action === 'requestCode') {
      try {
        await requestSignupCode(account.email)
        return { ok: true }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel enviar o codigo.' }
      }
    }

    const email = String(account.email || '').trim().toLowerCase()
    const password = String(account.password || '')

    if (!email || password.length < 6 || String(account.code || '').trim().length !== 6) {
      return { ok: false, message: 'Informe email, senha e codigo de 6 digitos.' }
    }

    try {
      const initialAccessKey = generateStoreAccessKey({ tradeName: account.tradeName })
      const localStore = createStoreRecord({
        profile: {
          tradeName: account.tradeName,
          owner: account.ownerName,
          phone: account.phone,
          whatsapp: account.phone,
          email,
          taxId: account.taxId,
          category: account.category || 'Restaurante',
          street: account.street,
          number: account.number,
          district: '',
          cityName: account.cityName,
          state: account.state || 'SC',
          schedule: account.schedule,
          accessKey: initialAccessKey,
          minimumOrder: '0,00',
          deliveryRadius: '5',
        },
        owner: {
          name: account.ownerName,
          email,
          password,
        },
      }, resolvedStores.length)

      if (localStore.ok === false) {
        return localStore
      }

      const signup = await signupBackendAccount({
        tradeName: account.tradeName,
        ownerName: account.ownerName,
        email,
        phone: account.phone,
        taxId: account.taxId,
        category: account.category || 'Restaurante',
        street: account.street,
        number: account.number,
        district: '',
        cityName: account.cityName,
        state: account.state || 'SC',
        schedule: account.schedule,
        accessKey: initialAccessKey,
        menuSnapshot: JSON.stringify(buildMenuSnapshot(localStore.store.snapshot)),
        minimumOrder: 0,
        deliveryRadiusKm: 5,
        password,
        code: account.code,
      })

      if (signup.ok === false || !signup.user?.storeId) {
        return { ok: false, message: signup.message || 'Codigo invalido ou expirado.' }
      }

      const storeId = signup.user.storeId
      const nextStore = {
        ...localStore.store,
        id: storeId,
        snapshot: {
          ...localStore.store.snapshot,
          pilotSync: normalizePilotSync({
            ...localStore.store.snapshot.pilotSync,
            enabled: true,
            status: 'online',
            storeId,
            storeName: account.tradeName,
            lastCheckedAt: nowDateTime(),
            message: 'Conta criada e vinculada a API.',
          }),
        },
      }
      const nextStores = [...resolvedStores, nextStore]

      setStores(nextStores)
      setActiveStoreId(nextStore.id)
      applySnapshot(nextStore.snapshot, 'Conta criada.')
      setPilotSync(nextStore.snapshot.pilotSync)
      setCurrentStoreUser(buildStoreSession(localStore.user, nowDateTime, nextStore.id))
      setToast(`Bem-vindo, ${localStore.user.name}.`)
      notify('Conta criada no backend e painel aberto.')

      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Nao foi possivel criar a conta agora.',
      }
    }
  }

  async function handlePasswordReset(request) {
    try {
      if (request.action === 'requestCode') {
        await requestPasswordResetCode(request.email)
        return { ok: true }
      }

      const result = await resetBackendPassword(request.email, request.code, request.password)
      return result?.ok === false ? result : { ok: true }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Nao foi possivel processar a recuperacao.',
      }
    }
  }

  async function linkLocalStoreToBackend(localUser, localMenu = buildMenuSnapshot({ categories, products, deliveryZones })) {
    if (!localUser?.email || !localUser?.password) {
      return false
    }

    try {
      const login = await loginBackendUser(localUser.email, localUser.password)

      if (login.ok === false || !login.user?.storeId) {
        return false
      }

      const workspace = await loadBackendWorkspace(login.user.storeId)
      const backendStore = workspace.store || await getBackendStore(login.user.storeId)
      const remoteMenu = getWorkspaceMenuSnapshot({ ...workspace, store: backendStore })
      const remoteSnapshot = buildMenuSnapshot({
        categories: remoteMenu.categories || [],
        products: remoteMenu.products || [],
        deliveryZones: remoteMenu.deliveryZones || [],
      })
      const hasRemoteMenu = hasMenuSnapshotContent(remoteSnapshot)
      const nextPilotSync = normalizePilotSync({
        ...pilotSync,
        enabled: true,
        status: 'online',
        storeId: login.user.storeId,
        storeName: backendStore.tradeName || storeProfile.name,
        lastCheckedAt: nowDateTime(),
        lastSyncedAt: nowDateTime(),
        message: hasRemoteMenu ? 'Loja carregada do backend.' : 'Loja local vinculada ao backend.',
      })
      const localStoreProfile = normalizeStoreProfile({
        ...storeProfile,
        accessKey: storeProfile.accessKey || backendStore.accessKey || generateStoreAccessKey(storeProfile),
      })
      const nextStoreUsers = storeUsers.map((user) => (
        user.email === localUser.email
          ? { ...user, id: login.user.id || user.id, role: login.user.role || user.role }
          : user
      ))

      let nextSnapshot
      if (hasRemoteMenu) {
        const loadedStore = backendWorkspaceToStoreRecord({ ...workspace, store: backendStore }, backendStore.accessKey || '')
        nextSnapshot = normalizeAppSnapshot({
          ...loadedStore.snapshot,
          storeUsers: nextStoreUsers,
          pilotSync: nextPilotSync,
        })
      } else if (hasMenuSnapshotContent(localMenu)) {
        nextSnapshot = normalizeAppSnapshot({
          ...currentStoreSnapshot,
          categories,
          products,
          deliveryZones,
          storeProfile: localStoreProfile,
          storeUsers: nextStoreUsers,
          pilotSync: nextPilotSync,
        })

        await updateBackendStore(login.user.storeId, {
          ...storeProfileToBackendRequest(localStoreProfile),
          menuSnapshot: JSON.stringify(localMenu),
        })
        await updateBackendMenuSnapshot(login.user.storeId, localMenu)
      } else {
        nextSnapshot = normalizeAppSnapshot({
          ...backendWorkspaceToStoreRecord({ ...workspace, store: backendStore }, backendStore.accessKey || '').snapshot,
          storeUsers: nextStoreUsers,
          pilotSync: nextPilotSync,
        })
      }

      const nextStores = [
        ...resolvedStores.filter((store) => store.id !== activeStoreId && store.id !== login.user.storeId),
        { id: login.user.storeId, snapshot: nextSnapshot },
      ]

      setStores(nextStores)
      setActiveStoreId(login.user.storeId)
      applySnapshot(nextSnapshot, hasRemoteMenu ? 'Conta carregada do backend.' : 'Loja local vinculada ao backend.')
      setPilotSync(nextPilotSync)
      setCurrentStoreUser(buildStoreSession(
        nextStoreUsers.find((user) => user.email === localUser.email) || localUser,
        nowDateTime,
        login.user.storeId,
      ))
      notify(hasRemoteMenu ? 'Cardapio carregado do banco.' : 'Cardapio local enviado para o banco.')
      return true
    } catch (err) {
      notify(`Nao foi possivel vincular o cardapio local ao backend: ${err instanceof Error ? err.message : 'erro desconhecido'}`, 'warning')
      return false
    }
  }

  async function loginStoreUser(credentials) {
    if (activeStoreId) {
      const result = authenticateStoreUser(storeUsers, credentials)

      if (result.ok !== false) {
        const linked = await linkLocalStoreToBackend(result.user)
        if (linked) {
          return { ok: true }
        }

        setCurrentStoreUser(buildStoreSession(result.user, nowDateTime, activeStoreId))
        setToast(`Bem-vindo, ${result.user.name}.`)
        return { ok: true }
      }
    }

    try {
      const login = await loginBackendUser(credentials.email, credentials.password)

      if (login.ok === false || !login.user?.storeId) {
        return { ok: false, message: login.message || 'Email ou senha invalidos.' }
      }

      const workspace = await loadBackendWorkspace(login.user.storeId)
      const backendStore = workspace.store || await getBackendStore(login.user.storeId)
      const localUser = normalizeStoreUser({
        id: login.user.id,
        name: login.user.name,
        email: login.user.email,
        password: credentials.password,
        role: login.user.role || 'owner',
        createdAt: login.user.createdAt || nowDateTime(),
      })
      const loadedStore = backendWorkspaceToStoreRecord({ ...workspace, store: backendStore }, backendStore.accessKey || '')
      const nextStore = {
        id: login.user.storeId,
        snapshot: {
          ...loadedStore.snapshot,
          storeUsers: [localUser],
          pilotSync: normalizePilotSync({
            ...loadedStore.snapshot.pilotSync,
            enabled: true,
            status: 'online',
            storeId: login.user.storeId,
            storeName: backendStore.tradeName,
            lastCheckedAt: nowDateTime(),
            message: 'Conta carregada da API.',
          }),
        },
      }
      const nextStores = [...resolvedStores.filter((store) => store.id !== nextStore.id), nextStore]

      setStores(nextStores)
      setActiveStoreId(nextStore.id)
      applySnapshot(nextStore.snapshot, 'Conta carregada.')
      setPilotSync(nextStore.snapshot.pilotSync)
      setCurrentStoreUser(buildStoreSession(localUser, nowDateTime, nextStore.id))
      setToast(`Bem-vindo, ${localUser.name}.`)
      notify('Conta carregada do backend.')
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel entrar agora.' }
    }
  }

  function logoutStoreUser() {
    setCurrentStoreUser(null)
    setToast('Sessao encerrada.')
  }

  async function openDemoStore({ source = 'demoButton', accessKey = '', storeId = '' } = {}) {
    const normalizedKey = normalizeStoreAccessKey(accessKey)
    const usingAccessKey = source === 'accessKey'

    if (usingAccessKey && normalizedKey && normalizedKey !== 'demo') {
      const matchedStore = resolvedStores.find((store) => normalizeStoreAccessKey(store.snapshot?.storeProfile?.accessKey) === normalizedKey)

      if (matchedStore) {
        const firstUser = matchedStore.snapshot.storeUsers[0]
        if (!firstUser) {
          return { ok: false, message: 'Esta loja ainda nao tem usuario cadastrado.' }
        }

        setActiveStoreId(matchedStore.id)
        applySnapshot(matchedStore.snapshot, 'Loja carregada pela chave de acesso.')
        setCurrentStoreUser(buildStoreSession(firstUser, nowDateTime, matchedStore.id))
        setToast(`Acesso liberado para ${matchedStore.snapshot.storeProfile.name || 'loja'}.`)
        notify('Acesso liberado pela chave da loja.')
        return { ok: true }
      }

      try {
        const workspace = storeId
          ? await loadBackendWorkspace(storeId)
          : await loadBackendWorkspaceByAccessKey(accessKey)
        if (!workspace.store) {
          return { ok: false, message: 'Loja nao encontrada na API.' }
        }

        if (normalizeStoreAccessKey(workspace.store.accessKey) !== normalizedKey) {
          return { ok: false, message: 'Chave de acesso nao confere com a loja.' }
        }

        const nextStore = backendWorkspaceToStoreRecord(workspace, accessKey)
        const nextStores = [...resolvedStores.filter((store) => store.id !== nextStore.id), {
          id: nextStore.id,
          snapshot: nextStore.snapshot,
        }]

        setStores(nextStores)
        setActiveStoreId(nextStore.id)
        applySnapshot(nextStore.snapshot, 'Loja carregada pela chave de acesso.')
        setCurrentStoreUser(buildStoreSession(nextStore.user, nowDateTime, nextStore.id))
        setToast(`Acesso liberado para ${nextStore.snapshot.storeProfile.name || 'loja'}.`)
        notify('Acesso liberado pela chave da loja.')
        return { ok: true }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel carregar a loja pela chave.' }
      }
    }

    const existingDemoStore = resolvedStores.find((store) => store.snapshot.storeUsers.some((user) => user.email === 'demo@meucardapio.local'))
    const openExistingDemo = (store) => {
      const result = authenticateStoreUser(store.snapshot.storeUsers, {
        email: 'demo@meucardapio.local',
        password: 'demo123',
      })

      if (result.ok === false) {
        return result
      }

      setActiveStoreId(store.id)
      applySnapshot(store.snapshot, 'Ambiente demo carregado.')
      setCurrentStoreUser(buildStoreSession(result.user, nowDateTime, store.id))
      setToast('Demo iniciado.')
      notify('Ambiente demo carregado.')
      return { ok: true }
    }

    if (existingDemoStore) {
      return openExistingDemo(existingDemoStore)
    }

    const result = createDemoStoreRecord(resolvedStores.length)

    if (result.ok === false) {
      return result
    }

    const nextStores = [...resolvedStores, result.store]
    setStores(nextStores)
    setActiveStoreId(result.store.id)
    applySnapshot(result.store.snapshot, 'Ambiente demo carregado.')
    setCurrentStoreUser(buildStoreSession(result.user, nowDateTime, result.store.id))
    setToast('Demo iniciado.')
    notify('Loja demo criada localmente.')
    return { ok: true }
  }

  function applySnapshot(snapshot, toastMessage = 'Backup carregado localmente.') {
    const merged = normalizeAppSnapshot(snapshot)
    lastMenuSnapshotRef.current = serializeMenuSnapshot({
      categories: merged.categories,
      products: merged.products,
      deliveryZones: merged.deliveryZones,
    })

    setOrders(merged.orders)
    setOrderSequence(merged.orderSequence)
    orderSequenceRef.current = merged.orderSequence
    setActiveNav(merged.activeNav)
    setStoreOpen(Boolean(merged.storeOpen))
    setCashOpen(Boolean(merged.cashOpen))
    setCashOpenedAt(merged.cashOpenedAt || '')
    setNoticeVisible(false)
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
    setOrderAddresses(merged.orderAddresses)
    setDeliveryZones(merged.deliveryZones)
    setStoreProfile(merged.storeProfile)
    setStoreForm(merged.storeProfile)
    storeFormBaseRef.current = merged.storeProfile
    setPrinterConfig(merged.printerConfig)
    setPrinterForm(printerConfigToForm(merged.printerConfig))
    setPilotSync(merged.pilotSync)
    setSecurity(merged.security)
    setStoreUsers(merged.storeUsers)
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
    setStoreAddressLookup({ status: 'idle', message: '' })
    setStoreMapMode('view')
    setToast(toastMessage)
  }

  function applyWorkspace(workspace, toastMessage = 'Backup carregado localmente.') {
    setStores(workspace.stores)
    setActiveStoreId(workspace.activeStoreId)
    applySnapshot(workspace.activeSnapshot, toastMessage)
    setCurrentStoreUser(workspace.currentStoreUser)
  }

  function exportAppBackup() {
    downloadTextFile(
      `meucardapio-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(workspaceSnapshot, null, 2),
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

  function openMenuImportPicker() {
    setDataImportError('')
    menuImportInputRef.current?.click()
  }

  function getUniqueImportId(value, fallback, usedIds) {
    const base = String(value || fallback).trim() || fallback
    let candidate = base
    let suffix = 2

    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }

    usedIds.add(candidate)
    return candidate
  }

  function applyMenuImport(importedMenu, fileName = '') {
    const rawCategories = Array.isArray(importedMenu?.categories) ? importedMenu.categories : []
    const rawProducts = Array.isArray(importedMenu?.products) ? importedMenu.products : []

    if (rawProducts.length === 0) {
      throw new Error('Nenhum produto encontrado.')
    }

    const usedCategoryIds = new Set()
    const nextCategories = rawCategories
      .filter((category) => category?.name)
      .map((category, index) => ({
        id: getUniqueImportId(category.id, `import-cat-${index + 1}`, usedCategoryIds),
        name: category.name,
        imageUrl: category.imageUrl || '',
        active: category.active !== false,
      }))
    const fallbackCategory = nextCategories[0]?.name || 'Importados'
    const validCategoryNames = new Set(nextCategories.map((category) => category.name))
    const usedProductIds = new Set()
    const nextProducts = rawProducts
      .filter((product) => product?.name)
      .map((product, index) => normalizeProduct({
        ...product,
        id: getUniqueImportId(product.id, `import-prod-${index + 1}`, usedProductIds),
        category: validCategoryNames.has(product.category) ? product.category : fallbackCategory,
      }, fallbackCategory))

    setCategories(nextCategories.length > 0 ? nextCategories : [{ id: 'import-cat-1', name: fallbackCategory, active: true }])
    setProducts(nextProducts)
    setSelectedCategory('all')
    setMenuSearch('')
    setCounterCart([])
    setOrderCart([])
    setSelectedCartItemId(null)
    setDataImportError('')
    notify(`${nextProducts.length} item(ns) importado(s) para o cardapio${fileName ? ` de ${fileName}` : ''}.`)
  }

  async function handleMenuImportData(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const content = await file.text()
      applyMenuImport(parseMenuImportContent(content), file.name)
    } catch {
      setDataImportError('Nao foi possivel desserializar este cardapio.')
      notify('Nao foi possivel importar este cardapio.', 'warning')
    } finally {
      event.target.value = ''
    }
  }

  async function handleImportData(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const content = await file.text()
      const parsed = JSON.parse(content)
      applyWorkspace(loadPersistedWorkspaceFromRaw(parsed), 'Backup carregado localmente.')
      notify('Backup importado com sucesso.')
    } catch {
      setDataImportError('Nao foi possivel importar este arquivo.')
    } finally {
      event.target.value = ''
    }
  }

  function resetFrontData() {
    applySnapshot({
      ...createDefaultAppData(),
      storeProfile,
      storeUsers,
      security,
      printerConfig,
      pilotSync,
      botConfig,
      kdsConfig,
    }, 'Base local redefinida para o estado inicial.')
    notify('Base local redefinida para o estado inicial.')
  }

  function deleteStoreProfile() {
    const remainingStores = resolvedStores.filter((store) => store.id !== activeStoreId)
    const nextActiveStoreId = remainingStores[0]?.id || null
    const nextActiveSnapshot = remainingStores[0]?.snapshot || createDefaultAppData()

    setStores(remainingStores)
    setActiveStoreId(nextActiveStoreId)
    setCurrentStoreUser(null)
    applySnapshot(nextActiveSnapshot, nextActiveStoreId ? 'Loja carregada.' : 'Acesso redefinido.')
    notify('Cadastro da loja removido deste navegador.', 'warning')
  }

  function createPrintQueueJob(printDocument, status, normalizedConfig) {
    return normalizePrintJob({
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: printDocument.label,
      type: printDocument.type,
      status,
      createdAt: nowDateTime(),
      printedAt: status === 'Impresso' ? nowDateTime() : '',
      printer: normalizedConfig.deviceName,
      document: printDocument,
    })
  }

  function pushPrintJob(job) {
    setPrinterConfig((current) => {
      const normalized = normalizePrinterConfig(current)

      return {
        ...normalized,
        queue: [job, ...normalized.queue].slice(0, 30),
      }
    })
  }

  function sendPrintDocument(printDocument, { printNow = true, configOverride = null } = {}) {
    const normalizedConfig = normalizePrinterConfig(configOverride || printerConfig)
    const canPrintNow = printNow && normalizedConfig.connected
    const printed = canPrintNow ? openPrintWindow(printDocument, normalizedConfig) : false
    const status = canPrintNow ? (printed ? 'Impresso' : 'Falha') : 'Pendente'
    const job = createPrintQueueJob(printDocument, status, normalizedConfig)

    pushPrintJob(job)

    if (!normalizedConfig.connected) {
      notify(`${printDocument.label} ficou pendente: impressora desconectada.`, 'warning')
      return false
    }

    if (!printed && printNow) {
      notify(`${printDocument.label} entrou na fila, mas o navegador bloqueou a janela de impressao.`, 'warning')
      return false
    }

    notify(printed ? `${printDocument.label} enviado para impressao.` : `${printDocument.label} adicionado a fila.`)
    return printed
  }

  function enqueuePrintJob(label, type = 'Pedido', printDocument = null, options = {}) {
    const documentData = printDocument || {
      label,
      type,
      title: label,
      bodyHtml: buildGenericPrintBody(label, type, storeProfile, printerConfig),
    }

    return sendPrintDocument(documentData, options)
  }

  function createOrderPrintDocument(order, variant = 'order') {
    const normalizedOrder = normalizeOrderRecord(order)
    const typeLabels = {
      order: 'Pedido',
      kitchen: 'Cozinha',
      dispatch: 'Expedicao',
      fiscal: 'Fiscal',
    }
    const type = typeLabels[variant] || 'Pedido'

    return {
      label: `${type} #${normalizedOrder.id}`,
      type,
      title: `${type} #${normalizedOrder.id}`,
      bodyHtml: buildOrderPrintBody(normalizedOrder, storeProfile, printerConfig, variant),
    }
  }

  function printOrderTicket(order, variant = 'order', options = {}) {
    return enqueuePrintJob(
      `${variant === 'dispatch' ? 'Expedicao' : variant === 'kitchen' ? 'Cozinha' : 'Pedido'} #${order.id}`,
      variant === 'dispatch' ? 'Expedicao' : variant === 'kitchen' ? 'Cozinha' : 'Pedido',
      createOrderPrintDocument(order, variant),
      { printNow: true, ...options },
    )
  }

  function printInvoiceForOrder(order, invoice = null, options = {}) {
    const normalizedOrder = normalizeOrderRecord(order)
    const fiscalDocument = invoice || {
      id: `nfc-${normalizedOrder.id}`,
      orderId: normalizedOrder.id,
      customer: normalizedOrder.customer,
      amount: normalizedOrder.total,
      status: 'Autorizada',
    }
    const printDocument = {
      label: `NFC-e #${normalizedOrder.id}`,
      type: 'Fiscal',
      title: `NFC-e #${normalizedOrder.id}`,
      bodyHtml: buildInvoicePrintBody(fiscalDocument, normalizedOrder, storeProfile, printerConfig),
    }

    return enqueuePrintJob(printDocument.label, printDocument.type, printDocument, { printNow: true, ...options })
  }

  function printInvoiceRecord(invoice, options = {}) {
    const sourceOrder = orders.find((order) => order.id === invoice.orderId)
    const printDocument = {
      label: `NFC-e #${invoice.orderId}`,
      type: 'Fiscal',
      title: `NFC-e #${invoice.orderId}`,
      bodyHtml: buildInvoicePrintBody(invoice, sourceOrder, storeProfile, printerConfig),
    }

    return enqueuePrintJob(printDocument.label, printDocument.type, printDocument, { printNow: true, ...options })
  }

  function printQrCode(qr, options = {}) {
    const printDocument = {
      label: `QR ${qr.table}`,
      type: 'QR',
      title: `QR ${qr.table}`,
      bodyHtml: buildQrPrintBody(qr, storeProfile, printerConfig),
    }

    return enqueuePrintJob(printDocument.label, printDocument.type, printDocument, { printNow: true, ...options })
  }

  async function saveStoreProfile(event) {
    event.preventDefault()
    const nextStore = normalizeStoreProfile(storeFormRef.current)
    const backendStoreId = pilotSync.storeId || (/^[0-9a-f-]{36}$/i.test(String(activeStoreId || '')) ? activeStoreId : '')

    if (backendStoreId) {
      try {
        const patch = buildStoreProfilePatch(storeFormBaseRef.current, nextStore)
        if (Object.keys(patch).length > 0) {
          await patchBackendStore(backendStoreId, patch)
        }
      } catch (err) {
        notify(`Loja salva localmente, mas a API nao atualizou: ${err instanceof Error ? err.message : 'erro desconhecido'}`, 'warning')
      }
    }

    setStoreProfile(nextStore)
    setStoreForm(nextStore)
    storeFormRef.current = nextStore
    storeFormBaseRef.current = nextStore
    setSecurity((current) => ({
      ...current,
      operator: nextStore.owner || current.operator,
      email: nextStore.supportEmail || nextStore.email || current.email,
    }))
    closeModal()
    notify('Dados da loja atualizados.')
  }

  async function verifyStoreAddress() {
    const geocodingAddress = buildStoreAddressForGeocoding(storeFormRef.current)

    if (!geocodingAddress.street.trim() || !geocodingAddress.city.trim()) {
      notify('Informe endereco e cidade da loja.', 'warning')
      return
    }

    setStoreAddressLookup({ status: 'loading', message: 'Localizando loja no mapa...' })

    try {
      const geocode = await geocodeDeliveryAddress(geocodingAddress)

      if (!geocode) {
        setStoreAddressLookup({ status: 'danger', message: 'Endereco da loja nao encontrado no mapa.' })
        notify('Endereco da loja nao encontrado no mapa.', 'warning')
        return
      }

      const lat = normalizeCoordinate(geocode.lat)
      const lng = normalizeCoordinate(geocode.lon)

      setStoreForm((current) => {
        const nextStore = normalizeStoreProfile({
          ...current,
          lat: formatCoordinate(lat),
          lng: formatCoordinate(lng),
          mapLabel: geocode.display_name || '',
          verifiedAt: nowDateTime(),
        })
        storeFormRef.current = nextStore
        return nextStore
      })
      setStoreMapMode('view')
      setStoreAddressLookup({ status: 'success', message: 'Loja localizada no mapa.' })
      notify('Endereco da loja localizado.')
    } catch {
      setStoreAddressLookup({ status: 'danger', message: 'Nao foi possivel localizar a loja agora.' })
      notify('Nao foi possivel localizar a loja agora.', 'warning')
    }
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
    setPrinterConfig((current) => printerFormToConfig(printerForm, current))
    closeModal()
    notify('Impressora configurada localmente.')
  }

  function runPrinterTest() {
    const previewConfig = printerFormToConfig(printerForm, printerConfig)
    const testOrder = createPrinterTestOrder()
    const printDocument = {
      label: `Pedido teste #${testOrder.id}`,
      type: 'Teste',
      title: `Pedido teste #${testOrder.id}`,
      bodyHtml: buildOrderPrintBody(testOrder, storeProfile, previewConfig, 'order'),
    }

    sendPrintDocument(printDocument, { printNow: true, configOverride: previewConfig })
  }

  function clearPrintQueue() {
    setPrinterConfig((current) => ({ ...current, queue: [] }))
    notify('Fila de impressao limpa.')
  }

  function reopenOrderEditor() {
    setModal({ type: 'newOrder' })
  }

  function completePrintJob(jobId) {
    setPrinterConfig((current) => ({
      ...normalizePrinterConfig(current),
      queue: normalizePrinterConfig(current).queue.filter((job) => job.id !== jobId),
    }))
    notify('Item removido da fila de impressao.')
  }

  function printQueuedJob(job) {
    const normalizedConfig = normalizePrinterConfig(printerConfig)
    const documentData = job.document || {
      label: job.label,
      type: job.type,
      title: job.label,
      bodyHtml: buildGenericPrintBody(job.label, job.type, storeProfile, printerConfig),
    }
    const printed = normalizedConfig.connected ? openPrintWindow(documentData, normalizedConfig) : false
    const status = normalizedConfig.connected ? (printed ? 'Impresso' : 'Falha') : 'Pendente'

    setPrinterConfig((current) => {
      const normalized = normalizePrinterConfig(current)

      return {
        ...normalized,
        queue: normalized.queue.map((currentJob) =>
          currentJob.id === job.id
            ? {
                ...currentJob,
                status,
                printedAt: printed ? nowDateTime() : currentJob.printedAt,
                printer: normalizedConfig.deviceName,
              }
            : currentJob,
        ),
      }
    })

    if (!normalizedConfig.connected) {
      notify(`${job.label} continua pendente: impressora desconectada.`, 'warning')
      return
    }

    notify(printed ? `${job.label} reenviado para impressao.` : `${job.label} nao abriu a janela de impressao.`, printed ? 'neutral' : 'warning')
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

  function openOrderPaymentPanel() {
    if (orderCart.length === 0) {
      notify('Adicione pelo menos um item para liberar o pagamento.', 'warning')
      return
    }

    setPaymentDraft(normalizeOrderPayment(newOrder.payment))
    setOrderPanel('payment')
  }

  function openOrderDeliveryPanel() {
    if (orderCart.length === 0) {
      notify('Adicione pelo menos um item para liberar a entrega.', 'warning')
      return
    }

    setDeliveryTabDraft(newOrder.fulfillment || (newOrder.channel === 'delivery' ? 'delivery' : 'pickup'))
    setDeliveryFeeDraft(newOrder.deliveryFee || '0,00')
    setSelectedAddressDraftId(newOrder.addressId || '')
    setEditingDeliveryAddressId(null)
    setDeliveryAddressForm(blankDeliveryAddress)
    deliveryAddressFormRef.current = blankDeliveryAddress
    setDeliveryAddressMapMode('view')
    setOrderPanel('delivery')
  }

  function openOrderDocumentPanel() {
    if (orderCart.length === 0) {
      notify('Adicione pelo menos um item para liberar os dados fiscais.', 'warning')
      return
    }

    setDocumentDraft(newOrder.document || '')
    setOrderPanel('document')
  }

  function openOrderAdjustmentPanel() {
    if (orderCart.length === 0) {
      notify('Adicione pelo menos um item para liberar ajustes do pedido.', 'warning')
      return
    }

    const adjustments = normalizeOrderAdjustmentFields(newOrder)

    setAdjustmentDraft({
      discountType: adjustments.discountType,
      discountValue: adjustments.discountValue,
      surchargeType: adjustments.surchargeType,
      surchargeValue: adjustments.surchargeValue,
    })
    setOrderPanel('adjustment')
  }

  function updateDeliveryAddressField(field, value) {
    const nextAddress = {
      ...deliveryAddressFormRef.current,
      [field]: field === 'cep' ? formatCepInput(value) : value,
    }
    const updatedAddress = field === 'complement' ? nextAddress : resetDeliveryAddressVerification(nextAddress)
    deliveryAddressFormRef.current = updatedAddress
    setDeliveryAddressForm(updatedAddress)
    setDeliveryAddressLookup({ status: 'idle', message: '' })
  }

  async function applyCoordinatesToDeliveryAddress(lat, lng, label = getPointLabelFromCoordinates(lat, lng)) {
    let baseAddress = resetDeliveryAddressVerification(deliveryAddressFormRef.current)

    try {
      const reverseResult = await reverseGeocodeCoordinates(lat, lng)
      baseAddress = mergeReverseGeocodeAddress(baseAddress, reverseResult)
      label = formatOrderAddress(baseAddress) || reverseResult?.display_name || label
    } catch {
      label = formatOrderAddress(baseAddress) || label
    }

    const nextAddress = {
      ...baseAddress,
      lat: formatCoordinate(lat),
      lng: formatCoordinate(lng),
      mapLabel: label,
    }
    deliveryAddressFormRef.current = nextAddress
    setDeliveryAddressForm(nextAddress)
  }

  function applyCoordinatesToStore(lat, lng, label = getPointLabelFromCoordinates(lat, lng, 'Localizacao da loja')) {
    const nextStore = normalizeStoreProfile({
      ...storeFormRef.current,
      lat: formatCoordinate(lat),
      lng: formatCoordinate(lng),
      mapLabel: label,
      verifiedAt: nowDateTime(),
    })
    storeFormRef.current = nextStore
    setStoreForm(nextStore)
  }

  async function useCurrentLocationForDeliveryAddress() {
    setDeliveryAddressLookup({ status: 'loading', message: 'Buscando a localizacao atual...' })

    try {
      const position = await getCurrentBrowserPosition()
      const lat = normalizeCoordinate(position.coords.latitude)
      const lng = normalizeCoordinate(position.coords.longitude)
      await applyCoordinatesToDeliveryAddress(lat, lng, getPointLabelFromCoordinates(lat, lng, 'Localizacao atual'))
      setDeliveryAddressMapMode('view')
      setDeliveryAddressLookup({ status: 'success', message: 'Localizacao atual aplicada ao endereco.' })
      notify('Localizacao atual aplicada ao endereco.')
    } catch {
      setDeliveryAddressLookup({ status: 'danger', message: 'Nao foi possivel obter a localizacao atual.' })
      notify('Nao foi possivel obter a localizacao atual.', 'warning')
    }
  }

  function toggleDeliveryAddressMapPicking() {
    setDeliveryAddressMapMode((current) => (current === 'pick' ? 'view' : 'pick'))
    setDeliveryAddressLookup((current) => ({
      status: current.status === 'loading' ? 'idle' : current.status,
      message: current.message,
    }))
  }

  async function handleDeliveryAddressMapPick(point) {
    const [lng, lat] = point
    await applyCoordinatesToDeliveryAddress(lat, lng)
    setDeliveryAddressMapMode('view')
    setDeliveryAddressLookup({ status: 'success', message: 'Ponto marcado. Confira numero, complemento e taxa.' })
    notify('Ponto marcado. Confira o endereco preenchido.')
  }

  async function useCurrentLocationForStore() {
    setStoreAddressLookup({ status: 'loading', message: 'Buscando a localizacao atual da loja...' })

    try {
      const position = await getCurrentBrowserPosition()
      const lat = normalizeCoordinate(position.coords.latitude)
      const lng = normalizeCoordinate(position.coords.longitude)
      applyCoordinatesToStore(lat, lng, getPointLabelFromCoordinates(lat, lng, 'Localizacao atual da loja'))
      setStoreMapMode('view')
      setStoreAddressLookup({ status: 'success', message: 'Localizacao atual aplicada a loja.' })
      notify('Localizacao atual aplicada a loja.')
    } catch {
      setStoreAddressLookup({ status: 'danger', message: 'Nao foi possivel obter a localizacao atual da loja.' })
      notify('Nao foi possivel obter a localizacao atual da loja.', 'warning')
    }
  }

  function toggleStoreMapPicking() {
    setStoreMapMode((current) => (current === 'pick' ? 'view' : 'pick'))
  }

  function handleStoreMapPick(point) {
    const [lng, lat] = point
    applyCoordinatesToStore(lat, lng)
    setStoreMapMode('view')
    setStoreAddressLookup({ status: 'success', message: 'Ponto da loja marcado no mapa.' })
    notify('Ponto da loja marcado no mapa.')
  }

  function startNewOrderAddress() {
    setEditingDeliveryAddressId(null)
    setDeliveryAddressForm(blankDeliveryAddress)
    deliveryAddressFormRef.current = blankDeliveryAddress
    setDeliveryAddressLookup({ status: 'idle', message: '' })
    setDeliveryAddressMapMode('view')
    setOrderPanel('deliveryAddress')
  }

  function startEditOrderAddress() {
    if (!selectedAddressDraftId) {
      notify('Selecione um endereco para editar.', 'warning')
      return
    }

    const selectedAddress = orderAddresses.find((address) => address.id === selectedAddressDraftId)

    if (!selectedAddress) {
      notify('Endereco nao encontrado.', 'warning')
      return
    }

    setEditingDeliveryAddressId(selectedAddress.id)
    const nextAddress = {
      cep: selectedAddress.cep,
      street: selectedAddress.street,
      number: selectedAddress.number,
      complement: selectedAddress.complement,
      district: selectedAddress.district,
      city: selectedAddress.city,
      lat: selectedAddress.lat,
      lng: selectedAddress.lng,
      mapLabel: selectedAddress.mapLabel,
      deliveryZoneId: selectedAddress.deliveryZoneId,
      deliveryZoneName: selectedAddress.deliveryZoneName,
      deliveryFee: selectedAddress.deliveryFee,
      deliveryAvailable: selectedAddress.deliveryAvailable,
      verifiedAt: selectedAddress.verifiedAt,
    }
    setDeliveryAddressForm(nextAddress)
    deliveryAddressFormRef.current = nextAddress
    setDeliveryAddressLookup({
      status: selectedAddress.deliveryAvailable ? 'success' : selectedAddress.verifiedAt ? 'danger' : 'idle',
      message: getDeliveryAddressSummary(selectedAddress),
    })
    setDeliveryAddressMapMode('view')
    setOrderPanel('deliveryAddress')
  }

  function deleteOrderAddressSelection() {
    if (!selectedAddressDraftId) {
      notify('Selecione um endereco para excluir.', 'warning')
      return
    }

    setOrderAddresses((current) => current.filter((address) => address.id !== selectedAddressDraftId))
    setSelectedAddressDraftId('')

    if (newOrder.addressId === selectedAddressDraftId) {
      setNewOrder((current) => ({
        ...current,
        addressId: '',
        address: '',
        addressLat: '',
        addressLng: '',
        deliveryZoneId: '',
        deliveryZoneName: '',
        deliveryFee: '0,00',
      }))
    }

    notify('Endereco removido.')
  }

  async function lookupCepForDeliveryAddress() {
    const cep = normalizePostalCode(deliveryAddressFormRef.current.cep)

    if (cep.length !== 8) {
      notify('Informe um CEP com 8 digitos.', 'warning')
      return
    }

    setDeliveryAddressLookup({ status: 'loading', message: 'Buscando CEP no ViaCEP...' })

    try {
      const response = await fetchWithTimeout(`https://viacep.com.br/ws/${cep}/json/`, {}, 4500)

      if (!response.ok) {
        throw new Error('cep-request')
      }

      const data = await response.json()

      if (data.erro) {
        setDeliveryAddressLookup({ status: 'danger', message: 'CEP nao encontrado.' })
        notify('CEP nao encontrado.', 'warning')
        return
      }

      const city = [data.localidade, data.uf].filter(Boolean).join(' - ')

      const currentAddress = deliveryAddressFormRef.current
      const nextAddress = resetDeliveryAddressVerification({
        ...currentAddress,
        cep: data.cep || formatCepInput(cep),
        street: data.logradouro || currentAddress.street,
        district: data.bairro || currentAddress.district,
        city: city || currentAddress.city,
      })
      deliveryAddressFormRef.current = nextAddress
      setDeliveryAddressForm(nextAddress)
      setDeliveryAddressLookup({ status: 'success', message: 'CEP encontrado. Confira o numero e verifique a taxa.' })
      notify('Endereco preenchido pelo CEP.')
    } catch {
      setDeliveryAddressLookup({ status: 'danger', message: 'Nao foi possivel consultar o CEP agora.' })
      notify('Nao foi possivel consultar o CEP agora.', 'warning')
    }
  }

  async function fetchNominatimResults(url) {
    const cachedResult = geocodeCacheRef.current.get(url)

    if (cachedResult) {
      return cachedResult
    }

    const elapsed = Date.now() - nominatimLastRequestRef.current

    if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, NOMINATIM_MIN_INTERVAL_MS - elapsed)
      })
    }

    nominatimLastRequestRef.current = Date.now()

    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/json',
      },
    }, 1500)

    if (!response.ok) {
      throw new Error('nominatim-request')
    }

    const data = await response.json()
    const results = Array.isArray(data) ? data : []
    geocodeCacheRef.current.set(url, results)
    return results
  }

async function geocodeDeliveryAddress(address) {
    const urls = buildNominatimSearchUrls(address)

    for (const url of urls) {
      const results = await fetchNominatimResults(url)
      const match = results.find((result) => normalizeCoordinate(result.lat) !== null && normalizeCoordinate(result.lon) !== null)

      if (match) {
        return match
      }
    }

  return null
}

async function reverseGeocodeCoordinates(lat, lng) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    addressdetails: '1',
    zoom: '18',
  })
  const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
  const cachedResult = geocodeCacheRef.current.get(url)

  if (cachedResult) {
    return cachedResult
  }

  const elapsed = Date.now() - nominatimLastRequestRef.current

  if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, NOMINATIM_MIN_INTERVAL_MS - elapsed)
    })
  }

  nominatimLastRequestRef.current = Date.now()

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
    },
  }, 1500)

  if (!response.ok) {
    throw new Error('nominatim-reverse-request')
  }

  const result = await response.json()
  geocodeCacheRef.current.set(url, result)
  return result
}

function mergeReverseGeocodeAddress(currentAddress, reverseResult) {
  const address = reverseResult?.address || {}
  const street = address.road || address.pedestrian || address.residential || address.footway || address.path || ''
  const number = address.house_number || ''
  const district = address.suburb || address.neighbourhood || address.city_district || address.quarter || ''
  const cityName = address.city || address.town || address.village || address.municipality || ''
  const state = address.state_code || address.state || ''
  const city = [cityName, state].filter(Boolean).join(' - ')

  return {
    ...currentAddress,
    cep: currentAddress.cep || formatCepInput(address.postcode || ''),
    street: currentAddress.street || street,
    number: currentAddress.number || number,
    district: currentAddress.district || district,
    city: currentAddress.city || city,
  }
}

  async function verifyDeliveryAddressForm({ silent = false, addressInput = deliveryAddressFormRef.current } = {}) {
    const coordinates = getAddressCoordinates(addressInput)

    if (!coordinates && (!addressInput.street.trim() || !addressInput.number.trim() || !addressInput.city.trim())) {
      notify('Preencha rua, numero e cidade ou marque um ponto no mapa para verificar.', 'warning')
      return null
    }

    setDeliveryAddressLookup({
      status: 'loading',
      message: coordinates ? 'Conferindo o ponto marcado no mapa...' : 'Verificando endereco no mapa...',
    })

    try {
      let geocode = null
      let lat = coordinates?.lat ?? null
      let lng = coordinates?.lng ?? null
      let verifiedAddressInput = addressInput
      const fallbackZoneByDistrict = findDeliveryZoneByDistrict(addressInput, deliveryZones)

      if (coordinates) {
        try {
          geocode = await reverseGeocodeCoordinates(lat, lng)
          verifiedAddressInput = mergeReverseGeocodeAddress(addressInput, geocode)
        } catch {
          geocode = null
        }
      } else {
        geocode = getFallbackGeocodeForAddress(addressInput, deliveryZones)

        if (!geocode) {
          try {
            geocode = await geocodeDeliveryAddress(addressInput)
          } catch {
            geocode = null
          }
        }

        if (!geocode) {
          setDeliveryAddressLookup({ status: 'danger', message: 'Endereco nao encontrado no mapa.' })

          if (!silent) {
            notify('Endereco nao encontrado no mapa.', 'warning')
          }

          return null
        }

        lat = normalizeCoordinate(geocode.lat)
        lng = normalizeCoordinate(geocode.lon)
      }

      const directZone = geocode?.fallbackZone || findDeliveryZoneForCoordinates(lat, lng, deliveryZones)
      const zone = directZone || fallbackZoneByDistrict || null

      if (!directZone && zone) {
        const fallbackCoordinates = getDeliveryZoneCentroid(zone)

        if (fallbackCoordinates) {
          lat = fallbackCoordinates.lat
          lng = fallbackCoordinates.lng
        }
      }

      const verifiedAddress = createOrderAddress({
        ...verifiedAddressInput,
        cep: formatCepInput(verifiedAddressInput.cep),
        lat: formatCoordinate(lat),
        lng: formatCoordinate(lng),
        mapLabel: formatOrderAddress(verifiedAddressInput) || geocode?.display_name || addressInput.mapLabel || getPointLabelFromCoordinates(lat, lng),
        deliveryZoneId: zone?.id || '',
        deliveryZoneName: zone?.name || '',
        deliveryFee: zone ? formatCurrencyInput(parseCurrencyInput(zone.fee)) : '0,00',
        deliveryAvailable: Boolean(zone),
        verifiedAt: nowDateTime(),
      })

      setDeliveryAddressForm(verifiedAddress)
      deliveryAddressFormRef.current = verifiedAddress

      if (zone) {
        setDeliveryFeeDraft(verifiedAddress.deliveryFee)
        setDeliveryAddressLookup({
          status: 'success',
          message: `Atende ${zone.name}. Taxa ${verifiedAddress.deliveryFee}.`,
        })

        if (!silent) {
          notify(`Endereco atendido em ${zone.name}. Taxa ${verifiedAddress.deliveryFee}.`)
        }
      } else {
        setDeliveryAddressLookup({
          status: 'danger',
          message: 'Fora das zonas de entrega cadastradas.',
        })

        if (!silent) {
          notify('Endereco fora das zonas de entrega.', 'warning')
        }
      }

      return { address: verifiedAddress, zone }
    } catch {
      setDeliveryAddressLookup({ status: 'danger', message: 'Falha ao consultar o mapa. Tente novamente.' })

      if (!silent) {
        notify('Falha ao consultar o mapa. Tente novamente.', 'warning')
      }

      return null
    }
  }

  async function saveOrderAddress(event) {
    event.preventDefault()

    const currentAddressForm = deliveryAddressFormRef.current
    const hasCoordinates = Boolean(getAddressCoordinates(currentAddressForm))
    const hasStructuredAddress = Boolean(
      currentAddressForm.street.trim()
      && currentAddressForm.number.trim()
      && currentAddressForm.district.trim()
      && currentAddressForm.city.trim(),
    )

    if (!hasCoordinates && !hasStructuredAddress) {
      notify('Preencha o endereco completo ou marque um ponto no mapa.', 'warning')
      return
    }

    let addressToSave = currentAddressForm

    if (!addressToSave.deliveryAvailable) {
      const verification = await verifyDeliveryAddressForm({ silent: true, addressInput: addressToSave })

      if (!verification) {
        notify('Verifique o endereco no mapa antes de salvar.', 'warning')
        return
      }

      if (!verification.zone) {
        notify('A loja nao atende esse endereco.', 'warning')
        return
      }

      addressToSave = verification.address
    }

    const normalizedAddress = createOrderAddress({
      id: editingDeliveryAddressId || undefined,
      cep: addressToSave.cep.trim(),
      street: addressToSave.street.trim(),
      number: addressToSave.number.trim(),
      complement: addressToSave.complement.trim(),
      district: addressToSave.district.trim(),
      city: addressToSave.city.trim(),
      lat: addressToSave.lat,
      lng: addressToSave.lng,
      mapLabel: addressToSave.mapLabel,
      deliveryZoneId: addressToSave.deliveryZoneId,
      deliveryZoneName: addressToSave.deliveryZoneName,
      deliveryFee: addressToSave.deliveryFee,
      deliveryAvailable: addressToSave.deliveryAvailable,
      verifiedAt: addressToSave.verifiedAt,
    })

    setOrderAddresses((current) => {
      if (editingDeliveryAddressId) {
        return current.map((address) => (address.id === editingDeliveryAddressId ? normalizedAddress : address))
      }

      return [...current, normalizedAddress]
    })

    setSelectedAddressDraftId(normalizedAddress.id)
    setEditingDeliveryAddressId(normalizedAddress.id)
    setDeliveryAddressForm(normalizedAddress)
    deliveryAddressFormRef.current = normalizedAddress
    setDeliveryAddressLookup({
      status: normalizedAddress.deliveryAvailable ? 'success' : 'danger',
      message: getDeliveryAddressSummary(normalizedAddress),
    })
    setDeliveryAddressMapMode('view')
    notify(editingDeliveryAddressId ? 'Endereco atualizado. Voce pode continuar editando.' : 'Endereco criado. Voce pode adicionar complemento.')
  }

  function applyOrderPayment(paymentId = paymentDraft) {
    setNewOrder((current) => ({
      ...current,
      payment: normalizeOrderPayment(paymentId),
    }))
    setOrderPanel(null)
  }

  function applyOrderDelivery() {
    if (deliveryTabDraft === 'delivery') {
      const selectedAddress = orderAddresses.find((address) => address.id === selectedAddressDraftId)

      if (!selectedAddress) {
        notify('Selecione ou cadastre um endereco para delivery.', 'warning')
        return
      }

      if (!selectedAddress.deliveryAvailable) {
        notify('Verifique o endereco no mapa antes de aplicar delivery.', 'warning')
        return
      }

      setNewOrder((current) => ({
        ...current,
        channel: 'delivery',
        fulfillment: 'delivery',
        addressId: selectedAddress.id,
        address: formatOrderAddress(selectedAddress),
        deliveryFee: deliveryFeeDraft || selectedAddress.deliveryFee || '0,00',
        addressLat: selectedAddress.lat,
        addressLng: selectedAddress.lng,
        deliveryZoneId: selectedAddress.deliveryZoneId,
        deliveryZoneName: selectedAddress.deliveryZoneName,
      }))
      setOrderPanel(null)
      return
    }

    setNewOrder((current) => ({
      ...current,
      channel: 'pickup',
      fulfillment: deliveryTabDraft,
      addressId: '',
      address: '',
      deliveryFee: '0,00',
    }))
    setOrderPanel(null)
  }

  function applyOrderDocument() {
    setNewOrder((current) => ({
      ...current,
      document: documentDraft.trim(),
    }))
    setOrderPanel(null)
  }

  function applyOrderAdjustment() {
    setNewOrder((current) => ({
      ...current,
      discountType: adjustmentDraft.discountType,
      discountValue: adjustmentDraft.discountValue,
      surchargeType: adjustmentDraft.surchargeType,
      surchargeValue: adjustmentDraft.surchargeValue,
    }))
    setShowManualTotalInput(Boolean(adjustmentDraft.discountValue || adjustmentDraft.surchargeValue))
    setOrderPanel(null)
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

    const draftOrder = normalizeOrderRecord(cloneData(draft.data.newOrder))

    setNewOrder({
      ...blankOrder,
      ...draftOrder,
      items: Array.isArray(draftOrder.items) ? draftOrder.items.join(', ') : (draftOrder.items || ''),
    })
    setOrderCart((draft.data.orderCart || []).map((item) => normalizeStoredOrderCartItem(item, products)))
    setPosCategory(draft.data.posCategory || 'all')
    setPosSearch('')
    setSelectedCartItemId(null)
    setCartItemForm(blankCartItemForm)
    setCartItemStepIndex(0)
    setShowManualTotalInput(Boolean(draftOrder.discountValue || draftOrder.surchargeValue || draft.data.newOrder?.total) && (draft.data.orderCart?.length ?? 0) > 0)
    setOrderPanel(null)
    reopenOrderEditor()
    notify(`Rascunho "${draft.label}" carregado.`)
  }

  function deleteOrderDraft(draftId) {
    setOrderDrafts((current) => current.filter((item) => item.id !== draftId))
    notify('Rascunho removido.')
  }

  function moveOrder(orderId, nextStatus) {
    const currentOrder = orders.find((order) => order.id === orderId)
    const shouldAutoPrintPreparation = Boolean(
      currentOrder
      && nextStatus === 'production'
      && currentOrder.status !== 'production'
      && settings.autoPrint
      && !currentOrder.preparationPrintedAt
    )
    const updatedOrder = currentOrder
      ? {
          ...currentOrder,
          status: nextStatus,
          preparationPrintedAt: shouldAutoPrintPreparation ? nowDateTime() : currentOrder.preparationPrintedAt,
        }
      : null

    setOrders((current) =>
      current.map((order) => (order.id === orderId ? updatedOrder : order)),
    )

    if (updatedOrder && shouldAutoPrintPreparation) {
      printOrderTicket(updatedOrder, 'kitchen')
    }

    if (updatedOrder) {
      void syncOrderStatusToBackend(updatedOrder, nextStatus)
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
        createdAt: nowDateTime(),
      },
      ...current,
    ])
  }

  function syncOrderFinanceEntry(order) {
    setFinance((current) =>
      current.map((entry) =>
        String(entry.title || '').endsWith(`#${order.id}`)
          ? {
              ...entry,
              amount: order.total,
              status: order.payment === 'Mesa' ? 'Pendente' : 'Pago',
            }
          : entry,
      ),
    )
  }

  function removeOrderFinanceEntry(orderId) {
    setFinance((current) => current.filter((entry) => !String(entry.title || '').endsWith(`#${orderId}`)))
  }

  function reserveNextOrderId() {
    const nextOrderNumber = Math.max(
      Number(orderSequenceRef.current) || 8300,
      getLastOrderNumber(orders),
      8300,
    ) + 1

    orderSequenceRef.current = nextOrderNumber
    setOrderSequence(nextOrderNumber)
    return String(nextOrderNumber)
  }

  function createOrder(event) {
    event.preventDefault()

    const cartTotal = orderCart.reduce((sum, item) => sum + item.price * item.qty, 0)
    const adjustments = normalizeOrderAdjustmentFields(newOrder)
    const legacyManualTotal = showManualTotalInput && !adjustments.discountValue && !adjustments.surchargeValue
      ? parseCurrencyInput(newOrder.total)
      : 0
    const financialBreakdown = getOrderFinancialBreakdown(cartTotal, newOrder)
    const total = legacyManualTotal > 0
      ? legacyManualTotal
      : financialBreakdown.total
    const typedItems = String(Array.isArray(newOrder.items) ? newOrder.items.join(', ') : (newOrder.items || ''))
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const normalizedDocument = newOrder.document.trim()
    const normalizedNote = [newOrder.note.trim(), normalizedDocument ? `CPF/CNPJ: ${normalizedDocument}` : '']
      .filter(Boolean)
      .join(' | ')

    if (orderCart.length === 0 && typedItems.length === 0) {
      notify('Adicione pelo menos um item antes de gerar o pedido.', 'warning')
      return
    }

    if (newOrder.channel === 'delivery' && !newOrder.address.trim()) {
      notify('Informe o endereco para pedidos de delivery.', 'warning')
      return
    }

    if (total <= 0) {
      notify('Confirme um total valido para o pedido.', 'warning')
      return
    }

    const editedSourceOrder = editingOrderId
      ? orders.find((order) => order.id === editingOrderId)
      : null
    const nextId = editedSourceOrder?.id || reserveNextOrderId()
    const createdOrder = {
      ...(editedSourceOrder || {}),
      id: nextId,
      customer: newOrder.customer || 'Cliente balcao',
      phone: newOrder.phone || '(47) 9 0000-0000',
      channel: newOrder.fulfillment === 'delivery' ? 'delivery' : 'pickup',
      fulfillment: newOrder.fulfillment,
      source: newOrder.fulfillment === 'dinein' && normalizeOrderPayment(newOrder.payment) === 'Mesa'
        ? 'Mesa'
        : resolveOrderSourceForFulfillment(newOrder.fulfillment, editedSourceOrder?.source),
      status: editedSourceOrder?.status || (settings.autoAccept ? 'production' : 'analysis'),
      total,
      payment: normalizeOrderPayment(newOrder.payment),
      document: normalizedDocument,
      createdAt: editedSourceOrder?.createdAt || nowDateTime(),
      time: editedSourceOrder?.time || nowTime(),
      addressId: newOrder.addressId || '',
      addressLat: newOrder.addressLat || '',
      addressLng: newOrder.addressLng || '',
      deliveryZoneId: newOrder.deliveryZoneId || '',
      deliveryZoneName: newOrder.deliveryZoneName || '',
      address: newOrder.fulfillment === 'delivery'
        ? newOrder.address.trim()
        : newOrder.fulfillment === 'dinein'
          ? 'Consumir no local'
          : 'Retirada no balcao',
      subtotal: financialBreakdown.subtotal,
      deliveryFee: formatCurrencyInput(financialBreakdown.deliveryFee),
      discountType: adjustments.discountType,
      discountValue: adjustments.discountValue,
      discountAmount: formatCurrencyInput(financialBreakdown.discountAmount),
      surchargeType: adjustments.surchargeType,
      surchargeValue: adjustments.surchargeValue,
      surchargeAmount: formatCurrencyInput(financialBreakdown.surchargeAmount),
      note: normalizedNote || (editedSourceOrder ? 'Pedido editado pelo painel.' : 'Pedido criado pelo painel.'),
      items: orderCart.length
        ? orderCart.map(getOrderCartItemLabel)
        : typedItems,
      cartItems: orderCart.length ? orderCart.map((item) => cloneData(item)) : [],
      printItems: orderCart.length
        ? orderCart.map(getOrderCartPrintItem)
        : [],
    }
    const normalizedCreatedOrder = normalizeOrderRecord({
      ...createdOrder,
      preparationPrintedAt: !editedSourceOrder && settings.autoPrint && createdOrder.status === 'production'
        ? nowDateTime()
        : createdOrder.preparationPrintedAt,
    })

    if (editedSourceOrder) {
      setOrders((current) =>
        current.map((order) => (order.id === editedSourceOrder.id ? normalizedCreatedOrder : order)),
      )
      syncOrderFinanceEntry(normalizedCreatedOrder)
    } else {
      setOrders((current) => [normalizedCreatedOrder, ...current])
      registerOrderFinanceEntry(normalizedCreatedOrder)
    }

    if (pilotSync.enabled && pilotSync.autoSyncOrders) {
      void syncSingleOrderToBackend(normalizedCreatedOrder, { silent: true })
    } else if (!editedSourceOrder) {
      markOrderSyncState(createdOrder.id, {
        syncStatus: 'pending',
        syncMessage: 'Aguardando modo piloto.',
      })
    }
    if (!editedSourceOrder && settings.autoPrint && normalizedCreatedOrder.status === 'production') {
      printOrderTicket(normalizedCreatedOrder, 'kitchen')
    }
    setNewOrder(blankOrder)
    setOrderCart([])
    setSelectedCartItemId(null)
    setOrderPanel(null)
    setEditingOrderId(null)
    closeModal()
    notify(editedSourceOrder ? `Pedido #${nextId} editado.` : `Pedido #${nextId} criado no front.`)
  }

  function updateOrder(event, orderId) {
    event.preventDefault()

    let updatedOrder = null

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? (() => {
              const fulfillment = orderForm.fulfillment || inferOrderFulfillment(orderForm)
              const subtotal = parseCurrencyInput(orderForm.subtotal || order.subtotal || order.total)
              const normalizedItems = orderForm.items
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
              const normalizedOrder = normalizeOrderRecord({
                ...order,
                customer: orderForm.customer || 'Cliente balcao',
                phone: orderForm.phone || '(47) 9 0000-0000',
                channel: fulfillment === 'delivery' ? 'delivery' : 'pickup',
                fulfillment,
                source: fulfillment === 'dinein' && orderForm.payment === 'Mesa'
                  ? 'Mesa'
                  : resolveOrderSourceForFulfillment(fulfillment, order.source),
                payment: normalizeOrderPayment(orderForm.payment),
                subtotal,
                deliveryFee: fulfillment === 'delivery' ? (orderForm.deliveryFee || '0,00') : '0,00',
                address: fulfillment === 'delivery'
                  ? (orderForm.address.trim() || 'Endereco informado no pedido')
                  : fulfillment === 'dinein'
                    ? (orderForm.address.trim() || 'Consumir no local')
                    : 'Retirada no balcao',
                document: orderForm.document.trim(),
                discountType: orderForm.discountType,
                discountValue: orderForm.discountValue,
                surchargeType: orderForm.surchargeType,
                surchargeValue: orderForm.surchargeValue,
                note: orderForm.note || 'Pedido editado pelo painel.',
                items: normalizedItems,
              })
              const financialBreakdown = getOrderFinancialBreakdown(subtotal, normalizedOrder)

              updatedOrder = normalizeOrderRecord({
                ...normalizedOrder,
                total: financialBreakdown.total,
                discountAmount: formatCurrencyInput(financialBreakdown.discountAmount),
                surchargeAmount: formatCurrencyInput(financialBreakdown.surchargeAmount),
              })

              return updatedOrder
            })()
          : order,
      ),
    )

    if (updatedOrder) {
      syncOrderFinanceEntry(updatedOrder)
      void syncSingleOrderToBackend(updatedOrder, { silent: true })
    }

    closeModal()
    notify(`Pedido #${orderId} editado.`)
  }

  function deleteOrder(orderId) {
    const deletedOrder = orders.find((order) => order.id === orderId)

    setOrders((current) => current.filter((order) => order.id !== orderId))
    removeOrderFinanceEntry(orderId)
    closeModal()
    if (deletedOrder) {
      void deleteOrderFromBackend(deletedOrder)
    }
    notify(`Pedido #${orderId} apagado.`)
  }

  function finishOrder(orderId) {
    moveOrder(orderId, 'completed')
    closeModal()
  }

  function finishReadyOrders() {
    const readyOrders = orders.filter((order) => order.status === 'ready')
    const readyCount = readyOrders.length
    setOrders((current) =>
      current.map((order) => (order.status === 'ready' ? { ...order, status: 'completed' } : order)),
    )
    readyOrders.forEach((order) => {
      void syncOrderStatusToBackend(order, 'completed')
    })
    closeModal()
    notify(`${readyCount} pedido(s) finalizado(s).`)
  }

  function restoreBlockedOrder(id) {
    const blocked = blockedOrders.find((order) => order.id === id)

    if (!blocked) {
      return
    }

    const restoredOrder = normalizeOrderRecord({
      id: blocked.id,
      customer: blocked.customer,
      phone: '(47) 9 1111-2222',
      channel: 'pickup',
      fulfillment: 'pickup',
      source: 'WhatsApp',
      status: 'analysis',
      subtotal: 28.5,
      total: 28.5,
      payment: 'Cartao',
      time: '18:30',
      address: 'Retirada no balcao',
      deliveryFee: '0,00',
      note: blocked.reason,
      items: ['Pedido recuperado'],
    })

    setBlockedOrders((current) => current.filter((order) => order.id !== id))
    setOrders((current) => [
      restoredOrder,
      ...current,
    ])
    if (pilotSync.enabled && pilotSync.autoSyncOrders) {
      void syncSingleOrderToBackend(restoredOrder, { silent: true })
    } else {
      markOrderSyncState(restoredOrder.id, {
        syncStatus: 'pending',
        syncMessage: 'Aguardando modo piloto.',
      })
    }
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

  function resetOrderCatalog(goToCategories = false) {
    setCartItemForm(blankCartItemForm)
    setCartItemStepIndex(0)
    setCartItemNoteOpen(false)

    if (goToCategories) {
      setPosCategory('all')
    }

    setPosSearch('')
  }

  function openNewOrderCartItem(product, categoryName = product.category) {
    setPosCategory(categoryName)
    setPosSearch('')
    setCartItemForm(orderCartItemToForm(product))
    setCartItemStepIndex(0)
    setCartItemNoteOpen(false)
  }

  function openExistingOrderCartItem(cartItem) {
    const product = products.find((item) => item.id === cartItem.productId)

    if (!product) {
      notify('Produto nao encontrado no cardapio.', 'warning')
      return
    }

    setSelectedCartItemId(cartItem.id)
    setPosCategory(product.category)
    setPosSearch('')
    setCartItemForm(orderCartItemToForm(product, cartItem))
    setCartItemStepIndex(getInitialCartItemEditStep(product, cartItem))
    setCartItemNoteOpen(Boolean(cartItem.note))
  }

  function addOrderCart(product, categoryName = product.category) {
    openNewOrderCartItem(product, categoryName)
  }

  function removeOrderCart(productId) {
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
    setSelectedCartItemId(productId)
    notify('Quantidade do item atualizada.')
  }

  function toggleCartItemFlavor(flavorId, maxFlavors, product) {
    const isSelected = cartItemForm.flavorIds.includes(flavorId)
    const allowsRepeatedFlavor = maxFlavors > 1

    if (allowsRepeatedFlavor) {
      if (cartItemForm.flavorIds.length >= maxFlavors) {
        notify(`Escolha no maximo ${maxFlavors} ${getFlavorEntityLabel(product, true)}.`, 'warning')
        return
      }

      setCartItemForm((current) => ({ ...current, flavorIds: [...current.flavorIds, flavorId] }))
      return
    }

    if (!isSelected && maxFlavors > 1 && cartItemForm.flavorIds.length >= maxFlavors) {
      notify(`Escolha no maximo ${maxFlavors} ${getFlavorEntityLabel(product, true)}.`, 'warning')
      return
    }

    setCartItemForm((current) => {
      if (current.flavorIds.includes(flavorId)) {
        return { ...current, flavorIds: current.flavorIds.filter((currentId) => currentId !== flavorId) }
      }

      if (maxFlavors === 1) {
        return { ...current, flavorIds: [flavorId] }
      }

      return { ...current, flavorIds: [...current.flavorIds, flavorId] }
    })
  }

  function removeCartItemFlavor(flavorId) {
    setCartItemForm((current) => {
      const flavorIndex = current.flavorIds.lastIndexOf(flavorId)

      if (flavorIndex < 0) {
        return current
      }

      return {
        ...current,
        flavorIds: current.flavorIds.filter((currentId, index) => currentId !== flavorId || index !== flavorIndex),
      }
    })
  }

  function toggleCartItemAddonOption(step, optionId) {
    const isSelected = getCartStepSelectedIds(cartItemForm, step).includes(optionId)
    const maxSelect = Math.max(1, Number(step?.maxSelect) || 1)

    if (maxSelect > 1) {
      if (getCartStepSelectedIds(cartItemForm, step).length >= maxSelect) {
        notify(`Escolha no maximo ${maxSelect} opcoes em ${step.title.toLowerCase()}.`, 'warning')
        return
      }

      setCartItemForm((current) => {
        const selectedIds = Array.isArray(current.addonSelections?.[step.id]) ? current.addonSelections[step.id] : []

        return {
          ...current,
          addonSelections: {
            ...current.addonSelections,
            [step.id]: [...selectedIds, optionId],
          },
        }
      })
      return
    }

    if (!isSelected && getCartStepSelectedIds(cartItemForm, step).length >= maxSelect) {
      notify(`Escolha no maximo ${maxSelect} opcoes em ${step.title.toLowerCase()}.`, 'warning')
      return
    }

    setCartItemForm((current) => {
      const selectedIds = Array.isArray(current.addonSelections?.[step.id]) ? current.addonSelections[step.id] : []

      if (selectedIds.includes(optionId)) {
        const nextSelections = selectedIds.filter((currentId) => currentId !== optionId)

        return {
          ...current,
          addonSelections: {
            ...current.addonSelections,
            [step.id]: nextSelections,
          },
        }
      }

      const nextSelections = maxSelect === 1 ? [optionId] : [...selectedIds, optionId]

      return {
        ...current,
        addonSelections: {
          ...current.addonSelections,
          [step.id]: nextSelections,
        },
      }
    })
  }

  function removeCartItemAddonOption(step, optionId) {
    setCartItemForm((current) => {
      const selectedIds = Array.isArray(current.addonSelections?.[step.id]) ? current.addonSelections[step.id] : []
      const optionIndex = selectedIds.lastIndexOf(optionId)

      if (optionIndex < 0) {
        return current
      }

      return {
        ...current,
        addonSelections: {
          ...current.addonSelections,
          [step.id]: selectedIds.filter((currentId, index) => currentId !== optionId || index !== optionIndex),
        },
      }
    })
  }

  function ensureCartItemStepSelection(step) {
    if (isCartStepSelectionValid(step, cartItemForm)) {
      return true
    }

    const minimumRequired = Math.max(step.required ? 1 : 0, Number(step.minSelect) || 0)

    if (minimumRequired > 0) {
      notify(`Selecione pelo menos ${minimumRequired} opcao(oes) em ${step.title.toLowerCase()}.`, 'warning')
      return false
    }

    notify(`Revise a selecao de ${step.title.toLowerCase()}.`, 'warning')
    return false
  }

  function goToNextCartItemStep(product) {
    const steps = getCartConfigurationSteps(product)
    const currentStep = steps[cartItemStepIndex]

    if (currentStep && !ensureCartItemStepSelection(currentStep)) {
      return
    }

    setCartItemStepIndex((current) => Math.min(current + 1, Math.max(steps.length - 1, 0)))
  }

  function goToPreviousCartItemStep() {
    setCartItemStepIndex((current) => Math.max(current - 1, 0))
  }

  function commitOrderCartItem() {
    const product = products.find((item) => item.id === cartItemForm.productId)

    if (!product) {
      notify('Produto nao encontrado no cardapio.', 'warning')
      resetOrderCatalog(false)
      return false
    }

    const steps = getCartConfigurationSteps(product)
    const invalidStep = steps.find((step) => !isCartStepSelectionValid(step, cartItemForm))

    if (invalidStep) {
      ensureCartItemStepSelection(invalidStep)
      return false
    }

    const activeFlavors = getActiveProductFlavors(product)
    const maxFlavors = Math.max(1, Number(product.maxFlavors) || 1)
    const selectedFlavorIds = cartItemForm.flavorIds
      .filter((flavorId) => activeFlavors.some((flavor) => flavor.id === flavorId))
      .slice(0, maxFlavors)
    const normalizedAddonSelections = normalizeCartAddonSelections(product, cartItemForm.addonSelections)

    const nextItem = createOrderCartLine(product, {
      lineId: cartItemForm.lineId || undefined,
      qty: Math.max(1, Number(cartItemForm.qty) || 1),
      flavorIds: selectedFlavorIds,
      addonSelections: normalizedAddonSelections,
      note: cartItemForm.note,
    })

    setOrderCart((current) => {
      if (cartItemForm.lineId) {
        return current.map((item) => (item.id === cartItemForm.lineId ? nextItem : item))
      }

      return [...current, nextItem]
    })

    setSelectedCartItemId(nextItem.id)
    resetOrderCatalog(false)
    notify(cartItemForm.lineId ? 'Item atualizado no pedido.' : 'Item adicionado ao pedido.')
    return true
  }

  function saveOrderCartItem(event) {
    event.preventDefault()
    commitOrderCartItem()
  }

  function checkoutCounter() {
    const subtotal = counterCart.reduce((sum, item) => sum + item.price * item.qty, 0)
    const nextId = reserveNextOrderId()
    const createdOrder = normalizeOrderRecord({
      id: nextId,
      customer: 'Cliente PDV',
      phone: '(47) 9 0000-0000',
      channel: 'pickup',
      fulfillment: 'pickup',
      source: 'Balcao',
      status: 'production',
      subtotal,
      total: subtotal,
      payment: 'Cartao',
      time: nowTime(),
      address: 'Retirada no balcao',
      deliveryFee: '0,00',
      note: 'Venda criada no PDV.',
      items: counterCart.map((item) => `${item.qty}x ${item.name}`),
      printItems: counterCart.map((item) => ({
        qty: item.qty,
        name: item.name,
        details: [],
        price: (Number(item.price) || 0) * (Number(item.qty) || 1),
      })),
    })

    setOrders((current) => [createdOrder, ...current])
    registerOrderFinanceEntry(createdOrder, 'Venda PDV')
    if (pilotSync.enabled && pilotSync.autoSyncOrders) {
      void syncSingleOrderToBackend(createdOrder, { silent: true })
    } else {
      markOrderSyncState(createdOrder.id, {
        syncStatus: 'pending',
        syncMessage: 'Aguardando modo piloto.',
      })
    }
    if (settings.autoPrint) {
      printOrderTicket(createdOrder, 'order')
    }
    setCounterCart([])
    closeModal()
    setActiveNav('orders')
    notify(`Venda PDV virou pedido #${nextId}.`)
  }

  async function createCustomerStorefrontOrder(request) {
    const subtotal = request.items.reduce((sum, item) => (
      sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)
    ), 0)
    const deliveryFee = request.fulfillment === 'delivery' ? Number(request.deliveryFee) || 0 : 0
    const customerDiscount = Math.min(subtotal, Math.max(0, Number(request.customerDiscount) || 0))
    const nextId = reserveNextOrderId()
    const createdOrder = normalizeOrderRecord({
      id: nextId,
      customer: request.customerName || 'Cliente cardapio',
      phone: request.customerPhone || '',
      channel: request.fulfillment === 'delivery' ? 'delivery' : 'pickup',
      fulfillment: request.fulfillment || 'delivery',
      source: 'Cardapio Digital',
      status: settings.autoAccept ? 'production' : 'analysis',
      subtotal,
      total: Math.max(0, subtotal - customerDiscount) + deliveryFee,
      payment: request.payment || 'Cartao',
      customerOrderCount: request.customerOrderCount || '',
      time: nowTime(),
      address: request.fulfillment === 'delivery'
        ? request.address || request.note?.match(/Endereco:\s*([^|]+)/)?.[1]?.trim() || 'Endereco informado no pedido'
        : 'Retirada no balcao',
      addressLat: request.addressLat || '',
      addressLng: request.addressLng || '',
      deliveryZoneId: request.deliveryZoneId || '',
      deliveryZoneName: request.deliveryZoneName || '',
      deliveryFee: formatCurrencyInput(deliveryFee),
      discountType: customerDiscount > 0 ? 'fixed' : 'fixed',
      discountValue: customerDiscount > 0 ? formatCurrencyInput(customerDiscount) : '',
      discountAmount: customerDiscount > 0 ? formatCurrencyInput(customerDiscount) : '0,00',
      note: request.note || 'Pedido vindo do cardapio digital.',
      items: request.items.map((item) => `${item.quantity}x ${item.productName}`),
      printItems: request.items.map((item) => backendItemToReceiptItem({
        ...item,
        totalPrice: (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1),
      })),
    })

    setOrders((current) => [createdOrder, ...current])
    registerOrderFinanceEntry(createdOrder, 'Cardapio digital')

    if (pilotSync.enabled && pilotSync.autoSyncOrders) {
      void syncSingleOrderToBackend(createdOrder, { silent: true })
    } else {
      markOrderSyncState(createdOrder.id, {
        syncStatus: 'pending',
        syncMessage: 'Aguardando modo piloto.',
      })
    }

    if (settings.autoPrint) {
      printOrderTicket(createdOrder, 'order')
    }

    setActiveNav('orders')
    notify(`Pedido #${nextId} recebido pelo cardapio digital.`)
    return createdOrder
  }

  function saveProduct(event, productId = null) {
    event.preventDefault()

    if (!productId && categories.length === 0) {
      notify('Crie uma categoria antes de cadastrar um item.', 'warning')
      closeModal()
      openModal('newCategory')
      return
    }

    const baseProduct = productId ? products.find((product) => product.id === productId) : null
    const primaryCategory = productForm.category || categories[0]?.name || baseProduct?.category || ''
    const normalizedProduct = normalizeProduct({
      ...baseProduct,
      name: productForm.name || 'Produto sem nome',
      description: productForm.description || '',
      imageUrl: productForm.imageUrl || '',
      category: primaryCategory,
      extraCategories: Array.isArray(productForm.extraCategories)
        ? productForm.extraCategories.filter((category) => category !== primaryCategory)
        : [],
      price: parseCurrencyInput(productForm.price),
      maxFlavors: Number(productForm.maxFlavors) || baseProduct?.maxFlavors || 2,
      availableFrom: productForm.availableFrom || baseProduct?.availableFrom || '18:00',
      availableTo: productForm.availableTo || baseProduct?.availableTo || '23:30',
      availableDays: productForm.availableDays || baseProduct?.availableDays || getAllWeekDays(),
      flavors: baseProduct?.flavors,
      addonGroups: baseProduct?.addonGroups,
    }, categories[0]?.name || 'Pizzas')

    if (productId) {
      setProducts((current) =>
        current.map((product) =>
          product.id === productId ? { ...product, ...normalizedProduct } : product,
        ),
      )
      notify('Produto editado.')
    } else {
      setProducts((current) => [
        { ...normalizedProduct, id: `prod-${Date.now()}` },
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

  function importProductsToCategory(event, targetCategoryName) {
    event.preventDefault()

    const productIds = importProductsForm.productIds || []
    if (!targetCategoryName || productIds.length === 0) {
      notify('Selecione ao menos um item para importar.', 'warning')
      return
    }

    setProducts((current) =>
      current.map((product) => {
        if (!productIds.includes(product.id) || product.category === targetCategoryName) {
          return product
        }

        return normalizeProduct({
          ...product,
          extraCategories: [...(product.extraCategories || []), targetCategoryName],
          exhaustedCategories: (product.exhaustedCategories || []).filter((category) => category !== targetCategoryName),
        }, categories[0]?.name || 'Pizzas')
      }),
    )

    closeModal()
    notify(`${productIds.length} item(ns) importado(s).`)
  }

  function toggleProduct(productId, categoryName) {
    let toggledProduct = null
    let exhausted = false

    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        const currentExhausted = product.exhaustedCategories || []
        exhausted = !currentExhausted.includes(categoryName)
        toggledProduct = normalizeProduct({
          ...product,
          exhaustedCategories: exhausted
            ? [...currentExhausted, categoryName]
            : currentExhausted.filter((currentCategory) => currentCategory !== categoryName),
        }, categories[0]?.name || 'Pizzas')
        return toggledProduct
      }),
    )

    if (toggledProduct) {
      notify(`${toggledProduct.name} ${exhausted ? 'esgotado' : 'disponivel'} em ${categoryName}.`)
    }
  }

  function updateProductConfig(productId, patch) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId ? normalizeProduct({ ...product, ...patch }, categories[0]?.name || 'Pizzas') : product,
      ),
    )
  }

  function updateProductFlavor(productId, flavorId, patch) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        return normalizeProduct({
          ...product,
          flavors: product.flavors.map((flavor) =>
            flavor.id === flavorId ? { ...flavor, ...patch } : flavor,
          ),
        }, categories[0]?.name || 'Pizzas')
      }),
    )
  }

  function saveFlavor(event, productId, flavorId = null) {
    event.preventDefault()
    const flavorOwner = products.find((product) => product.id === productId)
    const flavorEntity = getFlavorEntityLabel(flavorOwner, false)

    const normalizedFlavor = createProductFlavor(
      flavorForm.name.trim() || (flavorId ? 'Sabor editado' : 'Novo sabor'),
      parseCurrencyInput(flavorForm.price),
      flavorForm.active,
      flavorId || undefined,
    )

    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        const nextFlavors = flavorId
          ? product.flavors.map((flavor) => (flavor.id === flavorId ? normalizedFlavor : flavor))
          : [...product.flavors, normalizedFlavor]

        return normalizeProduct({
          ...product,
          flavors: nextFlavors,
        }, categories[0]?.name || 'Pizzas')
      }),
    )

    closeModal()
    notify(flavorId ? `${flavorEntity} atualizado.` : `${flavorEntity} criado.`)
  }

  function removeProductFlavor(productId, flavorId) {
    let removedFlavorName = ''
    const flavorOwner = products.find((product) => product.id === productId)
    const flavorEntity = getFlavorEntityLabel(flavorOwner, false)

    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        const nextFlavors = product.flavors.filter((flavor) => {
          if (flavor.id === flavorId) {
            removedFlavorName = flavor.name
            return false
          }

          return true
        })

        return normalizeProduct({
          ...product,
          flavors: nextFlavors,
        }, categories[0]?.name || 'Pizzas')
      }),
    )

    notify(removedFlavorName ? `${flavorEntity} "${removedFlavorName}" removido.` : `${flavorEntity} removido.`)
  }

  function addProductAddonGroup(productId) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        const nextGroupIndex = (product.addonGroups?.length ?? 0) + 1

        return normalizeProduct({
          ...product,
          addonGroups: [
            ...(product.addonGroups || []),
            createProductAddonGroup({
              name: `Grupo ${nextGroupIndex}`,
              options: [createProductAddonOption('Nova opcao')],
            }),
          ],
        }, categories[0]?.name || 'Pizzas')
      }),
    )

    notify('Grupo de adicional criado.')
  }

  function updateProductAddonGroup(productId, groupId, patch) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        return normalizeProduct({
          ...product,
          addonGroups: (product.addonGroups || []).map((group) => {
            if (group.id !== groupId) {
              return group
            }

            const maxSelect = Math.max(1, Number(patch.maxSelect ?? group.maxSelect) || 1)
            const required = patch.required ?? group.required
            const minSelect = Math.max(required ? 1 : 0, Number(patch.minSelect ?? group.minSelect) || 0)

            return {
              ...group,
              ...patch,
              required,
              maxSelect,
              minSelect: Math.min(minSelect, maxSelect),
            }
          }),
        }, categories[0]?.name || 'Pizzas')
      }),
    )
  }

  function removeProductAddonGroup(productId, groupId) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        return normalizeProduct({
          ...product,
          addonGroups: (product.addonGroups || []).filter((group) => group.id !== groupId),
        }, categories[0]?.name || 'Pizzas')
      }),
    )

    notify('Grupo de adicional removido.')
  }

  function addProductAddonOption(productId, groupId) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        return normalizeProduct({
          ...product,
          addonGroups: (product.addonGroups || []).map((group) => {
            if (group.id !== groupId) {
              return group
            }

            return {
              ...group,
              options: [...(group.options || []), createProductAddonOption('Nova opcao')],
            }
          }),
        }, categories[0]?.name || 'Pizzas')
      }),
    )
  }

  function updateProductAddonOption(productId, groupId, optionId, patch) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        return normalizeProduct({
          ...product,
          addonGroups: (product.addonGroups || []).map((group) => {
            if (group.id !== groupId) {
              return group
            }

            return {
              ...group,
              options: (group.options || []).map((option) =>
                option.id === optionId ? { ...option, ...patch } : option,
              ),
            }
          }),
        }, categories[0]?.name || 'Pizzas')
      }),
    )
  }

  function removeProductAddonOption(productId, groupId, optionId) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        return normalizeProduct({
          ...product,
          addonGroups: (product.addonGroups || []).map((group) => {
            if (group.id !== groupId) {
              return group
            }

            return {
              ...group,
              options: (group.options || []).filter((option) => option.id !== optionId),
            }
          }),
        }, categories[0]?.name || 'Pizzas')
      }),
    )
  }

  function toggleProductAvailabilityDay(productId, dayId) {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) {
          return product
        }

        const activeDays = product.availableDays.includes(dayId)
          ? product.availableDays.filter((day) => day !== dayId)
          : [...product.availableDays, dayId]

        return normalizeProduct({
          ...product,
          availableDays: activeDays.length > 0 ? activeDays : [dayId],
        }, categories[0]?.name || 'Pizzas')
      }),
    )
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
          category.id === categoryId ? { ...category, name, imageUrl: categoryForm.imageUrl || '', active: categoryForm.active } : category,
        ),
      )

      if (currentCategory && currentCategory.name !== name) {
        setProducts((current) =>
          current.map((product) =>
            normalizeProduct({
              ...product,
              category: product.category === currentCategory.name ? name : product.category,
              extraCategories: Array.isArray(product.extraCategories)
                ? product.extraCategories.map((extraCategory) => extraCategory === currentCategory.name ? name : extraCategory)
                : [],
            }, categories[0]?.name || 'Pizzas'),
          ),
        )
      }

      notify('Categoria atualizada.')
    } else {
      setCategories((current) => [
        { id: `cat-${Date.now()}`, name, imageUrl: categoryForm.imageUrl || '', active: categoryForm.active },
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
    const remainingCategories = categories.filter((category) => category.id !== categoryId)
    const fallbackCategory = remainingCategories[0]?.name || ''

    setCategories(remainingCategories)
    setProducts((current) => {
      if (!currentCategory) {
        return current
      }

      if (!fallbackCategory) {
        return current.filter((product) => product.category !== currentCategory.name)
          .map((product) => ({
            ...product,
            extraCategories: Array.isArray(product.extraCategories)
              ? product.extraCategories.filter((category) => category !== currentCategory.name)
              : [],
          }))
      }

      return current.map((product) =>
        normalizeProduct({
          ...product,
          category: product.category === currentCategory.name ? fallbackCategory : product.category,
          extraCategories: Array.isArray(product.extraCategories)
            ? product.extraCategories.filter((category) => category !== currentCategory.name)
            : [],
        }, fallbackCategory),
      )
    })

    if (selectedCategory === currentCategory?.name) {
      setSelectedCategory('all')
    }

    if (posCategory === currentCategory?.name) {
      setPosCategory('all')
    }

    closeModal()
    notify(fallbackCategory ? 'Categoria apagada.' : 'Categoria apagada com os itens vinculados.')
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
    const nextId = reserveNextOrderId()
    const subtotal = table.total || 49.9
    const createdOrder = normalizeOrderRecord({
      id: nextId,
      customer: table.customer || table.name,
      phone: '(47) 9 2222-3333',
      channel: 'pickup',
      fulfillment: 'dinein',
      source: 'Mesa',
      status: 'production',
      subtotal,
      total: subtotal,
      payment: 'Mesa',
      time: nowTime(),
      address: table.name,
      deliveryFee: '0,00',
      note: 'Pedido vindo do salao.',
      items: ['Consumo da mesa'],
    })

    setOrders((current) => [createdOrder, ...current])
    setTables((current) =>
      current.map((item) =>
        item.id === table.id ? { ...item, status: 'occupied', total: (item.total || 0) + 49.9 } : item,
      ),
    )
    registerOrderFinanceEntry(createdOrder, 'Mesa')
    if (pilotSync.enabled && pilotSync.autoSyncOrders) {
      void syncSingleOrderToBackend(createdOrder, { silent: true })
    } else {
      markOrderSyncState(createdOrder.id, {
        syncStatus: 'pending',
        syncMessage: 'Aguardando modo piloto.',
      })
    }
    if (settings.autoPrint) {
      printOrderTicket(createdOrder, 'order')
    }
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
      const deliveryOrder = orders.find((order) => order.id === orderId)

      if (deliveryOrder) {
        printOrderTicket({ ...deliveryOrder, courier: courierName }, 'dispatch')
      } else {
        enqueuePrintJob(`Entrega #${orderId} - ${courierName}`, 'Entrega', null, { printNow: true })
      }
    }
    closeModal()
    notify(`Entrega #${orderId} atribuida para ${courierName}.`)
  }

  function updateDeliveryZonePoint(pointIndex, nextPoint) {
    setDeliveryZoneFeedback('')
    setDeliveryZonePoints((current) =>
      current.map((point, index) => (index === pointIndex ? nextPoint : point)),
    )
  }

  function removeSelectedDeliveryZonePoint() {
    if (selectedDeliveryZonePointIndex === null) {
      notify('Selecione um ponto para remover.', 'warning')
      setDeliveryZoneFeedback('Selecione um ponto para remover.')
      return
    }

    setDeliveryZoneFeedback('')
    setDeliveryZonePoints((current) =>
      current.filter((_, pointIndex) => pointIndex !== selectedDeliveryZonePointIndex),
    )
    setSelectedDeliveryZonePointIndex(null)
  }

  function trimDeliveryZoneFromSelectedPoint() {
    if (selectedDeliveryZonePointIndex === null) {
      notify('Selecione um ponto para cortar a area a partir dele.', 'warning')
      setDeliveryZoneFeedback('Selecione um ponto para cortar a area a partir dele.')
      return
    }

    setDeliveryZonePoints((current) => current.slice(0, selectedDeliveryZonePointIndex + 1))
    setDeliveryZoneFeedback('')
    notify('Area cortada a partir do ponto selecionado.')
  }

  function validateDeliveryZoneDetails() {
    if (!deliveryZoneForm.name.trim()) {
      return 'Informe o nome da zona.'
    }

    if (Number.isNaN(parseCurrencyInput(deliveryZoneForm.fee)) || parseCurrencyInput(deliveryZoneForm.fee) < 0) {
      return 'Informe uma taxa valida para a zona.'
    }

    return ''
  }

  function advanceDeliveryZoneToMap() {
    const feedback = validateDeliveryZoneDetails()

    if (feedback) {
      setDeliveryZoneFeedback(feedback)
      notify(feedback, 'warning')
      return
    }

    setDeliveryZoneFeedback('')
    setDeliveryZoneStep(2)
  }

  function saveDeliveryZone(zoneId = editingDeliveryZoneId) {
    const polygon = getDeliveryZoneDraftPolygon(deliveryZonePoints, deliveryZoneForm.coordinates)
    const detailsFeedback = validateDeliveryZoneDetails()

    if (detailsFeedback) {
      setDeliveryZoneFeedback(detailsFeedback)
      notify(detailsFeedback, 'warning')
      return
    }

    if (!polygon || polygon.length < 4) {
      const feedback = 'Marque pelo menos 3 pontos no mapa para formar a zona.'
      setDeliveryZoneFeedback(feedback)
      notify(feedback, 'warning')
      return
    }

    const normalizedZone = normalizeDeliveryZone({
      id: zoneId || undefined,
      name: deliveryZoneForm.name.trim(),
      fee: deliveryZoneForm.fee,
      active: deliveryZoneForm.active === 'yes',
      color: deliveryZoneForm.color,
      polygon,
    })

    if (zoneId) {
      setDeliveryZones((current) =>
        current.map((zone) => (zone.id === zoneId ? normalizedZone : zone)),
      )
      notify('Zona de entrega atualizada.')
    } else {
      setDeliveryZones((current) => [normalizedZone, ...current])
      notify('Zona de entrega criada.')
    }

    setEditingDeliveryZoneId(null)
    setDeliveryZoneForm(blankDeliveryZone)
    setDeliveryZoneStep(1)
    setDeliveryZonePoints([])
    setSelectedDeliveryZonePointIndex(null)
    setDeliveryZoneFeedback('')
    setModal({ type: 'deliveryZones', payload: null })
  }

  function toggleDeliveryZone(zoneId) {
    setDeliveryZones((current) =>
      current.map((zone) => (zone.id === zoneId ? { ...zone, active: !zone.active } : zone)),
    )
    notify('Status da zona atualizado.')
  }

  function deleteDeliveryZone(zoneId) {
    setDeliveryZones((current) => current.filter((zone) => zone.id !== zoneId))
    closeModal()
    notify('Zona de entrega apagada.')
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
      cost: parseCurrencyInput(stockForm.cost),
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
      amount: parseCurrencyInput(financeForm.amount),
      status: financeForm.status,
      createdAt: financeId ? undefined : nowDateTime(),
    }

    if (financeId) {
      setFinance((current) =>
        current.map((item) => (item.id === financeId ? { ...item, ...normalizedFinance, createdAt: item.createdAt || nowDateTime() } : item)),
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
      printInvoiceForOrder(sourceOrder, {
        id: `nfc-${sourceOrder.id}`,
        orderId: sourceOrder.id,
        customer: sourceOrder.customer,
        amount: sourceOrder.total,
        status: 'Autorizada',
      })
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
          storeId={pilotSync.storeId || (/^[0-9a-f-]{36}$/i.test(String(activeStoreId || '')) ? activeStoreId : '')}
          orders={orders}
          chatMessages={chatMessages}
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
          onToggleCategory={toggleCategory}
          onToggleProduct={toggleProduct}
          onUpdateProductConfig={updateProductConfig}
          onUpdateProductFlavor={updateProductFlavor}
          onRemoveProductFlavor={removeProductFlavor}
          onAddProductAddonGroup={addProductAddonGroup}
          onUpdateProductAddonGroup={updateProductAddonGroup}
          onRemoveProductAddonGroup={removeProductAddonGroup}
          onAddProductAddonOption={addProductAddonOption}
          onUpdateProductAddonOption={updateProductAddonOption}
          onRemoveProductAddonOption={removeProductAddonOption}
          onToggleProductAvailabilityDay={toggleProductAvailabilityDay}
          onImportMenu={openMenuImportPicker}
          onOpenModal={openModal}
        />
      )
    }

    if (activeNav === 'tables') {
      return <TablesSection tables={tables} orders={orders} qrCodes={qrCodes} onOpenModal={openModal} />
    }

    if (activeNav === 'kds') {
      return <KdsSection orders={orders} onMoveOrder={moveOrder} onOpenModal={openModal} />
    }

    if (activeNav === 'delivery') {
      return <DeliverySection orders={orders} couriers={couriers} deliveryZones={deliveryZones} onToggleCourier={toggleCourier} onOpenModal={openModal} />
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

    if (activeNav === 'finance') {
      return <FinanceSection finance={finance} orders={orders} onOpenModal={openModal} onPayFinance={payFinance} />
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
      return (
        <ReportsSection
          orders={orders}
          products={products}
          tables={tables}
          finance={finance}
          coupons={coupons}
          recoveries={recoveries}
          pilotSync={pilotSync}
          onOpenModal={openModal}
        />
      )
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
          <div className="operations-stack">
            <Board visibleOrders={visibleOrders} onOpenModal={openModal} onMoveOrder={moveOrder} onPrintOrder={printOrderTicket} />
          </div>
          <OrdersSideRail
            orders={orders}
            blockedOrders={blockedOrders}
            suggestions={suggestions}
            onOpenModal={openModal}
          />
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
      const normalizedPosSearch = posSearch.trim().toLowerCase()
      const configuredProduct = products.find((product) => product.id === cartItemForm.productId) || null
      const availableCategories = categories
        .filter((category) => category.active)
        .filter((category) => products.some((product) => isProductAvailableInCategory(product, category.name)))
      const visibleCategories = availableCategories.filter((category) => {
        if (!normalizedPosSearch) {
          return true
        }

        const productNames = products
          .filter((product) => isProductAvailableInCategory(product, category.name))
          .map((product) => product.name)
          .join(' ')

        return `${category.name} ${productNames}`.toLowerCase().includes(normalizedPosSearch)
      })
      const activeProducts = products
        .filter((product) => posCategory === 'all' ? isProductAvailable(product) : isProductAvailableInCategory(product, posCategory))
        .filter((product) => product.name.toLowerCase().includes(normalizedPosSearch))
      const posStep = configuredProduct ? 'configure' : posCategory === 'all' ? 'categories' : 'products'
      const configurationSteps = configuredProduct ? getCartConfigurationSteps(configuredProduct) : []
      const currentConfigStep = configurationSteps[cartItemStepIndex] || configurationSteps[0] || null
      const currentConfigOptions = currentConfigStep
        ? currentConfigStep.options.filter((option) => option.name.toLowerCase().includes(normalizedPosSearch))
        : []
      const configuredUnitPrice = configuredProduct ? getCartItemUnitPrice(configuredProduct, cartItemForm.flavorIds, cartItemForm.addonSelections) : 0
      const configuredFlavorLimit = configuredProduct ? Math.max(1, Number(configuredProduct.maxFlavors) || 1) : 1
      const configuredFlavorLabel = configuredProduct ? getCartItemFlavorLabel(configuredProduct, cartItemForm.flavorIds) : ''
      const configuredAddonEntries = configuredProduct ? getSelectedCartAddonEntries(configuredProduct, cartItemForm.addonSelections) : []
      const hasConfiguredTrail = Boolean(configuredFlavorLabel) || configuredAddonEntries.length > 0
      const hasCartItemNote = Boolean(cartItemForm.note.trim())
      const canFinalizeConfiguredItem = configuredProduct
        ? getCartConfigurationSteps(configuredProduct).every((step) => isCartStepSelectionValid(step, cartItemForm))
        : false
      const hasNextConfigStep = cartItemStepIndex < Math.max(configurationSteps.length - 1, 0)
      const orderSubtotal = orderCart.reduce((sum, item) => sum + item.price * item.qty, 0)
      const orderBreakdown = getOrderFinancialBreakdown(orderSubtotal, newOrder)
      const legacyAdjustments = normalizeOrderAdjustmentFields(newOrder)
      const legacyManualTotal = showManualTotalInput && !legacyAdjustments.discountValue && !legacyAdjustments.surchargeValue ? parseCurrencyInput(newOrder.total) : 0
      const orderTotal = legacyManualTotal > 0
        ? legacyManualTotal
        : orderBreakdown.total
      const selectedCartItem = orderCart.find((item) => item.id === selectedCartItemId) || null
      const orderAddressPreview = newOrder.fulfillment === 'delivery'
        ? newOrder.address || 'Nenhum endereco selecionado'
        : getOrderFulfillmentLabel(newOrder.fulfillment)
      const hasOrderAdjustments = orderBreakdown.discountAmount > 0 || orderBreakdown.surchargeAmount > 0
      const hasOrderItems = orderCart.length > 0
      const isEditingOrder = Boolean(editingOrderId)

      return (
        <div className="pos-backdrop" role="presentation" onMouseDown={closeModal}>
          <section
            className="pos-shell"
            role="dialog"
            aria-modal="true"
            aria-label={isEditingOrder ? `Editar pedido #${editingOrderId}` : 'Criar pedido no PDV'}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <form id="new-order-form" onSubmit={createOrder} className="pos-shell__form">
              <main className={`pos-catalog ${posStep === 'configure' ? 'pos-catalog--config' : ''}`.trim()}>
                <header className="pos-tabs">
                  <button
                    className={newOrder.channel === 'pickup' ? 'is-active' : ''}
                    data-testid="new-order-tab-pickup"
                    type="button"
                    onClick={() => setNewOrder({
                      ...newOrder,
                      channel: 'pickup',
                      fulfillment: newOrder.fulfillment === 'dinein' ? 'dinein' : 'pickup',
                      address: '',
                      addressId: '',
                      deliveryFee: '0,00',
                    })}
                  >
                    Pedidos balcao (PDV)
                  </button>
                  <button
                    className={newOrder.channel === 'delivery' ? 'is-active' : ''}
                    data-testid="new-order-tab-delivery"
                    disabled={!hasOrderItems}
                    type="button"
                    onClick={() => setNewOrder({ ...newOrder, channel: 'delivery', fulfillment: 'delivery' })}
                  >
                    [ D ] Delivery e Balcao
                  </button>
                  <button type="button" onClick={() => setActiveNav('tables')}>[ M ] Mesas e Comandas</button>
                </header>

                <section className="pos-catalog__toolbar">
                  <button
                    type="button"
                    className="pos-filter"
                    onClick={() => {
                      if (posStep === 'configure') {
                        resetOrderCatalog(false)
                        return
                      }

                      setPosCategory('all')
                      setPosSearch('')
                    }}
                  >
                    <Icon name={posStep === 'categories' ? 'filter' : 'arrow'} size={18} />
                    <span>
                      {posStep === 'categories'
                        ? '[F] Filtros'
                        : posStep === 'products'
                          ? posCategory
                          : configuredProduct?.name || '[F] Filtros'}
                    </span>
                  </button>
                  <label>
                    <input value={posSearch} onChange={(event) => setPosSearch(event.target.value)} placeholder="[ P ] Pesquisar" />
                    <Icon name="search" size={22} />
                  </label>
                </section>

                <div className="pos-hints">
                  {posStep === 'categories' ? (
                    <>
                      <span>
                        <Icon name="menu" size={14} />
                        Categorias
                      </span>
                      <span>
                        <b>ENTER</b>
                        Abrir itens
                      </span>
                    </>
                  ) : null}

                  {posStep === 'products' ? (
                    <>
                      <span>
                        <Icon name="menu" size={14} />
                        {posCategory} / Itens
                      </span>
                      <span>
                        <b>ENTER</b>
                        Configurar item
                      </span>
                    </>
                  ) : null}

                  {posStep === 'configure' ? (
                    <>
                      <span>
                        <Icon name="menu" size={14} />
                        Configuracao simplificada
                      </span>
                      <span>
                        <b>F</b>
                        Finalizar item
                      </span>
                    </>
                  ) : null}
                </div>

                {posStep === 'categories' ? (
                  <section className="pos-product-grid">
                    {visibleCategories.length > 0 ? visibleCategories.map((category) => (
                      <button
                        className="pos-product-tile pos-product-tile--category"
                        data-testid={`pos-category-${category.id}`}
                        type="button"
                        key={category.id}
                        onClick={() => {
                          setPosCategory(category.name)
                          setPosSearch('')
                        }}
                      >
                        <span className="tile-pattern" />
                        <strong>{category.name}</strong>
                        <small>{products.filter((product) => isProductAvailableInCategory(product, category.name)).length} item(ns)</small>
                      </button>
                    )) : (
                      <div className="pos-stage-empty">Nenhuma categoria encontrada para o filtro atual.</div>
                    )}
                  </section>
                ) : null}

                {posStep === 'products' ? (
                  <section className="pos-stage">
                    <header className="pos-stage__header">
                      <div className="pos-stage__title">
                        <strong>{posCategory}</strong>
                        <small>Itens disponiveis para montagem do pedido</small>
                      </div>
                      <span className="pos-stage__badge">{activeProducts.length} item(ns)</span>
                    </header>

                    <div className="pos-product-grid pos-product-grid--items">
                      {activeProducts.length > 0 ? activeProducts.map((product) => (
                        <button
                          className="pos-product-tile pos-product-tile--product"
                          data-testid={`pos-product-${product.id}`}
                          type="button"
                          key={product.id}
                          onClick={() => addOrderCart(product, posCategory)}
                        >
                          <span className={`tile-pattern tile-pattern--food ${getMenuProductThumbClass(product)}`.trim()} />
                          <strong>{product.name}</strong>
                          <small>{formatCurrency(product.price)}</small>
                        </button>
                      )) : (
                        <div className="pos-stage-empty">Nenhum item encontrado nesta categoria.</div>
                      )}
                    </div>
                  </section>
                ) : null}

                {posStep === 'configure' && configuredProduct ? (
                  <section className="pos-config">
                    <header className="pos-config__header">
                      <div className="pos-config__lead">
                        <span className={`product-thumb ${getMenuProductThumbClass(configuredProduct)}`.trim()} />
                        <div>
                          <strong>{configuredProduct.name}</strong>
                          <small>
                            {currentConfigStep
                              ? `${currentConfigStep.title} ${currentConfigStep.required ? '(obrigatorio)' : '(opcional)'}`
                              : 'Defina a quantidade do item'}
                          </small>
                        </div>
                      </div>
                      <span className="pos-config__badge">
                        {configurationSteps.length > 0 ? `${Math.min(cartItemStepIndex + 1, configurationSteps.length)} de ${configurationSteps.length}` : 'Item direto'}
                      </span>
                    </header>

                    <div className="pos-config__body">
                      <div className="pos-config__summary">
                        <div>
                          <strong>{currentConfigStep?.title || configuredProduct.category}</strong>
                          <small>
                            {currentConfigStep
                              ? currentConfigStep.required
                                ? `Selecione de ${Math.max(1, Number(currentConfigStep.minSelect) || 1)} a ${currentConfigStep.maxSelect} opcao(oes)`
                                : `Selecione ate ${currentConfigStep.maxSelect} opcao(oes)`
                              : 'Nenhuma configuracao extra para este item'}
                          </small>
                        </div>
                        <b>{formatCurrency(configuredUnitPrice)}</b>
                      </div>

                      {hasConfiguredTrail ? (
                        <div className="pos-config__trail">
                          {configuredFlavorLabel ? (
                            <article className="pos-config__trail-item pos-config__trail-item--primary">
                              <span>{isComboProduct(configuredProduct) ? 'Subsabores escolhidos' : 'Sabores escolhidos'}</span>
                              <strong>{configuredFlavorLabel}</strong>
                            </article>
                          ) : null}

                          {configuredAddonEntries.map((entry) => (
                            <article className="pos-config__trail-item" key={entry.groupId}>
                              <span>{entry.groupName}</span>
                              <strong>{entry.label}</strong>
                            </article>
                          ))}
                        </div>
                      ) : null}

                      {currentConfigStep ? (
                        <div className="pos-config__grid">
                          {currentConfigOptions.length > 0 ? currentConfigOptions.map((option) => {
                            const selectedIds = getCartStepSelectedIds(cartItemForm, currentConfigStep)
                            const selectedCount = selectedIds.filter((selectedId) => selectedId === option.id).length
                            const isSelected = selectedCount > 0
                            const optionLimit = Math.max(1, Number(currentConfigStep.maxSelect) || configuredFlavorLimit)
                            const allowsRepeatedOption = optionLimit > 1
                            const canAddRepeatedOption = selectedIds.length < optionLimit

                            if (allowsRepeatedOption) {
                              return (
                                <article
                                  className={`pos-flavor-card pos-flavor-card--quantity ${isSelected ? 'is-active' : ''}`.trim()}
                                  data-testid={`${currentConfigStep.type === 'flavors' ? 'cart-flavor' : 'cart-addon'}-${option.id}`}
                                  key={option.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    if (!canAddRepeatedOption) {
                                      return
                                    }

                                    if (currentConfigStep.type === 'flavors') {
                                      toggleCartItemFlavor(option.id, configuredFlavorLimit, configuredProduct)
                                      return
                                    }

                                    toggleCartItemAddonOption(currentConfigStep, option.id)
                                  }}
                                  onKeyDown={(event) => {
                                    if ((event.key === 'Enter' || event.key === ' ') && canAddRepeatedOption) {
                                      event.preventDefault()
                                      if (currentConfigStep.type === 'flavors') {
                                        toggleCartItemFlavor(option.id, configuredFlavorLimit, configuredProduct)
                                      } else {
                                        toggleCartItemAddonOption(currentConfigStep, option.id)
                                      }
                                    }
                                  }}
                                >
                                  <strong>{option.name}</strong>
                                  <small className="pos-flavor-card__price">{option.price > 0 ? formatCurrency(option.price) : 'R$ 0,00'}</small>
                                  <div className="pos-flavor-card__stepper" onClick={(event) => event.stopPropagation()}>
                                    <button
                                      aria-label={`Remover ${option.name}`}
                                      disabled={selectedCount <= 0}
                                      type="button"
                                      onClick={() => {
                                        if (currentConfigStep.type === 'flavors') {
                                          removeCartItemFlavor(option.id)
                                          return
                                        }

                                        removeCartItemAddonOption(currentConfigStep, option.id)
                                      }}
                                    >
                                      -
                                    </button>
                                    <b>{selectedCount}</b>
                                    <button
                                      aria-label={`Adicionar ${option.name}`}
                                      disabled={!canAddRepeatedOption}
                                      type="button"
                                      onClick={() => {
                                        if (currentConfigStep.type === 'flavors') {
                                          toggleCartItemFlavor(option.id, configuredFlavorLimit, configuredProduct)
                                          return
                                        }

                                        toggleCartItemAddonOption(currentConfigStep, option.id)
                                      }}
                                    >
                                      +
                                    </button>
                                  </div>
                                  <small className="pos-flavor-card__limit">Maximo {optionLimit}</small>
                                </article>
                              )
                            }

                            return (
                              <button
                                className={`pos-flavor-card ${isSelected ? 'is-active' : ''}`.trim()}
                                data-testid={`${currentConfigStep.type === 'flavors' ? 'cart-flavor' : 'cart-addon'}-${option.id}`}
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  if (currentConfigStep.type === 'flavors') {
                                    toggleCartItemFlavor(option.id, configuredFlavorLimit, configuredProduct)
                                    return
                                  }

                                  toggleCartItemAddonOption(currentConfigStep, option.id)
                                }}
                              >
                                <strong>{option.name}</strong>
                                <small>{option.price > 0 ? `+${formatCurrency(option.price)}` : 'Sem adicional'}</small>
                                <span>{isSelected ? 'Selecionado' : 'Selecionar'}</span>
                              </button>
                            )
                          }) : (
                            <div className="pos-stage-empty">Nenhuma opcao encontrada para o filtro atual.</div>
                          )}
                        </div>
                      ) : (
                        <div className="pos-stage-empty">Este item nao possui sabores ou adicionais configuraveis. Ajuste a quantidade e finalize.</div>
                      )}

                      <div className="pos-config__footer">
                        <label className="pos-config__qty">
                          <span>{isComboProduct(configuredProduct) ? 'Quantidade do combo' : 'Quantidade'}</span>
                          <input
                            data-testid="cart-item-qty"
                            min="1"
                            type="number"
                            value={cartItemForm.qty}
                            onChange={(event) => setCartItemForm({ ...cartItemForm, qty: event.target.value })}
                          />
                        </label>

                        {cartItemForm.lineId ? (
                          <Button variant="danger" onClick={() => { removeOrderCart(cartItemForm.lineId); resetOrderCatalog(false) }}>
                            Remover item
                          </Button>
                        ) : null}
                      </div>

                      {(cartItemNoteOpen || hasCartItemNote) ? (
                        <label className="pos-config__note">
                          <span>Observacao do item</span>
                          <textarea
                            autoFocus={cartItemNoteOpen && !hasCartItemNote}
                            placeholder="Ex: pizza sem cebola, ponto da carne, sem gelo..."
                            value={cartItemForm.note}
                            onChange={(event) => setCartItemForm({ ...cartItemForm, note: event.target.value })}
                          />
                        </label>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <footer className="pos-next-row">
                  <button type="button" onClick={closeModal}>Cancelar</button>
                  {posStep === 'products' ? (
                    <button type="button" onClick={() => { setPosCategory('all'); setPosSearch('') }}>[ V ] Voltar</button>
                  ) : null}
                  {posStep === 'configure' ? (
                    <>
                      <button
                        className={hasCartItemNote ? 'is-active' : ''}
                        type="button"
                        onClick={() => setCartItemNoteOpen((current) => !current || !hasCartItemNote)}
                      >
                        [ O ] Observacao do item
                      </button>
                      <button type="button" onClick={() => {
                        if (cartItemStepIndex > 0) {
                          goToPreviousCartItemStep()
                          return
                        }

                        resetOrderCatalog(false)
                      }}>[ V ] Voltar</button>
                      {hasNextConfigStep ? (
                        <button type="button" onClick={() => configuredProduct && goToNextCartItemStep(configuredProduct)}>[ A ] Proximo</button>
                      ) : null}
                      <button type="button" disabled={!canFinalizeConfiguredItem} onClick={commitOrderCartItem}>[ F ] Finalizar item</button>
                    </>
                  ) : null}
                </footer>
              </main>

              <aside className="pos-summary">
                <header className="pos-summary__header">
                  <button type="button" onClick={() => openModal('orderDrafts')}>[CTRL+X] Rascunhos <b>{orderDrafts.length}</b></button>
                  <button type="button" disabled={!selectedCartItem} onClick={() => selectedCartItem && openExistingOrderCartItem(selectedCartItem)}>[Q] Editar</button>
                  <button type="button" disabled={!selectedCartItem} onClick={() => selectedCartItem && removeOrderCart(selectedCartItem.id)}>[W] Excluir</button>
                  <button type="button" className="summary-settings" onClick={() => openModal('automations')}><Icon name="settings" size={22} /></button>
                </header>

                <div className="pos-summary__items">
                  <div className="pos-summary__title">
                    <strong>Itens do pedido</strong>
                    <span>Subtotal</span>
                  </div>
                  {orderCart.length > 0 ? (
                    <div className="pos-summary__list" data-testid="order-cart-list">
                      {orderCart.map((item) => (
                        <article
                          className={`summary-item ${selectedCartItemId === item.id ? 'is-selected' : ''}`.trim()}
                          data-product-id={item.productId}
                          data-testid={`order-cart-item-${item.id}`}
                          key={item.id}
                          onClick={() => setSelectedCartItemId(item.id)}
                        >
                          <div className="summary-item__main">
                            <span>
                              <strong>{item.qty}x {item.name}</strong>
                              {item.note ? <small className="summary-item__note">Observacao: {item.note}</small> : null}
                              <small>{formatCurrency(item.price)} por unidade</small>
                            </span>
                            <b className="summary-item__price">{formatCurrency(item.price * item.qty)}</b>
                          </div>
                          {getOrderCartChildRows(item).length > 0 ? (
                            <div className="summary-item__children">
                              {getOrderCartChildRows(item).map((row) => (
                                <span className="summary-item__child" key={`${item.id}-${row.id}`}>
                                  <small>{row.groupName}</small>
                                  <strong>{row.count * item.qty}x {row.name}</strong>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="summary-item__controls" onClick={(event) => event.stopPropagation()}>
                            <button
                              data-testid={`order-item-subtract-${item.id}`}
                              type="button"
                              onClick={() => changeOrderCartQuantity(item.id, item.qty - 1)}
                            >
                              -
                            </button>
                            <b className="summary-item__qty">{item.qty}</b>
                            <button
                              data-testid={`order-item-add-${item.id}`}
                              type="button"
                              onClick={() => changeOrderCartQuantity(item.id, item.qty + 1)}
                            >
                              +
                            </button>
                            <button
                              className="summary-item__edit"
                              type="button"
                              onClick={() => openExistingOrderCartItem(item)}
                              title="Editar item"
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              className="summary-item__remove"
                              type="button"
                              onClick={() => removeOrderCart(item.id)}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="pos-summary__empty">Finalize o item ao lado, ele vai aparecer aqui</div>
                  )}
                </div>

                <label className="order-note">
                  <span>[O] Observacao do pedido</span>
                  <textarea value={newOrder.note} onChange={(event) => setNewOrder({ ...newOrder, note: event.target.value })} />
                </label>

                <div className="pos-total">
                  <span>Subtotal <b>{formatCurrency(orderSubtotal)}</b></span>
                  <span>Entrega <b>{orderBreakdown.deliveryFee > 0 ? formatCurrency(orderBreakdown.deliveryFee) : 'Gratis'}</b></span>
                  {orderBreakdown.discountAmount > 0 ? <span>Desconto <b>{formatCurrency(orderBreakdown.discountAmount)}</b></span> : null}
                  {orderBreakdown.surchargeAmount > 0 ? <span>Acrescimo <b>{formatCurrency(orderBreakdown.surchargeAmount)}</b></span> : null}
                  <strong>Total <b>{formatCurrency(orderTotal)}</b></strong>
                </div>

                <div className="customer-grid">
                  <input
                    className={!hasOrderItems ? 'is-locked' : ''}
                    disabled={!hasOrderItems}
                    value={newOrder.phone}
                    onChange={(event) => setNewOrder({ ...newOrder, phone: event.target.value })}
                    placeholder="(XX) X XXXX-XXXX"
                  />
                  <input
                    className={!hasOrderItems ? 'is-locked' : ''}
                    data-testid="new-customer"
                    disabled={!hasOrderItems}
                    value={newOrder.customer}
                    onChange={(event) => setNewOrder({ ...newOrder, customer: event.target.value })}
                    placeholder="Nome do cliente"
                  />
                </div>

                <div className="payment-grid payment-grid--primary">
                  <button data-testid="open-payment-panel" disabled={!hasOrderItems} type="button" className="is-active" onClick={openOrderPaymentPanel}>[ P ] {newOrder.payment}</button>
                  <button data-testid="open-delivery-panel" disabled={!hasOrderItems} type="button" className={newOrder.fulfillment === 'delivery' ? 'is-active' : ''} onClick={openOrderDeliveryPanel}>[ E ] {getOrderFulfillmentLabel(newOrder.fulfillment)}</button>
                </div>

                <div className="payment-grid payment-grid--secondary">
                  <button data-testid="open-document-panel" disabled={!hasOrderItems} type="button" className={newOrder.document.trim() ? 'is-active' : ''} onClick={openOrderDocumentPanel}>[ T ] CPF/CNPJ</button>
                  <button data-testid="open-adjustment-panel" disabled={!hasOrderItems} type="button" className={hasOrderAdjustments ? 'is-active' : ''} onClick={openOrderAdjustmentPanel}>[ Y ] Ajustar R$</button>
                </div>

                <div className="pos-inline-summary-stack">
                  <div className="pos-inline-summary">
                    <span>Pagamento</span>
                    <strong>{newOrder.payment}</strong>
                  </div>

                  <div className="pos-inline-summary">
                    <span>{newOrder.fulfillment === 'delivery' ? 'Endereco de entrega' : 'Forma de entrega'}</span>
                    <strong data-testid="order-address-summary">{orderAddressPreview}</strong>
                  </div>

                  {newOrder.document.trim() ? (
                    <div className="pos-inline-summary">
                      <span>CPF/CNPJ</span>
                      <strong>{newOrder.document}</strong>
                    </div>
                  ) : null}

                  {hasOrderAdjustments ? (
                    <div className="pos-inline-summary">
                      <span>Ajuste aplicado</span>
                      <strong>
                        {[
                          orderBreakdown.discountAmount > 0 ? `Desconto ${formatCurrency(orderBreakdown.discountAmount)}` : '',
                          orderBreakdown.surchargeAmount > 0 ? `Acrescimo ${formatCurrency(orderBreakdown.surchargeAmount)}` : '',
                        ].filter(Boolean).join(' | ')}
                      </strong>
                    </div>
                  ) : null}
                </div>

                <footer className="pos-submit-row">
                  <Button variant="primary" form="new-order-form" type="submit">
                    [ ENTER ] {isEditingOrder ? 'Salvar pedido' : 'Gerar pedido'}
                  </Button>
                  <button type="button" className="save-draft" disabled={isEditingOrder} onClick={saveOrderDraft}><Icon name="printer" size={22} /></button>
                </footer>
              </aside>
            </form>

            {orderPanel === 'payment' ? (
              <OrderUtilitySheet title="Forma de pagamento" onClose={() => setOrderPanel(null)}>
                <div className="order-choice-list">
                  {ORDER_PAYMENT_OPTIONS.map((option) => (
                    <button
                      className={`order-choice ${paymentDraft === option.id ? 'is-active' : ''}`.trim()}
                      key={option.id}
                      type="button"
                      onClick={() => applyOrderPayment(option.id)}
                    >
                      <span className="order-choice__icon">
                        <Icon name={option.icon} size={20} />
                      </span>
                      <span className="order-choice__content">
                        <strong>[ {option.hotkey} ] {option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
                </div>
              </OrderUtilitySheet>
            ) : null}

            {orderPanel === 'delivery' ? (
              <OrderUtilitySheet
                title="Forma de entrega"
                onClose={() => setOrderPanel(null)}
                footer={
                  <Button variant="primary" onClick={applyOrderDelivery}>[ ENTER ] Aplicar forma de entrega</Button>
                }
              >
                <div className="order-sheet-stack">
                  <div className="delivery-sheet__tabs">
                    {ORDER_FULFILLMENT_OPTIONS.map((option) => (
                      <button
                        className={deliveryTabDraft === option.id ? 'is-active' : ''}
                        key={option.id}
                        type="button"
                        onClick={() => setDeliveryTabDraft(option.id)}
                      >
                        [ {option.hotkey} ] {option.label}
                      </button>
                    ))}
                  </div>

                  {deliveryTabDraft === 'delivery' ? (
                    <>
                      <div className="delivery-sheet__actions">
                        <strong>Endereco de entrega:</strong>
                        <div>
                          <button type="button" onClick={startNewOrderAddress}>[ N ] Novo</button>
                          <button type="button" onClick={startEditOrderAddress}>[ Q ] Editar</button>
                          <button type="button" onClick={deleteOrderAddressSelection}>[ W ] Excluir</button>
                        </div>
                      </div>

                      {orderAddresses.length > 0 ? (
                        <div className="delivery-address-list">
                          {orderAddresses.map((address) => (
                            <button
                              className={`delivery-address-card ${selectedAddressDraftId === address.id ? 'is-active' : ''}`.trim()}
                              key={address.id}
                              type="button"
                              onClick={() => setSelectedAddressDraftId(address.id)}
                            >
                              <span className="delivery-address-card__top">
                                <strong>{formatOrderAddress(address)}</strong>
                                <StatusBadge tone={address.deliveryAvailable ? 'success' : 'warning'}>
                                  {address.deliveryAvailable ? 'Atende' : 'Verificar'}
                                </StatusBadge>
                              </span>
                              <small>{getDeliveryAddressSummary(address)}</small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="delivery-address-empty">
                          <strong>Nenhum endereco cadastrado.</strong>
                          <button type="button" onClick={startNewOrderAddress}>[ N ] Novo endereco</button>
                        </div>
                      )}

                    <label className="delivery-fee-field">
                        <span>[ V ] Taxa aplicada pela zona</span>
                        <input
                          data-testid="delivery-fee"
                          inputMode="decimal"
                          value={deliveryFeeDraft}
                          onChange={(event) => setDeliveryFeeDraft(formatCurrencyTypingInput(event.target.value))}
                          placeholder="0,00"
                          readOnly={Boolean(orderAddresses.find((address) => address.id === selectedAddressDraftId)?.deliveryAvailable)}
                        />
                      </label>
                    </>
                  ) : (
                    <div className="delivery-address-empty">
                      <strong>{deliveryTabDraft === 'pickup' ? 'Retirada no local' : 'Consumir no local'}</strong>
                      <p>{deliveryTabDraft === 'pickup' ? 'O pedido sera separado para retirada no balcao.' : 'O pedido sera marcado para consumo no local.'}</p>
                    </div>
                  )}
                </div>
              </OrderUtilitySheet>
            ) : null}

            {orderPanel === 'deliveryAddress' ? (
              <OrderUtilitySheet
                title="Forma de entrega"
                onClose={() => setOrderPanel('delivery')}
                footer={
                  <>
                    <Button onClick={() => setOrderPanel('delivery')}>[ ESC ] Cancelar</Button>
                    <Button variant="primary" form="delivery-address-form" type="submit">[ ENTER ] Salvar</Button>
                  </>
                }
              >
                <div className="order-sheet-stack">
                  <div className="delivery-sheet__tabs">
                    {ORDER_FULFILLMENT_OPTIONS.map((option) => (
                      <button
                        className={option.id === 'delivery' ? 'is-active' : ''}
                        key={option.id}
                        type="button"
                        disabled={option.id !== 'delivery'}
                      >
                        [ {option.hotkey} ] {option.label}
                      </button>
                    ))}
                  </div>

                  <form className="order-address-form" id="delivery-address-form" onSubmit={saveOrderAddress}>
                    <label className="field order-address-form__full">
                      <span>CEP</span>
                      <div className="address-lookup-row">
                        <input data-testid="delivery-cep" value={deliveryAddressForm.cep} onChange={(event) => updateDeliveryAddressField('cep', event.target.value)} placeholder="17.120-007" />
                        <button type="button" onClick={lookupCepForDeliveryAddress}>Buscar CEP</button>
                      </div>
                    </label>
                    <label className="field order-address-form__full">
                      <span>Rua *</span>
                      <input data-testid="new-address" value={deliveryAddressForm.street} onChange={(event) => updateDeliveryAddressField('street', event.target.value)} placeholder="Rua 15 de novembro" />
                    </label>
                    <label className="field">
                      <span>Numero *</span>
                      <input data-testid="delivery-number" value={deliveryAddressForm.number} onChange={(event) => updateDeliveryAddressField('number', event.target.value)} placeholder="941" />
                    </label>
                    <label className="field">
                      <span>Complemento</span>
                      <input data-testid="delivery-complement" value={deliveryAddressForm.complement} onChange={(event) => updateDeliveryAddressField('complement', event.target.value)} placeholder="Em frente a padaria" />
                    </label>
                    <label className="field">
                      <span>Bairro *</span>
                      <input data-testid="delivery-district" value={deliveryAddressForm.district} onChange={(event) => updateDeliveryAddressField('district', event.target.value)} placeholder="Centro" />
                    </label>
                    <label className="field">
                      <span>Cidade *</span>
                      <input data-testid="delivery-city" value={deliveryAddressForm.city} onChange={(event) => updateDeliveryAddressField('city', event.target.value)} placeholder="Penha - SC" />
                    </label>

                    <div className="delivery-check-panel order-address-form__full">
                      <div className="location-action-row">
                        <button type="button" onClick={useCurrentLocationForDeliveryAddress}>Usar localizacao atual</button>
                        <button
                          className={deliveryAddressMapMode === 'pick' ? 'is-active' : ''}
                          type="button"
                          onClick={toggleDeliveryAddressMapPicking}
                        >
                          {deliveryAddressMapMode === 'pick' ? 'Cancelar marcacao' : 'Colocar ponto no mapa'}
                        </button>
                        <button type="button" onClick={() => verifyDeliveryAddressForm()}>Verificar mapa e taxa</button>
                      </div>
                      <span className={`delivery-check-panel__status delivery-check-panel__status--${deliveryAddressLookup.status}`}>
                        {deliveryAddressLookup.message || 'A taxa sera calculada pela zona cadastrada.'}
                      </span>
                    </div>

                    <div className="order-address-form__full">
                      <div className="delivery-map-card delivery-map-card--wide">
                        <OsmDeliveryMap
                          address={getAddressCoordinates(deliveryAddressForm) ? deliveryAddressForm : null}
                          center={getDeliveryMapCenter({ storeProfile, zones: deliveryZones, address: deliveryAddressForm })}
                          onMapClick={deliveryAddressMapMode === 'pick' ? handleDeliveryAddressMapPick : undefined}
                          storeProfile={storeProfile}
                          title="Mapa do endereco de entrega"
                          zones={deliveryZones}
                          zoom={14}
                        />
                        {deliveryAddressMapMode === 'pick' ? (
                          <small className="delivery-zone-editor__hint">Clique no mapa para posicionar o endereco com precisao.</small>
                        ) : null}
                      </div>
                    </div>
                  </form>
                </div>
              </OrderUtilitySheet>
            ) : null}

            {orderPanel === 'adjustment' ? (
              <OrderUtilitySheet
                title="Ajustar valor do pedido"
                onClose={() => setOrderPanel(null)}
                footer={
                  <>
                    <Button onClick={() => setOrderPanel(null)}>[ ESC ] Cancelar</Button>
                    <Button variant="primary" onClick={applyOrderAdjustment}>[ ENTER ] Aplicar ajuste</Button>
                  </>
                }
              >
                <div className="order-sheet-stack">
                  <section className="adjustment-card">
                    <header className="adjustment-card__header">
                      <strong>Desconto</strong>
                      <small>Aplicado sem anular o acrescimo.</small>
                    </header>

                    <div className="adjustment-type-list">
                      <label>
                        <input checked={adjustmentDraft.discountType === 'fixed'} name="discount-type" type="radio" onChange={() => setAdjustmentDraft({ ...adjustmentDraft, discountType: 'fixed' })} />
                        <span>Valor fixo (R$)</span>
                      </label>
                      <label>
                        <input checked={adjustmentDraft.discountType === 'percent'} name="discount-type" type="radio" onChange={() => setAdjustmentDraft({ ...adjustmentDraft, discountType: 'percent' })} />
                        <span>Percentual (%)</span>
                      </label>
                    </div>

                    <label className="delivery-fee-field">
                      <span>Valor do desconto</span>
                      <input
                        data-testid="discount-input"
                        inputMode="decimal"
                        value={adjustmentDraft.discountValue}
                        onChange={(event) => setAdjustmentDraft({
                          ...adjustmentDraft,
                          discountValue: adjustmentDraft.discountType === 'percent' ? event.target.value : formatCurrencyTypingInput(event.target.value),
                        })}
                        placeholder={adjustmentDraft.discountType === 'percent' ? 'Ex. 10' : 'Ex. 5,00'}
                      />
                    </label>
                  </section>

                  <section className="adjustment-card">
                    <header className="adjustment-card__header">
                      <strong>Acrescimo</strong>
                      <small>Permanece junto com o desconto, quando houver.</small>
                    </header>

                    <div className="adjustment-type-list">
                      <label>
                        <input checked={adjustmentDraft.surchargeType === 'fixed'} name="surcharge-type" type="radio" onChange={() => setAdjustmentDraft({ ...adjustmentDraft, surchargeType: 'fixed' })} />
                        <span>Valor fixo (R$)</span>
                      </label>
                      <label>
                        <input checked={adjustmentDraft.surchargeType === 'percent'} name="surcharge-type" type="radio" onChange={() => setAdjustmentDraft({ ...adjustmentDraft, surchargeType: 'percent' })} />
                        <span>Percentual (%)</span>
                      </label>
                    </div>

                    <label className="delivery-fee-field">
                      <span>Valor do acrescimo</span>
                      <input
                        data-testid="surcharge-input"
                        inputMode="decimal"
                        value={adjustmentDraft.surchargeValue}
                        onChange={(event) => setAdjustmentDraft({
                          ...adjustmentDraft,
                          surchargeValue: adjustmentDraft.surchargeType === 'percent' ? event.target.value : formatCurrencyTypingInput(event.target.value),
                        })}
                        placeholder={adjustmentDraft.surchargeType === 'percent' ? 'Ex. 10' : 'Ex. 5,00'}
                      />
                    </label>
                  </section>

                  <div className="pos-inline-summary">
                    <span>Resultado do ajuste</span>
                    <strong>
                      {[
                        getOrderDiscountAmount(orderSubtotal, adjustmentDraft) > 0 ? `Desconto ${formatCurrency(getOrderDiscountAmount(orderSubtotal, adjustmentDraft))}` : '',
                        getOrderSurchargeAmount(orderSubtotal, adjustmentDraft) > 0 ? `Acrescimo ${formatCurrency(getOrderSurchargeAmount(orderSubtotal, adjustmentDraft))}` : '',
                      ].filter(Boolean).join(' | ') || 'Sem ajuste'}
                    </strong>
                  </div>
                </div>
              </OrderUtilitySheet>
            ) : null}

            {orderPanel === 'document' ? (
              <OrderUtilitySheet
                title="CPF/CNPJ"
                onClose={() => setOrderPanel(null)}
                footer={
                  <>
                    <Button onClick={() => setOrderPanel(null)}>[ ESC ] Cancelar</Button>
                    <Button variant="primary" onClick={applyOrderDocument}>[ ENTER ] Salvar</Button>
                  </>
                }
              >
                <div className="order-sheet-stack">
                  <label className="delivery-fee-field">
                    <span>Digite o CPF/CNPJ:</span>
                    <input value={documentDraft} onChange={(event) => setDocumentDraft(event.target.value)} placeholder="Digite aqui" />
                  </label>
                </div>
              </OrderUtilitySheet>
            ) : null}
          </section>
        </div>
      )
    }

    if (modal.type === 'editOrder') {
      const editSubtotal = parseCurrencyInput(orderForm.subtotal)
      const editBreakdown = getOrderFinancialBreakdown(editSubtotal, orderForm)

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
            <Field label="Forma de entrega">
              <select
                value={orderForm.fulfillment}
                onChange={(event) => {
                  const fulfillment = event.target.value
                  const shouldResetAddress = ['Retirada no balcao', 'Consumir no local'].includes(orderForm.address)

                  setOrderForm({
                    ...orderForm,
                    channel: fulfillment === 'delivery' ? 'delivery' : 'pickup',
                    fulfillment,
                    deliveryFee: fulfillment === 'delivery' ? orderForm.deliveryFee : '0,00',
                    payment: fulfillment === 'dinein'
                      ? orderForm.payment
                      : orderForm.payment === 'Mesa'
                        ? 'Cartao'
                        : orderForm.payment,
                    address: fulfillment === 'delivery'
                      ? (shouldResetAddress ? '' : orderForm.address)
                      : fulfillment === 'dinein'
                        ? (orderForm.address && orderForm.address !== 'Retirada no balcao' ? orderForm.address : 'Consumir no local')
                        : 'Retirada no balcao',
                  })
                }}
              >
                <option value="pickup">Retirar no local</option>
                <option value="delivery">Entrega (delivery)</option>
                <option value="dinein">Consumir no local</option>
              </select>
            </Field>
            <Field label="Pagamento">
              <select value={orderForm.payment} onChange={(event) => setOrderForm({ ...orderForm, payment: event.target.value })}>
                <option>Cartao</option>
                <option>Dinheiro</option>
                <option>Dividir</option>
                {orderForm.fulfillment === 'dinein' ? <option>Mesa</option> : null}
              </select>
            </Field>
            <Field label="Subtotal">
              <input data-testid="edit-subtotal" value={orderForm.subtotal} onChange={(event) => setOrderForm({ ...orderForm, subtotal: formatCurrencyTypingInput(event.target.value) })} placeholder="59,90" />
            </Field>
            <Field label="Taxa de entrega">
              <input value={orderForm.deliveryFee} disabled={orderForm.fulfillment !== 'delivery'} onChange={(event) => setOrderForm({ ...orderForm, deliveryFee: formatCurrencyTypingInput(event.target.value) })} placeholder="0,00" />
            </Field>
            <Field label="CPF/CNPJ">
              <input value={orderForm.document} onChange={(event) => setOrderForm({ ...orderForm, document: event.target.value })} placeholder="Opcional" />
            </Field>
            <Field label="Endereco / mesa">
              <input value={orderForm.address} onChange={(event) => setOrderForm({ ...orderForm, address: event.target.value })} placeholder={orderForm.fulfillment === 'delivery' ? 'Rua, numero e referencia' : orderForm.fulfillment === 'dinein' ? 'Mesa ou identificacao' : 'Retirada no balcao'} />
            </Field>
            <Field label="Tipo de desconto">
              <select value={orderForm.discountType} onChange={(event) => setOrderForm({ ...orderForm, discountType: event.target.value })}>
                <option value="fixed">Valor fixo</option>
                <option value="percent">Percentual</option>
              </select>
            </Field>
            <Field label="Desconto">
              <input value={orderForm.discountValue} onChange={(event) => setOrderForm({ ...orderForm, discountValue: orderForm.discountType === 'percent' ? event.target.value : formatCurrencyTypingInput(event.target.value) })} placeholder={orderForm.discountType === 'percent' ? '10' : '5,00'} />
            </Field>
            <Field label="Tipo de acrescimo">
              <select value={orderForm.surchargeType} onChange={(event) => setOrderForm({ ...orderForm, surchargeType: event.target.value })}>
                <option value="fixed">Valor fixo</option>
                <option value="percent">Percentual</option>
              </select>
            </Field>
            <Field label="Acrescimo">
              <input value={orderForm.surchargeValue} onChange={(event) => setOrderForm({ ...orderForm, surchargeValue: orderForm.surchargeType === 'percent' ? event.target.value : formatCurrencyTypingInput(event.target.value) })} placeholder={orderForm.surchargeType === 'percent' ? '10' : '5,00'} />
            </Field>
            <Field label="Total final">
              <input value={formatCurrencyInput(editBreakdown.total)} readOnly />
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
            <Field label="Descricao">
              <input value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} placeholder="Ingredientes ou detalhe do item" />
            </Field>
            <Field label="Categoria">
              <select
                value={productForm.category}
                onChange={(event) => {
                  const nextCategory = event.target.value
                  setProductForm({
                    ...productForm,
                    category: nextCategory,
                    extraCategories: (productForm.extraCategories || []).filter((category) => category !== nextCategory),
                  })
                }}
              >
                {categories.map((category) => <option key={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Preco">
              <input data-testid="product-price" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: formatCurrencyTypingInput(event.target.value) })} placeholder="49,90" />
            </Field>
            <Field label="Foto do produto">
              <input value={productForm.imageUrl} onChange={(event) => setProductForm({ ...productForm, imageUrl: event.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Maximo de sabores">
              <input
                min="1"
                type="number"
                value={productForm.maxFlavors}
                onChange={(event) => setProductForm({ ...productForm, maxFlavors: event.target.value })}
              />
            </Field>
            <Field label="Disponivel das">
              <input
                type="time"
                value={productForm.availableFrom}
                onChange={(event) => setProductForm({ ...productForm, availableFrom: event.target.value })}
              />
            </Field>
            <Field label="Ate">
              <input
                type="time"
                value={productForm.availableTo}
                onChange={(event) => setProductForm({ ...productForm, availableTo: event.target.value })}
              />
            </Field>
            <div className="field form-grid__full">
              <span>Importar para categorias</span>
              <div className="category-checkbox-list">
                {categories.map((category) => {
                  const isPrimary = productForm.category === category.name
                  const isChecked = isPrimary || (productForm.extraCategories || []).includes(category.name)

                  return (
                    <label className={isPrimary ? 'is-disabled' : ''} key={category.id}>
                      <input
                        checked={isChecked}
                        disabled={isPrimary}
                        type="checkbox"
                        onChange={(event) => {
                          const currentExtras = productForm.extraCategories || []
                          setProductForm({
                            ...productForm,
                            extraCategories: event.target.checked
                              ? [...currentExtras, category.name]
                              : currentExtras.filter((extraCategory) => extraCategory !== category.name),
                          })
                        }}
                      />
                      <span>{category.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'importProducts') {
      const targetCategory = payload?.category || ''
      const sourceCategories = categories.filter((category) => category.name !== targetCategory)
      const importableProducts = products.filter((product) =>
        product.category === importProductsForm.sourceCategory && !productAppearsInCategory(product, targetCategory),
      )

      return (
        <Modal
          title={`Importar de`}
          subtitle={targetCategory ? `Trazer itens para ${targetCategory} sem duplicar cadastro.` : 'Importar itens entre categorias.'}
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" form="import-products-form" type="submit">Importar</Button>
            </>
          }
        >
          <form className="form-grid" id="import-products-form" onSubmit={(event) => importProductsToCategory(event, targetCategory)}>
            <Field label="Importar de">
              <select
                value={importProductsForm.sourceCategory}
                onChange={(event) => setImportProductsForm({ sourceCategory: event.target.value, productIds: [] })}
              >
                {sourceCategories.map((category) => <option key={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <div className="field form-grid__full">
              <span>Itens</span>
              <div className="category-checkbox-list">
                {importableProducts.length > 0 ? importableProducts.map((product) => (
                  <label key={product.id}>
                    <input
                      checked={importProductsForm.productIds.includes(product.id)}
                      type="checkbox"
                      onChange={(event) => {
                        const currentIds = importProductsForm.productIds
                        setImportProductsForm({
                          ...importProductsForm,
                          productIds: event.target.checked
                            ? [...currentIds, product.id]
                            : currentIds.filter((productId) => productId !== product.id),
                        })
                      }}
                    />
                    <span>{product.name}</span>
                  </label>
                )) : (
                  <span className="empty-modal">Nenhum item disponivel nessa categoria.</span>
                )}
              </div>
            </div>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'newFlavor' || modal.type === 'editFlavor') {
      const isEdit = modal.type === 'editFlavor'
      const flavorOwner = payload?.product
      const flavorEntity = getFlavorEntityLabel(flavorOwner, false)

      return (
        <Modal
          title={isEdit ? `Editar ${flavorEntity}` : `Novo ${flavorEntity}`}
          subtitle={flavorOwner ? `${flavorOwner.name} - ${isComboProduct(flavorOwner) ? 'configuracao de combo' : 'configuracao de sabores'}` : 'Cadastro local do cardapio.'}
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" form="flavor-form" type="submit">{isEdit ? 'Salvar' : 'Criar'}</Button>
            </>
          }
        >
          <form className="form-grid" id="flavor-form" onSubmit={(event) => saveFlavor(event, payload.productId, payload.flavor?.id || null)}>
            <Field label={isComboProduct(flavorOwner) ? 'Nome do subsabor' : 'Nome do sabor'}>
              <input value={flavorForm.name} onChange={(event) => setFlavorForm({ ...flavorForm, name: event.target.value })} placeholder={isComboProduct(flavorOwner) ? 'Ex: Pizza BBQ do combo' : 'Ex: Sabor especial'} />
            </Field>
            <Field label="Valor do sabor">
              <input value={flavorForm.price} onChange={(event) => setFlavorForm({ ...flavorForm, price: formatCurrencyTypingInput(event.target.value) })} placeholder="0,00" />
            </Field>
            <Field label="Status">
              <select value={flavorForm.active ? 'yes' : 'no'} onChange={(event) => setFlavorForm({ ...flavorForm, active: event.target.value === 'yes' })}>
                <option value="yes">Ativo</option>
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
            <Field label="Foto da secao">
              <input value={categoryForm.imageUrl} onChange={(event) => setCategoryForm({ ...categoryForm, imageUrl: event.target.value })} placeholder="https://..." />
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
      const hasFallbackCategory = categories.some((category) => category.id !== payload.id)

      return (
        <Modal
          title={`Apagar ${payload.name}`}
          subtitle={hasFallbackCategory ? 'Os produtos dessa categoria serao realocados para outra secao.' : 'Se esta for a ultima categoria, os itens vinculados tambem serao apagados.'}
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
              <input value={stockForm.cost} onChange={(event) => setStockForm({ ...stockForm, cost: formatCurrencyTypingInput(event.target.value) })} />
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
              <input value={financeForm.amount} onChange={(event) => setFinanceForm({ ...financeForm, amount: formatCurrencyTypingInput(event.target.value) })} placeholder="120,00" />
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
        <Modal
          title={`NFC-e ${payload.orderId}`}
          subtitle={payload.status}
          onClose={closeModal}
          footer={<Button variant="primary" onClick={() => printInvoiceRecord(payload)}>Imprimir NFC-e</Button>}
        >
          <div className="invoice-preview">
            <strong>{storeProfile.name || 'MeuCardapio'}</strong>
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
          subtitle="Cria um acesso de mesa para autoatendimento."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Cancelar</Button><Button variant="primary" form="qr-form" type="submit">Gerar QR</Button></>}
        >
          <form className="form-grid" id="qr-form" onSubmit={(event) => { event.preventDefault(); createQrCode() }}>
            <Field label="Mesa">
              <input data-testid="qr-table" value={qrForm.table} onChange={(event) => setQrForm({ ...qrForm, table: event.target.value })} />
            </Field>
            <Field label="Codigo interno">
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
            <small>Autoatendimento da mesa</small>
            <Button variant="primary" onClick={() => printQrCode(payload)}>Imprimir</Button>
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
      const setupStatus = [
        { id: 'menu', title: 'Cardapio e QR', done: products.filter(isProductAvailable).length > 0 },
        { id: 'channels', title: 'Marketplaces e social', done: integrations.some((integration) => integration.active) },
        { id: 'cash', title: 'Pagamento e caixa', done: cashOpen || finance.length > 0 },
      ]

      return (
        <Modal
          title="Ajuda de integracoes"
          subtitle="Checklist local para marketplaces, anuncios e pagamento online."
          onClose={closeModal}
          footer={<><Button onClick={closeModal}>Fechar</Button><Button variant="primary" onClick={exportAppBackup}>Exportar backup</Button></>}
        >
          <div className="stack-list">
            {setupStatus.map((step) => (
              <article className="list-row" key={step.id}>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.done ? 'Pronto para demonstracao' : 'Ainda precisa de setup visual'}</small>
                </span>
                <StatusBadge tone={step.done ? 'success' : 'warning'}>{step.done ? 'OK' : 'Pendente'}</StatusBadge>
              </article>
            ))}
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
      const cashSessionOrders = cashOpenedAt ? orders.filter((order) => isRecordInRange(order, parseRecordDate(cashOpenedAt), null)) : orders
      const cashSessionFinance = cashOpenedAt ? finance.filter((item) => isRecordInRange(item, parseRecordDate(cashOpenedAt), null)) : finance
      const paidEntries = cashSessionFinance.filter((item) => item.status === 'Pago')
      const cashEntries = cashSessionOrders.filter((order) => order.payment === 'Dinheiro').reduce((sum, order) => sum + order.total, 0)
      const cardEntries = cashSessionOrders.filter((order) => order.payment === 'Cartao').reduce((sum, order) => sum + order.total, 0)
      const splitEntries = cashSessionOrders.filter((order) => order.payment === 'Dividir').reduce((sum, order) => sum + order.total, 0)

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
                  const nextCashOpen = !cashOpen
                  setCashOpen(nextCashOpen)
                  setCashOpenedAt(nextCashOpen ? nowDateTime() : '')
                  notify(cashOpen ? 'Caixa fechado.' : 'Caixa aberto.')
                  closeModal()
                }}
              >
                {cashOpen ? 'Fechar caixa' : 'Abrir caixa'}
              </Button>
            </>
          }
        >
          <div className="stack-list">
            <div className="modal-summary">
              <span>Status atual</span>
              <strong>{cashOpen ? 'Aberto para vendas' : 'Fechado para conferencia'}</strong>
              <p>{cashOpen && cashOpenedAt ? `Valores desde a abertura em ${cashOpenedAt}.` : 'Abra o caixa para iniciar uma nova conferencia de turno.'}</p>
            </div>
            <article className="list-row">
              <span>
                <strong>Dinheiro no caixa</strong>
                <small>Estimativa do turno presencial</small>
              </span>
              <b>{formatCurrency(cashEntries)}</b>
            </article>
            <article className="list-row">
              <span>
                <strong>Pagamento dividido</strong>
                <small>Pedidos combinando mais de uma forma de pagamento</small>
              </span>
              <b>{formatCurrency(splitEntries)}</b>
            </article>
            <article className="list-row">
              <span>
                <strong>Cartao processado</strong>
                <small>Conferencia de operadora no fechamento</small>
              </span>
              <b>{formatCurrency(cardEntries)}</b>
            </article>
            <article className="list-row">
              <span>
                <strong>Lancamentos pagos</strong>
                <small>{paidEntries.length} registro(s) prontos para conciliacao</small>
              </span>
              <b>{formatCurrency(paidEntries.reduce((sum, item) => sum + item.amount, 0))}</b>
            </article>
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
              <select
                value={settings.autoPrint ? 'yes' : 'no'}
                onChange={(event) => setSettings({ ...settings, autoPrint: event.target.value === 'yes', printer: event.target.value === 'yes' })}
              >
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

    if (modal.type === 'storeStatus') {
      return (
        <Modal
          title="Status da loja"
          subtitle="Controle separado do caixa para abrir ou fechar o atendimento."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Fechar janela</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setStoreOpen((current) => !current)
                  notify(storeOpen ? 'Loja fechada para novos pedidos.' : 'Loja aberta para atendimento.')
                  closeModal()
                }}
              >
                {storeOpen ? 'Fechar loja' : 'Abrir loja'}
              </Button>
            </>
          }
        >
          <div className="stack-list">
            <div className="modal-summary">
              <span>Status atual</span>
              <strong>{storeOpen ? 'Recebendo pedidos' : 'Loja pausada'}</strong>
              <p>Use este controle para ligar ou desligar a operacao sem alterar o caixa.</p>
            </div>
            <article className="list-row">
              <span>
                <strong>Horario configurado</strong>
                <small>{storeProfile.schedule}</small>
              </span>
              <StatusBadge tone={storeOpen ? 'success' : 'danger'}>{storeOpen ? 'Aberta' : 'Fechada'}</StatusBadge>
            </article>
            <article className="list-row">
              <span>
                <strong>Canal principal</strong>
                <small>{storeProfile.phone} - {storeProfile.city}</small>
              </span>
              <small>{storeProfile.owner}</small>
            </article>
            <article className="list-row">
              <span>
                <strong>Caixa</strong>
                <small>Continua separado do status da loja.</small>
              </span>
              <StatusBadge tone={cashOpen ? 'success' : 'warning'}>{cashOpen ? 'Caixa aberto' : 'Caixa fechado'}</StatusBadge>
            </article>
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
      const mappedRoutes = orders
        .filter((order) => order.channel === 'delivery' && order.status !== 'completed')
        .map((order, index) => ({
          ...order,
          route: `Rota ${String.fromCharCode(65 + index)}`,
          eta: getOrderEta(order),
        }))

      return (
        <Modal title="Mapa de entregas" subtitle="Rotas abertas e enderecos verificados." onClose={closeModal}>
          <div className="stack-list">
            <DeliveryRouteMap routes={mappedRoutes} storeProfile={storeProfile} zones={deliveryZones} />
            {mappedRoutes.map((route) => (
              <article className="list-row" key={route.id}>
                <span>
                  <strong>{route.route} - #{route.id}</strong>
                  <small>{route.customer} - {route.deliveryZoneName || 'Sem zona'} - {route.courier || 'Sem entregador'} - ETA {route.eta}</small>
                </span>
                <SourceBadge source={getOrderSource(route)} />
              </article>
            ))}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'deliveryZones') {
      return (
        <Modal
          title="Zonas de entrega"
          subtitle="Regioes atendidas e taxa calculada automaticamente."
          onClose={closeModal}
          footer={<Button variant="primary" onClick={() => openModal('newDeliveryZone')}>Nova zona</Button>}
        >
          <div className="stack-list">
            {deliveryZones.map((zone) => (
              <article className="list-row delivery-zone-row" key={zone.id}>
                <span>
                  <strong><i className="delivery-zone-color" style={{ backgroundColor: zone.color || DELIVERY_ZONE_COLORS[0] }} />{zone.name}</strong>
                  <small>{formatCurrency(parseCurrencyInput(zone.fee))} - {zone.polygon.length - 1} ponto(s)</small>
                </span>
                <StatusBadge tone={zone.active ? 'success' : 'muted'}>{zone.active ? 'Ativa' : 'Off'}</StatusBadge>
                <Button onClick={() => toggleDeliveryZone(zone.id)}>{zone.active ? 'Pausar' : 'Ativar'}</Button>
                <Button onClick={() => openModal('editDeliveryZone', zone)}>Editar</Button>
                <Button variant="danger" onClick={() => openModal('deleteDeliveryZone', zone)}>Apagar</Button>
              </article>
            ))}
          </div>
        </Modal>
      )
    }

    if (modal.type === 'newDeliveryZone' || modal.type === 'editDeliveryZone') {
      const isEdit = modal.type === 'editDeliveryZone'
      const zoneCenter = isEdit && payload
        ? getDeliveryMapCenter({ storeProfile, zones: [payload] })
        : getStoreCoordinates(storeProfile)
      const visibleZones = deliveryZones.filter((zone) => zone.id !== editingDeliveryZoneId)

      return (
        <Modal
          title={isEdit ? `Editar ${payload.name}` : 'Nova zona de entrega'}
          subtitle={deliveryZoneStep === 1 ? 'Defina nome, taxa e cor da area.' : 'Clique no mapa para marcar os pontos da area.'}
          onClose={() => setModal({ type: 'deliveryZones', payload: null })}
          footer={
            deliveryZoneStep === 1 ? (
              <>
                <Button onClick={() => setModal({ type: 'deliveryZones', payload: null })}>Cancelar</Button>
                <Button variant="primary" onClick={advanceDeliveryZoneToMap}>Avancar para o mapa</Button>
              </>
            ) : (
              <>
                <Button onClick={() => { setDeliveryZoneFeedback(''); setDeliveryZoneStep(1) }}>Voltar</Button>
                <Button variant="primary" onClick={() => saveDeliveryZone(isEdit ? payload.id : null)}>Salvar zona</Button>
              </>
            )
          }
        >
          {deliveryZoneFeedback ? (
            <div className="delivery-zone-feedback" role="alert">
              {deliveryZoneFeedback}
            </div>
          ) : null}
          {deliveryZoneStep === 1 ? (
            <div className="form-grid">
              <Field label="Nome da zona">
                <input value={deliveryZoneForm.name} onChange={(event) => { setDeliveryZoneFeedback(''); setDeliveryZoneForm({ ...deliveryZoneForm, name: event.target.value }) }} placeholder="Centro" />
              </Field>
              <Field label="Taxa">
                <input inputMode="decimal" value={deliveryZoneForm.fee} onChange={(event) => { setDeliveryZoneFeedback(''); setDeliveryZoneForm({ ...deliveryZoneForm, fee: formatCurrencyTypingInput(event.target.value) }) }} placeholder="5,00" />
              </Field>
              <Field label="Status">
                <select value={deliveryZoneForm.active} onChange={(event) => { setDeliveryZoneFeedback(''); setDeliveryZoneForm({ ...deliveryZoneForm, active: event.target.value }) }}>
                  <option value="yes">Ativa</option>
                  <option value="no">Off</option>
                </select>
              </Field>
              <label className="field">
                <span>Cor</span>
                <div className="color-swatch-row">
                  {DELIVERY_ZONE_COLORS.map((color) => (
                    <button
                      className={deliveryZoneForm.color === color ? 'is-active' : ''}
                      key={color}
                      style={{ backgroundColor: color }}
                      type="button"
                      onClick={() => { setDeliveryZoneFeedback(''); setDeliveryZoneForm({ ...deliveryZoneForm, color }) }}
                    />
                  ))}
                </div>
              </label>
            </div>
          ) : (
            <div className="delivery-zone-editor">
              <div className="delivery-zone-editor__toolbar">
                <div className="delivery-zone-editor__status">
                  <strong>{deliveryZonePoints.length} ponto(s) marcados</strong>
                  <small>
                    {selectedDeliveryZonePointIndex === null
                      ? 'Clique em um ponto para selecionar e arraste para ajustar.'
                      : `Ponto ${selectedDeliveryZonePointIndex + 1} selecionado.`}
                  </small>
                </div>
                <div>
                  <Button
                    onClick={() => {
                      setDeliveryZoneFeedback('')
                      setSelectedDeliveryZonePointIndex(null)
                      setDeliveryZonePoints((current) => current.slice(0, -1))
                    }}
                  >
                    Desfazer ponto
                  </Button>
                  <Button onClick={trimDeliveryZoneFromSelectedPoint}>Cortar daqui</Button>
                  <Button onClick={removeSelectedDeliveryZonePoint}>Remover ponto</Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDeliveryZoneFeedback('')
                      setSelectedDeliveryZonePointIndex(null)
                      setDeliveryZonePoints([])
                    }}
                  >
                    Limpar area
                  </Button>
                </div>
              </div>
              <OsmDeliveryMap
                center={zoneCenter}
                editingZoneId={editingDeliveryZoneId || ''}
                editorPoints={deliveryZonePoints}
                onMapClick={(point) => {
                  setDeliveryZoneFeedback('')
                  setSelectedDeliveryZonePointIndex(null)
                  setDeliveryZonePoints((current) => [...current, point])
                }}
                onMoveEditorPoint={updateDeliveryZonePoint}
                onSelectEditorPoint={setSelectedDeliveryZonePointIndex}
                selectedEditorPointIndex={selectedDeliveryZonePointIndex}
                storeProfile={storeProfile}
                title="Editor de zona de entrega"
                zones={visibleZones}
                zoom={14}
              />
              <small className="delivery-zone-editor__hint">Clique para criar novos pontos. Clique em um ponto existente para selecionar, arraste para corrigir e use "Cortar daqui" para continuar o desenho a partir do meio.</small>
            </div>
          )}
        </Modal>
      )
    }

    if (modal.type === 'deleteDeliveryZone') {
      return (
        <Modal
          title={`Apagar ${payload.name}`}
          subtitle="Enderecos novos deixam de usar esta regiao."
          onClose={() => setModal({ type: 'deliveryZones', payload: null })}
          footer={<><Button onClick={() => setModal({ type: 'deliveryZones', payload: null })}>Cancelar</Button><Button variant="danger" onClick={() => deleteDeliveryZone(payload.id)}>Apagar zona</Button></>}
        >
          <div className="modal-summary">
            <span>Zona</span>
            <strong>{payload.name}</strong>
            <p>Taxa atual: {formatCurrency(parseCurrencyInput(payload.fee))}</p>
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

    if (modal.type === 'pilot') {
      const pilotStatus = getPilotStatusMeta(pilotSync)
      const pendingSyncOrders = orders.filter((order) => !order.backendId || order.syncStatus === 'pending' || order.syncStatus === 'failed')
      const syncedOrders = orders.filter((order) => order.backendId && order.syncStatus !== 'pending' && order.syncStatus !== 'failed')
      const pilotChecklist = [
        {
          label: 'Loja cadastrada',
          ok: isStoreConfigured(storeProfile),
          detail: storeProfile.tradeName || storeProfile.name || 'Complete os dados da loja',
        },
        {
          label: 'Backend respondendo',
          ok: pilotSync.enabled && pilotSync.status === 'online',
          detail: pilotSync.message,
        },
        {
          label: 'Pedidos com fallback local',
          ok: true,
          detail: `${orders.length} pedido(s) salvos no navegador`,
        },
        {
          label: 'Impressao revisada',
          ok: printerConfig.connected && printerConfig.deviceName,
          detail: printerConfig.connected ? printerConfig.deviceName : 'Impressora desconectada',
        },
      ]

      return (
        <Modal
          title="Modo piloto controlado"
          subtitle="Backend, backup, logs e fila de pedidos para teste real acompanhado."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={exportOrdersCsvFile}>CSV pedidos</Button>
              <Button onClick={exportAppBackup}>Backup JSON</Button>
              <Button variant="primary" onClick={syncPendingOrders}>Sincronizar pendentes</Button>
            </>
          }
        >
          <div className="pilot-layout">
            <section className="pilot-panel pilot-panel--status">
              <header className="pilot-panel__header">
                <div>
                  <strong>Conexao da API</strong>
                  <small>{API_BASE_URL}</small>
                </div>
                <StatusBadge tone={pilotStatus.tone}>{pilotStatus.label}</StatusBadge>
              </header>

              <div className="pilot-grid">
                <div>
                  <span>Loja API</span>
                  <strong>{pilotSync.storeName || 'Nao vinculada'}</strong>
                  <small>{pilotSync.storeId || 'Sem storeId carregado'}</small>
                </div>
                <div>
                  <span>Ultimo teste</span>
                  <strong>{pilotSync.lastCheckedAt || '-'}</strong>
                  <small>{pilotSync.message}</small>
                </div>
                <div>
                  <span>Ultimo sync</span>
                  <strong>{pilotSync.lastSyncedAt || '-'}</strong>
                  <small>{syncedOrders.length} pedido(s) com backend</small>
                </div>
                <div>
                  <span>Pendentes</span>
                  <strong>{pendingSyncOrders.length}</strong>
                  <small>Reenvio manual disponivel</small>
                </div>
              </div>

              <div className="pilot-actions">
                <Button variant="primary" onClick={connectPilotSync}>Ligar piloto</Button>
                <Button onClick={quickHealthCheck}>Checar API</Button>
                <Button onClick={sendPilotLog}>Log teste</Button>
                <Button variant="danger" onClick={disablePilotSync}>Desligar</Button>
              </div>

              <form className="pilot-switches">
                <Field label="Sincronizar novos pedidos">
                  <select
                    value={pilotSync.autoSyncOrders ? 'yes' : 'no'}
                    onChange={(event) => updatePilotSync({ autoSyncOrders: event.target.value === 'yes' })}
                  >
                    <option value="yes">Automaticamente</option>
                    <option value="no">Manual</option>
                  </select>
                </Field>
                <Field label="Sincronizar mudanca de status">
                  <select
                    value={pilotSync.syncOnStatusChange ? 'yes' : 'no'}
                    onChange={(event) => updatePilotSync({ syncOnStatusChange: event.target.value === 'yes' })}
                  >
                    <option value="yes">Automaticamente</option>
                    <option value="no">Manual</option>
                  </select>
                </Field>
              </form>
            </section>

            <section className="pilot-panel">
              <header className="pilot-panel__header">
                <div>
                  <strong>Checklist do teste</strong>
                  <small>Use antes de abrir pedidos reais.</small>
                </div>
              </header>
              <div className="stack-list">
                {pilotChecklist.map((item) => (
                  <article className="list-row" key={item.label}>
                    <Icon name={item.ok ? 'check' : 'bell'} size={18} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <StatusBadge tone={item.ok ? 'success' : 'warning'}>{item.ok ? 'OK' : 'Revisar'}</StatusBadge>
                  </article>
                ))}
              </div>
            </section>

            <section className="pilot-panel pilot-panel--queue">
              <header className="pilot-panel__header">
                <div>
                  <strong>Fila de sincronizacao</strong>
                  <small>Pedidos sem backend ou com falha aparecem aqui.</small>
                </div>
                <Button variant="primary" onClick={syncPendingOrders}>Reenviar</Button>
              </header>
              <div className="stack-list">
                {pendingSyncOrders.slice(0, 8).map((order) => {
                  const syncMeta = getOrderSyncMeta(order)

                  return (
                    <article className="list-row" key={order.id}>
                      <span>
                        <strong>#{order.id} - {order.customer}</strong>
                        <small>{syncMeta.description}</small>
                      </span>
                      <StatusBadge tone={syncMeta.tone}>{syncMeta.label}</StatusBadge>
                      <Button onClick={() => syncSingleOrderToBackend(order)}>Enviar</Button>
                    </article>
                  )
                })}
                {pendingSyncOrders.length === 0 ? <div className="empty-modal">Nenhum pedido pendente de API.</div> : null}
              </div>
            </section>
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

    if (modal.type === 'configureCartItem' || modal.type === 'editCartItem') {
      const product = products.find((item) => item.id === payload.productId)

      if (!product) {
        return (
          <Modal
            title="Item indisponivel"
            subtitle="O produto nao esta mais disponivel para este pedido."
            onClose={reopenOrderEditor}
            footer={<Button onClick={reopenOrderEditor}>Voltar</Button>}
          >
            <div className="empty-modal">Produto nao encontrado no cardapio.</div>
          </Modal>
        )
      }

      const isEdit = modal.type === 'editCartItem'
      const activeFlavors = getActiveProductFlavors(product)
      const selectedFlavorCount = cartItemForm.flavorIds.length
      const flavorEntity = getFlavorEntityLabel(product, true)
      const flavorLimit = Math.max(1, Number(product.maxFlavors) || 1)
      const unitPrice = getCartItemUnitPrice(product, cartItemForm.flavorIds)

      return (
        <Modal
          title={isEdit ? `Editar ${product.name}` : `Adicionar ${product.name}`}
          subtitle={activeFlavors.length > 0 ? `Escolha de 1 a ${flavorLimit} ${flavorEntity}.` : 'Ajuste a quantidade deste item no pedido.'}
          onClose={reopenOrderEditor}
          footer={
            <>
              <Button onClick={reopenOrderEditor}>Cancelar</Button>
              <Button variant="primary" form="cart-item-form" type="submit">{isEdit ? 'Salvar item' : 'Adicionar ao pedido'}</Button>
            </>
          }
        >
          <form className="stack-list" id="cart-item-form" onSubmit={saveOrderCartItem}>
            <div className="modal-summary">
              <span>Item</span>
              <strong>{product.name}</strong>
              <p>{formatCurrency(unitPrice)} por unidade.</p>
            </div>

            {activeFlavors.length > 0 ? (
              <section className="cart-config">
                <header className="cart-config__header">
                  <strong>{isComboProduct(product) ? 'Escolha os subsabores' : 'Escolha os sabores'}</strong>
                  <small>{selectedFlavorCount} selecionado(s) de no maximo {flavorLimit}</small>
                </header>
                <div className="cart-config__list">
                  {activeFlavors.map((flavor) => {
                    const selectedCount = cartItemForm.flavorIds.filter((flavorId) => flavorId === flavor.id).length
                    const isSelected = selectedCount > 0
                    const allowsRepeatedFlavor = flavorLimit > 1
                    const canAddRepeatedFlavor = cartItemForm.flavorIds.length < flavorLimit

                    if (allowsRepeatedFlavor) {
                      return (
                        <article
                          className={`cart-config__option cart-config__option--quantity ${isSelected ? 'is-active' : ''}`.trim()}
                          data-testid={`cart-flavor-${flavor.id}`}
                          key={flavor.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => canAddRepeatedFlavor && toggleCartItemFlavor(flavor.id, flavorLimit, product)}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && canAddRepeatedFlavor) {
                              event.preventDefault()
                              toggleCartItemFlavor(flavor.id, flavorLimit, product)
                            }
                          }}
                        >
                          <span>
                            <strong>{flavor.name}</strong>
                            <small>{flavor.price > 0 ? formatCurrency(flavor.price) : 'R$ 0,00'}</small>
                          </span>
                          <div className="cart-config__stepper" onClick={(event) => event.stopPropagation()}>
                            <button
                              aria-label={`Remover ${flavor.name}`}
                              disabled={selectedCount <= 0}
                              type="button"
                              onClick={() => removeCartItemFlavor(flavor.id)}
                            >
                              -
                            </button>
                            <b>{selectedCount}</b>
                            <button
                              aria-label={`Adicionar ${flavor.name}`}
                              disabled={!canAddRepeatedFlavor}
                              type="button"
                              onClick={() => toggleCartItemFlavor(flavor.id, flavorLimit, product)}
                            >
                              +
                            </button>
                          </div>
                          <small className="cart-config__limit">Maximo {flavorLimit}</small>
                        </article>
                      )
                    }

                    return (
                      <button
                        className={`cart-config__option ${isSelected ? 'is-active' : ''}`.trim()}
                        data-testid={`cart-flavor-${flavor.id}`}
                        key={flavor.id}
                        type="button"
                        onClick={() => toggleCartItemFlavor(flavor.id, flavorLimit, product)}
                      >
                        <span>
                          <strong>{flavor.name}</strong>
                          <small>{flavor.price > 0 ? `+${formatCurrency(flavor.price)}` : 'Sem adicional'}</small>
                        </span>
                        <b>{isSelected ? 'Selecionado' : 'Selecionar'}</b>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            <Field label={isComboProduct(product) ? 'Quantidade do combo' : 'Quantidade'}>
              <input
                data-testid="cart-item-qty"
                min="1"
                type="number"
                value={cartItemForm.qty}
                onChange={(event) => setCartItemForm({ ...cartItemForm, qty: event.target.value })}
              />
            </Field>

            {isEdit ? (
              <div className="modal-actions">
                <Button variant="danger" onClick={() => { removeOrderCart(payload.id); reopenOrderEditor() }}>Remover item</Button>
              </div>
            ) : null}
          </form>
        </Modal>
      )
    }

    if (modal.type === 'orderDetails') {
      const normalizedOrder = normalizeOrderRecord(payload)
      const financialBreakdown = getOrderFinancialBreakdown(normalizedOrder.subtotal, normalizedOrder)

      return (
        <Modal
          title={`Pedido #${payload.id}`}
          subtitle={payload.customer}
          onClose={closeModal}
          footer={
            <>
              <Button onClick={() => printOrderTicket(normalizedOrder, 'kitchen')}>Cozinha</Button>
              <Button onClick={() => printOrderTicket(normalizedOrder, 'dispatch')}>Expedicao</Button>
              <Button variant="primary" onClick={() => printOrderTicket(normalizedOrder, 'order')}>Imprimir pedido</Button>
            </>
          }
        >
          <div className="order-detail">
            <div><span>Origem</span><strong>{getOrderSource(normalizedOrder)}</strong></div>
            <div><span>Status</span><strong>{getOrderStageLabel(normalizedOrder.status || 'analysis')} - ETA {getOrderEta(normalizedOrder)}</strong></div>
            <div><span>Contato</span><strong>{normalizedOrder.phone}</strong></div>
            <div><span>Forma de entrega</span><strong>{getOrderFulfillmentLabel(normalizedOrder.fulfillment)}</strong></div>
            <div><span>Endereco / referencia</span><strong>{normalizedOrder.address}</strong></div>
            {normalizedOrder.deliveryZoneName ? <div><span>Zona</span><strong>{normalizedOrder.deliveryZoneName}</strong></div> : null}
            <div><span>Pagamento</span><strong>{normalizedOrder.payment}</strong></div>
            <div><span>Subtotal</span><strong>{formatCurrency(financialBreakdown.subtotal)}</strong></div>
            <div><span>Entrega</span><strong>{financialBreakdown.deliveryFee > 0 ? formatCurrency(financialBreakdown.deliveryFee) : 'Gratis'}</strong></div>
            <div><span>Desconto</span><strong>{financialBreakdown.discountAmount > 0 ? formatCurrency(financialBreakdown.discountAmount) : 'R$ 0,00'}</strong></div>
            <div><span>Acrescimo</span><strong>{financialBreakdown.surchargeAmount > 0 ? formatCurrency(financialBreakdown.surchargeAmount) : 'R$ 0,00'}</strong></div>
            <div><span>Total</span><strong>{formatCurrency(financialBreakdown.total)}</strong></div>
            {normalizedOrder.document ? <div><span>CPF/CNPJ</span><strong>{normalizedOrder.document}</strong></div> : null}
            <div><span>Itens</span><strong>{normalizedOrder.items.join(', ')}</strong></div>
            <div><span>Observacao</span><strong>{normalizedOrder.note}</strong></div>
            <DeliveryAddressMap address={normalizedOrder} title={`Mapa do pedido ${payload.id}`} />
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
      const normalizedOrder = normalizeOrderRecord(payload)
      const financialBreakdown = getOrderFinancialBreakdown(normalizedOrder.subtotal, normalizedOrder)

      return (
        <Modal title={`Nota fiscal #${payload.id}`} subtitle="Pre-visualizacao fake da NF." onClose={closeModal}>
          <div className="invoice-preview">
            <strong>{storeProfile.name || 'MeuCardapio'}</strong>
            <span>Cliente: {normalizedOrder.customer}</span>
            <span>Entrega: {getOrderFulfillmentLabel(normalizedOrder.fulfillment)}</span>
            <span>Pagamento: {normalizedOrder.payment}</span>
            {normalizedOrder.document ? <span>CPF/CNPJ: {normalizedOrder.document}</span> : null}
            <span>Itens: {normalizedOrder.items.join(', ')}</span>
            <span>Subtotal: {formatCurrency(financialBreakdown.subtotal)}</span>
            <span>Entrega: {financialBreakdown.deliveryFee > 0 ? formatCurrency(financialBreakdown.deliveryFee) : 'Gratis'}</span>
            <span>Desconto: {financialBreakdown.discountAmount > 0 ? formatCurrency(financialBreakdown.discountAmount) : 'R$ 0,00'}</span>
            <span>Acrescimo: {financialBreakdown.surchargeAmount > 0 ? formatCurrency(financialBreakdown.surchargeAmount) : 'R$ 0,00'}</span>
            <span>Total: {formatCurrency(financialBreakdown.total)}</span>
            <Button
              variant="primary"
              onClick={() => {
                printInvoiceForOrder(normalizedOrder)
                closeModal()
              }}
            >
              Imprimir NFC-e
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

    if (modal.type === 'whatsappSetup') {
      const whatsappStoreId = pilotSync.storeId || (/^[0-9a-f-]{36}$/i.test(String(activeStoreId || '')) ? activeStoreId : '')

      return (
        <Modal title="Conectar WhatsApp" subtitle="Credenciais e sessao WaSenderAPI." onClose={closeModal}>
          <WhatsappSetupPanel storeId={whatsappStoreId} />
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
                <strong>Itens esgotados</strong>
                <small>{products.filter((product) => !isProductAvailable(product)).length} item(ns) indisponiveis</small>
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

    if (modal.type === 'publicProfile') {
      const publicStoreName = storeProfile.name || storeProfile.tradeName || 'Minha loja'
      const publicStoreCategory = storeProfile.category || 'Cardapio digital'
      const publicStoreAddress = [
        storeProfile.street,
        storeProfile.number,
        storeProfile.district,
        storeProfile.cityName || storeProfile.city,
      ].filter(Boolean).join(', ')
      const shareText = `Faca seu pedido no cardapio digital da ${publicStoreName}: ${storefrontUrl || ''}`
      const whatsappShareUrl = storefrontUrl
        ? `https://wa.me/?text=${encodeURIComponent(shareText)}`
        : ''
      const accessQrUrl = buildQrImageUrl(storeAccessUrl)

      return (
        <Modal title="Perfil publico da loja" subtitle="Link unico do cardapio digital para enviar aos clientes." onClose={closeModal}>
          <section className="public-profile-share">
            <div className="public-profile-share__hero">
              <div className="public-profile-share__phone">
                <span />
                <strong>{publicStoreName}</strong>
                <small>{storeOpen ? 'Aberta para pedidos' : 'Pausada agora'}</small>
              </div>
            </div>

            <div className="public-profile-share__content">
              <div className="public-profile-share__title">
                <strong>O link do seu Cardapio Digital</strong>
                <span>Copie o link e cole onde quiser para compartilhar.</span>
              </div>

              <div className="public-profile-share__link">
                {storefrontUrl || 'Vincule a loja ao backend para gerar o link publico.'}
              </div>

              <div className="public-profile-share__actions">
                <a className={`btn ${whatsappShareUrl ? '' : 'is-disabled'}`.trim()} href={whatsappShareUrl || undefined} target="_blank" rel="noreferrer" aria-disabled={!whatsappShareUrl}>
                  <Icon name="message" size={18} />
                  Enviar link
                </a>
                <Button variant="primary" disabled={!storefrontUrl} onClick={copyStorefrontShareUrl}>
                  Copiar
                </Button>
              </div>

              {storefrontUrl ? (
                <a className="public-profile-share__open" href={storefrontUrl} target="_blank" rel="noreferrer">
                  <Icon name="arrow" size={15} />
                  Abrir cardapio
                </a>
              ) : null}

              <div className="public-profile-share__title">
                <strong>Acesso da loja</strong>
                <span>Use este link em outro dispositivo para entrar direto nesta loja.</span>
              </div>

              <div className="public-profile-share__link">
                {storeAccessUrl || 'Cadastre uma chave unica nos dados da loja.'}
              </div>

              <div className="public-profile-share__actions">
                <Button disabled={!storeAccessUrl} onClick={copyStoreAccessUrl}>
                  Copiar acesso
                </Button>
                {storeAccessUrl ? (
                  <a className="btn" href={storeAccessUrl} target="_blank" rel="noreferrer">
                    <Icon name="arrow" size={15} />
                    Abrir acesso
                  </a>
                ) : null}
              </div>

              <div className="public-profile-share__card">
                <div className="public-profile-share__qr" aria-hidden="true">
                  {accessQrUrl ? <img alt="" src={accessQrUrl} /> : Array.from({ length: 25 }, (_, index) => (
                    <span key={index} className={index % 2 === 0 || index % 7 === 0 ? 'is-dark' : ''} />
                  ))}
                </div>
                <span>
                  <strong>{storeAccessUrl ? 'QR DE ACESSO DA LOJA' : 'CARDAPIO DIGITAL PARA REDES SOCIAIS'}</strong>
                  <small>{publicStoreCategory}</small>
                  <small>{storeAccessUrl || publicStoreAddress || storeProfile.phone || 'Perfil publico da loja'}</small>
                </span>
              </div>
            </div>
          </section>
        </Modal>
      )
    }

    if (modal.type === 'store') {
      return (
        <Modal
          title="Dados da loja"
          subtitle="Cadastro comercial, fiscal, atendimento e localizacao da loja."
          onClose={closeModal}
          footer={
            <>
              <Button variant="danger" onClick={() => openModal('deleteStore')}>Apagar loja</Button>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="primary" form="store-form" type="submit">Salvar loja</Button>
            </>
          }
        >
          <form id="store-form" onSubmit={saveStoreProfile}>
            <StoreProfileForm
              mapMode={storeMapMode}
              mapSlot={(
                <>
                  <OsmDeliveryMap
                    center={getStoreCoordinates(storeForm)}
                    onMapClick={storeMapMode === 'pick' ? handleStoreMapPick : undefined}
                    storeProfile={storeForm}
                    title="Mapa da loja"
                    zones={deliveryZones}
                    zoom={14}
                  />
                  {storeMapMode === 'pick' ? <small className="delivery-zone-editor__hint">Clique no mapa para posicionar a loja.</small> : null}
                </>
              )}
              mapStatus={storeAddressLookup.message || (storeForm.lat && storeForm.lng ? `Mapa usando ${formatCoordinate(storeForm.lat)}, ${formatCoordinate(storeForm.lng)}` : 'Localize a loja para centralizar as areas de entrega.')}
              mapTone={storeAddressLookup.status}
              onChange={handleStoreFormChange}
              onToggleMapPicking={toggleStoreMapPicking}
              onUseCurrentLocation={useCurrentLocationForStore}
              onVerifyAddress={verifyStoreAddress}
              showHero={false}
              showMapTools
              value={storeForm}
            />
            <section className="settings-inline-panel">
              <header>
                <span>Acesso da loja</span>
                <strong>Link unico e QR</strong>
              </header>
              <div className="settings-inline-panel__grid">
                <Field label="Link liberado pela chave">
                  <input readOnly value={buildStoreAccessUrl(storeForm.accessKey)} placeholder="Gere ou preencha uma chave unica acima" />
                </Field>
                <Field label="Gerador">
                  <Button onClick={generateAccessKeyForStore} type="button">Gerar chave</Button>
                </Field>
              </div>
            </section>
            <section className="settings-inline-panel">
              <header>
                <span>Pedidos online</span>
                <strong>Aceite e impressao</strong>
              </header>
              <div className="settings-inline-panel__grid">
                <Field label="Aceitar pedidos automaticamente">
                  <select value={settings.autoAccept ? 'yes' : 'no'} onChange={(event) => setSettings({ ...settings, autoAccept: event.target.value === 'yes' })}>
                    <option value="yes">Sim, mandar direto para preparo</option>
                    <option value="no">Nao, revisar antes</option>
                  </select>
                </Field>
                <Field label="Imprimir automaticamente">
                  <select
                    value={settings.autoPrint ? 'yes' : 'no'}
                    onChange={(event) => setSettings({ ...settings, autoPrint: event.target.value === 'yes', printer: event.target.value === 'yes' })}
                  >
                    <option value="yes">Sim, imprimir ao receber</option>
                    <option value="no">Nao, imprimir manualmente</option>
                  </select>
                </Field>
              </div>
            </section>
          </form>
        </Modal>
      )
    }

    if (modal.type === 'register' || modal.type === 'reports') {
      return (
        <Modal
          title={modal.type === 'register' ? 'Conta e loja' : 'Central de dados'}
          subtitle="Dados da loja ativa, backup, importacao, exportacao e reinicio da base local."
          onClose={closeModal}
        >
          <div className="stack-list">
            <article className="list-row">
              <span>
                <strong>Ambiente demo</strong>
                <small>Reabre a loja demonstrativa local com um clique.</small>
              </span>
              <Button onClick={openDemoStore}>Testar demo</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Loja atual</strong>
                <small>{storeProfile.name || 'Sem cadastro'} - {storeProfile.city || 'Cidade nao definida'}</small>
              </span>
              <Button onClick={() => openModal('store')}>Editar</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Apagar loja atual</strong>
                <small>Remove o ambiente ativo deste navegador.</small>
              </span>
              <Button variant="danger" onClick={() => openModal('deleteStore')}>Apagar</Button>
            </article>
            <article className="list-row">
              <span>
                <strong>Exportar JSON</strong>
                <small>Salva os dados locais desta instalacao em um arquivo.</small>
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

    if (modal.type === 'deleteStore') {
      return (
        <Modal
          title="Apagar loja"
          subtitle="Essa acao remove o cadastro local e devolve o app para o primeiro acesso."
          onClose={closeModal}
          footer={
            <>
              <Button onClick={closeModal}>Cancelar</Button>
              <Button variant="danger" form="delete-store-form" type="submit">Apagar loja</Button>
            </>
          }
        >
          <StoreDeletePrompt
            onConfirm={() => {
              deleteStoreProfile()
              closeModal()
            }}
            storeName={storeProfile.name || 'Minha Loja'}
          />
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
      const normalizedPrinter = normalizePrinterConfig(printerConfig)
      const previewPrinter = printerFormToConfig(printerForm, normalizedPrinter)
      const previewPaper = getPrinterPaperOption(previewPrinter.paper)
      const previewFont = getPrinterFontOption(previewPrinter.fontFamily)
      const previewDensity = getPrinterDensityOption(previewPrinter.density)
      const previewDarkness = getPrinterDarknessOption(previewPrinter.darknessLevel)
      const previewOrder = createPrinterTestOrder()
      const previewDocument = {
        label: `Pedido teste #${previewOrder.id}`,
        type: 'Teste',
        title: `Pedido teste #${previewOrder.id}`,
        bodyHtml: buildOrderPrintBody(previewOrder, storeProfile, previewPrinter, 'order'),
      }

      return (
        <Modal
          title="Configuracao de comandas"
          subtitle="Layout da bobina, impressora, conteudo do ticket e pre-visualizacao."
          onClose={closeModal}
          footer={<><Button onClick={runPrinterTest}>Imprimir teste</Button><Button onClick={clearPrintQueue}>Limpar fila</Button><Button variant="primary" form="printer-form" type="submit">Salvar configuracao</Button></>}
        >
          <div className="printer-config-layout">
            <section className="printer-panel printer-panel--settings">
              <header className="printer-panel__header">
                <div>
                  <strong>Comanda</strong>
                  <small>{previewPrinter.paper} - {previewPrinter.copies} via(s) - fonte {previewPrinter.fontSize}px</small>
                </div>
                <StatusBadge tone={previewPrinter.connected ? 'success' : 'warning'}>
                  {previewPrinter.connected ? 'Conectada' : 'Desconectada'}
                </StatusBadge>
              </header>

              <form className="printer-settings-form" id="printer-form" onSubmit={savePrinterSettings}>
                <section className="printer-form-section">
                  <h3>Impressora</h3>
                  <div className="printer-form-grid">
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
                      <input min="1" max="5" type="number" value={printerForm.copies} onChange={(event) => setPrinterForm({ ...printerForm, copies: event.target.value })} />
                    </Field>
                    <Field label="Bobina">
                      <select value={printerForm.paper} onChange={(event) => setPrinterForm({ ...printerForm, paper: event.target.value })}>
                        {PRINTER_PAPER_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </section>

                <section className="printer-form-section">
                  <h3>Formato</h3>
                  <div className="printer-form-grid">
                    <Field label="Fonte">
                      <select value={printerForm.fontFamily} onChange={(event) => setPrinterForm({ ...printerForm, fontFamily: event.target.value })}>
                        {PRINTER_FONT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Tamanho da fonte">
                      <input min="9" max="18" type="number" value={printerForm.fontSize} onChange={(event) => setPrinterForm({ ...printerForm, fontSize: event.target.value })} />
                    </Field>
                    <Field label="Margem em mm">
                      <input min="0" max="12" type="number" value={printerForm.marginMm} onChange={(event) => setPrinterForm({ ...printerForm, marginMm: event.target.value })} />
                    </Field>
                    <Field label="Densidade">
                      <select value={printerForm.density} onChange={(event) => setPrinterForm({ ...printerForm, density: event.target.value })}>
                        {PRINTER_DENSITY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </Field>
                    <Field label={`Escuro do texto (${printerForm.darknessLevel}%)`}>
                      <input
                        className="printer-darkness-range"
                        max="100"
                        min="0"
                        step="1"
                        type="range"
                        value={printerForm.darknessLevel}
                        onChange={(event) => setPrinterForm({ ...printerForm, darknessLevel: event.target.value })}
                      />
                      <div className="printer-range-scale">
                        <span>Claro</span>
                        <span>Escuro</span>
                      </div>
                    </Field>
                  </div>
                </section>

                <section className="printer-form-section">
                  <h3>Conteudo</h3>
                  <div className="printer-form-grid">
                    <Field label="Linha de corte">
                      <select value={printerForm.cutPaper} onChange={(event) => setPrinterForm({ ...printerForm, cutPaper: event.target.value })}>
                        <option value="yes">Mostrar</option>
                        <option value="no">Ocultar</option>
                      </select>
                    </Field>
                    <Field label="Cabecalho da loja">
                      <select value={printerForm.showStoreHeader} onChange={(event) => setPrinterForm({ ...printerForm, showStoreHeader: event.target.value })}>
                        <option value="yes">Mostrar</option>
                        <option value="no">Ocultar</option>
                      </select>
                    </Field>
                    <Field label="Telefone do cliente">
                      <select value={printerForm.showCustomerPhone} onChange={(event) => setPrinterForm({ ...printerForm, showCustomerPhone: event.target.value })}>
                        <option value="yes">Mostrar</option>
                        <option value="no">Ocultar</option>
                      </select>
                    </Field>
                    <Field label="Valores do pedido">
                      <select value={printerForm.showFinancials} onChange={(event) => setPrinterForm({ ...printerForm, showFinancials: event.target.value })}>
                        <option value="yes">Mostrar</option>
                        <option value="no">Ocultar</option>
                      </select>
                    </Field>
                    <Field label="Observacoes">
                      <select value={printerForm.showNotes} onChange={(event) => setPrinterForm({ ...printerForm, showNotes: event.target.value })}>
                        <option value="yes">Mostrar</option>
                        <option value="no">Ocultar</option>
                      </select>
                    </Field>
                  </div>
                </section>
              </form>
            </section>

            <section className="printer-panel printer-panel--preview">
              <header className="printer-panel__header">
                <div>
                  <strong>Previa da comanda</strong>
                  <small>Atualiza enquanto voce configura.</small>
                </div>
                <Button variant="primary" onClick={runPrinterTest}>Imprimir teste</Button>
              </header>
              <div className="printer-preview-shell">
                <div
                  className="printer-preview-paper"
                  style={{
                    '--preview-paper-width': previewPrinter.paper === 'A4' ? '360px' : `${Math.min(360, Math.max(250, previewPaper.widthMm * 4.4))}px`,
                    '--preview-font-family': previewFont.family,
                    '--preview-font-size': `${previewPrinter.fontSize}px`,
                    '--preview-font-weight': previewDarkness.fontWeight,
                    '--preview-line-height': previewDensity.lineHeight,
                    '--preview-text-shadow': previewDarkness.textShadow,
                    '--preview-margin': `${Math.max(8, previewPrinter.marginMm * 3)}px`,
                  }}
                >
                  <div className="printer-preview-receipt" dangerouslySetInnerHTML={{ __html: previewDocument.bodyHtml }} />
                </div>
              </div>
            </section>

            <section className="printer-panel printer-panel--queue">
              <header className="printer-panel__header">
                <div>
                  <strong>Fila de impressao</strong>
                  <small>{normalizedPrinter.queue.length} item(ns) aguardando, impressos ou com falha</small>
                </div>
                <Button onClick={clearPrintQueue}>Limpar fila</Button>
              </header>
              <div className="empty-modal">
                A impressao abre a janela do navegador. Nela, selecione a impressora fisica, desative cabecalhos/rodapes e mantenha o tamanho da bobina configurado aqui.
              </div>
              <div className="stack-list">
                {normalizedPrinter.queue.map((job) => (
                  <article className="list-row" key={job.id}>
                    <span>
                      <strong>{job.label}</strong>
                      <small>{job.type} - {job.status} - {job.printedAt || job.createdAt}</small>
                    </span>
                    <div className="modal-actions">
                      <Button onClick={() => printQueuedJob(job)}>Imprimir</Button>
                      <Button variant="danger" onClick={() => completePrintJob(job.id)}>Remover</Button>
                    </div>
                  </article>
                ))}
                {normalizedPrinter.queue.length === 0 ? <div className="empty-modal">Nenhum item na fila.</div> : null}
              </div>
            </section>
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
              <select
                value={settings.autoPrint ? 'yes' : 'no'}
                onChange={(event) => setSettings({ ...settings, autoPrint: event.target.value === 'yes', printer: event.target.value === 'yes' })}
              >
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
      register: ['Conta e loja', 'Backup, demo e configuracoes locais desta conta.'],
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

  if (customerStoreId) {
    return (
      <CustomerStorefront
        localStore={customerStore}
        onCreateLocalOrder={createCustomerStorefrontOrder}
      />
    )
  }

  if (!hasValidStoreSession || !isStoreReady) {
    return (
      <StoreAccess
        key={activeStoreId || 'access'}
        demoAvailable={resolvedStores.some((store) => store.snapshot.storeUsers.some((user) => user.email === 'demo@meucardapio.local'))}
        initialAccessKey={storeAccessKeyFromPath}
        onCreateAccount={createOnlineStoreAccount}
        onLogin={loginStoreUser}
        onResetPassword={handlePasswordReset}
        onUseDemo={openDemoStore}
        users={storeUsers}
      />
    )
  }

  return (
    <main className="app-frame">
      <TopBar
        currentStoreUser={currentStoreUser}
        notificationCount={notificationCount}
        onLogout={logoutStoreUser}
        onOpenModal={openModal}
        pilotSync={pilotSync}
      />

      <div className="workspace">
        <Sidebar
          activeNav={activeNav}
          storeOpen={storeOpen}
          cashOpen={cashOpen}
          storeProfile={storeProfile}
          onOpenModal={openModal}
          onSetActiveNav={setActiveNav}
        />

        <section className="content">
          <div className="content__top">
            <div>
              <h1>{activeTitle}</h1>
              <p>{toast}</p>
            </div>
            <div className="content__top-actions">
              <Button onClick={() => openModal('publicProfile')}>
                <Icon name="store" size={18} />
                Perfil publico
              </Button>
              <Button variant="primary" onClick={() => openModal('newOrder')}>
                <Icon name="plus" size={18} />
                Novo pedido
              </Button>
            </div>
          </div>

          <Notice
            visible={noticeVisible}
            onClose={() => setNoticeVisible(false)}
            onOpenPassword={() => openModal('password')}
          />

          {activeNav === 'reports' ? <BackendDiagnostics /> : null}

          {activeNav === 'menu' ? null : <Metrics orders={orders} storeOpen={storeOpen} />}

          {renderWorkArea()}
        </section>
      </div>

      <input ref={importInputRef} type="file" accept="application/json" className="sr-only-input" onChange={handleImportData} />
      <input ref={menuImportInputRef} type="file" accept="application/json,.json,.har" className="sr-only-input" onChange={handleMenuImportData} />
      {renderModal()}
      <GuidedTutorial
        step={currentTutorialStep}
        stepIndex={tutorialStepIndex}
        totalSteps={tutorialSteps.length}
        onBack={backTutorial}
        onClose={finishTutorial}
        onNext={advanceTutorial}
      />
    </main>
  )
}

export default App
