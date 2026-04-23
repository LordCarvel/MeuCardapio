import { useState } from 'react'
import styles from './StoreAccess.module.css'

const blankLoginForm = {
  email: '',
  password: '',
}

export function StoreAccess({
  demoAvailable = false,
  users = [],
  onLogin,
  onUseDemo,
}) {
  const [accessKey, setAccessKey] = useState('')
  const [loginForm, setLoginForm] = useState({
    ...blankLoginForm,
    email: users[0]?.email || '',
  })
  const [error, setError] = useState('')

  function submitLogin(event) {
    event.preventDefault()
    const result = onLogin?.({
      email: loginForm.email.trim(),
      password: loginForm.password,
    })

    if (result?.ok === false) {
      setError(result.message || 'Login invalido.')
      return
    }

    setError('')
  }

  function submitAccessKey(event) {
    event.preventDefault()
    const result = onUseDemo?.({
      source: 'accessKey',
      accessKey: accessKey.trim(),
    })

    if (result?.ok === false) {
      setError(result.message || 'Chave invalida.')
      return
    }

    setError('')
  }

  function startDemo() {
    const result = onUseDemo?.({
      source: 'demoButton',
      accessKey: 'demo',
    })

    if (result?.ok === false) {
      setError(result.message || 'Nao foi possivel abrir o demo.')
      return
    }

    setError('')
  }

  return (
    <main className={styles.shell}>
      <section className={styles.window}>
        <section className={styles.formPanel}>
          <div className={styles.logoRow}>
            <div className={styles.logoMark}>MC</div>
            <div>
              <span>MeuCardapio</span>
              <strong>PDV e gestao para restaurantes</strong>
            </div>
          </div>

          <header className={styles.header}>
            <p>Acesse sua conta</p>
            <h1>Seu restaurante em um so lugar</h1>
            <span>
              Cardapio digital, robo de atendimento, pedidos, caixa e entrega no mesmo painel.
            </span>
          </header>

          <form className={styles.form} onSubmit={submitAccessKey}>
            <label>
              <span>Chave de acesso</span>
              <input
                data-testid="access-key-input"
                placeholder="Sua chave de acesso"
                value={accessKey}
                onChange={(event) => setAccessKey(event.target.value)}
              />
            </label>
            <button className={styles.outlineButton} data-testid="access-key-submit" type="submit">
              Entrar com chave de acesso
            </button>
          </form>

          <div className={styles.divider}>
            <span>ou</span>
          </div>

          <form className={styles.form} data-testid="store-login-form" onSubmit={submitLogin}>
            <label>
              <span>E-mail</span>
              <input
                autoComplete="username"
                data-testid="store-login-email"
                placeholder="Seu e-mail"
                value={loginForm.email}
                onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
              />
            </label>
            <label>
              <span>Senha</span>
              <input
                autoComplete="current-password"
                data-testid="store-login-password"
                placeholder="Sua senha"
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
              />
            </label>

            {error ? <strong className={styles.error}>{error}</strong> : null}

            <button className={styles.primaryButton} data-testid="store-login-submit" type="submit">
              Entrar
            </button>
          </form>

          <div className={styles.demoBox}>
            <div>
              <strong>Quer so explorar o produto?</strong>
              <span>
                {demoAvailable
                  ? 'Abre novamente o ambiente demonstrativo salvo neste navegador.'
                  : 'Cria uma loja padrao local para navegar pelas funcionalidades.'}
              </span>
            </div>
            <button className={styles.demoButton} data-testid="start-demo" type="button" onClick={startDemo}>
              Testar demo
            </button>
          </div>

          <p className={styles.hint}>
            Nesta versao local, voce pode usar a chave <strong>demo</strong> ou clicar em <strong>Testar demo</strong>.
          </p>
        </section>

        <section className={styles.heroPanel}>
          <div className={styles.heroBadge}>MeuCardapio</div>
          <div className={styles.heroCopy}>
            <p>SaaS para restaurantes</p>
            <h2>Gestao completa para o seu restaurante</h2>
            <span>
              Pedidos, atendimento, cardapio digital, mesas, entregas, marketing e financeiro em um unico sistema.
            </span>
          </div>

          <div className={styles.heroDevices}>
            <article className={styles.deviceMain}>
              <header>
                <strong>Painel de pedidos</strong>
                <small>Status em tempo real</small>
              </header>
              <div className={styles.deviceColumns}>
                <div>
                  <span>Entrada</span>
                  <b>12</b>
                </div>
                <div>
                  <span>Preparo</span>
                  <b>08</b>
                </div>
                <div>
                  <span>Saida</span>
                  <b>04</b>
                </div>
              </div>
            </article>

            <article className={styles.devicePhone}>
              <strong>Cardapio mobile</strong>
              <span>Entrega | Retirada</span>
              <div className={styles.phoneList}>
                <b>Pizza grande</b>
                <b>Combo executivo</b>
                <b>Brownie</b>
              </div>
            </article>
          </div>

          <div className={styles.featureRow}>
            <article>
              <strong>Robo de atendimento</strong>
              <span>Captura pedidos no WhatsApp e no cardapio digital.</span>
            </article>
            <article>
              <strong>PDV e caixa</strong>
              <span>Fechamento rapido para balcao, salao e retirada.</span>
            </article>
            <article>
              <strong>Delivery e mesas</strong>
              <span>Operacao da cozinha ate a entrega no mapa.</span>
            </article>
          </div>
        </section>
      </section>
    </main>
  )
}
