export function normalizeStoreUser(user = {}, index = 0, nowDateTime) {
  return {
    id: user.id || `user-${Date.now()}-${index}`,
    name: user.name || `Usuario ${index + 1}`,
    email: String(user.email || '').trim().toLowerCase(),
    password: String(user.password || ''),
    role: user.role || 'operator',
    createdAt: user.createdAt || nowDateTime(),
  }
}

export function authenticateStoreUser(users = [], credentials = {}) {
  const email = String(credentials.email || '').trim().toLowerCase()
  const user = users.find((item) => item.email === email && item.password === credentials.password)

  if (!user) {
    return { ok: false, message: 'Email ou senha invalidos.' }
  }

  return { ok: true, user }
}

export function createStoreUser(users = [], userInput = {}, nowDateTime) {
  const email = String(userInput.email || '').trim().toLowerCase()

  if (!userInput.name?.trim()) {
    return { ok: false, message: 'Informe o nome do usuario responsavel.' }
  }

  if (!email) {
    return { ok: false, message: 'Informe um email valido para acesso.' }
  }

  if (String(userInput.password || '').length < 6) {
    return { ok: false, message: 'A senha precisa ter pelo menos 6 caracteres.' }
  }

  if (users.some((user) => user.email === email)) {
    return { ok: false, message: 'Ja existe um usuario com este email.' }
  }

  const createdUser = normalizeStoreUser({
    ...userInput,
    email,
    role: users.length === 0 ? 'owner' : 'operator',
    createdAt: nowDateTime(),
  }, users.length, nowDateTime)

  return {
    ok: true,
    user: createdUser,
    users: [...users, createdUser],
  }
}

export function buildStoreSession(user, nowDateTime, storeId = '') {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    storeId,
    loggedAt: nowDateTime(),
  }
}
