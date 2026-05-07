import { useEffect, useMemo, useRef, useState } from 'react'
import { createBackendOrder, getBackendOrders, loadPublicStorefront } from '../backend/backendApi'
import { STORAGE_KEY } from '../storage/browserStorage'
import { normalizeStoreProfile } from '../store/storeProfile'
import './CustomerStorefront.css'

const emptyCustomer = {
  name: '',
  phone: '',
  address: '',
  note: '',
  changeFor: '',
}

const emptyAddress = {
  cep: '',
  street: '',
  number: '',
  district: '',
  city: '',
  complement: '',
  lat: '',
  lng: '',
  mapLabel: '',
  pointConfirmed: false,
  numberMatched: false,
  deliveryZoneId: '',
  deliveryZoneName: '',
  deliveryFee: '',
}

const DEFAULT_MAP_CENTER = { lat: -26.7693, lng: -48.6452 }
const MAP_TILE_SIZE = 256

const PAYMENT_OPTIONS = [
  { id: 'Pix', title: 'Pix', subtitle: 'Pague agora', group: 'Pagar agora' },
  { id: 'Dinheiro', title: 'Dinheiro', subtitle: 'Pague na entrega' },
  { id: 'Cartao', title: 'Cartao', subtitle: 'Debito ou credito na entrega' },
  { id: 'Dividir', title: 'Usar mais de um pagamento', subtitle: 'Combinar formas de pagamento' },
]

const ORDER_STATUS_STEPS = [
  { id: 'analysis', label: 'Recebido' },
  { id: 'production', label: 'Em preparo' },
  { id: 'ready', label: 'Pronto' },
  { id: 'completed', label: 'Finalizado' },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0)
}

function parseCurrency(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')

  return Number(normalized) || 0
}

