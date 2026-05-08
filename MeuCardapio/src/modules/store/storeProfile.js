const DEFAULT_SERVICE_MODES = {
  delivery: true,
  pickup: true,
  dineIn: false,
}

export const STORE_SEGMENT_OPTIONS = [
  'Pizzaria',
  'Hamburgueria',
  'Lanchonete',
  'Restaurante',
  'Marmitaria',
  'Cafeteria',
  'Confeitaria',
  'Acaiteria',
]

export const STORE_SERVICE_MODE_OPTIONS = [
  { id: 'delivery', label: 'Entrega' },
  { id: 'pickup', label: 'Retirada' },
  { id: 'dineIn', label: 'Consumo no local' },
]

function splitStreetAndNumber(value = '') {
  const normalized = String(value).trim()
  const match = normalized.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)$/)

  if (!match) {
    return { street: normalized, number: '' }
  }

  return {
    street: match[1].replace(/,$/, '').trim(),
    number: match[2].trim(),
  }
}

function splitCityAndState(value = '') {
  const [cityName = '', state = ''] = String(value)
    .split(/\s*-\s*/)
    .map((part) => part.trim())

  return { cityName, state }
}

function normalizeServiceModes(value) {
  return {
    ...DEFAULT_SERVICE_MODES,
    ...(value ?? {}),
  }
}

function hasAnyStoreIdentity(profile) {
  return Boolean(
    profile.name
    || profile.tradeName
    || profile.owner
    || profile.phone
    || profile.email
    || profile.taxId,
  )
}

export function createEmptyStoreProfile() {
  return {
    tradeName: '',
    name: '',
    legalName: '',
    owner: '',
    manager: '',
    phone: '',
    whatsapp: '',
    email: '',
    supportEmail: '',
    taxId: '',
    stateRegistration: '',
    category: 'Pizzaria',
    description: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    cityName: '',
    state: 'SC',
    city: '',
    address: '',
    schedule: '',
    minimumOrder: '0,00',
    serviceFee: '0,00',
    deliveryRadius: '5',
    averagePrepTime: '35',
    deliveryLeadTime: '45',
    serviceModes: { ...DEFAULT_SERVICE_MODES },
    website: '',
    instagram: '',
    accessKey: '',
    note: '',
    lat: '',
    lng: '',
    mapLabel: '',
    verifiedAt: '',
    configuredAt: '',
  }
}

export function normalizeStoreProfile(profile = {}) {
  const defaults = createEmptyStoreProfile()
  const parsedAddress = splitStreetAndNumber(profile.address)
  const parsedCity = splitCityAndState(profile.city)
  const merged = {
    ...defaults,
    ...profile,
  }

  const tradeName = String(merged.tradeName || merged.name || '').trim()
  const street = String(merged.street || parsedAddress.street || '').trim()
  const number = String(merged.number || parsedAddress.number || '').trim()
  const cityName = String(merged.cityName || parsedCity.cityName || '').trim()
  const state = String(merged.state || parsedCity.state || defaults.state).trim()
  const serviceModes = normalizeServiceModes(merged.serviceModes)
  const address = [street, number].filter(Boolean).join(', ')
  const city = [cityName, state].filter(Boolean).join(' - ')

  return {
    ...merged,
    tradeName,
    name: tradeName,
    street,
    number,
    cityName,
    state,
    city,
    address,
    phone: String(merged.phone || merged.whatsapp || '').trim(),
    whatsapp: String(merged.whatsapp || merged.phone || '').trim(),
    email: String(merged.email || '').trim(),
    supportEmail: String(merged.supportEmail || '').trim(),
    taxId: String(merged.taxId || '').trim(),
    stateRegistration: String(merged.stateRegistration || '').trim(),
    accessKey: String(merged.accessKey || '').trim(),
    serviceModes,
    configuredAt: merged.configuredAt || (hasAnyStoreIdentity(merged) ? merged.verifiedAt || '' : ''),
  }
}

export function updateStoreProfile(profile, field, value) {
  return normalizeStoreProfile({
    ...profile,
    [field]: value,
  })
}

export function updateStoreServiceMode(profile, mode, enabled) {
  return normalizeStoreProfile({
    ...profile,
    serviceModes: {
      ...normalizeServiceModes(profile.serviceModes),
      [mode]: enabled,
    },
  })
}

export function isStoreConfigured(profile = {}) {
  const normalized = normalizeStoreProfile(profile)

  return Boolean(
    normalized.name
    && normalized.owner
    && normalized.phone
    && normalized.email
    && normalized.taxId
    && normalized.street
    && normalized.cityName
    && normalized.schedule,
  )
}

export function buildStoreAddressForGeocoding(profile = {}) {
  const normalized = normalizeStoreProfile(profile)

  return {
    street: normalized.street,
    number: normalized.number,
    district: normalized.district || '',
    city: normalized.city,
    cep: normalized.cep || '',
  }
}

export function getStoreInitials(profile = {}) {
  const name = normalizeStoreProfile(profile).name || 'MeuCardapio'

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function describeStoreServiceModes(profile = {}) {
  const normalized = normalizeStoreProfile(profile)

  return STORE_SERVICE_MODE_OPTIONS
    .filter((mode) => normalized.serviceModes[mode.id])
    .map((mode) => mode.label)
    .join(' | ')
}
