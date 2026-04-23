import styles from './StoreProfileForm.module.css'
import {
  STORE_SEGMENT_OPTIONS,
  STORE_SERVICE_MODE_OPTIONS,
  describeStoreServiceModes,
  updateStoreProfile,
  updateStoreServiceMode,
} from './storeProfile'

function Section({ eyebrow, title, description, children }) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <p>{eyebrow}</p>
        <h3>{title}</h3>
        <span>{description}</span>
      </header>
      <div className={styles.grid}>{children}</div>
    </section>
  )
}

function Field({ label, hint, wide = false, children }) {
  return (
    <label className={`${styles.field} ${wide ? styles.fieldWide : ''}`.trim()}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function StoreProfileForm({
  value,
  onChange,
  showHero = true,
  showMapTools = false,
  mapStatus = '',
  mapTone = 'idle',
  mapMode = 'view',
  onVerifyAddress,
  onUseCurrentLocation,
  onToggleMapPicking,
  mapSlot = null,
}) {
  const handleFieldChange = (field) => (event) => onChange(updateStoreProfile(value, field, event.target.value))
  const handleServiceModeChange = (mode) => (event) => onChange(updateStoreServiceMode(value, mode, event.target.checked))

  return (
    <div className={styles.stack}>
      {showHero ? (
        <div className={styles.hero}>
          <div>
            <p>Cadastro comercial</p>
            <h2>{value.name || 'Configure a sua operacao'}</h2>
          </div>
          <strong>{describeStoreServiceModes(value) || 'Selecione como a loja vai vender'}</strong>
        </div>
      ) : null}

      <Section
        eyebrow="Identidade"
        title="Dados comerciais"
        description="Informacoes que aparecem no painel, no cardapio digital e na operacao diaria."
      >
        <Field label="Nome fantasia">
          <input data-testid="store-trade-name" required value={value.tradeName} onChange={handleFieldChange('tradeName')} />
        </Field>
        <Field label="Razao social">
          <input value={value.legalName} onChange={handleFieldChange('legalName')} />
        </Field>
        <Field label="Categoria principal">
          <select value={value.category} onChange={handleFieldChange('category')}>
            {STORE_SEGMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="CNPJ">
          <input data-testid="store-tax-id" required value={value.taxId} onChange={handleFieldChange('taxId')} />
        </Field>
        <Field label="Inscricao estadual">
          <input value={value.stateRegistration} onChange={handleFieldChange('stateRegistration')} />
        </Field>
        <Field label="Descricao da loja" wide>
          <textarea rows="3" value={value.description} onChange={handleFieldChange('description')} />
        </Field>
      </Section>

      <Section
        eyebrow="Pessoas"
        title="Responsaveis e contato"
        description="Dados do dono, gerente e canais que o cliente usa para falar com a loja."
      >
        <Field label="Responsavel principal">
          <input data-testid="store-owner" required value={value.owner} onChange={handleFieldChange('owner')} />
        </Field>
        <Field label="Gerente operacional">
          <input value={value.manager} onChange={handleFieldChange('manager')} />
        </Field>
        <Field label="Telefone principal">
          <input data-testid="store-phone" required value={value.phone} onChange={handleFieldChange('phone')} />
        </Field>
        <Field label="WhatsApp">
          <input value={value.whatsapp} onChange={handleFieldChange('whatsapp')} />
        </Field>
        <Field label="Email comercial">
          <input data-testid="store-email" required type="email" value={value.email} onChange={handleFieldChange('email')} />
        </Field>
        <Field label="Email de suporte/fiscal">
          <input type="email" value={value.supportEmail} onChange={handleFieldChange('supportEmail')} />
        </Field>
        <Field label="Instagram">
          <input value={value.instagram} onChange={handleFieldChange('instagram')} />
        </Field>
        <Field label="Site ou link principal">
          <input value={value.website} onChange={handleFieldChange('website')} />
        </Field>
      </Section>

      <Section
        eyebrow="Endereco"
        title="Local da operacao"
        description="Endereco usado para entrega, retirada, geolocalizacao e configuracao da area atendida."
      >
        <Field label="CEP">
          <input inputMode="numeric" value={value.cep} onChange={handleFieldChange('cep')} />
        </Field>
        <Field label="Rua">
          <input data-testid="store-street" required value={value.street} onChange={handleFieldChange('street')} />
        </Field>
        <Field label="Numero">
          <input data-testid="store-number" required value={value.number} onChange={handleFieldChange('number')} />
        </Field>
        <Field label="Complemento">
          <input value={value.complement} onChange={handleFieldChange('complement')} />
        </Field>
        <Field label="Bairro">
          <input value={value.district} onChange={handleFieldChange('district')} />
        </Field>
        <Field label="Cidade">
          <input data-testid="store-city" required value={value.cityName} onChange={handleFieldChange('cityName')} />
        </Field>
        <Field label="UF">
          <input data-testid="store-state" maxLength="2" value={value.state} onChange={handleFieldChange('state')} />
        </Field>
      </Section>

      <Section
        eyebrow="Operacao"
        title="Como a loja vende"
        description="Parametros iniciais de atendimento para delivery, retirada e consumo no local."
      >
        <div className={`${styles.field} ${styles.fieldWide}`.trim()}>
          <span>Canais de atendimento</span>
          <div className={styles.modeGrid}>
            {STORE_SERVICE_MODE_OPTIONS.map((mode) => (
              <label className={styles.modeCard} key={mode.id}>
                <input
                  checked={Boolean(value.serviceModes?.[mode.id])}
                  onChange={handleServiceModeChange(mode.id)}
                  type="checkbox"
                />
                <strong>{mode.label}</strong>
              </label>
            ))}
          </div>
        </div>
        <Field label="Horario principal">
          <input data-testid="store-schedule" required value={value.schedule} onChange={handleFieldChange('schedule')} placeholder="Ex: 18:00 - 23:30" />
        </Field>
        <Field label="Tempo medio de preparo (min)">
          <input inputMode="numeric" value={value.averagePrepTime} onChange={handleFieldChange('averagePrepTime')} />
        </Field>
        <Field label="Prazo medio de entrega (min)">
          <input inputMode="numeric" value={value.deliveryLeadTime} onChange={handleFieldChange('deliveryLeadTime')} />
        </Field>
        <Field label="Taxa base de entrega">
          <input value={value.serviceFee} onChange={handleFieldChange('serviceFee')} />
        </Field>
        <Field label="Pedido minimo">
          <input value={value.minimumOrder} onChange={handleFieldChange('minimumOrder')} />
        </Field>
        <Field label="Raio de entrega (km)">
          <input inputMode="decimal" value={value.deliveryRadius} onChange={handleFieldChange('deliveryRadius')} />
        </Field>
        <Field label="Observacoes internas" wide>
          <textarea rows="3" value={value.note} onChange={handleFieldChange('note')} />
        </Field>
      </Section>

      {showMapTools ? (
        <Section
          eyebrow="Mapa"
          title="Geolocalizacao da loja"
          description="Use o mapa para centralizar zonas de entrega, roteirizacao e visualizacao operacional."
        >
          <div className={`${styles.mapActions} ${styles.fieldWide}`.trim()}>
            <button type="button" onClick={onVerifyAddress}>Localizar no mapa</button>
            <button type="button" onClick={onUseCurrentLocation}>Usar localizacao atual</button>
            <button className={mapMode === 'pick' ? styles.mapActionActive : ''} type="button" onClick={onToggleMapPicking}>
              {mapMode === 'pick' ? 'Cancelar marcacao' : 'Marcar no mapa'}
            </button>
          </div>
          <div className={`${styles.mapStatus} ${styles[`mapStatus${mapTone[0]?.toUpperCase() || 'I'}${mapTone.slice(1)}`] || ''} ${styles.fieldWide}`.trim()}>
            {mapStatus}
          </div>
          {mapSlot ? <div className={styles.fieldWide}>{mapSlot}</div> : null}
        </Section>
      ) : null}
    </div>
  )
}
