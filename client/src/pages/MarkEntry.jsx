import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  assessments,
  coAllocations,
  courses,
  students,
  studentAssessments,
} from '../data/mockData'
import { mapSplitToCOs, splitTotal } from '../utils/coSplit'
import { manualCoMarks } from '../utils/finalAttainment'
import './MarkEntry.css'

const EMPTY_ROW = { total: '', isAbsent: false }

// Assessment kinds that feed the internal mark but NOT CO attainment.
// Evidence: in the source workbook the optional test has a mark sheet
// (15.e.OT(M)) but no CO attainment sheet, unlike PT1, PT2, IP1, IP2 and SEE.
const NON_ATTAINMENT_KINDS = ['OT']
export const NO_ATTAINMENT_NOTE =
  'The optional test contributes to the internal mark only. It does not form part of CO attainment.'

// Stable fallbacks so derived values keep a steady identity between renders.
const NO_ROWS = {}

// Seed one assessment's rows from the saved marks in mock data.
// Students with no saved row start blank and present.
function seedRows(assessmentId) {
  const seeded = {}
  for (const student of students) {
    const saved = studentAssessments.find(
      (sa) => sa.assessmentId === assessmentId && sa.studentId === student.id,
    )
    seeded[student.id] = {
      total: saved && saved.totalObtained !== null ? String(saved.totalObtained) : '',
      isAbsent: saved ? saved.isAbsent : false,
    }
  }
  return seeded
}

// A blank total is "not entered yet", not an error. Absent rows are always valid.
function rowError(row, maxTotal) {
  if (!row || row.isAbsent) return null
  const raw = row.total.trim()
  if (raw === '') return null
  if (!/^\d+$/.test(raw)) return `Whole number 0-${maxTotal} only`
  if (Number(raw) > maxTotal) return `Maximum is ${maxTotal}`
  return null
}

