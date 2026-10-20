import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { App } from './app/App'
import './styles/global.css'
import { startAuth } from './features/auth/auth'

startAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode><HashRouter><App /></HashRouter></StrictMode>,
)