function isBackendStoreId(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getStorefrontIdFromPath() {
  const match = window.location.pathname.match(/\/loja\/([^/?#]+)/i)

  return match ? decodeURIComponent(match[1]) : ''
}

function normalizeBackendStore(store = {}) {
  return normalizeStoreProfile({
    tradeName: store.tradeName,
    owner: store.ownerName,
    phone: store.phone,
    whatsapp: store.phone,
    email: store.email,
    taxId: store.taxId,
    category: store.category,
    street: store.street || '',
    number: store.number || '',
    district: store.district || '',
    cityName: store.cityName || '',
    state: store.state || 'SC',
    schedule: store.schedule || '',
    minimumOrder: String(store.minimumOrder || '0').replace('.', ','),
    deliveryRadius: String(store.deliveryRadiusKm || 5),
  })
}

function normalizeBackendProduct(product = {}) {
  return {
    id: product.id,
    name: product.name || 'Produto sem nome',
    description: product.description || '',
    imageUrl: product.imageUrl || '',
    category: product.categoryName || 'Cardapio',
    price: Number(product.price) || 0,
    active: product.active !== false,
  }
}

function normalizeBackendCategory(category = {}) {
  return {
    id: category.id,
    name: category.name || 'Cardapio',
    imageUrl: category.imageUrl || '',
    active: category.active !== false,
  }
}

function getProductCategories(product = {}) {
  return [product.category, ...(Array.isArray(product.extraCategories) ? product.extraCategories : [])]
    .filter(Boolean)
    .filter((category, index, list) => list.indexOf(category) === index)
}

function isProductAvailable(product = {}) {
  if (product.active === false) {
    return false
  }

  return getProductCategories(product).some((category) => (
    !Array.isArray(product.exhaustedCategories) || !product.exhaustedCategories.includes(category)
  ))
}

function getThumbClass(product = {}) {
  const fingerprint = `${product.category || ''} ${product.name || ''}`.toLowerCase()

  if (fingerprint.includes('combo')) {
    return 'customer-thumb--combo'
  }

  if (fingerprint.includes('bebida') || fingerprint.includes('refrigerante') || fingerprint.includes('suco')) {
    return 'customer-thumb--drink'
  }

  if (fingerprint.includes('doce') || fingerprint.includes('brownie') || fingerprint.includes('sobremesa')) {
    return 'customer-thumb--dessert'
  }

  return 'customer-thumb--pizza'
}

function buildCartLine(product) {
  return {
    id: `customer-cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product.id,
    name: product.name,
    category: product.category,
    imageUrl: product.imageUrl || '',
    quantity: 1,
    unitPrice: Number(product.price) || 0,
    flavorIds: [],
    flavorNames: [],
    flavorLabel: '',
    addonSelections: {},
    addonEntries: [],
  }
}

function isComboProduct(product) {
  return `${product?.category || ''} ${product?.name || ''}`.toLowerCase().includes('combo')
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

function getCartConfigurationSteps(product) {
  const steps = []
  const activeFlavors = getActiveProductFlavors(product)

  if (activeFlavors.length > 0) {
    steps.push({
      id: 'step-flavors',
      type: 'flavors',
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
      title: group.name,
      required: group.required === true,
      minSelect: Math.max(group.required ? 1 : 0, Number(group.minSelect) || 0),
      maxSelect: Math.max(1, Number(group.maxSelect) || 1),
      options: group.options,
    })
  })

  return steps
}

function getCartStepSelectedIds(form, step) {
  if (!step) {
    return []
  }

  if (step.type === 'flavors') {
    return Array.isArray(form.flavorIds) ? form.flavorIds : []
  }

  return Array.isArray(form.addonSelections?.[step.id]) ? form.addonSelections[step.id] : []
}

function isCartStepSelectionValid(step, form) {
  if (!step) {
    return true
  }

  const selectedCount = getCartStepSelectedIds(form, step).length
  const minSelect = Math.max(step.required ? 1 : 0, Number(step.minSelect) || 0)
  const maxSelect = Math.max(1, Number(step.maxSelect) || 1)

  return selectedCount >= minSelect && selectedCount <= maxSelect
}

function getSelectedCartFlavorNames(product, flavorIds = []) {
  const selectedIds = new Set(flavorIds)

  return getActiveProductFlavors(product)
    .filter((flavor) => selectedIds.has(flavor.id))
    .map((flavor) => flavor.name)
}

function normalizeCartAddonSelections(product, addonSelections = {}) {
  const normalizedSelections = {}

  getActiveProductAddonGroups(product).forEach((group) => {
    const selectedIds = Array.isArray(addonSelections[group.id]) ? addonSelections[group.id] : []
    const validIds = Array.from(new Set(selectedIds.filter((optionId) => group.options.some((option) => option.id === optionId))))
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
      const selectedOptions = group.options.filter((option) => selectedIds.includes(option.id))

      if (selectedOptions.length === 0) {
        return null
      }

      return {
        groupId: group.id,
        groupName: group.name,
        optionIds: selectedOptions.map((option) => option.id),
        optionNames: selectedOptions.map((option) => option.name),
        label: selectedOptions.map((option) => option.name).join(', '),
      }
    })
    .filter(Boolean)
}

function getCartItemUnitPrice(product, flavorIds = [], addonSelections = {}) {
  const selectedFlavorIds = new Set(flavorIds)
  const flavorExtras = getActiveProductFlavors(product)
    .filter((flavor) => selectedFlavorIds.has(flavor.id))
    .reduce((sum, flavor) => sum + (Number(flavor.price) || 0), 0)
  const groups = getActiveProductAddonGroups(product)
  const addonExtras = getSelectedCartAddonEntries(product, addonSelections)
    .reduce((sum, entry) => {
      const group = groups.find((current) => current.id === entry.groupId)
      const groupTotal = group
        ? group.options
          .filter((option) => entry.optionIds.includes(option.id))
          .reduce((optionSum, option) => optionSum + (Number(option.price) || 0), 0)
        : 0

      return sum + groupTotal
    }, 0)

  return (Number(product?.price) || 0) + flavorExtras + addonExtras
}

function buildConfiguredCartLine(product, form) {
  const flavorIds = Array.from(new Set(form.flavorIds || []))
  const addonSelections = normalizeCartAddonSelections(product, form.addonSelections || {})
  const flavorNames = getSelectedCartFlavorNames(product, flavorIds)

  return {
    ...buildCartLine(product),
    id: form.lineId || `customer-cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    quantity: Math.max(1, Number(form.quantity) || 1),
    unitPrice: getCartItemUnitPrice(product, flavorIds, addonSelections),
    flavorIds,
    flavorNames,
    flavorLabel: flavorNames.join(', '),
    addonSelections,
    addonEntries: getSelectedCartAddonEntries(product, addonSelections),
  }
}

function getCartLineDetails(item) {
  return [
    item.flavorLabel ? `Sabores: ${item.flavorLabel}` : '',
    ...(Array.isArray(item.addonEntries) ? item.addonEntries.map((entry) => `${entry.groupName}: ${entry.label}`) : []),
  ].filter(Boolean)
}

function cartToOrderItems(cart) {
  return cart.map((item) => ({
    productName: [item.name, ...getCartLineDetails(item)].join(' - '),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }))
}

function ProductThumb({ product, small = false }) {
  return (
    <span
      className={`customer-thumb ${small ? 'customer-thumb--small' : ''} ${getThumbClass(product)} ${product?.imageUrl ? 'customer-thumb--photo' : ''}`.trim()}
      style={product?.imageUrl ? { backgroundImage: `url("${product.imageUrl}")` } : undefined}
    />
  )
}

function getLocalTrackedOrder(storeId, orderId) {
  try {
    const workspace = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    const store = Array.isArray(workspace.stores)
      ? workspace.stores.find((item) => item.id === storeId)
      : null

    return store?.snapshot?.orders?.find((order) => String(order.id) === String(orderId)) || null
  } catch {
    return null
  }
}

function getOrderStatusIndex(status = '') {
  return Math.max(0, ORDER_STATUS_STEPS.findIndex((step) => step.id === status))
}

function getOrderStatusLabel(status = '') {
  return ORDER_STATUS_STEPS.find((step) => step.id === status)?.label || 'Recebido'
}

function formatCustomerAddress(address = {}) {
  const streetLine = [address.street, address.number].filter(Boolean).join(', ')
  const districtLine = [address.district, address.city].filter(Boolean).join(' - ')
  const complement = address.complement ? `Compl.: ${address.complement}` : ''

  return [streetLine, districtLine, complement].filter(Boolean).join(' | ')
}

function formatCoordinate(value) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed.toFixed(6) : ''
}

function normalizeCoordinate(value) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function getAddressCoordinates(address = {}) {
  const lat = normalizeCoordinate(address.lat)
  const lng = normalizeCoordinate(address.lng)

  return lat === null || lng === null ? null : { lat, lng }
}

function getStoreCoordinates(storeProfile = {}) {
  const lat = normalizeCoordinate(storeProfile.lat)
  const lng = normalizeCoordinate(storeProfile.lng)

  return lat === null || lng === null ? null : { lat, lng }
}

function getMapCenter(address = {}, storeProfile = {}) {
  return getAddressCoordinates(address) || getStoreCoordinates(storeProfile) || DEFAULT_MAP_CENTER
}

function haversineDistanceKm(a, b) {
  const earthRadiusKm = 6371
  const toRadians = (value) => (value * Math.PI) / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const hav = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav))
}

function isPointInDeliveryPolygon(lat, lng, polygon = []) {
  let inside = false

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const [xi, yi] = polygon[index]
    const [xj, yj] = polygon[previousIndex]
    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi)

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function findDeliveryZoneForCoordinates(lat, lng, zones = []) {
  return zones.find((zone) => zone.active !== false && isPointInDeliveryPolygon(lat, lng, zone.polygon || []))
}

function getServiceAreaResult(address = {}, storeProfile = {}, deliveryZones = []) {
  const coordinates = getAddressCoordinates(address)

  if (!coordinates) {
    return { ok: false, reason: 'Marque o ponto no mapa antes de salvar.' }
  }

  const zone = findDeliveryZoneForCoordinates(coordinates.lat, coordinates.lng, deliveryZones)

  if (zone) {
    return { ok: true, zone, fee: zone.fee || address.deliveryFee || '' }
  }

  if (deliveryZones.some((zoneItem) => zoneItem.active !== false && Array.isArray(zoneItem.polygon) && zoneItem.polygon.length >= 3)) {
    return { ok: false, reason: 'Esse endereco esta fora da area de entrega desta loja.' }
  }

  const storeCoordinates = getStoreCoordinates(storeProfile)
  const radiusKm = Number(String(storeProfile.deliveryRadius || storeProfile.deliveryRadiusKm || '').replace(',', '.'))

  if (storeCoordinates && Number.isFinite(radiusKm) && radiusKm > 0) {
    const distanceKm = haversineDistanceKm(storeCoordinates, coordinates)

    return distanceKm <= radiusKm
      ? { ok: true, zone: null, fee: address.deliveryFee || '', distanceKm }
      : { ok: false, reason: `Esse endereco fica a ${distanceKm.toFixed(1)} km, fora do raio de ${radiusKm.toFixed(1)} km.` }
  }

  return { ok: false, reason: 'A loja ainda nao configurou area de entrega para validar esse endereco.' }
}

function mergeGeocodedAddress(current, result = {}) {
  const details = result.address || {}
  const requestedNumber = String(current.number || '').replace(/\D/g, '')
  const returnedNumber = String(details.house_number || '').replace(/\D/g, '')
  const numberMatched = Boolean(requestedNumber && returnedNumber && requestedNumber === returnedNumber)

  return {
    ...current,
    cep: current.cep || String(details.postcode || '').replace(/\D/g, '').slice(0, 8),
    street: details.road || details.pedestrian || details.residential || current.street,
    number: details.house_number || current.number,
    district: details.suburb || details.neighbourhood || details.city_district || current.district,
    city: [details.city || details.town || details.village || current.city, details.state_code || '']
      .filter(Boolean)
      .join(' - '),
    lat: formatCoordinate(result.lat),
    lng: formatCoordinate(result.lon),
    mapLabel: result.display_name || current.mapLabel,
    numberMatched,
  }
}

async function reverseGeocodePoint(lat, lng) {
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    lat: String(lat),
    lon: String(lng),
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`)

  return response.json()
}

function clampMapZoom(value) {
  return Math.min(19, Math.max(12, Number(value) || 16))
}

function latLngToMapPixel(lat, lng, zoom) {
  const scale = MAP_TILE_SIZE * (2 ** zoom)
  const sinLat = Math.sin((Math.max(Math.min(lat, 85.05112878), -85.05112878) * Math.PI) / 180)

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  }
}

function mapPixelToLatLng(x, y, zoom) {
  const scale = MAP_TILE_SIZE * (2 ** zoom)
  const lng = (x / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / scale
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))

  return { lat, lng }
}

function buildMapTiles(center, zoom) {
  const centerPixel = latLngToMapPixel(center.lat, center.lng, zoom)
  const centerTileX = Math.floor(centerPixel.x / MAP_TILE_SIZE)
  const centerTileY = Math.floor(centerPixel.y / MAP_TILE_SIZE)
  const tileCount = 2 ** zoom
  const tiles = []

  for (let xOffset = -2; xOffset <= 2; xOffset += 1) {
    for (let yOffset = -2; yOffset <= 2; yOffset += 1) {
      const tileX = centerTileX + xOffset
      const tileY = centerTileY + yOffset

      if (tileY < 0 || tileY >= tileCount) {
        continue
      }

      const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount

      tiles.push({
        key: `${zoom}-${wrappedTileX}-${tileY}`,
        src: `https://tile.openstreetmap.org/${zoom}/${wrappedTileX}/${tileY}.png`,
        left: tileX * MAP_TILE_SIZE - centerPixel.x,
        top: tileY * MAP_TILE_SIZE - centerPixel.y,
      })
    }
  }

  return tiles
}

