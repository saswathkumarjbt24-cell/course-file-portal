import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
// Shared primitives (buttons, skeletons, empty states, level badges). Imported
// HERE rather than from a component so its position in the emitted stylesheet
// is fixed: after the base, before every page's CSS.
import './styles/ui.css'
// BEGIN REMOVABLE -- printed document typography and signature space
// Imported HERE for the same reason as ui.css: its position in the emitted
// stylesheet is fixed, after the base and before every page's CSS. Every
// rule inside it is under @media print and cannot reach the screen.
import './styles/print.css'
// END REMOVABLE -- printed document typography and signature space
// BEGIN REMOVABLE -- CO-PO/PSO matrix fits the page
// Scoped to the articulation matrix only; keeps it inside the page width so
// the sheet is not scaled down. Also print-only.
import './styles/print-matrix.css'
// END REMOVABLE -- CO-PO/PSO matrix fits the page
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
