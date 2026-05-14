export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
const REQUEST_TIMEOUT_MS = 45000
const EMAIL_REQUEST_TIMEOUT_MS = 60000
const LONG_REQUEST_TIMEOUT_MS = 120000
const HEALTH_CACHE_MS = 5 * 60 * 1000

let healthCache = null
let healthRequest = null

function getApiConfigurationHint() {
  if (/github\.io/i.test(API_BASE_URL)) {
    return 'VITE_API_BASE_URL esta apontando para o GitHub Pages. Configure a variavel do GitHub Actions com a URL do Render terminando em /api.'
  }

  if (!/\/api\/?$/i.test(API_BASE_URL)) {
    return 'Confira VITE_API_BASE_URL. Ela deve apontar para a API do Render e terminar em /api.'
  }

  return ''
}

export async function request(path, options = {}) {
  const controller = new AbortController()
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) },
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`A API nao respondeu em ${Math.round(timeoutMs / 1000)}s. Tente novamente; se continuar, confira se o Render esta online.`)
    }

    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const detail = await response.text()
    const hint = getApiConfigurationHint()
    const isHtml = /^\s*</.test(detail)
    let apiMessage = detail

    if (!isHtml && detail) {
      try {
        const parsed = JSON.parse(detail)
        apiMessage = parsed.message || parsed.error || parsed.detail || detail
      } catch {
        apiMessage = detail
      }
    }

    const notFoundHint = response.status === 404 && path.startsWith('/auth/')
      ? 'Esse endpoint existe no codigo atual. Faca redeploy do backend no Render e confirme que o front esta usando a URL desse servico.'
      : ''
    const message = isHtml
      ? `Erro HTTP ${response.status}. A resposta veio em HTML, o que normalmente indica que o front chamou o GitHub Pages em vez da API do Render.`
      : apiMessage || `Erro HTTP ${response.status}`
    throw new Error([message, notFoundHint, hint].filter(Boolean).join(' '))
  }

  return response.status === 204 ? null : response.json()
}

async function requestFirstAvailable(paths, options = {}) {
  let lastError

  for (const path of paths) {
    try {
      return await request(path, options)
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : ''
      if (!/Erro HTTP 404/.test(message)) {
        throw err
      }
    }
  }

  throw lastError || new Error('Endpoint da API nao encontrado.')
}