export default function MarkEntry() {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)

  const courseAssessments = useMemo(
    () => assessments.filter((a) => a.courseId === courseId),
    [courseId],
  )

  // ?assessment=PT2 preselects that assessment; otherwise default to PT1.
  const [searchParams] = useSearchParams()
  const requestedKind = searchParams.get('assessment')

  const defaultAssessmentId = useMemo(() => {
    const requested = requestedKind
      ? courseAssessments.find((a) => a.kind === requestedKind)
      : null
    if (requested) return requested.id
    const pt1 = courseAssessments.find((a) => a.kind === 'PT1')
    return pt1 ? pt1.id : (courseAssessments[0]?.id ?? null)
  }, [courseAssessments, requestedKind])

  const [assessmentId, setAssessmentId] = useState(defaultAssessmentId)
  const [entries, setEntries] = useState(() =>
    defaultAssessmentId ? { [defaultAssessmentId]: seedRows(defaultAssessmentId) } : {},
  )
  const [saveNonce, setSaveNonce] = useState(0)

  const inputRefs = useRef([])

  useEffect(() => {
    setAssessmentId(defaultAssessmentId)
  }, [defaultAssessmentId])

  // Seed an assessment the first time it is opened; edits to an assessment
  // already opened are kept when switching back and forth.
  useEffect(() => {
    if (assessmentId == null) return
    setEntries((prev) =>
      prev[assessmentId] ? prev : { ...prev, [assessmentId]: seedRows(assessmentId) },
    )
  }, [assessmentId])

  // Clear the "Saved (mock)" message a few seconds after each save.
  useEffect(() => {
    if (saveNonce === 0) return undefined
    const timer = setTimeout(() => setSaveNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [saveNonce])

  const assessment = courseAssessments.find((a) => a.id === assessmentId) ?? null
  const kind = assessment ? assessment.kind : ''
  const splitMode = assessment ? assessment.splitMode : ''
  const maxTotal = assessment ? assessment.maxTotal : 0

  const allocation = useMemo(
    () =>
      coAllocations
        .filter((a) => a.assessmentId === assessmentId)
        .sort((a, b) => a.coNumber - b.coNumber),
    [assessmentId],
  )

  const rows = entries[assessmentId] ?? NO_ROWS

  // The optional test has no CO attainment, so it shows no CO columns.
  const contributesToAttainment = !NON_ATTAINMENT_KINDS.includes(kind)
  const coColumns = contributesToAttainment ? allocation : []

  const errors = useMemo(() => {
    const found = {}
    for (const student of students) {
      const message = rowError(rows[student.id], maxTotal)
      if (message) found[student.id] = message
    }
    return found
  }, [rows, maxTotal])

  const invalidCount = Object.keys(errors).length

  function updateRow(studentId, patch) {
    setEntries((prev) => {
      const base = prev[assessmentId] ?? seedRows(assessmentId)
      const current = base[studentId] ?? EMPTY_ROW
      return {
        ...prev,
        [assessmentId]: { ...base, [studentId]: { ...current, ...patch } },
      }
    })
  }

  function handleAbsentToggle(studentId, isAbsent) {
    // Marking absent clears the total; there is no mark to split.
    updateRow(studentId, isAbsent ? { isAbsent: true, total: '' } : { isAbsent: false })
  }

  // Move focus to the next/previous total input, skipping absent (disabled) rows.
  function moveFocus(fromIndex, direction) {
    let i = fromIndex + direction
    while (i >= 0 && i < students.length) {
      const input = inputRefs.current[i]
      if (input && !input.disabled) {
        input.focus()
        input.select()
        return
      }
      i += direction
    }
  }

  function handleKeyDown(event, index) {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(index, 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(index, -1)
    }
  }

  function handleSave() {
    const payload = {
      courseId,
      assessmentId,
      kind,
      entries: students.map((student) => {
        const row = rows[student.id] ?? EMPTY_ROW
        const raw = row.total.trim()
        const totalObtained = row.isAbsent || raw === '' ? null : Number(raw)
        return {
          studentId: student.id,
          totalObtained,
          isAbsent: row.isAbsent,
          coMarks:
            totalObtained === null
              ? null
              : splitMode === 'manual'
                ? manualCoMarks(assessmentId, student.id)
                : mapSplitToCOs(splitTotal(totalObtained), kind),
        }
      }),
    }
    // No backend yet - this is the only place the payload goes.
    console.log('[MarkEntry] mock save payload', payload)
    setSaveNonce((n) => n + 1)
  }

  if (!course) {
    return (
      <>
        <Link to="/" className="back-link">
          &larr; Back to dashboard
        </Link>
        <header className="page-header">
          <h1 className="page-header__title">Mark Entry</h1>
          <p className="page-header__subtitle">Unknown course (id {id})</p>
        </header>
        <div className="placeholder">No such course in the current data.</div>
      </>
    )
  }

  return (
    <>
      <Link to={`/course/${courseId}`} className="back-link">
        &larr; Back to course
      </Link>
      {' · '}
      <Link to={`/course/${courseId}/attainment`} className="back-link">
        View CO attainment &rarr;
      </Link>

      <header className="page-header">
        <h1 className="page-header__title">Mark Entry</h1>
        <p className="page-header__subtitle">
          {course.code} — {course.title}
        </p>
      </header>

      {!assessment ? (
        <div className="placeholder">No assessments are configured for this course yet.</div>
      ) : (
        <>
          <div className="mark-toolbar">
            <div className="mark-field">
              <label className="mark-field__label" htmlFor="assessment-select">
                Assessment
              </label>
              <select
                id="assessment-select"
                className="mark-field__select"
                value={assessmentId}
                onChange={(event) => setAssessmentId(Number(event.target.value))}
              >
                {courseAssessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.kind}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <section className="mark-summary">
            <div className="mark-summary__item">
              <span className="mark-summary__label">Course</span>
              <span className="mark-summary__value">
                {course.code} — {course.title}
              </span>
            </div>
            <div className="mark-summary__item">
              <span className="mark-summary__label">Assessment</span>
              <span className="mark-summary__value">{kind}</span>
            </div>
            <div className="mark-summary__item">
              <span className="mark-summary__label">Max total</span>
              <span className="mark-summary__value">{maxTotal}</span>
            </div>
            {contributesToAttainment ? (
              <div className="mark-summary__item">
                <span className="mark-summary__label">CO allocation</span>
                <span className="mark-summary__allocation">
                  {allocation.map((a) => (
                    <span key={a.coNumber} className="mark-summary__alloc-chip">
                      CO{a.coNumber}: {a.marksAllocated}
                    </span>
                  ))}
                </span>
              </div>
            ) : (
              <div className="mark-summary__item">
                <span className="mark-summary__label">CO attainment</span>
                <span className="mark-summary__value">{NO_ATTAINMENT_NOTE}</span>
              </div>
            )}
          </section>

          <div className="mark-table-wrap">
            <table className="mark-table">
              <thead>
                <tr>
                  <th className="mark-table__num">S.No</th>
                  <th>Reg Number</th>
                  <th>Name</th>
                  <th className="mark-table__center">Absent</th>
                  <th className="mark-table__center">Total</th>
                  {coColumns.map((a) => (
                    <th key={a.coNumber} className="mark-table__co">
                      CO{a.coNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => {
                  const row = rows[student.id] ?? EMPTY_ROW
                  const error = errors[student.id]
                  const raw = row.total.trim()
                  // For 'manual' assessments (IP1/IP2/SEE) the per-CO marks
                  // are the entered data, so they are read from
                  // studentCoMarks rather than derived from the total.
                  const coMarks =
                    row.isAbsent || error || raw === ''
                      ? null
                      : splitMode === 'manual'
                        ? manualCoMarks(assessmentId, student.id)
                        : mapSplitToCOs(splitTotal(Number(raw)), kind)

                  return (
                    <tr key={student.id} className={row.isAbsent ? 'mark-row--absent' : undefined}>
                      <td className="mark-table__num">{index + 1}</td>
                      <td className="mark-table__reg">{student.regNumber}</td>
                      <td>{student.name}</td>
                      <td className="mark-table__center">
                        <input
                          type="checkbox"
                          checked={row.isAbsent}
                          aria-label={`Mark ${student.name} absent`}
                          onChange={(event) =>
                            handleAbsentToggle(student.id, event.target.checked)
                          }
                        />
                      </td>
                      <td className="mark-table__center">
                        <input
                          ref={(el) => {
                            inputRefs.current[index] = el
                          }}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          className={
                            error ? 'mark-input mark-input--invalid' : 'mark-input'
                          }
                          value={row.total}
                          disabled={row.isAbsent}
                          aria-invalid={error ? true : undefined}
                          title={error || undefined}
                          aria-label={`Total mark for ${student.name}`}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => updateRow(student.id, { total: event.target.value })}
                          onKeyDown={(event) => handleKeyDown(event, index)}
                        />
                      </td>
                      {coColumns.map((a) => {
                        const value = row.isAbsent
                          ? '--'
                          : coMarks && coMarks[a.coNumber] !== undefined
                            ? coMarks[a.coNumber]
                            : '—'
                        return (
                          <td
                            key={a.coNumber}
                            className={
                              typeof value === 'number'
                                ? 'mark-table__co'
                                : 'mark-table__co mark-table__co--empty'
                            }
                          >
                            {value}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="mark-hint">
            Press Enter or Down arrow in a total to jump to the next student; Up arrow goes back.
            Absent rows are skipped.
          </p>

          <div className="mark-footer">
            <button
              type="button"
              className="mark-button"
              disabled={invalidCount > 0}
              onClick={handleSave}
            >
              Save
            </button>

            {invalidCount > 0 && (
              <span className="mark-status mark-status--error">
                {invalidCount} {invalidCount === 1 ? 'row has' : 'rows have'} an invalid total
                (allowed 0-{maxTotal}).
              </span>
            )}

            {invalidCount === 0 && saveNonce > 0 && (
              <span className="mark-status mark-status--saved">Saved (mock)</span>
            )}

            {invalidCount === 0 && saveNonce === 0 && (
              <span className="mark-status">Nothing is sent to a server yet.</span>
            )}
          </div>
        </>
      )}
    </>
  )
}
