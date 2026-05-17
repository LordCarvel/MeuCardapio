import { useState } from 'react'
import styles from './StoreAccess.module.css'

const blankLoginForm = {
  email: '',
  password: '',
}
const blankResetForm = {
  email: '',
  code: '',
  password: '',
  confirmPassword: '',
}

const signupWeekdays = [
  ['mon', 'Segunda'],
  ['tue', 'Terca'],
  ['wed', 'Quarta'],
  ['thu', 'Quinta'],
  ['fri', 'Sexta'],
  ['sat', 'Sabado'],
  ['sun', 'Domingo'],
]

const defaultSignupSchedule = {
  mon: { open: true, from: '18:00', to: '23:30' },
  tue: { open: true, from: '18:00', to: '23:30' },
  wed: { open: true, from: '18:00', to: '23:30' },
  thu: { open: true, from: '18:00', to: '23:30' },
  fri: { open: true, from: '18:00', to: '00:30' },
  sat: { open: true, from: '18:00', to: '00:30' },
  sun: { open: false, from: '18:00', to: '23:30' },
}

const blankSignupForm = {
  tradeName: '',
  ownerName: '',
  email: '',
  phone: '',
  taxId: '',
  category: 'Restaurante',
  street: '',
  number: '',
  cityName: '',
  state: 'SC',
  schedule: defaultSignupSchedule,
  password: '',
  confirmPassword: '',
  emailCode: '',
}

