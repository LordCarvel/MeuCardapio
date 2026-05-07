const DEFAULT_AVAILABLE_FROM = '18:00'
const DEFAULT_AVAILABLE_TO = '23:59'
const DEFAULT_AVAILABLE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function parseMenuImportContent(content) {
  const parsed = JSON.parse(String(content || '').replace(/^\uFEFF/, ''))
  return deserializeMenuImport(parsed)
}

export function deserializeMenuImport(parsed) {
  const snapshotMenu = extractSnapshotMenu(parsed)

  if (snapshotMenu.products.length > 0) {
    return snapshotMenu
  }

  const roots = [parsed, ...collectRoots(parsed)]
  const extracted = extractMenu(roots)

  return buildMenuImport(extracted)
}

function extractSnapshotMenu(parsed) {
  if (Array.isArray(parsed?.stores)) {
    const activeStore = parsed.stores.find((store) => store?.id === parsed.activeStoreId) || parsed.stores[0]
    return extractSnapshotMenu(activeStore?.snapshot ?? activeStore)
  }

  if (!Array.isArray(parsed?.products) || parsed.products.length === 0) {
    return { categories: [], products: [] }
  }

  return buildMenuImport({
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    products: parsed.products,
  })
}

function collectRoots(capture) {
  const roots = []

  if (Array.isArray(capture?.log?.entries)) {
    for (const entry of capture.log.entries) {
      const text = entry?.response?.content?.text

      if (typeof text !== 'string' || !text.trim()) {
        continue
      }

      const decoded = entry.response.content.encoding === 'base64'
        ? decodeBase64Utf8(text)
        : text

      pushJsonRoot(roots, decoded)
    }
  }

  if (Array.isArray(capture?.responses)) {
    for (const response of capture.responses) {
      if (response.json) {
        roots.push(response.json)
      } else if (response.bodyText) {
        pushJsonRoot(roots, response.bodyText)
      }
    }
  }

  for (const storage of [capture?.storages?.localStorage, capture?.storages?.sessionStorage]) {
    for (const value of getStorageValues(storage)) {
      if (typeof value === 'string' && value.length >= 2) {
        pushJsonRoot(roots, value)
      }
    }
  }

  return roots
}

function getStorageValues(storage) {
  if (!storage) {
    return []
  }

  if (Array.isArray(storage)) {
    return storage.map((item) => item?.value ?? item?.bodyText ?? item).filter(Boolean)
  }

  if (isPlainObject(storage)) {
    return Object.values(storage)
  }

  return []
}

function pushJsonRoot(roots, text) {
  try {
    roots.push(JSON.parse(String(text || '').replace(/^\uFEFF/, '')))
  } catch {
    // Capturas tambem contem HTML, JS, imagens e valores simples.
  }
}

