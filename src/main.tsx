import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Ponto de entrada da aplicação: monta o componente <App /> dentro da
// <div id="root"> definida em index.html. StrictMode ativa verificações
// extras do React em desenvolvimento (não afeta o build de produção).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