export function StoreAccess({
  initialAccessKey = '',
  users = [],
  onCreateAccount,
  onLogin,
  onResetPassword,
  onUseDemo,
}) {
  const [mode, setMode] = useState('login')
  const [accessKey, setAccessKey] = useState(initialAccessKey)
  const [loginForm, setLoginForm] = useState({
    ...blankLoginForm,
    email: users[0]?.email || '',
  })
  const [signupForm, setSignupForm] = useState(blankSignupForm)
  const [resetForm, setResetForm] = useState(blankResetForm)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle')
  const [signupCodeSent, setSignupCodeSent] = useState(false)
  const [resetCodeSent, setResetCodeSent] = useState(false)

  const busy = status === 'submitting'

  function updateSignup(field, value) {
    setSignupForm((current) => ({ ...current, [field]: value }))
  }

  function updateReset(field, value) {
    setResetForm((current) => ({ ...current, [field]: value }))
  }

  function updateSignupSchedule(day, field, value) {
    setSignupForm((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        [day]: {
          ...current.schedule[day],
          [field]: field === 'open' ? Boolean(value) : value,
        },
      },
    }))
  }

  function buildScheduleText(schedule) {
    return signupWeekdays
      .map(([day, label]) => {
        const item = schedule[day]
        return item?.open ? `${label} ${item.from || '--:--'}-${item.to || '--:--'}` : `${label} fechado`
      })
      .join('; ')
  }

  async function submitLogin(event) {
    event.preventDefault()
    let result

    try {
      setStatus('submitting')
      result = await onLogin?.({
        email: loginForm.email.trim(),
        password: loginForm.password,
      })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel entrar agora.' }
    } finally {
      setStatus('idle')
    }

    if (result?.ok === false) {
      setError(result.message || 'Login invalido.')
      return
    }

    setError('')
  }

  async function submitAccessKey(event) {
    event.preventDefault()
    let result

    try {
      setStatus('submitting')
      result = await onUseDemo?.({
        source: 'accessKey',
        accessKey: accessKey.trim(),
      })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel entrar com a chave.' }
    } finally {
      setStatus('idle')
    }

    if (result?.ok === false) {
      setError(result.message || 'Chave invalida.')
      return
    }

    setError('')
  }

  async function submitSignup(event) {
    event.preventDefault()

    if (signupForm.password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    if (signupForm.password !== signupForm.confirmPassword) {
      setError('Confirme a senha com o mesmo valor.')
      return
    }

    let result

    try {
      setStatus('submitting')
      result = await onCreateAccount?.({
        tradeName: signupForm.tradeName.trim(),
        ownerName: signupForm.ownerName.trim(),
        email: signupForm.email.trim(),
        phone: signupForm.phone.trim(),
        taxId: signupForm.taxId.trim(),
        category: signupForm.category,
        street: signupForm.street.trim(),
        number: signupForm.number.trim(),
        cityName: signupForm.cityName.trim(),
        state: signupForm.state.trim().toUpperCase(),
        schedule: buildScheduleText(signupForm.schedule),
        password: signupForm.password,
        code: signupForm.emailCode.trim(),
      })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel criar a conta.' }
    } finally {
      setStatus('idle')
    }

    if (result?.ok === false) {
      setError(result.message || 'Nao foi possivel criar a conta.')
      return
    }

    setError('')
  }

  async function requestSignupValidationCode() {
    if (!signupForm.email.trim()) {
      setError('Informe o email antes de pedir o codigo.')
      return
    }

    let result

    try {
      setStatus('submitting')
      result = await onCreateAccount?.({
        action: 'requestCode',
        email: signupForm.email.trim(),
      })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel enviar o codigo.' }
    } finally {
      setStatus('idle')
    }

    if (result?.ok === false) {
      setMessage('')
      setError(result.message || 'Nao foi possivel enviar o codigo.')
      return
    }

    setSignupCodeSent(true)
    setError('')
    setMessage('Codigo enviado. Confira seu email e informe os 6 digitos.')
  }

  async function requestPasswordCode() {
    if (!resetForm.email.trim()) {
      setError('Informe o email cadastrado.')
      return
    }

    let result

    try {
      setStatus('submitting')
      result = await onResetPassword?.({
        action: 'requestCode',
        email: resetForm.email.trim(),
      })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel enviar o codigo.' }
    } finally {
      setStatus('idle')
    }

    if (result?.ok === false) {
      setMessage('')
      setError(result.message || 'Nao foi possivel enviar o codigo.')
      return
    }

    setResetCodeSent(true)
    setError('')
    setMessage('Codigo enviado. Confira seu email para redefinir a senha.')
  }

  async function submitPasswordReset(event) {
    event.preventDefault()

    if (resetForm.password.length < 6 || resetForm.password !== resetForm.confirmPassword) {
      setError('Informe e confirme uma senha com pelo menos 6 caracteres.')
      return
    }

    let result

    try {
      setStatus('submitting')
      result = await onResetPassword?.({
        action: 'reset',
        email: resetForm.email.trim(),
        code: resetForm.code.trim(),
        password: resetForm.password,
      })
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : 'Nao foi possivel redefinir a senha.' }
    } finally {
      setStatus('idle')
    }

    if (result?.ok === false) {
      setMessage('')
      setError(result.message || 'Nao foi possivel redefinir a senha.')
      return
    }

    setMode('login')
    setLoginForm({ email: resetForm.email.trim(), password: '' })
    setResetForm(blankResetForm)
    setResetCodeSent(false)
    setError('')
    setMessage('Senha redefinida. Entre com sua nova senha.')
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

          <div className={styles.modeTabs} role="tablist" aria-label="Acesso">
            <button className={mode === 'login' ? styles.modeTabActive : ''} type="button" onClick={() => { setMode('login'); setError(''); setMessage('') }}>
              Entrar
            </button>
            <button className={mode === 'signup' ? styles.modeTabActive : ''} type="button" onClick={() => { setMode('signup'); setError(''); setMessage('') }}>
              Criar conta
            </button>
          </div>

          {mode === 'login' ? (
            <>
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
                <button className={styles.outlineButton} data-testid="access-key-submit" disabled={busy} type="submit">
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
                {message ? <strong className={styles.success}>{message}</strong> : null}

                <button className={styles.primaryButton} data-testid="store-login-submit" disabled={busy} type="submit">
                  Entrar
                </button>
                <button className={styles.linkButton} type="button" onClick={() => { setMode('reset'); setError(''); setMessage('') }}>
                  Esqueci minha senha
                </button>
              </form>
            </>
          ) : mode === 'signup' ? (
            <form className={styles.form} data-testid="store-signup-form" onSubmit={submitSignup}>
              <label>
                <span>Nome da loja</span>
                <input required value={signupForm.tradeName} onChange={(event) => updateSignup('tradeName', event.target.value)} />
              </label>
              <label>
                <span>Seu nome</span>
                <input required value={signupForm.ownerName} onChange={(event) => updateSignup('ownerName', event.target.value)} />
              </label>
              <label>
                <span>E-mail</span>
                <input autoComplete="username" required type="email" value={signupForm.email} onChange={(event) => updateSignup('email', event.target.value)} />
              </label>
              <div className={styles.inlineAction}>
                <button className={styles.outlineButton} disabled={busy} type="button" onClick={requestSignupValidationCode}>
                  {signupCodeSent ? 'Reenviar codigo' : 'Enviar codigo de validacao'}
                </button>
              </div>
              <label>
                <span>Telefone</span>
                <input required value={signupForm.phone} onChange={(event) => updateSignup('phone', event.target.value)} />
              </label>
              <label>
                <span>CNPJ ou CPF</span>
                <input required value={signupForm.taxId} onChange={(event) => updateSignup('taxId', event.target.value)} />
              </label>
              <label>
                <span>Categoria</span>
                <select value={signupForm.category} onChange={(event) => updateSignup('category', event.target.value)}>
                  <option value="Restaurante">Restaurante</option>
                  <option value="Pizzaria">Pizzaria</option>
                  <option value="Hamburgueria">Hamburgueria</option>
                  <option value="Lanchonete">Lanchonete</option>
                  <option value="Marmitaria">Marmitaria</option>
                  <option value="Cafeteria">Cafeteria</option>
                  <option value="Confeitaria">Confeitaria</option>
                  <option value="Acaiteria">Acaiteria</option>
                </select>
              </label>
              <label>
                <span>Rua</span>
                <input required value={signupForm.street} onChange={(event) => updateSignup('street', event.target.value)} />
              </label>
              <label>
                <span>Numero</span>
                <input required value={signupForm.number} onChange={(event) => updateSignup('number', event.target.value)} />
              </label>
              <label>
                <span>Cidade</span>
                <input required value={signupForm.cityName} onChange={(event) => updateSignup('cityName', event.target.value)} />
              </label>
              <label>
                <span>UF</span>
                <input maxLength="2" required value={signupForm.state} onChange={(event) => updateSignup('state', event.target.value.toUpperCase())} />
              </label>
              <div className={styles.scheduleBlock}>
                <span>Horarios por dia</span>
                <div className={styles.scheduleGrid}>
                  {signupWeekdays.map(([day, label]) => {
                    const schedule = signupForm.schedule[day]
                    return (
                      <div className={styles.scheduleRow} key={day}>
                        <label className={styles.scheduleToggle}>
                          <input checked={schedule.open} type="checkbox" onChange={(event) => updateSignupSchedule(day, 'open', event.target.checked)} />
                          <strong>{label}</strong>
                        </label>
                        <input aria-label={`${label} abre`} disabled={!schedule.open} type="time" value={schedule.from} onChange={(event) => updateSignupSchedule(day, 'from', event.target.value)} />
                        <input aria-label={`${label} fecha`} disabled={!schedule.open} type="time" value={schedule.to} onChange={(event) => updateSignupSchedule(day, 'to', event.target.value)} />
                      </div>
                    )
                  })}
                </div>
              </div>
              <label>
                <span>Senha</span>
                <input autoComplete="new-password" required type="password" value={signupForm.password} onChange={(event) => updateSignup('password', event.target.value)} />
              </label>
              <label>
                <span>Confirmar senha</span>
                <input autoComplete="new-password" required type="password" value={signupForm.confirmPassword} onChange={(event) => updateSignup('confirmPassword', event.target.value)} />
              </label>
              <label>
                <span>Codigo recebido por email</span>
                <input inputMode="numeric" maxLength="6" required value={signupForm.emailCode} onChange={(event) => updateSignup('emailCode', event.target.value.replace(/\D/g, '').slice(0, 6))} />
              </label>

              {error ? <strong className={styles.error}>{error}</strong> : null}
              {message ? <strong className={styles.success}>{message}</strong> : null}

              <button className={styles.primaryButton} disabled={busy} type="submit">
                {busy ? 'Criando conta...' : 'Criar conta'}
              </button>
            </form>
          ) : (
            <form className={styles.form} data-testid="store-reset-form" onSubmit={submitPasswordReset}>
              <label>
                <span>E-mail cadastrado</span>
                <input autoComplete="username" required type="email" value={resetForm.email} onChange={(event) => updateReset('email', event.target.value)} />
              </label>
              <button className={styles.outlineButton} disabled={busy} type="button" onClick={requestPasswordCode}>
                {resetCodeSent ? 'Reenviar codigo' : 'Enviar codigo de recuperacao'}
              </button>
              <label>
                <span>Codigo recebido</span>
                <input inputMode="numeric" maxLength="6" required value={resetForm.code} onChange={(event) => updateReset('code', event.target.value.replace(/\D/g, '').slice(0, 6))} />
              </label>
              <label>
                <span>Nova senha</span>
                <input autoComplete="new-password" required type="password" value={resetForm.password} onChange={(event) => updateReset('password', event.target.value)} />
              </label>
              <label>
                <span>Confirmar nova senha</span>
                <input autoComplete="new-password" required type="password" value={resetForm.confirmPassword} onChange={(event) => updateReset('confirmPassword', event.target.value)} />
              </label>

              {error ? <strong className={styles.error}>{error}</strong> : null}
              {message ? <strong className={styles.success}>{message}</strong> : null}

              <button className={styles.primaryButton} disabled={busy} type="submit">
                Redefinir senha
              </button>
              <button className={styles.linkButton} type="button" onClick={() => { setMode('login'); setError(''); setMessage('') }}>
                Voltar para entrar
              </button>
            </form>
          )}

          <p className={styles.hint}>
            Use sua chave de acesso ou entre com o usuario da loja.
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
