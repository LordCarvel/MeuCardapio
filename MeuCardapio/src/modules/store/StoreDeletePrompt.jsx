import { useState } from 'react'
import styles from './StoreDeletePrompt.module.css'

export function StoreDeletePrompt({ storeName, onConfirm }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()

    if (value.trim() !== storeName.trim()) {
      setError('Digite exatamente o nome da loja para confirmar.')
      return
    }

    setError('')
    onConfirm?.()
  }

  return (
    <form className={styles.panel} id="delete-store-form" onSubmit={submit}>
      <div className={styles.warning}>
        <strong>Essa acao remove o cadastro da loja neste navegador.</strong>
        <p>Usuarios locais, perfil comercial e dados operacionais voltam para o estado de primeiro acesso.</p>
      </div>

      <label className={styles.field}>
        <span>Digite "{storeName}" para confirmar</span>
        <input value={value} onChange={(event) => setValue(event.target.value)} />
      </label>

      {error ? <strong className={styles.error}>{error}</strong> : null}
    </form>
  )
}