function decodeBase64Utf8(value) {
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function extractMenu(roots) {
  const anotaRoot = roots.find((root) => Array.isArray(root?.data?.menu?.menu))

  if (anotaRoot) {
    return extractAnotaMenuMerchant(anotaRoot.data)
  }

  const categories = new Map()
  const products = new Map()

  for (const root of roots) {
    walk(root, [], (node, ancestors) => {
      if (!isPlainObject(node)) {
        return
      }

      const categoryName = getCategoryNameFromNode(node) || findCategoryName(ancestors)

      if (categoryName && hasProductChildren(node)) {
        upsertCategory(categories, categoryName, node)
      }

      if (isProductLike(node)) {
        const product = normalizeProductFromNode(node, categoryName || findCategoryName(ancestors))

        if (product) {
          const key = `${normalizeKey(product.category)}::${normalizeKey(product.name)}::${product.price}`
          products.set(key, product)
          upsertCategory(categories, product.category)
        }
      }
    })
  }

  return {
    categories: [...categories.values()],
    products: [...products.values()],
  }
}

function extractAnotaMenuMerchant(data) {
  const mainCategories = Array.isArray(data?.menu?.menu) ? data.menu.menu : []
  const auxCategories = Array.isArray(data?.menu?.menu_aux) ? data.menu.menu_aux : []
  const auxById = new Map(auxCategories.map((category) => [category.category_id || category._id, category]))
  const categories = mainCategories
    .filter((category) => Array.isArray(category.itens) && category.itens.length > 0)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((category) => ({
      name: cleanText(category.title),
      imageUrl: normalizeImageUrl(category.image),
      active: !isInactive(category),
    }))

  const products = []

  for (const category of mainCategories) {
    const categoryName = cleanText(category.title)

    for (const item of category.itens || []) {
      const price = pickPrice(item)

      if (!categoryName || !item?.title || price === null) {
        continue
      }

      products.push({
        name: cleanText(item.title),
        category: categoryName,
        description: cleanText(item.description),
        imageUrl: normalizeImageUrl(item.image),
        price,
        active: !isInactive(item),
        maxFlavors: getAnotaMaxFlavors(item, categoryName),
        addonGroups: extractAnotaStepGroups(item, auxById),
      })
    }
  }

  return { categories, products }
}

function extractAnotaStepGroups(item, auxById) {
  const groups = []

  for (const [index, step] of (item.next_steps || []).entries()) {
    const auxCategory = auxById.get(step.category)

    if (!auxCategory || !Array.isArray(auxCategory.itens) || auxCategory.itens.length === 0) {
      continue
    }

    groups.push({
      id: `group-${normalizeKey(auxCategory.category_id || auxCategory._id || `${item._id}-${index}`)}`,
      name: cleanText(auxCategory.title || auxCategory.internal_title || `Grupo ${index + 1}`),
      required: Number(step.min) > 0,
      minSelect: Math.max(0, Number(step.min) || 0),
      maxSelect: Math.max(1, Number(step.max) || 1),
      options: auxCategory.itens
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((option, optionIndex) => ({
          id: `addon-${normalizeKey(option.category_item_id || option.item_id || option._id || `${index}-${optionIndex}`)}`,
          name: cleanText(option.title || `Opcao ${optionIndex + 1}`),
          price: pickPrice(option) ?? 0,
          active: !isInactive(option),
        }))
        .filter((option) => option.name),
    })
  }

  return groups
}

function getAnotaMaxFlavors(item, categoryName) {
  const title = `${categoryName} ${item?.title || ''}`.toLowerCase()
  const flavorStep = (item?.next_steps || []).find((step) => Number(step.min) > 0 && Number(step.max) > 1)

  if (flavorStep) {
    return Number(flavorStep.max) || 2
  }

  if (/pizza|broto|familia|gigante|fatias/.test(title)) {
    return 2
  }

  return 1
}

function buildMenuImport({ categories, products }) {
  const categoryMap = new Map()

  for (const category of categories || []) {
    upsertCategory(categoryMap, category?.name, category)
  }

  for (const product of products || []) {
    const categoryName = product?.category || 'Importados'
    upsertCategory(categoryMap, categoryName)
  }

  const normalizedCategories = [...categoryMap.values()].map((category, index) => ({
    id: category.id || `import-cat-${index + 1}-${normalizeKey(category.name) || 'categoria'}`,
    name: category.name,
    imageUrl: normalizeImageUrl(category.imageUrl || category.image),
    active: category.active !== false,
  }))
  const categoryNames = new Set(normalizedCategories.map((category) => category.name))
  const normalizedProducts = (products || [])
    .map((product, index) => {
      const category = cleanText(product?.category) || normalizedCategories[0]?.name || 'Importados'

      if (!categoryNames.has(category)) {
        return null
      }

      const name = cleanText(product?.name || product?.title)

      if (!name) {
        return null
      }

      return {
        id: product.id || `import-prod-${index + 1}-${normalizeKey(name) || 'produto'}`,
        name,
        category,
        description: cleanText(product.description || product.descricao),
        imageUrl: normalizeImageUrl(product.imageUrl || product.image),
        price: Number(product.price) || 0,
        active: product.active !== false,
        availableFrom: product.availableFrom || DEFAULT_AVAILABLE_FROM,
        availableTo: product.availableTo || DEFAULT_AVAILABLE_TO,
        availableDays: Array.isArray(product.availableDays) && product.availableDays.length > 0
          ? product.availableDays
          : DEFAULT_AVAILABLE_DAYS,
        maxFlavors: product.maxFlavors || 1,
        flavors: Array.isArray(product.flavors) ? product.flavors : [],
        addonGroups: Array.isArray(product.addonGroups) ? product.addonGroups : [],
      }
    })
    .filter(Boolean)

  return {
    categories: normalizedCategories,
    products: normalizedProducts,
  }
}

function walk(value, ancestors, visit) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, ancestors, visit)
    }
    return
  }

  if (!isPlainObject(value)) {
    return
  }

  visit(value, ancestors)

  for (const [key, child] of Object.entries(value)) {
    const nextAncestors = [...ancestors, { key, node: value }]
    walk(child, nextAncestors, visit)
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasProductChildren(node) {
  return ['items', 'itens', 'products', 'produtos', 'children', 'subItems', 'subitens']
    .some((key) => Array.isArray(node[key]) && node[key].some(isProductLike))
}

function getCategoryNameFromNode(node) {
  const type = normalizeKey(node.type || node.kind || node.entity || node.__typename)
  const explicitCategory = type.includes('categor') || type.includes('section') || type.includes('group')
  const name = pickText(node, ['category', 'categoryName', 'categoria', 'nomeCategoria', 'name', 'nome', 'title', 'titulo'])

  if (!name) {
    return ''
  }

  if (explicitCategory || hasProductChildren(node)) {
    return cleanText(name)
  }

  return ''
}

function findCategoryName(ancestors) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const name = getCategoryNameFromNode(ancestors[index].node)

    if (name) {
      return name
    }
  }

  return ''
}