function CustomerAddressMap({ center, zoom, selectedAddress, onPan, onZoom, onUseCenter }) {
  const dragRef = useRef(null)
  const mapRef = useRef(null)
  const tiles = useMemo(() => buildMapTiles(center, zoom), [center, zoom])
  const zoomRef = useRef(zoom)
  const onZoomRef = useRef(onZoom)

  useEffect(() => {
    zoomRef.current = zoom
    onZoomRef.current = onZoom
  }, [onZoom, zoom])

  useEffect(() => {
    const mapElement = mapRef.current

    if (!mapElement) {
      return undefined
    }

    function handleWheel(event) {
      event.preventDefault()
      onZoomRef.current(clampMapZoom(zoomRef.current + (event.deltaY > 0 ? -1 : 1)))
    }

    mapElement.addEventListener('wheel', handleWheel, { passive: false })

    return () => mapElement.removeEventListener('wheel', handleWheel)
  }, [])

  function panByPixels(deltaX, deltaY) {
    const centerPixel = latLngToMapPixel(center.lat, center.lng, zoom)
    const nextCenter = mapPixelToLatLng(centerPixel.x - deltaX, centerPixel.y - deltaY, zoom)

    onPan({
      lat: Number(nextCenter.lat.toFixed(6)),
      lng: Number(nextCenter.lng.toFixed(6)),
    })
  }

  return (
    <div
      ref={mapRef}
      className="customer-address-map"
      onPointerDown={(event) => {
        if (event.target.closest('button')) {
          return
        }

        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) {
          return
        }

        const deltaX = event.clientX - dragRef.current.x
        const deltaY = event.clientY - dragRef.current.y
        dragRef.current = { x: event.clientX, y: event.clientY }
        panByPixels(deltaX, deltaY)
      }}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
      role="application"
      aria-label="Mapa para escolher ponto de entrega"
    >
      <div className="customer-address-map__tiles">
        {tiles.map((tile) => (
          <img
            alt=""
            draggable="false"
            key={tile.key}
            src={tile.src}
            style={{
              left: `calc(50% + ${tile.left}px)`,
              top: `calc(50% + ${tile.top}px)`,
            }}
          />
        ))}
      </div>
      <span className="customer-map-pin" />
      {selectedAddress.lat && selectedAddress.lng ? <span className="customer-map-saved-pin">Ponto salvo</span> : null}
      <div className="customer-map-controls">
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onZoom(clampMapZoom(zoom + 1))}>+</button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onZoom(clampMapZoom(zoom - 1))}>-</button>
      </div>
      <button
        className="customer-map-use-center"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onUseCenter()
        }}
      >
        Usar ponto central
      </button>
      <small>Arraste para mover. Use + e - para aproximar.</small>
    </div>
  )
}

