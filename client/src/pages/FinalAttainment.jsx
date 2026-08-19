import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchAttainmentBands,
  fetchAttainmentConstants,
  fetchCoAllocations,
  fetchCoPoMatrix,
  fetchCoSplitValues,
  fetchCourseExitSurvey,
  fetchCourseNatures,
  fetchCourses,
  fetchProgramOutcomes,
  fetchProgramSpecificOutcomes,
  fetchStudentAssessments,
  fetchStudentCoMarks,
  fetchStudents,
  isApiMode,
  saveCourseExitSurvey,
} from '../data/api'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
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
// BEGIN REMOVABLE -- edit permission scope
import { useSession } from '../context/sessionStore'
import { canEditCourseFile, READ_ONLY_NOTE } from '../components/permissions'
// END REMOVABLE -- edit permission scope

const CIE_COMPONENTS = ['PT1', 'PT2', 'IP1', 'IP2']

const LOADERS = {
  assessments: fetchAssessments,
  attainmentBands: fetchAttainmentBands,
  attainmentConstants: fetchAttainmentConstants,
  coAllocations: fetchCoAllocations,
  coPoMatrix: fetchCoPoMatrix,
  coSplitValues: fetchCoSplitValues,
  courseExitSurvey: fetchCourseExitSurvey,
  courseNatures: fetchCourseNatures,
  courses: fetchCourses,
  programOutcomes: fetchProgramOutcomes,
  programSpecificOutcomes: fetchProgramSpecificOutcomes,
  students: fetchStudents,
  studentAssessments: fetchStudentAssessments,
  studentCoMarks: fetchStudentCoMarks,
}

function Missing({ text = 'Not entered' }) {
  return <span className="rep-table__missing">{text}</span>
}

// ---------------------------------------------------------------
// THE COURSE EXIT SURVEY IS THE ONLY EDITABLE FIGURE ON THIS PAGE.
//
// Every other value here is DERIVED from the marks -- the component levels,
// the CIE, the SEE, the direct level, the final level, the articulation
// matrix and the PO/PSO roll-up. Making any of them typeable would let a
// printed figure disagree with the marks it was calculated from.
//
// The survey is different in kind: it is an indirect measure collected from
// students, and there is nothing in the database to compute it from.
// ---------------------------------------------------------------

// A level on the 0..3 attainment scale, to at most two decimals -- the same
// range the server validates against, so a percentage pasted in by mistake
// is caught before it is sent.
function surveyError(raw) {
  const text = raw.trim()
  if (text === '') return null
  if (!/^\d(\.\d{1,2})?$/.test(text)) return 'Use a level 0-3, at most two decimals'
  if (Number(text) > 3) return 'Maximum level is 3'
  return null
}

function seedSurvey(courseExitSurvey, courseId, coNumbers) {
  const seeded = {}
  for (const co of coNumbers) {
    const row = courseExitSurvey.find((s) => s.courseId === courseId && s.coNumber === co)
    seeded[co] = row && row.value !== null ? String(row.value) : ''
  }
  return seeded
}

function level(value) {
  return value === null || value === undefined ? <Missing /> : value.toFixed(2)
}

function dash(value) {
  return value === null || value === undefined ? '-' : value.toFixed(2)
}

export default function FinalAttainment() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <FinalAttainmentView {...data} />
}

