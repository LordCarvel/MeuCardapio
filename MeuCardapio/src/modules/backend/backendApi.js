export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
const REQUEST_TIMEOUT_MS = 30000

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
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('A API demorou demais para responder. Confira se o Render esta online e se o SMTP do email esta configurado corretamente.')
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

export async function checkBackendHealth() {
  return request('/health')
}

export async function loadBackendDiagnostics() {
  const health = await checkBackendHealth()
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

  return { health, stores, store, summary, products, categories, orders, logs }
}

export async function loadPublicStorefront(storeId) {
  const [store, products, categories] = await Promise.all([
    request(`/stores/${storeId}`),
    request(`/stores/${storeId}/products`),
    request(`/stores/${storeId}/categories`),
  ])

  return { store, products, categories }
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
    body: JSON.stringify({ email, purpose: 'PASSWORD_RESET' }),
  })
}

export async function resetBackendPassword(email, code, password) {
  return requestFirstAvailable(['/auth/password/reset', '/auth/reset-password'], {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  })
}