export function CustomerStorefront({ localStore = null, onCreateLocalOrder }) {
  const storeId = getStorefrontIdFromPath()
  const [backendData, setBackendData] = useState(null)
  const [status, setStatus] = useState(() => (
    isBackendStoreId(storeId)
      ? { type: 'loading', message: 'Carregando cardapio...' }
      : { type: 'idle', message: '' }
  ))
  const [screen, setScreen] = useState('home')
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState(emptyCustomer)
  const [address, setAddress] = useState(emptyAddress)
  const [addressStatus, setAddressStatus] = useState({ type: 'idle', message: '' })
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER)
  const [mapZoom, setMapZoom] = useState(16)
  const [fulfillment, setFulfillment] = useState('delivery')
  const [payment, setPayment] = useState('')
  const [tracking, setTracking] = useState(null)
  const [configProduct, setConfigProduct] = useState(null)
  const [configForm, setConfigForm] = useState({
    lineId: '',
    quantity: '1',
    flavorIds: [],
    addonSelections: {},
  })
  const [configStepIndex, setConfigStepIndex] = useState(0)

  useEffect(() => {
    if (localStore || !isBackendStoreId(storeId)) {
      return
    }

    let cancelled = false

    loadPublicStorefront(storeId)
      .then((data) => {
        if (cancelled) {
          return
        }

        setBackendData({
          storeProfile: normalizeBackendStore(data.store),
          categories: data.categories.map(normalizeBackendCategory),
          products: data.products.map(normalizeBackendProduct),
        })
        setStatus({ type: 'idle', message: '' })
      })
      .catch((err) => {
        if (cancelled) {
          return
        }

        setStatus({
          type: 'error',
          message: err instanceof Error ? err.message : 'Nao foi possivel abrir esta loja.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [localStore, storeId])

  useEffect(() => {
    if (!tracking || tracking.status === 'completed') {
      return undefined
    }

    let cancelled = false

    async function refreshTrackedOrder() {
      if (tracking.source === 'local') {
        const nextOrder = getLocalTrackedOrder(tracking.storeId, tracking.id)

        if (!cancelled && nextOrder) {
          setTracking((current) => current ? { ...current, order: nextOrder, status: nextOrder.status || current.status } : current)
        }

        return
      }

      try {
        const backendOrders = await getBackendOrders(tracking.storeId)
        const nextOrder = backendOrders.find((order) => String(order.id) === String(tracking.id))

        if (!cancelled && nextOrder) {
          setTracking((current) => current ? { ...current, order: nextOrder, status: nextOrder.status || current.status } : current)
        }
      } catch {
        if (!cancelled) {
          setStatus({ type: 'error', message: 'Nao foi possivel atualizar o acompanhamento agora.' })
        }
      }
    }

    refreshTrackedOrder()
    const intervalId = window.setInterval(refreshTrackedOrder, 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [tracking])

  const data = useMemo(() => {
    if (localStore?.snapshot) {
      return {
        source: 'local',
        storeProfile: normalizeStoreProfile(localStore.snapshot.storeProfile),
        categories: localStore.snapshot.categories || [],
        products: localStore.snapshot.products || [],
        deliveryZones: localStore.snapshot.deliveryZones || [],
      }
    }

    if (backendData) {
      return { source: 'backend', deliveryZones: [], ...backendData }
    }

    return null
  }, [backendData, localStore])

  const storeProfile = data?.storeProfile || null
  const deliveryZones = useMemo(() => data?.deliveryZones || [], [data])
  const allProducts = useMemo(() => (data?.products || []).filter(isProductAvailable), [data])
  const categories = useMemo(() => {
    const configured = (data?.categories || [])
      .filter((category) => category.active !== false)
      .filter((category) => allProducts.some((product) => getProductCategories(product).includes(category.name)))

    return configured.length > 0
      ? configured
      : Array.from(new Set(allProducts.map((product) => product.category).filter(Boolean)))
        .map((name) => ({ id: name, name, active: true }))
  }, [allProducts, data])
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return allProducts
      .filter((product) => activeCategory === 'all' || getProductCategories(product).includes(activeCategory))
      .filter((product) => !normalizedQuery || `${product.name} ${product.description || ''} ${product.category}`.toLowerCase().includes(normalizedQuery))
  }, [activeCategory, allProducts, query])
  const popularProducts = allProducts.slice(0, 8)
  const suggestedProducts = allProducts
    .filter((product) => !cart.some((item) => item.productId === product.id))
    .slice(0, 10)
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const serviceArea = useMemo(
    () => getServiceAreaResult(address, storeProfile || {}, deliveryZones),
    [address, deliveryZones, storeProfile],
  )
  const deliveryFee = fulfillment === 'delivery'
    ? parseCurrency(address.deliveryFee || serviceArea.fee || storeProfile?.serviceFee || '0')
    : 0
  const total = subtotal + deliveryFee
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const canIdentify = cart.length > 0
  const formattedAddress = formatCustomerAddress(address)
  const hasDeliveryAddress = Boolean(address.street.trim() && address.number.trim() && address.district.trim() && address.city.trim())
  const hasConfirmedDeliveryPoint = Boolean(address.pointConfirmed && address.lat && address.lng)
  const canFinish = customer.name.trim() && customer.phone.trim() && (fulfillment === 'pickup' || (hasDeliveryAddress && hasConfirmedDeliveryPoint && serviceArea.ok)) && payment

  function openProductConfig(product, nextScreen = 'item') {
    const steps = getCartConfigurationSteps(product)

    if (steps.length === 0) {
      addProductDirect(product, nextScreen === 'item' ? 'cart' : nextScreen)
      return
    }

    setConfigProduct(product)
    setConfigForm({
      lineId: '',
      quantity: '1',
      flavorIds: [],
      addonSelections: {},
    })
    setConfigStepIndex(0)
    setScreen('item')
  }

  function openCartLineConfig(item) {
    const product = allProducts.find((current) => current.id === item.productId)

    if (!product || getCartConfigurationSteps(product).length === 0) {
      return
    }

    setConfigProduct(product)
    setConfigForm({
      lineId: item.id,
      quantity: String(item.quantity || 1),
      flavorIds: Array.isArray(item.flavorIds) ? item.flavorIds : [],
      addonSelections: item.addonSelections || {},
    })
    setConfigStepIndex(0)
    setScreen('item')
  }

  function addProductDirect(product, nextScreen = '') {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id)

      if (existing) {
        return current.map((item) => (
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        ))
      }

      return [...current, buildCartLine(product)]
    })

    if (nextScreen) {
      setScreen(nextScreen)
    }
  }

  function addProduct(product, nextScreen = '') {
    openProductConfig(product, nextScreen)
  }

  function toggleConfigOption(step, optionId) {
    const selectedIds = getCartStepSelectedIds(configForm, step)
    const isSelected = selectedIds.includes(optionId)
    const maxSelect = Math.max(1, Number(step.maxSelect) || 1)

    if (!isSelected && selectedIds.length >= maxSelect) {
      if (step.type === 'flavors' && maxSelect === 1) {
        setConfigForm((current) => ({ ...current, flavorIds: [optionId] }))
        return
      }

      return
    }

    if (step.type === 'flavors') {
      setConfigForm((current) => ({
        ...current,
        flavorIds: isSelected
          ? current.flavorIds.filter((id) => id !== optionId)
          : [...current.flavorIds, optionId],
      }))
      return
    }

    setConfigForm((current) => {
      const currentSelectedIds = Array.isArray(current.addonSelections?.[step.id])
        ? current.addonSelections[step.id]
        : []
      const nextSelectedIds = isSelected
        ? currentSelectedIds.filter((id) => id !== optionId)
        : maxSelect === 1
          ? [optionId]
          : [...currentSelectedIds, optionId]

      return {
        ...current,
        addonSelections: {
          ...current.addonSelections,
          [step.id]: nextSelectedIds,
        },
      }
    })
  }

  function goNextConfigStep() {
    if (!configProduct) {
      return
    }

    const steps = getCartConfigurationSteps(configProduct)
    const currentStep = steps[configStepIndex]

    if (currentStep && !isCartStepSelectionValid(currentStep, configForm)) {
      setStatus({ type: 'error', message: `Selecione uma opcao em ${currentStep.title}.` })
      return
    }

    setStatus({ type: 'idle', message: '' })
    setConfigStepIndex((current) => Math.min(current + 1, Math.max(steps.length - 1, 0)))
  }

  function commitConfiguredItem() {
    if (!configProduct) {
      return
    }

    const steps = getCartConfigurationSteps(configProduct)
    const invalidStep = steps.find((step) => !isCartStepSelectionValid(step, configForm))

    if (invalidStep) {
      setStatus({ type: 'error', message: `Selecione uma opcao em ${invalidStep.title}.` })
      return
    }

    const nextLine = buildConfiguredCartLine(configProduct, configForm)

    setCart((current) => {
      if (configForm.lineId) {
        return current.map((item) => (item.id === configForm.lineId ? nextLine : item))
      }

      return [...current, nextLine]
    })
    setConfigProduct(null)
    setConfigStepIndex(0)
    setConfigForm({ lineId: '', quantity: '1', flavorIds: [], addonSelections: {} })
    setStatus({ type: 'idle', message: '' })
    setScreen('cart')
  }

  function updateQuantity(lineId, quantity) {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.id !== lineId))
      return
    }

    setCart((current) => current.map((item) => (item.id === lineId ? { ...item, quantity } : item)))
  }

  function updateAddressField(field, value) {
    setAddress((current) => ({
      ...current,
      [field]: field === 'cep' ? value.replace(/\D/g, '').slice(0, 8) : value,
      pointConfirmed: false,
      numberMatched: false,
      deliveryZoneId: '',
      deliveryZoneName: '',
    }))
    setAddressStatus({ type: 'idle', message: '' })
  }

  async function locateCustomerAddress() {
    if (!navigator.geolocation) {
      setAddressStatus({ type: 'error', message: 'Localizacao indisponivel neste navegador.' })
      return
    }

    setAddressStatus({ type: 'loading', message: 'Buscando sua localizacao...' })
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLat = formatCoordinate(position.coords.latitude)
        const nextLng = formatCoordinate(position.coords.longitude)

        try {
          const geocode = await reverseGeocodePoint(nextLat, nextLng)
          setAddress((current) => mergeGeocodedAddress({
            ...current,
            lat: nextLat,
            lng: nextLng,
            pointConfirmed: true,
            mapLabel: `Localizacao marcada: ${nextLat}, ${nextLng}`,
          }, geocode))
          setMapCenter({ lat: Number(nextLat), lng: Number(nextLng) })
          setAddressStatus({ type: 'success', message: 'Localizacao marcada e endereco preenchido.' })
        } catch {
          setAddress((current) => ({
            ...current,
            lat: nextLat,
            lng: nextLng,
            pointConfirmed: true,
            mapLabel: `Localizacao marcada: ${nextLat}, ${nextLng}`,
          }))
          setMapCenter({ lat: Number(nextLat), lng: Number(nextLng) })
          setAddressStatus({ type: 'success', message: 'Localizacao marcada no mapa.' })
        }
      },
      () => {
        setAddressStatus({ type: 'error', message: 'Nao foi possivel pegar sua localizacao.' })
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function geocodeCustomerAddress() {
    const queryText = [address.street, address.number, address.district, address.city, address.cep, 'Brasil']
      .filter(Boolean)
      .join(', ')

    if (!queryText.trim()) {
      setAddressStatus({ type: 'error', message: 'Preencha o endereco antes de localizar no mapa.' })
      return
    }

    setAddressStatus({ type: 'loading', message: 'Localizando endereco no mapa...' })

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(queryText)}`)
      const results = await response.json()
      const first = Array.isArray(results) ? results[0] : null

      if (!first) {
        setAddressStatus({ type: 'error', message: 'Endereco nao encontrado. Ajuste rua, numero e cidade.' })
        return
      }

      setAddress((current) => ({
        ...mergeGeocodedAddress(current, first),
        pointConfirmed: false,
        deliveryZoneId: '',
        deliveryZoneName: '',
      }))
      setMapCenter({ lat: Number(first.lat), lng: Number(first.lon) })
      setAddressStatus({ type: 'success', message: 'Endereco aproximado no mapa. Confira o ponto central e toque em "Usar ponto central" para validar a area de entrega.' })
    } catch {
      setAddressStatus({ type: 'error', message: 'Falha ao consultar o mapa.' })
    }
  }

  async function useMapCenterAsAddressPoint() {
    const nextLat = formatCoordinate(mapCenter.lat)
    const nextLng = formatCoordinate(mapCenter.lng)
    const baseAddress = {
      ...address,
      lat: nextLat,
      lng: nextLng,
      deliveryZoneId: '',
      deliveryZoneName: '',
      pointConfirmed: true,
      mapLabel: `Ponto marcado: ${nextLat}, ${nextLng}`,
    }

    setAddressStatus({ type: 'loading', message: 'Buscando endereco do ponto marcado...' })
    setAddress(baseAddress)

    try {
      const geocode = await reverseGeocodePoint(nextLat, nextLng)
      setAddress((current) => ({
        ...mergeGeocodedAddress(current, geocode),
        pointConfirmed: true,
      }))
      setAddressStatus({
        type: 'success',
        message: geocode?.address?.house_number
          ? 'Ponto marcado e endereco preenchido.'
          : 'Ponto marcado. O mapa nao encontrou o numero exato; ajuste rua/numero se precisar, mas a area sera validada pelo ponto.',
      })
    } catch {
      setAddressStatus({ type: 'success', message: 'Ponto marcado no mapa.' })
    }
  }

  function saveCustomerAddress() {
    if (!hasDeliveryAddress) {
      setAddressStatus({ type: 'error', message: 'Preencha rua, numero, bairro e cidade.' })
      return
    }

    if (!hasConfirmedDeliveryPoint) {
      setAddressStatus({ type: 'error', message: 'Confirme o ponto exato no mapa em "Usar ponto central". A area de entrega e validada pelo ponto, nao apenas pela rua.' })
      return
    }

    const nextServiceArea = getServiceAreaResult(address, storeProfile || {}, deliveryZones)

    if (!nextServiceArea.ok) {
      setAddressStatus({ type: 'error', message: nextServiceArea.reason })
      return
    }

    const nextAddress = {
      ...address,
      deliveryZoneId: nextServiceArea.zone?.id || '',
      deliveryZoneName: nextServiceArea.zone?.name || '',
      deliveryFee: nextServiceArea.fee || address.deliveryFee || '',
    }

    setAddress(nextAddress)
    setCustomer((current) => ({ ...current, address: formatCustomerAddress(nextAddress) }))
    setAddressStatus({
      type: 'success',
      message: nextServiceArea.zone ? `Endereco salvo na area ${nextServiceArea.zone.name}.` : 'Endereco salvo dentro da area de entrega.',
    })
    setScreen('checkout')
  }

  async function submitOrder() {
    if (!data || cart.length === 0) {
      setStatus({ type: 'error', message: 'Adicione pelo menos um item.' })
      setScreen('cart')
      return
    }

    if (!canFinish) {
      setStatus({ type: 'error', message: 'Complete identificacao, entrega e pagamento.' })
      return
    }

    const request = {
      customerName: customer.name.trim(),
      customerPhone: customer.phone.trim(),
      fulfillment,
      payment,
      addressLat: address.lat,
      addressLng: address.lng,
      deliveryZoneId: address.deliveryZoneId,
      deliveryZoneName: address.deliveryZoneName,
      note: [
        fulfillment === 'delivery' ? `Endereco: ${formattedAddress}` : 'Buscar o pedido',
        fulfillment === 'delivery' && address.lat && address.lng ? `Mapa: ${address.lat}, ${address.lng}` : '',
        fulfillment === 'delivery' && address.deliveryZoneName ? `Area: ${address.deliveryZoneName}` : '',
        payment === 'Dinheiro' && customer.changeFor.trim() ? `Troco para: ${customer.changeFor.trim()}` : '',
        payment === 'Dinheiro' && !customer.changeFor.trim() ? 'Nao precisa de troco' : '',
        customer.note.trim() ? `Obs: ${customer.note.trim()}` : '',
        'Origem: Cardapio digital',
      ].filter(Boolean).join(' | '),
      deliveryFee,
      items: cartToOrderItems(cart),
    }

    setStatus({ type: 'loading', message: 'Enviando pedido...' })

    try {
      let savedOrder = null

      if (data.source === 'local' && onCreateLocalOrder) {
        savedOrder = await onCreateLocalOrder(request)
      } else {
        savedOrder = await createBackendOrder(storeId, request)
      }

      setCart([])
      setCustomer(emptyCustomer)
      setAddress(emptyAddress)
      setAddressStatus({ type: 'idle', message: '' })
      setFulfillment('delivery')
      setPayment('')
      setTracking({
        id: savedOrder?.id || savedOrder?.backendId || `pedido-${Date.now()}`,
        storeId,
        source: data.source,
        status: savedOrder?.status || 'analysis',
        order: savedOrder,
      })
      setScreen('tracking')
      setStatus({ type: 'success', message: 'Pedido enviado. A loja recebeu sua solicitacao.' })
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Nao foi possivel enviar o pedido.',
      })
    }
  }

  if (!data) {
    return (
      <main className="customer-page customer-page--empty">
        <section className="customer-empty-state">
          <strong>{status.type === 'loading' ? 'Abrindo loja' : 'Loja nao encontrada'}</strong>
          <p>{status.message || 'Confira se o link do cardapio esta correto.'}</p>
          <a href="/">Voltar</a>
        </section>
      </main>
    )
  }

  const configSteps = configProduct ? getCartConfigurationSteps(configProduct) : []
  const currentConfigStep = configSteps[configStepIndex] || null
  const configUnitPrice = configProduct ? getCartItemUnitPrice(configProduct, configForm.flavorIds, configForm.addonSelections) : 0
  const configQuantity = Math.max(1, Number(configForm.quantity) || 1)
  const hasNextConfigStep = configStepIndex < Math.max(configSteps.length - 1, 0)
  const canCommitConfig = configProduct
    ? configSteps.every((step) => isCartStepSelectionValid(step, configForm))
    : false

  return (
    <main className="customer-page">
      {screen === 'home' ? (
        <>
          <header className="customer-store-header">
            <div className="customer-store-header__inner">
              <div className="customer-logo">{(storeProfile.name || 'MC').slice(0, 2).toUpperCase()}</div>
              <strong>{storeProfile.name || 'Minha loja'}</strong>
              <button type="button" aria-label="Buscar" onClick={() => document.querySelector('.customer-search input')?.focus()}>⌕</button>
            </div>
          </header>

          <section className="customer-home">
            <div className="customer-store-meta">
              <span>Aberto ate {storeProfile.schedule || '23h30'}</span>
              <span>Pedido min. {formatCurrency(parseCurrency(storeProfile.minimumOrder) || 25)}</span>
              <button type="button">Perfil da loja</button>
            </div>
            {status.message ? <p className={`customer-status customer-status--${status.type}`}>{status.message}</p> : null}

            <label className="customer-search">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque no cardapio" />
            </label>

            {popularProducts.length > 0 ? (
              <section className="customer-section">
                <h2>Os mais pedidos</h2>
                <div className="customer-popular-list">
                  {popularProducts.map((product) => (
                    <button className="customer-popular-card" key={product.id} type="button" onClick={() => addProduct(product, 'cart')}>
                      <ProductThumb product={product} />
                      <strong>{product.name}</strong>
                      <span>{formatCurrency(product.price)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <nav className="customer-category-tabs">
              <button className={activeCategory === 'all' ? 'is-active' : ''} type="button" onClick={() => setActiveCategory('all')}>Todos</button>
              {categories.map((category) => (
                <button
                  className={`customer-category-tab ${activeCategory === category.name ? 'is-active' : ''}`.trim()}
                  key={category.id || category.name}
                  type="button"
                  onClick={() => setActiveCategory(category.name)}
                >
                  {category.imageUrl ? <span style={{ backgroundImage: `url("${category.imageUrl}")` }} /> : null}
                  {category.name}
                </button>
              ))}
            </nav>

            <section className="customer-section customer-section--list">
              <h2>{activeCategory === 'all' ? 'Mais vendidas' : activeCategory}</h2>
              <div className="customer-product-list">
                {filteredProducts.map((product) => (
                  <button className="customer-product-row" key={product.id} type="button" onClick={() => addProduct(product, 'cart')}>
                    <div>
                      <strong>{product.name}</strong>
                      <p>{product.description || `A partir de ${formatCurrency(product.price)}`}</p>
                      <span>{formatCurrency(product.price)}</span>
                    </div>
                    <ProductThumb product={product} small />
                  </button>
                ))}
                {filteredProducts.length === 0 ? <p className="customer-empty-list">Nenhum item disponivel nessa busca.</p> : null}
              </div>
            </section>
          </section>

          <BottomNav cartCount={cartCount} screen={screen} setScreen={setScreen} />
          {cart.length > 0 ? (
            <button className="customer-floating-cart" type="button" onClick={() => setScreen('cart')}>
              <span>{cartCount} item(ns)</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </button>
          ) : null}
        </>
      ) : null}

      {screen === 'item' && configProduct ? (
        <CustomerScreen title={configProduct.name} onBack={() => setScreen('home')}>
          <section className="customer-item-config">
            <header className="customer-item-card">
              <ProductThumb product={configProduct} small />
              <div>
                <strong>{configProduct.name}</strong>
                <span>{formatCurrency(configUnitPrice)}</span>
                <small>{currentConfigStep ? `${configStepIndex + 1} de ${configSteps.length}` : 'Item direto'}</small>
              </div>
            </header>

            {currentConfigStep ? (
              <section className="customer-option-group">
                <header>
                  <div>
                    <h2>{currentConfigStep.title}</h2>
                    <p>
                      {currentConfigStep.required
                        ? `Escolha de ${Math.max(1, Number(currentConfigStep.minSelect) || 1)} ate ${currentConfigStep.maxSelect}`
                        : `Escolha ate ${currentConfigStep.maxSelect}`}
                    </p>
                  </div>
                  <span>{currentConfigStep.required ? 'Obrigatorio' : 'Opcional'}</span>
                </header>

                <div className="customer-option-list">
                  {currentConfigStep.options.map((option) => {
                    const selected = getCartStepSelectedIds(configForm, currentConfigStep).includes(option.id)

                    return (
                      <button className={selected ? 'is-selected' : ''} key={option.id} type="button" onClick={() => toggleConfigOption(currentConfigStep, option.id)}>
                        <div>
                          <strong>{option.name}</strong>
                          <small>{Number(option.price) > 0 ? `+ ${formatCurrency(option.price)}` : 'Sem adicional'}</small>
                        </div>
                        <b />
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            <section className="customer-config-summary">
              <label>
                <span>Quantidade</span>
                <input min="1" type="number" value={configForm.quantity} onChange={(event) => setConfigForm((current) => ({ ...current, quantity: event.target.value }))} />
              </label>
              {getSelectedCartFlavorNames(configProduct, configForm.flavorIds).length > 0 ? (
                <p><strong>Sabores:</strong> {getSelectedCartFlavorNames(configProduct, configForm.flavorIds).join(', ')}</p>
              ) : null}
              {getSelectedCartAddonEntries(configProduct, configForm.addonSelections).map((entry) => (
                <p key={entry.groupId}><strong>{entry.groupName}:</strong> {entry.label}</p>
              ))}
              {status.message && status.type === 'error' ? <p className="customer-config-error">{status.message}</p> : null}
            </section>

            <div className="customer-config-actions">
              <button type="button" onClick={() => {
                if (configStepIndex > 0) {
                  setConfigStepIndex((current) => current - 1)
                  return
                }

                setScreen('home')
              }}>
                Voltar
              </button>
              {hasNextConfigStep ? (
                <button type="button" onClick={goNextConfigStep}>Proximo</button>
              ) : (
                <button disabled={!canCommitConfig} type="button" onClick={commitConfiguredItem}>
                  Adicionar
                </button>
              )}
            </div>

            <StickyAction
              disabled={!canCommitConfig}
              label={hasNextConfigStep ? 'Proximo' : 'Adicionar ao carrinho'}
              total={configUnitPrice * configQuantity}
              onClick={hasNextConfigStep ? goNextConfigStep : commitConfiguredItem}
            />
          </section>
        </CustomerScreen>
      ) : null}

      {screen === 'cart' ? (
        <CustomerScreen title="Carrinho" onBack={() => setScreen('home')}>
          <div className="customer-cart-screen">
            <button className="customer-clear" type="button" onClick={() => setCart([])}>Limpar</button>
            {cart.map((item) => (
              <article className="customer-cart-line" key={item.id}>
                <ProductThumb product={item} small />
                <div>
                  <button className="customer-cart-line__edit" type="button" onClick={() => openCartLineConfig(item)}>
                    <strong>{item.quantity}x {item.name}</strong>
                  </button>
                  <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                  {getCartLineDetails(item).length > 0
                    ? getCartLineDetails(item).map((detail) => <small key={detail}>{detail}</small>)
                    : <small>Sem adicionais</small>}
                </div>
                <div className="customer-qty">
                  <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)}>−</button>
                  <b>{item.quantity}</b>
                  <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</button>
                </div>
              </article>
            ))}
            {cart.length === 0 ? <p className="customer-empty-list">Seu carrinho esta vazio.</p> : null}

            {suggestedProducts.length > 0 ? (
              <section className="customer-upsell">
                <h2>Peca tambem</h2>
                <div>
                  {suggestedProducts.map((product) => (
                    <button key={product.id} type="button" onClick={() => addProduct(product)}>
                      <ProductThumb product={product} small />
                      <strong>{product.name}</strong>
                      <span>{formatCurrency(product.price)}</span>
                      <b>+</b>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <button className="customer-outline-action" type="button" onClick={() => setScreen('home')}>Adicionar mais produtos</button>
            <StickyAction disabled={!canIdentify} label="Avancar" total={subtotal} onClick={() => setScreen('identify')} />
          </div>
        </CustomerScreen>
      ) : null}

      {screen === 'identify' ? (
        <CustomerScreen title="Identifique-se" onBack={() => setScreen('cart')}>
          <section className="customer-identify">
            <label>
              <span>Seu numero de WhatsApp e:</span>
              <input autoFocus value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} placeholder="(__) _____-____" />
            </label>
            <label>
              <span>Seu nome e sobrenome:</span>
              <input value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Nome e sobrenome" />
            </label>
            <button disabled={!customer.phone.trim() || !customer.name.trim()} type="button" onClick={() => setScreen('checkout')}>Avancar</button>
            <p>Para realizar seu pedido vamos precisar de suas informacoes, este e um ambiente protegido.</p>
          </section>
        </CustomerScreen>
      ) : null}

      {screen === 'checkout' ? (
        <CustomerScreen title="Finalizar pedido" onBack={() => setScreen('identify')}>
          <section className="customer-checkout-flow">
            <div className="customer-delivery-to">
              <span>Este pedido sera entregue a:</span>
              <strong>{customer.name}</strong>
              <small>{customer.phone}</small>
              <button type="button" onClick={() => setScreen('identify')}>Trocar</button>
            </div>

            <section className="customer-panel">
              <h2>Escolha como receber o pedido</h2>
              <button className={fulfillment === 'delivery' ? 'is-selected' : ''} type="button" onClick={() => setFulfillment('delivery')}>
                <span>⌂</span>
                <div>
                  <strong>{hasDeliveryAddress ? 'Endereco de entrega' : 'Cadastrar novo endereco'}</strong>
                  <small>{hasDeliveryAddress ? formattedAddress : 'Entrega em 39 - 49 min'}</small>
                </div>
                <b />
              </button>
              {fulfillment === 'delivery' ? (
                <button
                  className="customer-address-edit-button"
                  type="button"
                  onClick={() => {
                    setMapCenter(getMapCenter(address, storeProfile || {}))
                    setScreen('address')
                  }}
                >
                  {hasDeliveryAddress ? 'Alterar endereco no mapa' : 'Cadastrar endereco com mapa'}
                </button>
              ) : null}
              <button className={fulfillment === 'pickup' ? 'is-selected' : ''} type="button" onClick={() => setFulfillment('pickup')}>
                <span>▤</span>
                <div>
                  <strong>Buscar o pedido</strong>
                  <small>Gratis</small>
                </div>
                <b />
              </button>
            </section>

            <section className="customer-panel customer-panel--payment">
              <h2>Escolha a forma de pagamento</h2>
              <div className="customer-payment-group">Pagar agora <em>Mais rapido</em></div>
              {PAYMENT_OPTIONS.map((option, index) => (
                <button className={payment === option.id ? 'is-selected' : ''} key={option.id} type="button" onClick={() => setPayment(option.id)}>
                  <span>{index === 0 ? '◆' : '○'}</span>
                  <div>
                    <strong>{option.title}</strong>
                    <small>{option.subtitle}</small>
                  </div>
                  <b />
                </button>
              ))}
              {payment === 'Dinheiro' ? (
                <label className="customer-change-field">
                  <span>Precisa de troco?</span>
                  <input
                    value={customer.changeFor}
                    onChange={(event) => setCustomer((current) => ({ ...current, changeFor: event.target.value }))}
                    placeholder="Ex: Troco para R$ 100,00. Deixe vazio se nao precisar."
                  />
                </label>
              ) : null}
            </section>

            <label className="customer-note-field">
              <span>Observacoes</span>
              <textarea value={customer.note} onChange={(event) => setCustomer((current) => ({ ...current, note: event.target.value }))} placeholder="Ex: sem cebola, troco para 50..." />
            </label>

            <OrderTotals subtotal={subtotal} deliveryFee={deliveryFee} total={total} />
            {status.message ? <p className={`customer-status customer-status--${status.type}`}>{status.message}</p> : null}
            <StickyAction disabled={!canFinish || status.type === 'loading'} label={status.type === 'loading' ? 'Enviando...' : 'Finalizar pedido'} total={total} onClick={submitOrder} />
          </section>
        </CustomerScreen>
      ) : null}

      {screen === 'tracking' && tracking ? (
        <CustomerScreen title="Acompanhar pedido" onBack={() => setScreen('home')}>
          <section className="customer-tracking">
            <article className="customer-tracking-card">
              <span>Pedido</span>
              <strong>#{String(tracking.id).slice(0, 8)}</strong>
              <p>{status.message || 'Pedido conectado ao sistema da loja.'}</p>
            </article>

            <div className="customer-tracking-steps">
              {ORDER_STATUS_STEPS.map((step, index) => (
                <article className={index <= getOrderStatusIndex(tracking.status) ? 'is-done' : ''} key={step.id}>
                  <b>{index + 1}</b>
                  <span>{step.label}</span>
                </article>
              ))}
            </div>

            <section className="customer-tracking-summary">
              <div>
                <span>Status atual</span>
                <strong>{getOrderStatusLabel(tracking.status)}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatCurrency(tracking.order?.total || total)}</strong>
              </div>
              <p>A tela atualiza automaticamente enquanto a loja altera o pedido. Quando a loja finalizar, o acompanhamento encerra.</p>
            </section>

            <button className="customer-outline-action" type="button" onClick={() => setScreen('home')}>Voltar ao cardapio</button>
          </section>
        </CustomerScreen>
      ) : null}

      {screen === 'address' ? (
        <CustomerScreen title="Endereco de entrega" onBack={() => setScreen('checkout')}>
          <section className="customer-address-flow">
            <CustomerAddressMap
              center={mapCenter}
              onPan={setMapCenter}
              onUseCenter={useMapCenterAsAddressPoint}
              onZoom={setMapZoom}
              selectedAddress={address}
              zoom={mapZoom}
            />

            <div className="customer-address-actions">
              <button type="button" onClick={locateCustomerAddress}>Usar minha localizacao</button>
              <button type="button" onClick={geocodeCustomerAddress}>Localizar endereco</button>
            </div>

            <form className="customer-address-form" onSubmit={(event) => { event.preventDefault(); saveCustomerAddress() }}>
              <label>
                <span>CEP</span>
                <input value={address.cep} onChange={(event) => updateAddressField('cep', event.target.value)} placeholder="00000000" />
              </label>
              <label className="customer-address-form__wide">
                <span>Rua / Avenida</span>
                <input value={address.street} onChange={(event) => updateAddressField('street', event.target.value)} placeholder="Nome da rua" />
              </label>
              <label>
                <span>Numero</span>
                <input value={address.number} onChange={(event) => updateAddressField('number', event.target.value)} placeholder="123" />
              </label>
              <label>
                <span>Bairro</span>
                <input value={address.district} onChange={(event) => updateAddressField('district', event.target.value)} placeholder="Centro" />
              </label>
              <label className="customer-address-form__wide">
                <span>Cidade / UF</span>
                <input value={address.city} onChange={(event) => updateAddressField('city', event.target.value)} placeholder="Penha - SC" />
              </label>
              <label className="customer-address-form__wide">
                <span>Complemento</span>
                <input value={address.complement} onChange={(event) => updateAddressField('complement', event.target.value)} placeholder="Apartamento, bloco, sala" />
              </label>
              {address.lat && address.lng ? (
                <p className="customer-address-point">
                  {address.pointConfirmed ? 'Ponto confirmado para entrega' : 'Endereco apenas aproximado'}
                  : {address.lat}, {address.lng}
                  {address.deliveryZoneName ? ` - ${address.deliveryZoneName}` : ''}
                  {!address.pointConfirmed ? ' - toque em "Usar ponto central" para validar.' : ''}
                  {address.pointConfirmed && !address.numberMatched ? ' - numero nao confirmado pelo mapa.' : ''}
                </p>
              ) : null}
              {addressStatus.message ? <p className={`customer-status customer-status--${addressStatus.type}`}>{addressStatus.message}</p> : null}
              <button type="submit">Salvar endereco</button>
            </form>
          </section>
        </CustomerScreen>
      ) : null}
    </main>
  )
}

function CustomerScreen({ title, onBack, children }) {
  return (
    <section className="customer-step-page">
      <header className="customer-step-header">
        <button type="button" onClick={onBack}>‹</button>
        <strong>{title}</strong>
      </header>
      {children}
    </section>
  )
}

function OrderTotals({ subtotal, deliveryFee, total }) {
  return (
    <section className="customer-totals">
      <div>
        <span>Subtotal</span>
        <strong>{formatCurrency(subtotal)}</strong>
      </div>
      <div>
        <span>Entrega</span>
        <strong>{deliveryFee > 0 ? formatCurrency(deliveryFee) : 'Gratis'}</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>{formatCurrency(total)}</strong>
      </div>
    </section>
  )
}

function StickyAction({ disabled, label, total, onClick }) {
  return (
    <div className="customer-sticky-action">
      <button disabled={disabled} type="button" onClick={onClick}>
        <span>{label}</span>
        <strong>{formatCurrency(total)}</strong>
      </button>
    </div>
  )
}

function BottomNav({ cartCount, screen, setScreen }) {
  return (
    <nav className="customer-bottom-nav">
      <button className={screen === 'home' ? 'is-active' : ''} type="button" onClick={() => setScreen('home')}>
        <span>⌂</span>
        Inicio
      </button>
      <button type="button" onClick={() => setScreen(cartCount > 0 ? 'cart' : 'home')}>
        <span>□</span>
        Pedidos
      </button>
      <button className={screen === 'cart' ? 'is-active' : ''} type="button" onClick={() => setScreen('cart')}>
        <span>▿</span>
        Carrinho
        {cartCount > 0 ? <b>{cartCount}</b> : null}
      </button>
    </nav>
  )
}
