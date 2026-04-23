import { useState } from 'react'
import styles from './StoreAccess.module.css'
import { StoreProfileForm } from './StoreProfileForm'
import {
  describeStoreServiceModes,
  getStoreInitials,
  isStoreConfigured,
  normalizeStoreProfile,
} from './storeProfile'

const blankLoginForm = {
  email: '',
  password: '',
}

const blankOwnerForm = {
  name: '',
  email: '',
  password: '',
  confirm: '',
}

function buildOwnerForm(storeProfile, users) {
  return {
    ...blankOwnerForm,
    name: storeProfile.owner || '',
    email: users[0]?.email || storeProfile.email || '',
  }
}

function SummaryItem({ label, value }) {
  return (
    <article className={styles.summaryItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

export function StoreAccess({ storeProfile, users = [], onLogin, onCreateStore }) {
  const normalizedStore = normalizeStoreProfile(storeProfile)
  const canLogin = isStoreConfigured(normalizedStore) && users.length > 0
  const mode = canLogin ? 'login' : 'onboarding'
  const [loginForm, setLoginForm] = useState({
    ...blankLoginForm,
    email: users[0]?.email || '',
  })
  const [profileForm, setProfileForm] = useState(normalizedStore)
  const [ownerForm, setOwnerForm] = useState(buildOwnerForm(normalizedStore, users))
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

  function submitOnboarding(event) {
    event.preventDefault()

    if (!profileForm.tradeName.trim() || !profileForm.owner.trim() || !profileForm.phone.trim()) {
      setError('Preencha nome da loja, responsavel e telefone principal.')
      return
    }

    if (!profileForm.email.trim() || !profileForm.taxId.trim()) {
      setError('Informe email comercial e CNPJ antes de continuar.')
      return
    }

    if (!profileForm.street.trim() || !profileForm.number.trim() || !profileForm.cityName.trim() || !profileForm.schedule.trim()) {
      setError('Complete endereco, numero, cidade e horario principal.')
      return
    }

    if (!ownerForm.name.trim() || !ownerForm.email.trim() || ownerForm.password.length < 6) {
      setError('Crie o acesso do responsavel com nome, email e senha de pelo menos 6 caracteres.')
      return
    }

    if (ownerForm.password !== ownerForm.confirm) {
      setError('As senhas do acesso principal nao conferem.')
      return
    }

    const result = onCreateStore?.({
      profile: profileForm,
      owner: {
        name: ownerForm.name.trim(),
        email: ownerForm.email.trim(),
        password: ownerForm.password,
      },
    })

    if (result?.ok === false) {
      setError(result.message || 'Nao foi possivel concluir o cadastro.')
      return
    }

    setError('')
  }

  return (
    <main className={styles.shell}>
      <section className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span>{getStoreInitials(profileForm)}</span>
            <div>
              <p>Painel operacional</p>
              <h1>{canLogin ? normalizedStore.name : 'Cadastre a loja por completo'}</h1>
            </div>
          </div>

          <p className={styles.lead}>
            {canLogin
              ? 'Entre com o usuario principal ou com uma conta ja criada para acessar a operacao.'
              : 'Configure dados comerciais, endereco, canais de venda e o primeiro acesso da operacao.'}
          </p>

          <div className={styles.summary}>
            <SummaryItem label="Categoria" value={profileForm.category || 'Nao informada'} />
            <SummaryItem label="Atendimento" value={describeStoreServiceModes(profileForm) || 'Selecione os canais'} />
            <SummaryItem label="Cidade" value={profileForm.city || 'Defina a cidade da operacao'} />
            <SummaryItem label="Horario" value={profileForm.schedule || 'Nao configurado'} />
          </div>

          <div className={styles.checklist}>
            <strong>O que precisa ficar pronto</strong>
            <ul>
              <li>Dados fiscais e nome fantasia da loja.</li>
              <li>Endereco operacional e canais de atendimento.</li>
              <li>Parametros iniciais de entrega e retirada.</li>
              <li>Acesso do primeiro responsavel da loja.</li>
            </ul>
          </div>
        </aside>

        <section className={styles.panel}>
          {mode === 'login' ? (
            <>
              <header className={styles.panelHeader}>
                <p>Loja configurada</p>
                <h2>Entrar na operacao</h2>
                <span>{normalizedStore.name} | {normalizedStore.city}</span>
              </header>

              <form className={styles.form} data-testid="store-login-form" onSubmit={submitLogin}>
                <label>
                  <span>Email</span>
                  <input
                    autoComplete="username"
                    data-testid="store-login-email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                  />
                </label>
                <label>
                  <span>Senha</span>
                  <input
                    autoComplete="current-password"
                    data-testid="store-login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  />
                </label>
                {error ? <strong className={styles.error}>{error}</strong> : null}
                <button data-testid="store-login-submit" type="submit">Entrar na loja</button>
              </form>
            </>
          ) : (
            <>
              <header className={styles.panelHeader}>
                <p>Primeiro acesso</p>
                <h2>Crie o perfil real da loja</h2>
                <span>Esse cadastro passa a alimentar o painel, o cardapio e o fluxo operacional.</span>
              </header>

              <form className={styles.onboardingForm} data-testid="store-onboarding-form" onSubmit={submitOnboarding}>
                <StoreProfileForm value={profileForm} onChange={setProfileForm} />

                <section className={styles.ownerCard}>
                  <header>
                    <p>Acesso principal</p>
                    <h3>Conta do responsavel</h3>
                    <span>Esse usuario entra direto como dono da operacao e pode ajustar o restante depois.</span>
                  </header>

                  <div className={styles.ownerGrid}>
                    <label>
                      <span>Nome do usuario</span>
                      <input
                        data-testid="store-access-name"
                        value={ownerForm.name}
                        onChange={(event) => setOwnerForm({ ...ownerForm, name: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Email de acesso</span>
                      <input
                        autoComplete="username"
                        data-testid="store-access-email"
                        type="email"
                        value={ownerForm.email}
                        onChange={(event) => setOwnerForm({ ...ownerForm, email: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Senha</span>
                      <input
                        autoComplete="new-password"
                        data-testid="store-access-password"
                        type="password"
                        value={ownerForm.password}
                        onChange={(event) => setOwnerForm({ ...ownerForm, password: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Confirmar senha</span>
                      <input
                        autoComplete="new-password"
                        data-testid="store-access-confirm"
                        type="password"
                        value={ownerForm.confirm}
                        onChange={(event) => setOwnerForm({ ...ownerForm, confirm: event.target.value })}
                      />
                    </label>
                  </div>
                </section>

                {error ? <strong className={styles.error}>{error}</strong> : null}
                <button className={styles.submitButton} data-testid="store-onboarding-submit" type="submit">Criar loja e entrar</button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  )
}