function isProductLike(node) {
  const name = pickText(node, ['name', 'nome', 'title', 'titulo', 'descriptionTitle'])
  const price = pickPrice(node)
  const type = normalizeKey(node.type || node.kind || node.entity || node.__typename)

  if (!name || price === null) {
    return false
  }

  if (type.includes('categor') || hasProductChildren(node)) {
    return false
  }

  return true
}

function normalizeProductFromNode(node, categoryName) {
  const name = cleanText(pickText(node, ['name', 'nome', 'title', 'titulo', 'descriptionTitle']))
  const price = pickPrice(node)

  if (!name || price === null) {
    return null
  }

  return {
    name,
    category: cleanText(categoryName || pickText(node, ['categoryName', 'categoria', 'category']) || 'Importados'),
    description: cleanText(pickText(node, ['description', 'descricao', 'details', 'detalhes'])),
    price,
    active: !isInactive(node),
    maxFlavors: /pizza|famil/i.test(`${categoryName} ${name}`) ? 2 : 1,
    addonGroups: extractAddonGroups(node),
  }
}

function extractAddonGroups(node) {
  const candidateKeys = ['addons', 'adicionais', 'additionals', 'complements', 'complementos', 'options', 'opcoes']
  const groups = []

  for (const key of candidateKeys) {
    if (!Array.isArray(node[key])) {
      continue
    }

    const options = node[key]
      .filter(isPlainObject)
      .map((option, index) => ({
        id: `addon-${normalizeKey(pickText(option, ['id', '_id']) || `${key}-${index}`)}`,
        name: cleanText(pickText(option, ['name', 'nome', 'title', 'titulo']) || `Opcao ${index + 1}`),
        price: pickPrice(option) ?? 0,
        active: !isInactive(option),
      }))
      .filter((option) => option.name)

    if (options.length > 0) {
      groups.push({
        id: `group-${normalizeKey(key)}`,
        name: labelFromKey(key),
        required: false,
        minSelect: 0,
        maxSelect: Math.max(1, options.length),
        options,
      })
    }
  }

  return groups
}

function upsertCategory(categories, name, source = {}) {
  const cleanName = cleanText(name)

  if (!cleanName) {
    return
  }

  const key = normalizeKey(cleanName)
  const current = categories.get(key)
  categories.set(key, {
    id: current?.id || source.id,
    name: current?.name || cleanName,
    imageUrl: current?.imageUrl || source.imageUrl || source.image || '',
    active: current?.active !== false && !isInactive(source),
  })
}

function pickText(node, keys) {
  for (const key of keys) {
    const value = node[key]

    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return ''
}

function pickPrice(node) {
  const keys = [
    'price',
    'preco',
    'valor',
    'value',
    'amount',
    'unitPrice',
    'salePrice',
    'promotionalPrice',
    'discountPrice',
    'originalPrice',
  ]

  for (const key of keys) {
    const value = node[key]
    const parsed = parsePrice(value)

    if (parsed !== null) {
      return parsed
    }
  }

  for (const key of ['prices', 'precos', 'priceInfo']) {
    if (isPlainObject(node[key])) {
      const parsed = pickPrice(node[key])

      if (parsed !== null) {
        return parsed
      }
    }
  }

  return null
}

function parsePrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1000 && Number.isInteger(value) ? value / 100 : value
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : null
}

function isInactive(node = {}) {
  const values = [
    node.active,
    node.ativo,
    node.enabled,
    node.disponivel,
    node.available,
    node.visible,
    node.paused,
    node.pausado,
    node.deleted,
    node.excluded,
  ]

  if (values.includes(false)) {
    return true
  }

  if (node.paused === true || node.pausado === true || node.deleted === true || node.excluded === true) {
    return true
  }

  const status = normalizeKey(node.status || node.situation || node.situacao)
  return ['inactive', 'inativo', 'paused', 'pausado', 'unavailable', 'indisponivel'].some((term) => status.includes(term))
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeImageUrl(value) {
  const url = cleanText(value)

  if (!url || !/^https?:\/\//i.test(url)) {
    return ''
  }

  return url
}

function normalizeKey(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function labelFromKey(key) {
  const labels = {
    addons: 'Adicionais',
    adicionais: 'Adicionais',
    additionals: 'Adicionais',
    complements: 'Complementos',
    complementos: 'Complementos',
    options: 'Opcoes',
    opcoes: 'Opcoes',
  }

  return labels[key] || key
}
