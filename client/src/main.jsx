import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
// Shared primitives (buttons, skeletons, empty states, level badges). Imported
// HERE rather than from a component so its position in the emitted stylesheet
// is fixed: after the base, before every page's CSS.
import './styles/ui.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
