import { useCallback, useEffect, useState } from 'react'
import { createBackendTestLog, loadBackendDiagnostics } from './backendApi'
import './BackendDiagnostics.css'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BackendDiagnostics() {
  const [status, setStatus] = useState('loading')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError('')

    try {
      const nextData = await loadBackendDiagnostics()
      setData(nextData)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel consultar a API')
      setStatus('error')
    }
  }, [])

  async function sendTestLog() {
    const storeId = data?.stores?.[0]?.id
    if (!storeId) return

    await createBackendTestLog(storeId)
    await refresh()
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  const summary = data?.summary
  const store = data?.stores?.[0]

  return (
    <section className="backend-diagnostics" aria-label="Diagnostico do backend">
      <div className="backend-diagnostics__header">
        <div>
          <span>Backend</span>
          <strong>{status === 'ready' ? 'API conectada' : status === 'loading' ? 'Consultando API' : 'API indisponivel'}</strong>
          <small>{store ? `${store.tradeName} - ${store.email}` : 'Spring Boot em http://localhost:8080/api'}</small>
        </div>
        <div className="backend-diagnostics__actions">
          <button className="btn btn--ghost" type="button" onClick={refresh}>Atualizar</button>
          <button className="btn btn--primary" type="button" onClick={sendTestLog} disabled={!store}>Gerar log</button>
        </div>
      </div>

      {error ? <p className="backend-diagnostics__error">{error}</p> : null}

      <div className="backend-diagnostics__grid">
        <div>
          <span>Status</span>
          <strong>{data?.health?.status || '-'}</strong>
        </div>
        <div>
          <span>Produtos</span>
          <strong>{summary?.activeProducts ?? '-'}/{summary?.products ?? '-'}</strong>
        </div>
        <div>
          <span>Pedidos abertos</span>
          <strong>{summary?.openOrders ?? '-'}</strong>
        </div>
        <div>
          <span>Receita</span>
          <strong>{formatCurrency(summary?.revenue)}</strong>
        </div>
      </div>

      <div className="backend-diagnostics__lists">
        <div>
          <h2>Produtos da API</h2>
          {(data?.products || []).slice(0, 4).map((product) => (
            <p key={product.id}>
              <strong>{product.name}</strong>
              <span>{formatCurrency(product.price)} - estoque {product.stock}</span>
            </p>
          ))}
        </div>
        <div>
          <h2>Logs recentes</h2>
          {(data?.logs || []).slice(0, 4).map((log) => (
            <p key={log.id}>
              <strong>{log.area}</strong>
              <span>{log.message}</span>
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}
