import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { get } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173'
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    }).on('error', reject)
  })
}

function getStatus(url) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      response.resume()
      response.on('end', () => resolve(response.statusCode))
    }).on('error', reject)
  })
}

async function openPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function waitForJson(url, timeout = 8000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    try {
      return await getJson(url)
    } catch {
      await sleep(120)
    }
  }

  throw new Error(`Timeout aguardando ${url}`)
}

async function waitForHttp(url, timeout = 5000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    try {
      const status = await getStatus(url)
      if (status >= 200 && status < 500) {
        return
      }
    } catch {
      await sleep(120)
    }
  }

  throw new Error(`Timeout aguardando ${url}`)
}

async function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl)
  const pending = new Map()
  let nextId = 1

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const callback = pending.get(message.id)

    if (!callback) {
      return
    }

    pending.delete(message.id)
    if (message.error) {
      callback.reject(new Error(message.error.message))
      return
    }
    callback.resolve(message.result)
  })

  return {
    send(method, params = {}) {
      const id = nextId
      nextId += 1
      socket.send(JSON.stringify({ id, method, params }))

      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
      })
    },
    close() {
      socket.close()
    },
  }
}

async function main() {
  const browserPath = browserCandidates.find((candidate) => existsSync(candidate))

  if (!browserPath) {
    throw new Error('Nenhum Chrome ou Edge encontrado para o smoke test.')
  }

  await waitForHttp(appUrl, 3000).catch(() => {
    throw new Error(`Servidor Vite nao respondeu em ${appUrl}. Inicie npm run dev antes do smoke.`)
  })

  const port = await openPort()
  const userDataDir = mkdtempSync(join(tmpdir(), 'meucardapio-smoke-'))
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1366,768',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' })

  let cdp

  try {
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`, 15000)
    const page = targets.find((target) => target.type === 'page')

    cdp = await connectCdp(page.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await cdp.send('Page.navigate', { url: appUrl })

    const evaluate = async (expression) => {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
      }

      return result.result.value
    }

    const waitFor = async (expression, label, timeout = 7000) => {
      const deadline = Date.now() + timeout

      while (Date.now() < deadline) {
        if (await evaluate(`Boolean(${expression})`)) {
          return
        }
        await sleep(100)
      }

      throw new Error(`Timeout: ${label}`)
    }

    const click = (selector) => evaluate(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error('Elemento nao encontrado: ${selector}');
        element.click();
        return true;
      })()
    `)

    const clickByText = (text, selector = 'button') => evaluate(`
      (() => {
        const normalize = (value) => value.replace(/\\s+/g, ' ').trim();
        const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
        const element = nodes.find((node) => normalize(node.innerText || node.textContent || '').includes(${JSON.stringify(text)}));
        if (!element) throw new Error('Texto nao encontrado: ${text}');
        element.click();
        return true;
      })()
    `)

    const submitForm = (formId) => evaluate(`
      (() => {
        const form = document.getElementById(${JSON.stringify(formId)});
        if (!form) throw new Error('Formulario nao encontrado: ${formId}');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return true;
      })()
    `)
    const toastHas = (text) => `document.querySelector('.content__top p')?.innerText.includes(${JSON.stringify(text)})`

    const clickInCard = (cardSelector, text, buttonText = '') => evaluate(`
      (() => {
        const cards = [...document.querySelectorAll(${JSON.stringify(cardSelector)})];
        const card = cards.find((item) => item.innerText.includes(${JSON.stringify(text)}));
        if (!card) throw new Error('Card nao encontrado: ${text}');
        const buttons = [...card.querySelectorAll('button')];
        const button = ${JSON.stringify(buttonText)}
          ? buttons.find((item) => item.innerText.includes(${JSON.stringify(buttonText)}))
          : buttons[buttons.length - 1];
        if (!button) throw new Error('Botao nao encontrado');
        button.click();
        return true;
      })()
    `)

    const setValue = (selector, value) => evaluate(`
      (() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error('Campo nao encontrado: ${selector}');
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
          || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
          || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
          || Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        descriptor.set.call(element, ${JSON.stringify(value)});
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return element.value;
      })()
    `)

    const openNav = async (id, label) => {
      await click(`[data-testid="nav-${id}"]`)
      if (label) {
        await waitFor(`document.body.innerText.includes(${JSON.stringify(label)})`, `nav ${id}`)
      }
    }

    const closeModal = async () => {
      await click('[data-testid="modal-close"]')
    }

    const clearLocalData = async () => {
      await waitFor(`document.readyState === 'complete'`, 'document ready', 10000)
      await evaluate(`
        (() => {
          localStorage.removeItem('meucardapio-ops-front-v3');
          sessionStorage.clear();
          return true;
        })()
      `)
      await cdp.send('Page.reload')
      await waitFor(`document.querySelector('.app-frame, [data-testid="store-login-form"], [data-testid="store-onboarding-form"]')`, 'app recarregado', 15000)
    }

    const createStoreIfNeeded = async () => {
      const needsOnboarding = await evaluate(`Boolean(document.querySelector('[data-testid="store-onboarding-form"]'))`)

      if (!needsOnboarding) {
        return
      }

      await setValue('[data-testid="store-trade-name"]', 'Smoke Pizza')
      await setValue('[data-testid="store-owner"]', 'Responsavel Smoke')
      await setValue('[data-testid="store-phone"]', '(47) 9 9000-0001')
      await setValue('[data-testid="store-email"]', 'smoke@meucardapio.local')
      await setValue('[data-testid="store-tax-id"]', '47.123.456/0001-99')
      await setValue('[data-testid="store-street"]', 'Rua Smoke')
      await setValue('[data-testid="store-number"]', '123')
      await setValue('[data-testid="store-city"]', 'Penha')
      await setValue('[data-testid="store-state"]', 'SC')
      await setValue('[data-testid="store-schedule"]', '18:00 - 23:30')
      await setValue('[data-testid="store-access-name"]', 'Admin Smoke')
      await setValue('[data-testid="store-access-email"]', 'admin@meucardapio.local')
      await setValue('[data-testid="store-access-password"]', 'admin123')
      await setValue('[data-testid="store-access-confirm"]', 'admin123')
      await click('[data-testid="store-onboarding-submit"]')
      await waitFor(`document.querySelector('.app-frame')`, 'cadastro inicial da loja', 15000)
    }

    const loginIfNeeded = async () => {
      const needsLogin = await evaluate(`Boolean(document.querySelector('[data-testid="store-login-form"]'))`)

      if (!needsLogin) {
        return
      }

      await setValue('[data-testid="store-login-email"]', 'admin@meucardapio.local')
      await setValue('[data-testid="store-login-password"]', 'admin123')
      await click('[data-testid="store-login-submit"]')
      await waitFor(`document.querySelector('.app-frame')`, 'login da loja', 10000)
    }

    const enterApp = async () => {
      await createStoreIfNeeded()
      await loginIfNeeded()
    }

    await waitFor(`document.querySelector('.app-frame, [data-testid="store-login-form"], [data-testid="store-onboarding-form"]')`, 'app carregado', 10000)
    await enterApp()
    await clearLocalData()
    await enterApp()
    await waitFor(`document.querySelectorAll('.stage-card').length === 3`, 'colunas renderizadas')
    await waitFor(`getComputedStyle(document.body).overflow === 'hidden'`, 'sem scroll global')
    await waitFor(`document.querySelector('.app-frame').getBoundingClientRect().height <= window.innerHeight`, 'layout dentro da tela')

    const hasSecurityNotice = await evaluate(`Boolean(document.querySelector('.notice .btn--link'))`)
    if (hasSecurityNotice) {
      await click('.notice .btn--link')
      await waitFor(`document.body.innerText.includes('Atualizar seguranca')`, 'modal seguranca')
      await setValue('#password-form .field:nth-of-type(1) input', 'senha-antiga')
      await setValue('#password-form .field:nth-of-type(2) input', 'novaSenha123')
      await setValue('#password-form .field:nth-of-type(3) input', 'novaSenha123')
      await click('button[form="password-form"]')
      await waitFor(toastHas('Configuracoes de seguranca atualizadas.'), 'senha salva')
    }

    await click('[data-testid="store-profile"]')
    await waitFor(`document.body.innerText.includes('Dados da loja')`, 'modal loja')
    await setValue('[data-testid="store-trade-name"]', 'Operacao Smoke')
    await click('button[form="store-form"]')
    await waitFor(`
      (() => {
        const profile = document.querySelector('[data-testid="store-profile"]');
        return profile ? profile.innerText.includes('Operacao Smoke') : false;
      })()
    `, 'loja atualizada')

    await click('[data-testid="open-register"]')
    await waitFor(`document.body.innerText.includes('Cadastro comercial')`, 'cadastro comercial')
    await closeModal()

    await click('[data-testid="open-automations"]')
    await waitFor(`document.body.innerText.includes('Automacoes')`, 'modal automacoes')
    await submitForm('settings-form')
    await waitFor(`document.querySelector('.content__top p')?.innerText.includes('Ajustes salvos localmente.')`, 'automacoes salvas')

    await click('[data-testid="open-printer"]')
    await waitFor(`document.body.innerText.includes('Impressora')`, 'modal impressora')
    await clickByText('Teste', '.modal .btn')
    await waitFor(toastHas('Teste de impressao enviado para a fila.'), 'teste impressora')
    await clickByText('Remover', '.modal .btn')
    await waitFor(toastHas('Item removido da fila de impressao.'), 'fila impressora')
    await click('button[form="printer-form"]')
    await waitFor(toastHas('Impressora configurada localmente.'), 'impressora salva')

    await click('[data-testid="open-notifications"]')
    await waitFor(`document.body.innerText.includes('Notificacoes')`, 'modal notificacoes')
    await closeModal()

    await click('[data-testid="open-cash"]')
    await waitFor(`document.body.innerText.includes('Caixa da loja')`, 'modal caixa')
    await clickByText('Abrir caixa', '.modal__footer .btn')
    await waitFor(toastHas('Caixa aberto.'), 'caixa aberto')

    await click('[data-testid="blocked-orders"]')
    await waitFor(`document.body.innerText.includes('Pedidos bloqueados')`, 'bloqueados')
    await clickByText('Recuperar', '.modal .btn')
    await waitFor(toastHas('Pedido #8320 recuperado.'), 'bloqueado recuperado')
    await closeModal()

    await click('[data-testid="new-order"]')
    await waitFor(`document.querySelector('.pos-shell')`, 'pdv novo pedido')
    await click('[data-testid="pos-category-cat-pizzas"]')
    await waitFor(`document.querySelectorAll('.summary-item').length === 0`, 'categoria nao adiciona item')
    await click('[data-testid="pos-product-prod-1"]')
    await waitFor(`document.querySelector('[data-testid="cart-flavor-flavor-pizza-4"]')`, 'configurar primeira pizza')
    await click('[data-testid="cart-flavor-flavor-pizza-4"]')
    await clickByText('[ A ] Proximo', '.pos-next-row button')
    await waitFor(`document.querySelector('[data-testid="cart-addon-addon-extra-cheddar"]')`, 'etapa adicionais')
    await click('[data-testid="cart-addon-addon-extra-cheddar"]')
    await clickByText('[ A ] Proximo', '.pos-next-row button')
    await waitFor(`document.querySelector('[data-testid="cart-addon-addon-border-cheddar"]')`, 'etapa borda')
    await click('[data-testid="cart-addon-addon-border-cheddar"]')
    await clickByText('[ F ] Finalizar item', '.pos-next-row button')
    await waitFor(`document.body.innerText.includes('Cheddar') && document.body.innerText.includes('Borda: Borda cheddar')`, 'primeira pizza com adicionais')
    await click('[data-testid="pos-product-prod-1"]')
    await waitFor(`document.querySelector('[data-testid="cart-flavor-flavor-pizza-6"]')`, 'configurar segunda pizza')
    await click('[data-testid="cart-flavor-flavor-pizza-6"]')
    await clickByText('[ F ] Finalizar item', '.pos-next-row button')
    await waitFor(`
      document.querySelectorAll('.summary-item[data-product-id="prod-1"]').length === 2
    `, 'duas pizzas separadas no carrinho')
    await evaluate(`
      (() => {
        const items = [...document.querySelectorAll('.summary-item[data-product-id="prod-1"]')];
        if (items.length < 2) throw new Error('Itens da pizza nao encontrados');
        items[0].click();
        return true;
      })()
    `)
    await clickByText('[Q] Editar', '.pos-summary__header button')
    await waitFor(`document.querySelector('[data-testid="cart-flavor-flavor-pizza-4"]')`, 'editar pizza do carrinho')
    await click('[data-testid="cart-flavor-flavor-pizza-4"]')
    await click('[data-testid="cart-flavor-flavor-pizza-5"]')
    await clickByText('[ A ] Proximo', '.pos-next-row button')
    await waitFor(`document.querySelector('[data-testid="cart-addon-addon-extra-cheddar"]')`, 'editar adicionais')
    await click('[data-testid="cart-addon-addon-extra-bacon"]')
    await clickByText('[ A ] Proximo', '.pos-next-row button')
    await waitFor(`document.querySelector('[data-testid="cart-addon-addon-border-cheddar"]')`, 'editar borda')
    await click('[data-testid="cart-addon-addon-border-cheddar"]')
    await click('[data-testid="cart-addon-addon-border-catupiry"]')
    await clickByText('[ F ] Finalizar item', '.pos-next-row button')
    await waitFor(`document.body.innerText.includes('Bacon crocante') && document.body.innerText.includes('Borda: Borda catupiry')`, 'configuracao alterada no carrinho')
    await click('.save-draft')
    await waitFor(toastHas('Rascunho salvo localmente.'), 'rascunho salvo')
    await clickByText('Rascunhos', '.pos-summary__header button')
    await waitFor(`document.body.innerText.includes('Rascunhos de pedido')`, 'modal rascunhos')
    await clickByText('Carregar', '.modal .btn')
    await waitFor(`document.querySelector('.pos-shell')`, 'retorno ao editor de pedido')
    await setValue('[data-testid="new-customer"]', 'Cliente Smoke')
    await click('[data-testid="new-order-tab-delivery"]')
    await click('[data-testid="open-payment-panel"]')
    await waitFor(`document.body.innerText.includes('Forma de pagamento')`, 'tela pagamento')
    await waitFor(`!document.querySelector('.pos-sheet').innerText.includes('Pix')`, 'pix removido do pedido')
    await clickByText('Cartao', '.pos-sheet button')
    await waitFor(`!document.body.innerText.includes('Forma de pagamento')`, 'pagamento aplicado')
    await click('[data-testid="open-document-panel"]')
    await waitFor(`document.body.innerText.includes('CPF/CNPJ')`, 'tela cpf cnpj')
    await setValue('.pos-sheet input', '123.456.789-00')
    await clickByText('[ ENTER ] Salvar', '.pos-sheet .btn')
    await waitFor(`document.body.innerText.includes('123.456.789-00')`, 'cpf cnpj aplicado')
    await click('[data-testid="open-adjustment-panel"]')
    await waitFor(`document.body.innerText.includes('Ajustar valor do pedido')`, 'tela ajustes')
    await setValue('.pos-sheet [data-testid="discount-input"]', '2,00')
    await setValue('.pos-sheet [data-testid="surcharge-input"]', '1,00')
    await clickByText('[ ENTER ] Aplicar ajuste', '.pos-sheet .btn')
    await waitFor(`document.body.innerText.includes('Desconto R$ 2,00') || document.body.innerText.includes('Desconto R$ 2,00')`, 'ajuste aplicado')
    await click('[data-testid="open-delivery-panel"]')
    await waitFor(`document.body.innerText.includes('Forma de entrega')`, 'tela entrega')
    await clickByText('Novo endereco', '.pos-sheet button')
    await waitFor(`document.querySelector('.pos-sheet [data-testid="new-address"]')`, 'formulario endereco')
    await setValue('.pos-sheet [data-testid="new-address"]', 'Rua Smoke')
    await setValue('.pos-sheet [data-testid="delivery-number"]', '123')
    await setValue('.pos-sheet [data-testid="delivery-district"]', 'Centro')
    await setValue('.pos-sheet [data-testid="delivery-city"]', 'Penha')
    await sleep(250)
    await submitForm('delivery-address-form')
    await waitFor(toastHas('Endereco criado.'), 'endereco salvo', 20000)
    await clickByText('[ ENTER ] Aplicar forma de entrega', '.pos-sheet .btn')
    await waitFor(`document.querySelector('[data-testid="order-address-summary"]').innerText.includes('Rua Smoke')`, 'endereco aplicado')
    await submitForm('new-order-form')
    await waitFor(`!document.querySelector('.pos-shell') && ${toastHas('criado no front')}`, 'pedido criado')

    await setValue('[data-testid="order-search"]', 'Cliente Smoke')
    await waitFor(`document.querySelectorAll('.order-card').length === 1`, 'busca filtrando')
    await clickByText('Detalhes', '.order-card button')
    await waitFor(`document.body.innerText.includes('Desconto') && document.body.innerText.includes('Acrescimo') && document.body.innerText.includes('CPF/CNPJ')`, 'detalhes financeiros do pedido')
    await click('[data-testid="modal-close"]')
    await click('[data-testid="filter-delivery"]')
    await waitFor(`document.body.innerText.includes('Cliente Smoke')`, 'filtro delivery')
    await click('[data-testid="filter-all"]')
    await setValue('[data-testid="order-search"]', '')

    await click('[data-testid="edit-order-8341"]')
    await waitFor(`document.body.innerText.includes('Editar pedido #8341')`, 'modal editar pedido')
    await setValue('[data-testid="edit-customer"]', 'Cliente Editado')
    await click('button[form="edit-order-form"]')
    await waitFor(`document.body.innerText.includes('Cliente Editado')`, 'pedido editado')

    await click('[data-testid="delete-order-8341"]')
    await waitFor(`document.body.innerText.includes('Apagar pedido #8341')`, 'modal apagar pedido')
    await clickByText('Apagar', '.modal__footer .btn')
    await waitFor(`!document.querySelector('[data-testid="order-8341"]')`, 'pedido apagado')

    await click('[data-testid="open-settings"]')
    await waitFor(`document.body.innerText.includes('Ajustes de operacao')`, 'modal ajustes')
    await submitForm('settings-form')
    await waitFor(`document.querySelector('.content__top p')?.innerText.includes('Ajustes salvos localmente.')`, 'ajustes salvos')

    await click('[data-testid="open-chat"]')
    await waitFor(`document.body.innerText.includes('Chat do atendimento')`, 'modal chat')
    await setValue('[data-testid="chat-input"]', 'Teste de atendimento')
    await click('.inline-form .btn--primary')
    await waitFor(`document.body.innerText.includes('Teste de atendimento')`, 'chat enviou mensagem')
    await closeModal()

    await click('[data-testid="open-suggestion"]')
    await waitFor(`document.body.innerText.includes('Enviar sugestao')`, 'modal sugestao')
    await setValue('[data-testid="suggestion-input"]', 'Melhorar o fechamento do caixa')
    await clickByText('Registrar sugestao', '.modal .btn')
    await waitFor(toastHas('Sugestao registrada localmente.'), 'sugestao registrada')

    await click('[data-testid="shortcut-whatsapp"]')
    await waitFor(`document.body.innerText.includes('Chat do atendimento')`, 'atalho whatsapp')
    await closeModal()
    await click('[data-testid="shortcut-boost"]')
    await waitFor(`document.body.innerText.includes('Novo cupom ou cashback')`, 'atalho campanha')
    await closeModal()
    await click('[data-testid="shortcut-help"]')
    await waitFor(`document.body.innerText.includes('Central de ajuda')`, 'atalho ajuda')
    await closeModal()
    await click('[data-testid="shortcut-home"]')
    await waitFor(`document.querySelectorAll('.stage-card').length === 3`, 'atalho inicio')

    await openNav('menu', 'Gestor de cardapio')
    await evaluate(`
      (() => {
        const button = document.querySelector('.menu-product-row .link-button');
        if (!button) throw new Error('Botao de link do cardapio nao encontrado');
        button.click();
        return true;
      })()
    `)
    await waitFor(`${toastHas('Link do item copiado.')} || ${toastHas('Link pronto:')}`, 'link do cardapio')
    await click('[data-testid="menu-new-category"]')
    await waitFor(`document.body.innerText.includes('Nova categoria')`, 'modal nova categoria')
    await setValue('[data-testid="category-name"]', 'Smoke Cat')
    await click('button[form="category-form"]')
    await waitFor(toastHas('Categoria criada.'), 'categoria criada')
    await click('[data-testid="menu-new-product"]')
    await waitFor(`document.body.innerText.includes('Novo produto')`, 'modal novo produto')
    await setValue('[data-testid="product-name"]', 'Smoke Produto')
    await setValue('#product-form .field:nth-of-type(2) select', 'Smoke Cat')
    await setValue('[data-testid="product-price"]', '21,90')
    await click('button[form="product-form"]')
    await waitFor(`document.body.innerText.includes('Smoke Produto')`, 'produto criado')
    await evaluate(`
      (() => {
        const row = [...document.querySelectorAll('.menu-product-row')].find((item) => item.innerText.includes('Smoke Produto'));
        if (!row) throw new Error('Produto Smoke nao encontrado para editar');
        row.querySelector('.select-action').click();
        return true;
      })()
    `)
    await waitFor(`document.body.innerText.includes('Editar Smoke Produto')`, 'modal editar produto')
    await setValue('[data-testid="product-price"]', '23,90')
    await click('button[form="product-form"]')
    await waitFor(toastHas('Produto editado.'), 'produto editado')
    let smokeFlavorCount = await evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
        if (!card) throw new Error('Produto Smoke nao encontrado para validar sabores');
        return card.querySelectorAll('.menu-option-row').length;
      })()
    `)
    while (smokeFlavorCount > 0) {
      const expectedCount = smokeFlavorCount - 1
      await evaluate(`
        (() => {
          const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
          if (!card) throw new Error('Produto Smoke nao encontrado para apagar sabor');
          const button = card.querySelector('.menu-option-row__delete');
          if (!button) throw new Error('Botao de apagar sabor nao encontrado');
          button.click();
          return true;
        })()
      `)
      await waitFor(`
        (() => {
          const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
          return card ? card.querySelectorAll('.menu-option-row').length === ${expectedCount} : false;
        })()
      `, `sabores restantes ${expectedCount}`)
      smokeFlavorCount = expectedCount
    }
    await evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
        if (!card) throw new Error('Produto Smoke nao encontrado para criar grupo adicional');
        const button = [...card.querySelectorAll('[data-testid^="add-addon-group-"]')][0];
        if (!button) throw new Error('Botao de adicionar grupo adicional nao encontrado');
        button.click();
        return true;
      })()
    `)
    await waitFor(`
      (() => {
        const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
        return card ? card.querySelectorAll('.menu-addon-card').length === 1 : false;
      })()
    `, 'grupo adicional criado no cardapio')
    await evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
        if (!card) throw new Error('Produto Smoke nao encontrado para configurar grupo adicional');

        const groupInput = [...card.querySelectorAll('[data-testid^="addon-group-name-"]')][0];
        const optionInput = [...card.querySelectorAll('[data-testid^="addon-option-name-"]')][0];
        const requiredButton = [...card.querySelectorAll('[data-testid^="addon-group-required-"]')][0];

        if (!groupInput || !optionInput || !requiredButton) {
          throw new Error('Campos do grupo adicional nao encontrados');
        }

        const setElementValue = (element, value) => {
          const prototype = Object.getPrototypeOf(element);
          const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
            || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          descriptor.set.call(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        };

        setElementValue(groupInput, 'Coberturas Smoke');
        setElementValue(optionInput, 'Cheddar Smoke');
        requiredButton.click();
        return true;
      })()
    `)
    await waitFor(`
      (() => {
        const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
        if (!card) return false;
        const groupInput = [...card.querySelectorAll('[data-testid^="addon-group-name-"]')][0];
        const optionInput = [...card.querySelectorAll('[data-testid^="addon-option-name-"]')][0];
        return groupInput?.value === 'Coberturas Smoke'
          && optionInput?.value === 'Cheddar Smoke'
          && card.innerText.includes('Etapa obrigatoria');
      })()
    `, 'grupo adicional configurado')
    await evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
        if (!card) throw new Error('Produto Smoke nao encontrado para adicionar opcao');
        const button = [...card.querySelectorAll('[data-testid^="add-addon-option-"]')][0];
        if (!button) throw new Error('Botao de adicionar opcao nao encontrado');
        button.click();
        return true;
      })()
    `)
    await waitFor(`
      (() => {
        const card = [...document.querySelectorAll('.menu-product-card')].find((item) => item.innerText.includes('Smoke Produto'));
        return card ? card.querySelectorAll('.menu-addon-card .menu-option-row').length === 2 : false;
      })()
    `, 'segunda opcao adicional criada')
    await evaluate(`
      (() => {
        const row = [...document.querySelectorAll('.menu-product-row')].find((item) => item.innerText.includes('Smoke Produto'));
        if (!row) throw new Error('Produto Smoke nao encontrado para apagar');
        row.querySelector('.btn--danger').click();
        return true;
      })()
    `)
    await waitFor(`document.body.innerText.includes('Apagar Smoke Produto')`, 'modal apagar produto')
    await clickByText('Apagar', '.modal__footer .btn')
    await waitFor(`!document.body.innerText.includes('Smoke Produto')`, 'produto apagado')
    await evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.menu-category-card')].find((item) => item.innerText.includes('Smoke Cat'));
        if (!card) throw new Error('Categoria Smoke Cat nao encontrada para apagar');
        const button = card.querySelector('.menu-category-card__tools .btn--danger');
        if (!button) throw new Error('Botao apagar categoria nao encontrado');
        button.click();
        return true;
      })()
    `)
    await waitFor(`document.body.innerText.includes('Apagar Smoke Cat')`, 'modal apagar categoria')
    await clickByText('Apagar categoria', '.modal__footer .btn')
    await waitFor(`
      (() => ![...document.querySelectorAll('.menu-category-card h3')]
        .some((item) => item.textContent.includes('Smoke Cat')))()
    `, 'categoria apagada')

    await openNav('counter', 'PDV rapido')
    await click('.product-pick-list button:first-child')
    await click('.checkout-total .btn--primary')
    await waitFor(`document.body.innerText.includes('Finalizar venda PDV')`, 'modal checkout pdv')
    await clickByText('Confirmar venda', '.modal__footer .btn')
    await waitFor(toastHas('Venda PDV virou pedido'), 'pdv gerou pedido')

    await openNav('tables', 'Salao e mesas')
    await click('[data-testid="new-table"]')
    await waitFor(`document.body.innerText.includes('Nova mesa')`, 'modal nova mesa')
    await setValue('[data-testid="table-name"]', 'Mesa Smoke')
    await click('button[form="table-form"]')
    await waitFor(`document.body.innerText.includes('Mesa Smoke')`, 'mesa criada')
    await clickInCard('.table-card', 'Mesa Smoke', 'Pedido')
    await waitFor(`document.body.innerText.includes('Pedido para Mesa Smoke')`, 'pedido da mesa')
    await clickByText('Criar pedido', '.modal__footer .btn')
    await waitFor(toastHas('criado para Mesa Smoke'), 'pedido da mesa criado')
    await clickInCard('.table-card', 'Mesa Smoke', 'Fechar')
    await waitFor(`document.body.innerText.includes('Fechar Mesa Smoke')`, 'fechar mesa')
    await clickByText('Fechar mesa', '.modal__footer .btn')
    await waitFor(toastHas('Mesa fechada.'), 'mesa fechada')
    await clickInCard('.table-card', 'Mesa Smoke')
    await waitFor(`document.body.innerText.includes('Apagar Mesa Smoke')`, 'modal apagar mesa')
    await clickByText('Apagar mesa', '.modal__footer .btn')
    await waitFor(`!document.body.innerText.includes('Mesa Smoke')`, 'mesa apagada')

    await openNav('delivery', 'Fila de entregas')
    await click('[data-testid="delivery-map"]')
    await waitFor(`document.body.innerText.includes('Mapa de entregas')`, 'mapa de entregas')
    await closeModal()
    await click('[data-testid="new-courier"]')
    await waitFor(`document.body.innerText.includes('Novo entregador')`, 'modal novo entregador')
    await setValue('#courier-form .field:nth-of-type(1) input', 'Courier Smoke')
    await click('button[form="courier-form"]')
    await waitFor(`document.body.innerText.includes('Courier Smoke')`, 'entregador criado')
    await click('.module-grid--delivery .module-card:first-child .data-row .btn--primary')
    await waitFor(`document.body.innerText.includes('Atribuir entrega')`, 'modal atribuir entrega')
    await click('.modal .list-row .btn--primary')
    await waitFor(toastHas('atribuida'), 'entrega atribuida')
    await evaluate(`
      (() => {
        const card = [...document.querySelectorAll('.module-grid--delivery .module-card')]
          .find((item) => item.innerText.includes('Entregadores'));
        if (!card) throw new Error('Card de entregadores nao encontrado');
        const row = [...card.querySelectorAll('.data-row')].find((item) => item.innerText.includes('Courier Smoke'));
        if (!row) throw new Error('Courier Smoke nao encontrado para apagar');
        const button = [...row.querySelectorAll('button')].find((item) => item.innerText.includes('Apagar'));
        if (!button) throw new Error('Botao apagar entregador nao encontrado');
        button.click();
        return true;
      })()
    `)
    await waitFor(`document.body.innerText.includes('Apagar Courier Smoke')`, 'modal apagar entregador')
    await clickByText('Apagar entregador', '.modal__footer .btn')
    await waitFor(`
      (() => {
        const card = [...document.querySelectorAll('.module-grid--delivery .module-card')]
          .find((item) => item.innerText.includes('Entregadores'));
        if (!card) return true;
        return ![...card.querySelectorAll('.data-row')]
          .some((item) => item.innerText.includes('Courier Smoke'));
      })()
    `, 'entregador apagado')

    await openNav('service', 'Robo e canais')
    await click('[data-testid="bot-training"]')
    await waitFor(`document.body.innerText.includes('Treinar robo')`, 'modal bot training')
    await click('button[form="bot-form"]')
    await waitFor(toastHas('Treinamento do robo atualizado.'), 'bot salvo')
    await clickInCard('.module-grid--service .module-card:first-child .data-row', 'WhatsApp', 'Robo')
    await click('[data-testid="new-recovery"]')
    await waitFor(`document.body.innerText.includes('Nova regra de recuperacao')`, 'modal nova recuperacao')
    await setValue('#recovery-form .field:nth-of-type(1) input', 'Recovery Smoke')
    await click('button[form="recovery-form"]')
    await waitFor(`document.body.innerText.includes('Recovery Smoke')`, 'recuperacao criada')
    await clickInCard('.module-grid--service .module-card:nth-child(2) .data-row', 'Recovery Smoke', 'Editar')
    await waitFor(`document.body.innerText.includes('Editar Recovery Smoke')`, 'editar recuperacao')
    await setValue('#recovery-form .field:nth-of-type(1) input', 'Recovery Smoke 2')
    await click('button[form="recovery-form"]')
    await waitFor(`document.body.innerText.includes('Recovery Smoke 2')`, 'recuperacao editada')
    await clickInCard('.module-grid--service .module-card:nth-child(2) .data-row', 'Recovery Smoke 2', 'Apagar')
    await waitFor(`document.body.innerText.includes('Apagar Recovery Smoke 2')`, 'apagar recuperacao')
    await clickByText('Apagar regra', '.modal__footer .btn')
    await waitFor(`!document.body.innerText.includes('Recovery Smoke 2')`, 'recuperacao apagada')

    await openNav('kds', 'Display de cozinha')
    await click('[data-testid="kds-settings"]')
    await waitFor(`document.body.innerText.includes('Configurar KDS')`, 'modal kds')
    await click('button[form="kds-form"]')
    await waitFor(toastHas('Configuracoes do KDS atualizadas.'), 'kds salvo')
    await click('.kds-ticket footer .btn:first-child')
    await waitFor(`document.body.innerText.includes('Pedido #')`, 'detalhe kds')
    await closeModal()
    await evaluate(`
      (() => {
        const button = [...document.querySelectorAll('.kds-ticket footer .btn--primary')]
          .find((item) => item.innerText.includes('Avancar'));
        if (!button) throw new Error('Botao avancar do KDS nao encontrado');
        button.click();
        return true;
      })()
    `)
    await waitFor(`${toastHas('atualizado')} || ${toastHas('pronto para saida')}`, 'kds avancou')

    await openNav('marketing', 'Cupons e cashback')
    await click('[data-testid="new-coupon"]')
    await waitFor(`document.body.innerText.includes('Novo cupom')`, 'modal novo cupom')
    await setValue('[data-testid="coupon-code"]', 'SMOKE15')
    await click('button[form="coupon-form"]')
    await waitFor(`document.body.innerText.includes('SMOKE15')`, 'cupom criado')
    await clickInCard('.module-grid--marketing .module-card:first-child .data-row', 'SMOKE15', 'Editar')
    await waitFor(`document.body.innerText.includes('Editar SMOKE15')`, 'editar cupom')
    await click('button[form="coupon-form"]')
    await waitFor(toastHas('Cupom atualizado.'), 'cupom editado')
    await click('[data-testid="new-qr"]')
    await waitFor(`document.body.innerText.includes('Gerar QR Code')`, 'modal qr')
    await setValue('[data-testid="qr-table"]', 'Mesa QR Smoke')
    await setValue('[data-testid="qr-url"]', 'mesa-qr-smoke')
    await click('button[form="qr-form"]')
    await waitFor(`document.body.innerText.includes('Mesa QR Smoke')`, 'qr criado')
    await clickInCard('.module-grid--marketing .module-card:last-child .data-row', 'Mesa QR Smoke', 'Imprimir')
    await waitFor(`document.body.innerText.includes('Imprimir QR - Mesa QR Smoke')`, 'imprimir qr')
    await clickByText('Imprimir', '.modal .btn')
    await waitFor(toastHas('enviado para impressao'), 'qr impresso')

    await openNav('inventory', 'Controle de estoque')
    await click('[data-testid="new-stock"]')
    await waitFor(`document.body.innerText.includes('Novo insumo')`, 'modal novo insumo')
    await setValue('[data-testid="stock-item"]', 'Tomate Smoke')
    await click('button[form="stock-form"]')
    await waitFor(`document.body.innerText.includes('Tomate Smoke')`, 'insumo criado')
    await clickInCard('.data-row', 'Tomate Smoke', 'Editar')
    await waitFor(`document.body.innerText.includes('Editar Tomate Smoke')`, 'editar insumo')
    await click('button[form="stock-form"]')
    await waitFor(toastHas('Insumo atualizado.'), 'insumo editado')
    await clickInCard('.data-row', 'Tomate Smoke', 'Entrada')
    await clickInCard('.data-row', 'Tomate Smoke', 'Baixa')
    await clickInCard('.data-row', 'Tomate Smoke', 'Apagar')
    await waitFor(`document.body.innerText.includes('Apagar Tomate Smoke')`, 'apagar insumo')
    await clickByText('Apagar insumo', '.modal__footer .btn')
    await waitFor(`!document.body.innerText.includes('Tomate Smoke')`, 'insumo apagado')

    await openNav('finance', 'Financeiro')
    await click('[data-testid="new-finance"]')
    await waitFor(`document.body.innerText.includes('Novo lancamento financeiro')`, 'modal novo financeiro')
    await setValue('[data-testid="finance-title"]', 'Conta Smoke')
    await click('button[form="finance-form"]')
    await waitFor(`document.body.innerText.includes('Conta Smoke')`, 'financeiro criado')
    await clickInCard('.module-grid--finance .module-card:nth-child(2) .data-row', 'Conta Smoke', 'Editar')
    await waitFor(`document.body.innerText.includes('Editar Conta Smoke')`, 'editar financeiro')
    await click('button[form="finance-form"]')
    await waitFor(toastHas('Lancamento atualizado.'), 'financeiro editado')
    await clickInCard('.module-grid--finance .module-card:nth-child(2) .data-row', 'Conta Smoke', 'Dar baixa')
    await waitFor(toastHas('Lancamento baixado.'), 'financeiro baixado')
    await clickInCard('.module-grid--finance .module-card:nth-child(2) .data-row', 'Conta Smoke', 'Apagar')
    await waitFor(`document.body.innerText.includes('Apagar Conta Smoke')`, 'apagar financeiro')
    await clickByText('Apagar lancamento', '.modal__footer .btn')
    await waitFor(`!document.body.innerText.includes('Conta Smoke')`, 'financeiro apagado')

    await openNav('fiscal', 'Fiscal e NFC-e')
    await click('.module-card__header .btn--primary')
    await waitFor(`document.body.innerText.includes('Emitir NFC-e')`, 'modal emitir nota')
    await clickByText('Emitir', '.modal__footer .btn')
    await waitFor(`${toastHas('NFC-e do pedido')} || ${toastHas('Nenhum pedido novo')}`, 'nota emitida')
    await click('.data-list .data-row .btn')
    await waitFor(`document.body.innerText.includes('NFC-e')`, 'ver nota')
    await closeModal()
    await clickInCard('.data-row', 'NFC-e', 'Cancelar')
    await waitFor(`${toastHas('Nota cancelada.')} || document.body.innerText.includes('Cancelada')`, 'nota cancelada')

    await openNav('integrations', 'Integracoes')
    await click('[data-testid="integration-help"]')
    await waitFor(`document.body.innerText.includes('Ajuda de integracoes')`, 'ajuda integracoes')
    await closeModal()
    await clickInCard('.data-row', 'Rappi')
    await waitFor(`${toastHas('Rappi conectado.')} || ${toastHas('Sincronizado')} || document.body.innerText.includes('Sincronizado')`, 'integracao alternada')

    await openNav('reports', 'Relatorios')
    await click('[data-testid="export-reports"]')
    await waitFor(`document.body.innerText.includes('Exportar relatorios')`, 'modal exportar')
    await click('.modal .list-row:first-child .btn--primary')
    await waitFor(toastHas('CSV de pedidos exportado.'), 'csv exportado')
    await click('.modal .list-row:last-child .btn--primary')
    await waitFor(toastHas('Backup JSON exportado.'), 'backup exportado')
    await closeModal()

    await click('[data-testid="open-register"]')
    await waitFor(`document.body.innerText.includes('Cadastro comercial')`, 'cadastro para reset')
    await clickByText('Resetar', '.modal .btn')
    await waitFor(toastHas('Base local redefinida para o estado inicial.'), 'reset local')
    await waitFor(`document.querySelectorAll('.stage-card').length === 3`, 'volta aos pedidos apos reset')

    await click('[data-testid="order-8335"] footer .btn--primary')
    await waitFor(`document.body.innerText.includes('Finalizar pedido #8335')`, 'modal finalizar')
    await clickByText('Confirmar entrega', '.modal__footer .btn')
    await waitFor(`!document.querySelector('[data-testid="order-8335"]')`, 'pedido finalizado')

    console.log('Smoke front OK')
  } finally {
    if (cdp) {
      cdp.close()
    }
    browser.kill()
    await sleep(500)
    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      // Edge can keep cache handles open for a moment after headless shutdown.
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
