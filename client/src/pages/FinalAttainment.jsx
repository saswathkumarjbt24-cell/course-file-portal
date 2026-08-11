import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  assessments,
  attainmentBands,
  attainmentConstants,
  coAllocations,
  coPoMatrix,
  courseExitSurvey,
  courseNatures,
  courses,
  programOutcomes,
  programSpecificOutcomes,
  studentAssessments,
  students,
} from '../data/mockData'
import {
  assessmentCoLevels,
  cieLevel,
  componentWeights,
  directLevel,
  finalLevel,
  overallOutcomeLevel,
  poLevelFromCO,
} from '../utils/finalAttainment'
import './Reports.css'

const CIE_COMPONENTS = ['PT1', 'PT2', 'IP1', 'IP2']

function Missing({ text = 'Not entered' }) {
  return <span className="rep-table__missing">{text}</span>
}

function level(value) {
  return value === null || value === undefined ? <Missing /> : value.toFixed(2)
}

function dash(value) {
  return value === null || value === undefined ? '-' : value.toFixed(2)
}

export default function FinalAttainment() {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)
  const nature = course ? courseNatures.find((n) => n.id === course.natureId) : null
  const targetPercent = course ? course.coTargetPercent : 0
  const coCount = course ? course.coCount : 0

  const coNumbers = useMemo(() => Array.from({ length: coCount }, (_, i) => i + 1), [coCount])

  const outcomeColumns = useMemo(
    () => [
      ...programOutcomes.map((o) => ({ ...o, type: 'PO' })),
      ...programSpecificOutcomes.map((o) => ({ ...o, type: 'PSO' })),
    ],
    [],
  )

  const weights = useMemo(() => componentWeights(nature), [nature])

  // CO levels for every assessment kind, via the same chain the Attainment
  // screen uses. A kind with no assessment or no marks yields {}.
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

  // Per CO: CIE -> direct -> final.
  const perCo = useMemo(() => {
    const out = {}
    for (const co of coNumbers) {
      const componentLevels = {}
      for (const kind of CIE_COMPONENTS) {
        componentLevels[kind] = levelsByKind[kind]?.[co] ?? null
      }
      const cie = cieLevel(componentLevels, weights)
      const see = levelsByKind.SEE?.[co] ?? null
      const direct = directLevel(cie, see, attainmentConstants)
      const survey =
        courseExitSurvey.find((s) => s.courseId === courseId && s.coNumber === co)?.value ?? null
      out[co] = {
        componentLevels,
        cie,
        see,
        direct,
        survey,
        final: finalLevel(direct, survey, attainmentConstants),
      }
    }
    return out
  }, [coNumbers, levelsByKind, weights, courseId])

  // Articulation values, keyed outcomeCode -> coNumber -> value.
  const matrix = useMemo(() => {
    const out = {}
    for (const row of coPoMatrix) {
      if (row.courseId !== courseId) continue
      if (!out[row.outcomeCode]) out[row.outcomeCode] = {}
      out[row.outcomeCode][row.coNumber] = row.value
    }
    return out
  }, [courseId])

  const finalLevels = useMemo(() => {
    const out = {}
    for (const co of coNumbers) out[co] = perCo[co].final
    return out
  }, [coNumbers, perCo])

  if (!course) {
    return (
      <>
        <Link to="/" className="back-link">
          &larr; Back to dashboard
        </Link>
        <header className="page-header">
          <h1 className="page-header__title">Final Attainment</h1>
          <p className="page-header__subtitle">Unknown course (id {id})</p>
        </header>
        <div className="placeholder">No such course in the current data.</div>
      </>
    )
  }

  return (
    <>
      <nav className="rep-nav">
        <Link to={`/course/${courseId}`}>&larr; Course setup</Link>
        <span className="rep-nav__sep">|</span>
        <Link to={`/course/${courseId}/attainment`}>Per-assessment attainment</Link>
        <span className="rep-nav__sep">·</span>
        <Link to={`/course/${courseId}/closing`}>Closing report</Link>
      </nav>

      <header className="page-header">
        <h1 className="page-header__title">Final CO / PO Attainment</h1>
        <p className="page-header__subtitle">
          {course.code} — {course.title} ({nature ? nature.name : 'unknown nature'}), target{' '}
          {targetPercent.toFixed(2)}%
        </p>
      </header>

      {/* ---------------- Table 1 ---------------- */}
      <section className="rep-card">
        <h2 className="rep-card__title">1. Direct assessment</h2>
        <p className="rep-card__note">
          Component weights are derived from the course nature&apos;s mark scale (PT max / 100, IP
          max split evenly between IP1 and IP2). Components with no marks are excluded from the CIE
          weighting rather than counted as zero.
        </p>

        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th className="rep-table__label">Component</th>
                <th>Weight</th>
                {coNumbers.map((co) => (
                  <th key={co}>CO{co}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CIE_COMPONENTS.map((kind) => (
                <tr key={kind}>
                  <td className="rep-table__label">{kind}</td>
                  <td className="rep-table__weight">
                    {weights[kind] === null ? '-' : weights[kind].toFixed(2)}
                  </td>
                  {coNumbers.map((co) => (
                    <td key={co} className="rep-table__value">
                      {level(perCo[co].componentLevels[kind])}
                    </td>
                  ))}
                </tr>
              ))}

              <tr className="rep-row--sub">
                <td className="rep-table__label">CIE (weighted mean of entered components)</td>
                <td className="rep-table__weight">—</td>
                {coNumbers.map((co) => (
                  <td key={co} className="rep-table__value">
                    {level(perCo[co].cie)}
                  </td>
                ))}
              </tr>

              <tr className="rep-row--sub">
                <td className="rep-table__label">SEE</td>
                <td className="rep-table__weight">—</td>
                {coNumbers.map((co) => (
                  <td key={co} className="rep-table__value">
                    {level(perCo[co].see)}
                  </td>
                ))}
              </tr>

              <tr className="rep-row--total">
                <td className="rep-table__label">
                  CO attainment level ({(attainmentConstants.cieWeight * 100).toFixed(0)}% CIE +{' '}
                  {(attainmentConstants.seeWeight * 100).toFixed(0)}% SEE)
                </td>
                <td className="rep-table__weight">—</td>
                {coNumbers.map((co) => (
                  <td key={co} className="rep-table__value">
                    {level(perCo[co].direct)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Table 2 ---------------- */}
      <section className="rep-card">
        <h2 className="rep-card__title">2. Indirect assessment and final CO attainment</h2>
        <p className="rep-card__note">
          The course exit survey is the indirect measure. The final level needs the direct level,
          so it stays blank until SEE marks exist.
        </p>

        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th className="rep-table__label">Measure</th>
                {coNumbers.map((co) => (
                  <th key={co}>CO{co}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="rep-table__label">Course Exit Survey</td>
                {coNumbers.map((co) => (
                  <td key={co} className="rep-table__value">
                    {level(perCo[co].survey)}
                  </td>
                ))}
              </tr>
              <tr className="rep-row--total">
                <td className="rep-table__label">
                  Final CO attainment ({(attainmentConstants.directWeight * 100).toFixed(0)}% direct
                  + {(attainmentConstants.surveyWeight * 100).toFixed(0)}% survey)
                </td>
                {coNumbers.map((co) => (
                  <td key={co} className="rep-table__value">
                    {level(perCo[co].final)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Table 3 ---------------- */}
      <section className="rep-card">
        <h2 className="rep-card__title">3. CO — PO / PSO articulation matrix</h2>
        <p className="rep-card__note">
          As entered on the Course Setup screen. Blank means no correlation.
        </p>

        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th className="rep-table__label">CO</th>
                {outcomeColumns.map((col) => (
                  <th
                    key={col.code}
                    className={
                      col.type === 'PSO' ? 'rep-matrix-head rep-pso' : 'rep-matrix-head'
                    }
                    title={col.title}
                  >
                    {col.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coNumbers.map((co) => (
                <tr key={co}>
                  <td className="rep-table__label">CO{co}</td>
                  {outcomeColumns.map((col) => (
                    <td key={col.code} className="rep-table__value">
                      {matrix[col.code]?.[co] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Table 4 ---------------- */}
      <section className="rep-card">
        <h2 className="rep-card__title">4. PO / PSO attainment</h2>
        <p className="rep-card__note">
          Each CO contributes its final level scaled by its articulation strength out of 3. The
          overall level is SUMPRODUCT(CO levels, strengths) / SUM(strengths). &quot;-&quot; means
          nothing maps, or the CO level is not available yet.
        </p>

        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th className="rep-table__label">CO</th>
                <th>Final level</th>
                {outcomeColumns.map((col) => (
                  <th
                    key={col.code}
                    className={
                      col.type === 'PSO' ? 'rep-matrix-head rep-pso' : 'rep-matrix-head'
                    }
                    title={col.title}
                  >
                    {col.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coNumbers.map((co) => (
                <tr key={co}>
                  <td className="rep-table__label">CO{co}</td>
                  <td className="rep-table__value">{dash(perCo[co].final)}</td>
                  {outcomeColumns.map((col) => (
                    <td key={col.code} className="rep-table__value">
                      {dash(poLevelFromCO(perCo[co].final, matrix[col.code]?.[co]))}
                    </td>
                  ))}
                </tr>
              ))}

              <tr className="rep-row--total">
                <td className="rep-table__label">Overall PO / PSO level</td>
                <td className="rep-table__value">—</td>
                {outcomeColumns.map((col) => (
                  <td key={col.code} className="rep-table__value">
                    {dash(overallOutcomeLevel(finalLevels, matrix[col.code] ?? {}))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rep-actions">
          <button type="button" className="rep-button" onClick={() => window.print()}>
            Print
          </button>
          <span className="rep-status">Printing drops the navigation and buttons.</span>
        </div>
      </section>
    </>
  )
}
