export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!response.ok) {
    const detail = await response.text()
    const hint = getApiConfigurationHint()
    const isHtml = /^\s*</.test(detail)
    const message = isHtml
      ? `Erro HTTP ${response.status}. A resposta veio em HTML, o que normalmente indica que o front chamou o GitHub Pages em vez da API do Render.`
      : detail || `Erro HTTP ${response.status}`
    throw new Error([message, hint].filter(Boolean).join(' '))
  }

  return response.status === 204 ? null : response.json()
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

export async function createBackendOrder(storeId, order) {
  return request(`/stores/${storeId}/orders`, {
    method: 'POST',
    body: JSON.stringify(order),
  })
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

export async function requestEmailLoginCode(email) {
  return request('/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function verifyEmailLoginCode(email, code) {
  return request('/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export async function requestPasswordResetCode(email) {
  return request('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetBackendPassword(email, code, password) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  })
}
