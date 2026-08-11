import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  assessments,
  attainmentBands,
  attainmentConstants,
  coAllocations,
  courseExitSurvey,
  courseNatures,
  courses,
  studentAssessments,
  students,
} from '../data/mockData'
import {
  assessmentCoLevels,
  cieLevel,
  componentWeights,
  directLevel,
  finalLevel,
} from '../utils/finalAttainment'
import './Reports.css'

const CIE_COMPONENTS = ['PT1', 'PT2', 'IP1', 'IP2']
const ACTION_LINES = [0, 1, 2]

// Placeholder letterhead - swap for the official wording when confirmed.
const INSTITUTION = 'BANNARI AMMAN INSTITUTE OF TECHNOLOGY'
const INSTITUTION_PLACE = 'Sathyamangalam'

function cell(value) {
  return value === null || value === undefined ? (
    <span className="rep-table__missing">Not entered</span>
  ) : (
    value.toFixed(2)
  )
}

export default function ClosingReport() {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)
  const nature = course ? courseNatures.find((n) => n.id === course.natureId) : null
  const targetPercent = course ? course.coTargetPercent : 0
  const coCount = course ? course.coCount : 0

  const [actions, setActions] = useState(['', '', ''])

  const coNumbers = useMemo(() => Array.from({ length: coCount }, (_, i) => i + 1), [coCount])
  const weights = useMemo(() => componentWeights(nature), [nature])

  const levelsByKind = useMemo(() => {
    const out = {}
    for (const kind of [...CIE_COMPONENTS, 'SEE']) {
      const assessment = assessments.find((a) => a.courseId === courseId && a.kind === kind)
      out[kind] = assessmentCoLevels({
        assessment,
        allocation: assessment
          ? coAllocations
              .filter((x) => x.assessmentId === assessment.id)
              .sort((a, b) => a.coNumber - b.coNumber)
          : [],
        records: assessment
          ? studentAssessments.filter((r) => r.assessmentId === assessment.id)
          : [],
        students,
        targetPercent,
        bands: attainmentBands,
      })
    }
    return out
  }, [courseId, targetPercent])

  const finalByCo = useMemo(() => {
    const out = {}
    for (const co of coNumbers) {
      const componentLevels = {}
      for (const kind of CIE_COMPONENTS) componentLevels[kind] = levelsByKind[kind]?.[co] ?? null
      const direct = directLevel(
        cieLevel(componentLevels, weights),
        levelsByKind.SEE?.[co] ?? null,
        attainmentConstants,
      )
      const survey =
        courseExitSurvey.find((s) => s.courseId === courseId && s.coNumber === co)?.value ?? null
      out[co] = finalLevel(direct, survey, attainmentConstants)
    }
    return out
  }, [coNumbers, levelsByKind, weights, courseId])

  if (!course) {
    return (
      <>
        <Link to="/" className="back-link">
          &larr; Back to dashboard
        </Link>
        <header className="page-header">
          <h1 className="page-header__title">Closing Report</h1>
          <p className="page-header__subtitle">Unknown course (id {id})</p>
        </header>
        <div className="placeholder">No such course in the current data.</div>
      </>
    )
  }

  const rows = [
    { label: 'CO attainment after PT1', values: levelsByKind.PT1 },
    { label: 'CO attainment after PT2', values: levelsByKind.PT2 },
    { label: 'CO attainment after SEE', values: levelsByKind.SEE },
  ]

  return (
    <>
      <nav className="rep-nav">
        <Link to={`/course/${courseId}`}>&larr; Course setup</Link>
        <span className="rep-nav__sep">|</span>
        <Link to={`/course/${courseId}/attainment`}>Per-assessment attainment</Link>
        <span className="rep-nav__sep">·</span>
        <Link to={`/course/${courseId}/final`}>Final attainment</Link>
      </nav>

      <section className="rep-card">
        <article className="rep-doc">
          <header className="rep-doc__head">
            <h1 className="rep-doc__institution">{INSTITUTION}</h1>
            <p className="rep-doc__dept">
              {INSTITUTION_PLACE} — Department of {course.department}
            </p>
          </header>

          <h2 className="rep-doc__subject">COURSE FILE CLOSING REPORT</h2>

          <div className="rep-doc__meta">
            <span>
              <strong>Course:</strong> {course.code} — {course.title}
            </span>
            <span>
              <strong>Nature:</strong> {nature ? nature.name : 'Unknown'}
            </span>
            <span>
              <strong>Regulation:</strong> {course.regulationYear ?? '—'}
            </span>
            <span>
              <strong>CO target:</strong> {targetPercent.toFixed(2)}%
            </span>
          </div>

          <div className="rep-doc__section">
            <h3 className="rep-doc__section-title">1. Attainment through the course</h3>
            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th className="rep-table__label">Stage</th>
                    {coNumbers.map((co) => (
                      <th key={co}>CO{co}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <td className="rep-table__label">{row.label}</td>
                      {coNumbers.map((co) => (
                        <td key={co} className="rep-table__value">
                          {cell(row.values?.[co] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="rep-row--total">
                    <td className="rep-table__label">
                      Final CO attainment level (direct + survey)
                    </td>
                    {coNumbers.map((co) => (
                      <td key={co} className="rep-table__value">
                        {cell(finalByCo[co])}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rep-doc__section">
            <h3 className="rep-doc__section-title">
              2. Action taken to improve attainment for the next year
            </h3>
            <div className="rep-actions-line">
              {ACTION_LINES.map((index) => (
                <div className="rep-action-row" key={index}>
                  <span className="rep-action-num">{index + 1}.</span>
                  <input
                    type="text"
                    className="rep-action-input"
                    value={actions[index]}
                    aria-label={`Action ${index + 1}`}
                    onChange={(event) =>
                      setActions((prev) => {
                        const next = [...prev]
                        next[index] = event.target.value
                        return next
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rep-sign">
            <div className="rep-sign__block">
              <div className="rep-sign__line">Course Faculty</div>
            </div>
            <div className="rep-sign__block">
              <div className="rep-sign__line">HOD</div>
            </div>
          </div>
        </article>

        <div className="rep-actions">
          <button type="button" className="rep-button" onClick={() => window.print()}>
            Print
          </button>
          <span className="rep-status">
            Typed actions print as written. Nothing is saved to a server.
          </span>
        </div>
      </section>
    </>
  )
}
