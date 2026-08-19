import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchAttainmentBands,
  fetchAttainmentConstants,
  fetchClosingActions,
  fetchCoAllocations,
  fetchCoSplitValues,
  fetchCourseExitSurvey,
  fetchCourseNatures,
  fetchCourses,
  fetchStudentAssessments,
  fetchStudentCoMarks,
  fetchStudents,
  isApiMode,
  saveClosingActions,
} from '../data/api'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import {
  assessmentCoLevels,
  cieLevel,
  componentWeights,
  directLevel,
  finalLevel,
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
  closingActions: fetchClosingActions,
  coAllocations: fetchCoAllocations,
  coSplitValues: fetchCoSplitValues,
  courseExitSurvey: fetchCourseExitSurvey,
  courseNatures: fetchCourseNatures,
  courses: fetchCourses,
  students: fetchStudents,
  studentAssessments: fetchStudentAssessments,
  studentCoMarks: fetchStudentCoMarks,
}
// The report prints three numbered action lines. `seq` in the database is
// this position plus one, which is what makes saving an upsert rather than an
// append: line 2 stays line 2 however many times the report is saved.
const ACTION_LINES = [0, 1, 2]

// Placeholder letterhead - swap for the official wording when confirmed.
const INSTITUTION = 'BANNARI AMMAN INSTITUTE OF TECHNOLOGY'
const INSTITUTION_PLACE = 'Sathyamangalam'

function seedActions(closingActions, courseId) {
  return ACTION_LINES.map((index) => {
    const row = closingActions.find(
      (a) => a.courseId === courseId && a.seq === index + 1,
    )
    return row && row.statement !== null ? row.statement : ''
  })
}

function cell(value) {
  return value === null || value === undefined ? (
    <span className="rep-table__missing">Not entered</span>
  ) : (
    value.toFixed(2)
  )
}

export default function ClosingReport() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="sheet" />
  if (error) return <DataError error={error} />
  return <ClosingReportView {...data} />
}

function ClosingReportView({
  assessments,
  attainmentBands,
  attainmentConstants,
  closingActions,
  coAllocations,
  coSplitValues,
  courseExitSurvey,
  courseNatures,
  courses,
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

  const [actions, setActions] = useState(() => seedActions(closingActions, courseId))
  const [savedNonce, setSavedNonce] = useState(0)
  // BEGIN REMOVABLE -- edit permission scope
  const { faculty } = useSession()
  const canEdit = canEditCourseFile(faculty)
  // END REMOVABLE -- edit permission scope
  const [saveState, runSave] = useSave()

  // Reseed when the route points at a different course.
  useEffect(() => {
    setActions(seedActions(closingActions, courseId))
  }, [closingActions, courseId])

  useEffect(() => {
    if (savedNonce === 0) return undefined
    const timer = setTimeout(() => setSavedNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [savedNonce])

  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Typed actions print as written. Saving writes them to the database.'
    : 'Typed actions print as written. Nothing is sent to a server yet.'

  function handleSaveActions() {
    // All three lines are sent every time, blanks included. A blank is stored
    // as NULL, so clearing a line really clears it -- sending only the
    // filled-in lines would leave a deleted one on the printed report.
    runSave(
      () =>
        saveClosingActions(
          courseId,
          ACTION_LINES.map((index) => ({
            seq: index + 1,
            statement: actions[index] ?? '',
          })),
        ),
      () => setSavedNonce((n) => n + 1),
    )
  }

  function handleCancelActions() {
    setActions(seedActions(closingActions, courseId))
  }

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
  }, [coNumbers, levelsByKind, weights, courseId, courseExitSurvey, attainmentConstants])

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

      <header className="page-header rep-noprint">
        <h1 className="page-header__title">Closing Report</h1>
        <p className="page-header__course">
          <span className="page-header__course-code">{course.code}</span>
          <span className="page-header__course-title">{course.title}</span>
        </p>
      </header>

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
                  <textarea
                    className="rep-textarea"
                    rows={2}
                    value={actions[index] ?? ''}
                    aria-label={`Action ${index + 1}`}
                    /* BEGIN REMOVABLE -- edit permission scope. Read-only, not
                       hidden: the printed report must still show the text. */
                    readOnly={!canEdit}
                    /* END REMOVABLE -- edit permission scope */
                    placeholder={`Action ${index + 1}`}
                    onChange={(event) =>
                      setActions((prev) => {
                        const next = [...prev]
                        next[index] = event.target.value
                        return next
                      })
                    }
                  />
                  {/* A textarea cannot grow to fit its text on paper, so the
                      statement is printed from here instead. */}
                  <span className="rep-print-value">{actions[index] ?? ''}</span>
                </div>
              ))}
            </div>

            <div className="rep-edit-bar">
              {/* BEGIN REMOVABLE -- edit permission scope */}
              {canEdit ? (
                <>
                  <button
                    type="button"
                    className="rep-button btn--primary"
                    disabled={saveState.saving}
                    onClick={handleSaveActions}
                  >
                    {saveState.saving ? 'Saving…' : 'Save actions'}
                  </button>
                  <button
                    type="button"
                    className="rep-button"
                    disabled={saveState.saving}
                    onClick={handleCancelActions}
                  >
                    Revert
                  </button>
                </>
              ) : (
                <span className="rep-status">{READ_ONLY_NOTE}</span>
              )}
              {/* END REMOVABLE -- edit permission scope */}
              {savedNonce > 0 ? (
                <span className="rep-status rep-status--saved">{savedLabel}</span>
              ) : (
                <span className="rep-status">{idleLabel}</span>
              )}
            </div>

            {/* A rejected save wrote nothing; the typed actions stay put. */}
            <SaveFeedback state={saveState} />
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
          <span className="rep-status">Printing drops the navigation and buttons.</span>
        </div>
      </section>
    </>
  )
}
