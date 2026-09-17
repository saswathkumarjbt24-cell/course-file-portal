import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
// Shared primitives (buttons, skeletons, empty states, level badges). Imported
// HERE rather than from a component so its position in the emitted stylesheet
// is fixed: after the base, before every page's CSS.
import './styles/ui.css'
// BEGIN REMOVABLE -- every table cell centres except the student Name
// Alignment for all eight table families, screen and print alike. Imported
// here for the same reason as ui.css; it wins over the page stylesheets on
// !important rather than on source order.
import './styles/tables-centred.css'
// END REMOVABLE -- every table cell centres except the student Name
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
// BEGIN REMOVABLE -- printed tables fit the page
// The remaining document tables: lets long cells wrap so a sheet is no longer
// widened past the page and scaled down. Print-only.
import './styles/print-tables.css'
// END REMOVABLE -- printed tables fit the page
// BEGIN REMOVABLE -- headroom for the PO / PSO attainment table
// AFTER print-matrix.css, which it narrows for one table only. Print-only.
import './styles/print-outcome-levels.css'
// END REMOVABLE -- headroom for the PO / PSO attainment table
// BEGIN REMOVABLE -- one printed sheet per sub-section
// AFTER print.css, whose signature rules it deliberately leaves alone: this
// file only breaks a page before each lettered sub-section. Print-only.
import './styles/print-subsheets.css'
// END REMOVABLE -- one printed sheet per sub-section
// BEGIN REMOVABLE -- the wide sheets print landscape
// Declares the one named page the wide sheets claim. Sets no margin, so the
// print dialog's own margins stand. Print-only.
import './styles/print-landscape.css'
// END REMOVABLE -- the wide sheets print landscape
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