function parseMenuSnapshot(value) {
  if (!value) {
    return null
  }

  if (typeof value === 'object') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function attachMenuSnapshot(workspace) {
  return {
    ...workspace,
    menuSnapshot: parseMenuSnapshot(workspace.store?.menuSnapshot),
  }
}

export async function checkBackendHealth({ force = false } = {}) {
  const now = Date.now()

  if (!force && healthCache && now - healthCache.checkedAt < HEALTH_CACHE_MS) {
    return healthCache.value
  }

  if (!force && healthRequest) {
    return healthRequest
  }

  healthRequest = request('/health')
    .then((value) => {
      healthCache = { value, checkedAt: Date.now() }
      return value
    })
    .finally(() => {
      healthRequest = null
    })

  return healthRequest
}

export async function loadBackendDiagnostics() {
  const health = await checkBackendHealth({ force: true })
  const stores = await request('/stores')
  const store = stores[0] || null

  if (!store) {
    return { health, stores, summary: null, products: [], orders: [], logs: [] }
  }

  const [summary, products, orders, logs] = await Promise.all([
    request(`/reports/summary?storeId=${store.id}`),
    request(`/stores/${store.id}/products`),
    request(`/stores/${store.id}/orders`),
    request(`/logs?storeId=${store.id}`),
  ])

  return { health, stores, summary, products, orders, logs }
}

export async function loadBackendWorkspace(storeId = '') {
  const health = await checkBackendHealth()
  const stores = await request('/stores')
  const store = storeId
    ? stores.find((item) => item.id === storeId) || stores[0] || null
    : stores[0] || null

  if (!store) {
    return { health, stores, store: null, summary: null, products: [], categories: [], orders: [], logs: [] }
  }

  const [summary, products, categories, orders, logs] = await Promise.all([
    request(`/reports/summary?storeId=${store.id}`),
    request(`/stores/${store.id}/products`),
    request(`/stores/${store.id}/categories`),
    request(`/stores/${store.id}/orders`),
    request(`/logs?storeId=${store.id}`),
  ])

  return attachMenuSnapshot({ health, stores, store, summary, products, categories, orders, logs })
}

export async function loadBackendWorkspaceByAccessKey(accessKey) {
  const health = await checkBackendHealth()
  const store = await request(`/stores/access/${encodeURIComponent(accessKey)}`)

  if (!store) {
    return { health, stores: [], store: null, summary: null, products: [], categories: [], orders: [], logs: [] }
  }

  const [summary, products, categories, orders, logs] = await Promise.all([
    request(`/reports/summary?storeId=${store.id}`),
    request(`/stores/${store.id}/products`),
    request(`/stores/${store.id}/categories`),
    request(`/stores/${store.id}/orders`),
    request(`/logs?storeId=${store.id}`),
  ])

  return attachMenuSnapshot({ health, stores: [store], store, summary, products, categories, orders, logs })
}

export async function loadPublicStorefront(storeId) {
  const [store, products, categories] = await Promise.all([
    request(`/stores/${storeId}`),
    request(`/stores/${storeId}/products`),
    request(`/stores/${storeId}/categories`),
  ])

  return attachMenuSnapshot({ store, products, categories })
}

export async function createBackendOrder(storeId, order) {
  return request(`/stores/${storeId}/orders`, {
    method: 'POST',
    body: JSON.stringify(order),
  })
}

export async function getBackendOrders(storeId) {
  return request(`/stores/${storeId}/orders`)
}

export async function updateBackendOrder(storeId, orderId, order) {
  return request(`/stores/${storeId}/orders/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify(order),
  })
}

export async function updateBackendOrderStatus(storeId, orderId, status) {
  return request(`/stores/${storeId}/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function deleteBackendOrder(storeId, orderId) {
  return request(`/stores/${storeId}/orders/${orderId}`, {
    method: 'DELETE',
  })
}

export async function createBackendLog({ storeId = null, level = 'INFO', area = 'frontend', message }) {
  return request('/logs', {
    method: 'POST',
    body: JSON.stringify({
      storeId,
      level,
      area,
      message,
    }),
  })
}

export async function createBackendTestLog(storeId) {
  return createBackendLog({
    storeId,
    level: 'INFO',
    area: 'frontend',
    message: 'Teste manual enviado pelo painel React',
  })
}

export async function createBackendStore(store) {
  return request('/stores', {
    method: 'POST',
    body: JSON.stringify(store),
  })
}

export async function updateBackendStore(storeId, store) {
  return request(`/stores/${storeId}`, {
    method: 'PUT',
    body: JSON.stringify(store),
  })
}

export async function patchBackendStore(storeId, patch) {
  return request(`/stores/${storeId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function updateBackendMenuSnapshot(storeId, snapshot) {
  return request(`/stores/${storeId}/menu-snapshot`, {
    method: 'PUT',
    body: JSON.stringify({ menuSnapshot: JSON.stringify(snapshot) }),
  })
}

export async function getBackendStore(storeId) {
  return request(`/stores/${storeId}`)
}

export async function createBackendStoreUser(storeId, user) {
  return request(`/stores/${storeId}/users`, {
    method: 'POST',
    body: JSON.stringify(user),
  })
}

export async function loginBackendUser(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function requestSignupCode(email) {
  return requestFirstAvailable(['/auth/signup/request-code', '/auth/request-signup-code', '/auth/codes'], {
    method: 'POST',
    timeoutMs: EMAIL_REQUEST_TIMEOUT_MS,
    body: JSON.stringify({ email, purpose: 'SIGNUP' }),
  })
}

export async function signupBackendAccount(account) {
  return request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(account),
  })
}

export async function requestEmailLoginCode(email) {
  return requestFirstAvailable(['/auth/login/request-code', '/auth/request-code', '/auth/codes'], {
    method: 'POST',
    timeoutMs: EMAIL_REQUEST_TIMEOUT_MS,
    body: JSON.stringify({ email, purpose: 'LOGIN' }),
  })
}

export async function verifyEmailLoginCode(email, code) {
  return requestFirstAvailable(['/auth/login/verify-code', '/auth/verify-code'], {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export async function requestPasswordResetCode(email) {
  return requestFirstAvailable(['/auth/password/request-reset', '/auth/request-password-reset', '/auth/codes'], {
    method: 'POST',
    timeoutMs: EMAIL_REQUEST_TIMEOUT_MS,
    body: JSON.stringify({ email, purpose: 'PASSWORD_RESET' }),
  })
}

export async function resetBackendPassword(email, code, password) {
  return requestFirstAvailable(['/auth/password/reset', '/auth/reset-password'], {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  })
}

export async function getWhatsappConfig(storeId) {
  return request(`/stores/${storeId}/whatsapp/config`)
}

export async function saveWhatsappConfig(storeId, config) {
  return request(`/stores/${storeId}/whatsapp/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

export async function createWhatsappSession(storeId, session) {
  return request(`/stores/${storeId}/whatsapp/session`, {
    method: 'POST',
    body: JSON.stringify(session),
  })
}

export async function connectWhatsappSession(storeId) {
  return request(`/stores/${storeId}/whatsapp/connect`, { method: 'POST' })
}

export async function getWhatsappQrCode(storeId) {
  return request(`/stores/${storeId}/whatsapp/qrcode`)
}

export async function getWhatsappStatus(storeId) {
  return request(`/stores/${storeId}/whatsapp/status`)
}

export async function getWhatsappConversations(storeId) {
  return request(`/stores/${storeId}/whatsapp/conversations`)
}

export async function syncWhatsappConversations(storeId) {
  return request(`/stores/${storeId}/whatsapp/conversations/sync`, { method: 'POST', timeoutMs: LONG_REQUEST_TIMEOUT_MS })
}

export async function patchWhatsappConversation(storeId, remoteJid, patch) {
  return request(`/stores/${storeId}/whatsapp/conversations?remoteJid=${encodeURIComponent(remoteJid)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function refreshWhatsappConversationAvatar(storeId, remoteJid) {
  return request(`/stores/${storeId}/whatsapp/conversations/avatar?remoteJid=${encodeURIComponent(remoteJid)}`, {
    method: 'POST',
    timeoutMs: LONG_REQUEST_TIMEOUT_MS,
  })
}

export async function getWhatsappMessages(storeId, remoteJid) {
  return request(`/stores/${storeId}/whatsapp/messages?remoteJid=${encodeURIComponent(remoteJid)}`)
}

export async function sendWhatsappMessage(storeId, to, text) {
  return request(`/stores/${storeId}/whatsapp/messages`, {
    method: 'POST',
    body: JSON.stringify({ to, text }),
  })
}

export async function controlWhatsappBot(storeId, remoteJid, action) {
  return request(`/stores/${storeId}/whatsapp/bot?remoteJid=${encodeURIComponent(remoteJid)}`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function markWhatsappConversationRead(storeId, remoteJid) {
  return request(`/stores/${storeId}/whatsapp/read?remoteJid=${encodeURIComponent(remoteJid)}`, {
    method: 'POST',
  })
}