function FinalAttainmentView({
  assessments,
  attainmentBands,
  attainmentConstants,
  coAllocations,
  coPoMatrix,
  coSplitValues,
  courseExitSurvey,
  courseNatures,
  courses,
  programOutcomes,
  programSpecificOutcomes,
  students,
  studentAssessments,
  studentCoMarks,
}) {
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
    [programOutcomes, programSpecificOutcomes],
  )

  const weights = useMemo(() => componentWeights(nature), [nature])

  // BEGIN REMOVABLE -- edit permission scope
  const { faculty } = useSession()
  // END REMOVABLE -- edit permission scope
  const [editingSurvey, setEditingSurvey] = useState(false)
  const [survey, setSurvey] = useState(() =>
    seedSurvey(courseExitSurvey, courseId, coNumbers),
  )
  const [savedNonce, setSavedNonce] = useState(0)
  const [saveState, runSave] = useSave()

  useEffect(() => {
    setSurvey(seedSurvey(courseExitSurvey, courseId, coNumbers))
    setEditingSurvey(false)
  }, [courseExitSurvey, courseId, coNumbers])

  useEffect(() => {
    if (savedNonce === 0) return undefined
    const timer = setTimeout(() => setSavedNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [savedNonce])

  const surveyErrors = useMemo(() => {
    const found = {}
    for (const co of coNumbers) {
      const message = surveyError(survey[co] ?? '')
      if (message) found[co] = message
    }
    return found
  }, [coNumbers, survey])

  const surveyInvalid = Object.keys(surveyErrors).length

  // The survey level actually in play, per CO. Null for a blank or invalid
  // entry, which keeps the final level blank rather than computing it from a
  // half-typed number.
  const surveyValues = useMemo(() => {
    const out = {}
    for (const co of coNumbers) {
      const raw = (survey[co] ?? '').trim()
      out[co] = raw === '' || surveyErrors[co] ? null : Number(raw)
    }
    return out
  }, [coNumbers, survey, surveyErrors])

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
        studentCoMarks,
        splitValues: coSplitValues,
      })
    }
    return out
  }, [
    courseId,
    targetPercent,
    assessments,
    coAllocations,
    studentAssessments,
    students,
    attainmentBands,
    studentCoMarks,
    coSplitValues,
  ])

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
      // The survey level as it stands ON SCREEN, so the final level always
      // agrees with the number printed above it. Saving is what makes that
      // agreement permanent; Cancel puts the stored value back.
      const surveyLevel = surveyValues[co] ?? null
      out[co] = {
        componentLevels,
        cie,
        see,
        direct,
        survey: surveyLevel,
        final: finalLevel(direct, surveyLevel, attainmentConstants),
      }
    }
    return out
  }, [coNumbers, levelsByKind, weights, surveyValues, attainmentConstants])

  // Articulation values, keyed outcomeCode -> coNumber -> value.
  const matrix = useMemo(() => {
    const out = {}
    for (const row of coPoMatrix) {
      if (row.courseId !== courseId) continue
      if (!out[row.outcomeCode]) out[row.outcomeCode] = {}
      out[row.outcomeCode][row.coNumber] = row.value
    }
    return out
  }, [courseId, coPoMatrix])

  const finalLevels = useMemo(() => {
    const out = {}
    for (const co of coNumbers) out[co] = perCo[co].final
    return out
  }, [coNumbers, perCo])

  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving writes the survey levels to the database.'
    : 'Nothing is sent to a server yet.'

  // A rejected save comes back with one issue per offending CO.
  const serverIssues = {}
  for (const issue of saveState.issues ?? []) {
    if (issue.coNumber !== undefined) serverIssues[issue.coNumber] = issue.message
  }

  function handleSaveSurvey() {
    // Only COs that HAVE a level are sent. The exit-survey endpoint requires
    // a number for every row it is given, and there is no delete: a blank
    // means "not collected", which is not the same as a level of zero.
    const payload = coNumbers
      .filter((co) => surveyValues[co] !== null)
      .map((co) => ({ coNumber: co, value: surveyValues[co] }))

    runSave(
      () => saveCourseExitSurvey(courseId, payload),
      () => {
        setSavedNonce((n) => n + 1)
        setEditingSurvey(false)
      },
    )
  }

  function handleCancelSurvey() {
    setSurvey(seedSurvey(courseExitSurvey, courseId, coNumbers))
    setEditingSurvey(false)
  }

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
          The course exit survey is the indirect measure and is the only figure on this page
          that is entered rather than calculated. The final level needs the direct level, so it
          stays blank until SEE marks exist. Clearing a survey box leaves the stored value
          alone — this sheet has no way to delete one.
        </p>

        <div className="rep-edit-bar">
          {editingSurvey ? (
            <>
              <button
                type="button"
                className="rep-button btn--primary"
                disabled={surveyInvalid > 0 || saveState.saving}
                onClick={handleSaveSurvey}
              >
                {saveState.saving ? 'Saving…' : 'Save survey'}
              </button>
              <button
                type="button"
                className="rep-button"
                disabled={saveState.saving}
                onClick={handleCancelSurvey}
              >
                Cancel
              </button>
            </>
          ) : canEditCourseFile(faculty) ? (
            <button
              type="button"
              className="rep-button"
              onClick={() => setEditingSurvey(true)}
            >
              Edit course exit survey
            </button>
          ) : (
            /* BEGIN REMOVABLE -- edit permission scope */
            <span className="rep-status">{READ_ONLY_NOTE}</span>
            /* END REMOVABLE -- edit permission scope */
          )}

          {surveyInvalid > 0 ? (
            <span className="rep-status rep-status--error">
              {surveyInvalid} {surveyInvalid === 1 ? 'value is' : 'values are'} outside the
              0–3 attainment scale.
            </span>
          ) : savedNonce > 0 ? (
            <span className="rep-status rep-status--saved">{savedLabel}</span>
          ) : (
            <span className="rep-status">{idleLabel}</span>
          )}
        </div>

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
                {coNumbers.map((co) => {
                  const error = surveyErrors[co] ?? serverIssues[co]
                  return (
                    <td key={co} className="rep-table__value">
                      {editingSurvey ? (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className={
                              error ? 'rep-input rep-input--invalid' : 'rep-input'
                            }
                            value={survey[co] ?? ''}
                            aria-invalid={error ? true : undefined}
                            aria-label={`Course exit survey level for CO${co}`}
                            title={error || undefined}
                            onFocus={(event) => event.target.select()}
                            onChange={(event) =>
                              setSurvey((prev) => ({ ...prev, [co]: event.target.value }))
                            }
                          />
                          {/* Printing mid-edit shows the value, not the box. */}
                          <span className="rep-print-value">{level(perCo[co].survey)}</span>
                        </>
                      ) : (
                        level(perCo[co].survey)
                      )}
                    </td>
                  )
                })}
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

        {/* A rejected save wrote nothing; the typed levels stay on screen. */}
        <SaveFeedback state={saveState} />
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
