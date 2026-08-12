import { useParams } from 'react-router-dom'
import {
  fetchCourses,
  fetchInstitution,
  fetchPeos,
  fetchProgramOutcomeStatements,
  fetchPsoStatements,
} from '../data/api'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import './Documents.css'

const LOADERS = {
  courses: fetchCourses,
  institution: fetchInstitution,
  peos: fetchPeos,
  programOutcomeStatements: fetchProgramOutcomeStatements,
  psoStatements: fetchPsoStatements,
}

function StatementList({ items }) {
  return (
    <ul className="doc-list">
      {items.map((item) => (
        <li className="doc-list__item" key={item.code}>
          <span className="doc-list__code">{item.code}</span>
          <span className="doc-list__text">{item.statement}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Outcomes({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <OutcomesView embedded={embedded} {...data} />
}

function OutcomesView({
  embedded,
  courses,
  institution,
  peos,
  programOutcomeStatements,
  psoStatements,
}) {
  const { id } = useParams()
  const course = courses.find((c) => c.id === Number(id))
  const department = course ? course.department : null
  // PSOs are department-specific; fall back to all of them if the course
  // department has none recorded.
  const psos = department
    ? psoStatements.filter((p) => p.department === department)
    : psoStatements
  const shown = psos.length > 0 ? psos : psoStatements

  return (
    <section className="doc-card">
      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">
            {institution.place}
            {department ? ` — Department of ${department}` : ''}
          </p>
        </header>

        <h2 className="doc-subtitle">PEOs, POs AND PSOs</h2>

        <div className="doc-section">
          <h3 className="doc-section__title">Programme Educational Objectives</h3>
          <StatementList items={peos} />
        </div>

        <div className="doc-section">
          <h3 className="doc-section__title">Programme Outcomes</h3>
          <StatementList items={programOutcomeStatements} />
        </div>

        <div className="doc-section">
          <h3 className="doc-section__title">Programme Specific Outcomes</h3>
          <StatementList items={shown} />
        </div>

        <div className="doc-sign">
          <div className="doc-sign__block">
            <div className="doc-sign__line">Course Faculty</div>
          </div>
          <div className="doc-sign__block">
            <div className="doc-sign__line">HOD</div>
          </div>
        </div>
      </article>

      {!embedded && (
        <div className="doc-actions">
          <button type="button" className="doc-button" onClick={() => window.print()}>
            Print
          </button>
          <span className="doc-status">Printing drops the navigation and buttons.</span>
        </div>
      )}
    </section>
  )
}
