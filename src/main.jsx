import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import QrTest from './QrTest.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QrTest />
  </StrictMode>,
)
