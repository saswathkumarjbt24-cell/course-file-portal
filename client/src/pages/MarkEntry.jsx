import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchCoAllocations,
  fetchCoSplitValues,
  fetchCourses,
  fetchStudentAssessments,
  fetchStudentCoMarks,
  fetchStudents,
  isApiMode,
  saveAssessmentMarks,
} from '../data/api'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import { mapSplitToCOs, splitIndex, splitTotal } from '../utils/coSplit'
import { manualCoMarks } from '../utils/finalAttainment'
import './MarkEntry.css'

const LOADERS = {
  assessments: fetchAssessments,
  coAllocations: fetchCoAllocations,
  coSplitValues: fetchCoSplitValues,
  courses: fetchCourses,
  students: fetchStudents,
  studentAssessments: fetchStudentAssessments,
  studentCoMarks: fetchStudentCoMarks,
}

const EMPTY_ROW = { total: '', isAbsent: false, co: {} }

// Assessment kinds that feed the internal mark but NOT CO attainment.
// Evidence: in the source workbook the optional test has a mark sheet
// (15.e.OT(M)) but no CO attainment sheet, unlike PT1, PT2, IP1, IP2 and SEE.
const NON_ATTAINMENT_KINDS = ['OT']
export const NO_ATTAINMENT_NOTE =
  'The optional test contributes to the internal mark only. It does not form part of CO attainment.'

// Stable fallbacks so derived values keep a steady identity between renders.
const NO_ROWS = {}

// ---------------------------------------------------------------
// TWO ENTRY MODES, DECIDED BY splitMode -- NEVER BY WHAT HAPPENS TO BE EMPTY
//
//   'lookup'  (PT1, PT2, OT)   the TOTAL is the entered data. The per-CO
//                              marks are derived from the hand-authored split
//                              table and are read-only here; the server
//                              re-derives them on save regardless of what is
//                              sent, so the database stays authoritative.
//
//   'manual'  (IP1, IP2, SEE)  the per-CO MARKS are the entered data. There
//                              is no total to split -- the total is their sum
//                              and is read-only.
//
// Reversing that in either direction would invent data: a lookup total split
// by hand would disagree with the institution's table, and a manual total
// split automatically has no split to use.
// ---------------------------------------------------------------
function isManual(assessment) {
  return assessment ? assessment.splitMode === 'manual' : false
}

// Seed one assessment's rows from the saved marks.
// Students with no saved row start blank and present.
function seedRows(assessmentId, students, studentAssessments, studentCoMarks) {
  const seeded = {}
  for (const student of students) {
    const saved = studentAssessments.find(
      (sa) => sa.assessmentId === assessmentId && sa.studentId === student.id,
    )
    // The per-CO marks of a manual assessment, as strings for the inputs. A
    // lookup assessment has none and does not use this.
    const savedCo = manualCoMarks(assessmentId, student.id, studentCoMarks)
    const co = {}
    if (savedCo) {
      for (const key of Object.keys(savedCo)) {
        co[key] = savedCo[key] === null ? '' : String(savedCo[key])
      }
    }
    seeded[student.id] = {
      total: saved && saved.totalObtained !== null ? String(saved.totalObtained) : '',
      isAbsent: saved ? saved.isAbsent : false,
      co,
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

// A per-CO mark, checked against the marks allocated to that CO. Two decimals,
// matching student_co_marks.marks_obtained DECIMAL(6,2).
function coError(row, coNumber, marksAllocated) {
  if (!row || row.isAbsent) return null
  const raw = (row.co?.[coNumber] ?? '').trim()
  if (raw === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'Use a number with at most two decimals'
  if (marksAllocated !== null && Number(raw) > marksAllocated) {
    return `Maximum for CO${coNumber} is ${marksAllocated}`
  }
  return null
}

/**
 * The total of a manual assessment: the sum of its per-CO marks.
 * Returns null when NOTHING has been entered, which is "not attempted yet"
 * and must not be saved as a zero. A CO left blank alongside entered ones
 * contributes nothing to the sum.
 */
function derivedTotal(row, allocation) {
  if (!row || row.isAbsent) return null
  let sum = 0
  let entered = 0
  for (const alloc of allocation) {
    const raw = (row.co?.[alloc.coNumber] ?? '').trim()
    if (raw === '') continue
    const value = Number(raw)
    if (Number.isNaN(value)) continue
    sum += value
    entered += 1
  }
  if (entered === 0) return null
  // Two decimals in, two decimals out -- no floating-point tail on screen.
  return Math.round(sum * 100) / 100
}

export default function MarkEntry() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <MarkEntryView {...data} />
}

function MarkEntryView({
  assessments,
  coAllocations,
  coSplitValues,
  courses,
  students,
  studentAssessments,
  studentCoMarks,
}) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)

  const courseAssessments = useMemo(
    () => assessments.filter((a) => a.courseId === courseId),
    [assessments, courseId],
  )

  // Built once per data load so mapping every student does not rebuild it.
  const splits = useMemo(() => splitIndex(coSplitValues), [coSplitValues])

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
  // Seeded empty and filled by the effect below. Seeding here would have to
  // repeat the effect's arguments, and getting them wrong is silent.
  const [entries, setEntries] = useState({})
  const [saveNonce, setSaveNonce] = useState(0)
  const [saveState, runSave] = useSave()

  // One entry per focusable input, keyed "<row index>:<column>", so Enter and
  // the arrow keys walk a COLUMN in both modes -- the total column when the
  // total is what is typed, and each CO column when the CO marks are.
  const inputRefs = useRef({})

  useEffect(() => {
    setAssessmentId(defaultAssessmentId)
  }, [defaultAssessmentId])

  // Seed an assessment the first time it is opened; edits to an assessment
  // already opened are kept when switching back and forth.
  useEffect(() => {
    if (assessmentId == null) return
    setEntries((prev) =>
      prev[assessmentId]
        ? prev
        : {
            ...prev,
            [assessmentId]: seedRows(
              assessmentId,
              students,
              studentAssessments,
              studentCoMarks,
            ),
          },
    )
  }, [assessmentId, students, studentAssessments, studentCoMarks])

  // Clear the "Saved (mock)" message a few seconds after each save.
  useEffect(() => {
    if (saveNonce === 0) return undefined
    const timer = setTimeout(() => setSaveNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [saveNonce])

  const assessment = courseAssessments.find((a) => a.id === assessmentId) ?? null
  const kind = assessment ? assessment.kind : ''
  const maxTotal = assessment ? assessment.maxTotal : 0
  const manual = isManual(assessment)

  const allocation = useMemo(
    () =>
      coAllocations
        .filter((a) => a.assessmentId === assessmentId)
        .sort((a, b) => a.coNumber - b.coNumber),
    [coAllocations, assessmentId],
  )

  const rows = entries[assessmentId] ?? NO_ROWS

  // The optional test has no CO attainment, so it shows no CO columns.
  // Memoised because the validation and the payload both depend on it, and a
  // fresh [] every render would re-run them every render.
  const contributesToAttainment = !NON_ATTAINMENT_KINDS.includes(kind)
  const coColumns = useMemo(
    () => (contributesToAttainment ? allocation : []),
    [contributesToAttainment, allocation],
  )

  // In manual mode the total is computed, so only the CO marks can be wrong.
  const totalErrors = useMemo(() => {
    const found = {}
    if (manual) return found
    for (const student of students) {
      const message = rowError(rows[student.id], maxTotal)
      if (message) found[student.id] = message
    }
    return found
  }, [manual, rows, maxTotal, students])

  const coErrors = useMemo(() => {
    const found = {}
    if (!manual) return found
    for (const student of students) {
      for (const alloc of coColumns) {
        const message = coError(rows[student.id], alloc.coNumber, alloc.marksAllocated)
        if (message) found[`${student.id}:${alloc.coNumber}`] = message
      }
    }
    return found
  }, [manual, rows, students, coColumns])

  const invalidCount = Object.keys(totalErrors).length + Object.keys(coErrors).length

  // In MOCK mode the wording stays exactly as it was, so the public demo is
  // unchanged. In API mode it says what actually happened.
  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving writes to the database and recalculates the internal marks.'
    : 'Nothing is sent to a server yet.'

  // A rejected save comes back with one issue per offending row, keyed by
  // student and -- for a per-CO failure -- by CO, so it can be shown against
  // the exact input the server refused.
  const serverTotalIssues = {}
  const serverCoIssues = {}
  for (const issue of saveState.issues ?? []) {
    if (issue.studentId === undefined) continue
    if (issue.coNumber === undefined) {
      serverTotalIssues[issue.studentId] = issue.message
    } else {
      serverCoIssues[`${issue.studentId}:${issue.coNumber}`] = issue.message
    }
  }

  function updateRow(studentId, patch) {
    setEntries((prev) => {
      const base =
        prev[assessmentId] ??
        seedRows(assessmentId, students, studentAssessments, studentCoMarks)
      const current = base[studentId] ?? EMPTY_ROW
      return {
        ...prev,
        [assessmentId]: { ...base, [studentId]: { ...current, ...patch } },
      }
    })
  }

  function updateCoMark(studentId, coNumber, value) {
    setEntries((prev) => {
      const base =
        prev[assessmentId] ??
        seedRows(assessmentId, students, studentAssessments, studentCoMarks)
      const current = base[studentId] ?? EMPTY_ROW
      return {
        ...prev,
        [assessmentId]: {
          ...base,
          [studentId]: { ...current, co: { ...current.co, [coNumber]: value } },
        },
      }
    })
  }

  function handleAbsentToggle(studentId, isAbsent) {
    // Marking absent clears everything entered: there is no mark to split and
    // no per-CO mark to keep.
    updateRow(
      studentId,
      isAbsent ? { isAbsent: true, total: '', co: {} } : { isAbsent: false },
    )
  }

  // Move focus up or down WITHIN A COLUMN, skipping absent (disabled) rows.
  function moveFocus(fromIndex, direction, column) {
    let i = fromIndex + direction
    while (i >= 0 && i < students.length) {
      const input = inputRefs.current[`${i}:${column}`]
      if (input && !input.disabled) {
        input.focus()
        input.select()
        return
      }
      i += direction
    }
  }

  function handleKeyDown(event, index, column) {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(index, 1, column)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(index, -1, column)
    }
  }

  function handleSave() {
    // The API takes a flat array of rows. coMarks is [{coNumber, marksObtained}].
    //
    // MANUAL: the typed per-CO marks ARE the payload, and the total is their
    // sum. A CO left blank is OMITTED rather than sent as null -- the server
    // replaces the whole per-CO set, so an omitted CO means "no mark", which
    // is what a blank box says.
    //
    // LOOKUP: unchanged. The total is what was typed and the server re-derives
    // the split itself; the derived marks are still included so the payload
    // has the same shape either way.
    const payload = students.map((student) => {
      const row = rows[student.id] ?? EMPTY_ROW

      if (row.isAbsent) {
        return { studentId: student.id, totalObtained: null, isAbsent: true, coMarks: [] }
      }

      if (manual) {
        const coMarks = []
        for (const alloc of coColumns) {
          const raw = (row.co?.[alloc.coNumber] ?? '').trim()
          if (raw === '') continue
          coMarks.push({ coNumber: alloc.coNumber, marksObtained: Number(raw) })
        }
        return {
          studentId: student.id,
          totalObtained: derivedTotal(row, coColumns),
          isAbsent: false,
          coMarks,
        }
      }

      const raw = row.total.trim()
      const totalObtained = raw === '' ? null : Number(raw)
      const byCo =
        totalObtained === null
          ? null
          : mapSplitToCOs(splitTotal(totalObtained, splits), kind)
      return {
        studentId: student.id,
        totalObtained,
        isAbsent: false,
        coMarks: byCo
          ? Object.keys(byCo).map((co) => ({
              coNumber: Number(co),
              marksObtained: byCo[co],
            }))
          : [],
      }
    })

    runSave(
      () => saveAssessmentMarks(assessmentId, payload),
      () => setSaveNonce((n) => n + 1),
    )
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
            <div className="mark-summary__item">
              <span className="mark-summary__label">Entered as</span>
              <span className="mark-summary__value">
                {manual
                  ? 'Per CO. The total is their sum and is not editable.'
                  : 'A total. The per-CO marks come from the split table and are not editable.'}
              </span>
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
                  const totalError =
                    totalErrors[student.id] ?? serverTotalIssues[student.id]
                  const raw = row.total.trim()

                  // Lookup only: the CO marks derived from the typed total.
                  const derivedCo =
                    manual || row.isAbsent || totalError || raw === ''
                      ? null
                      : mapSplitToCOs(splitTotal(Number(raw), splits), kind)

                  const computedTotal = manual ? derivedTotal(row, coColumns) : null

                  return (
                    <tr
                      key={student.id}
                      className={row.isAbsent ? 'mark-row--absent' : undefined}
                    >
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

                      {/* TOTAL: typed for a lookup assessment, the sum of the
                          CO marks for a manual one. */}
                      <td className="mark-table__center">
                        {manual ? (
                          <span
                            className="mark-total--derived"
                            aria-label={`Total for ${student.name}`}
                          >
                            {row.isAbsent ? '--' : (computedTotal ?? '—')}
                          </span>
                        ) : (
                          <input
                            ref={(el) => {
                              inputRefs.current[`${index}:total`] = el
                            }}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            className={
                              totalError ? 'mark-input mark-input--invalid' : 'mark-input'
                            }
                            value={row.total}
                            disabled={row.isAbsent}
                            aria-invalid={totalError ? true : undefined}
                            title={totalError || undefined}
                            aria-label={`Total mark for ${student.name}`}
                            onFocus={(event) => event.target.select()}
                            onChange={(event) =>
                              updateRow(student.id, { total: event.target.value })
                            }
                            onKeyDown={(event) => handleKeyDown(event, index, 'total')}
                          />
                        )}
                      </td>

                      {/* CO COLUMNS: typed for a manual assessment, derived
                          from the split table for a lookup one. */}
                      {coColumns.map((a) => {
                        if (manual) {
                          const key = `${student.id}:${a.coNumber}`
                          const error = coErrors[key] ?? serverCoIssues[key]
                          return (
                            <td key={a.coNumber} className="mark-table__co">
                              <input
                                ref={(el) => {
                                  inputRefs.current[`${index}:co${a.coNumber}`] = el
                                }}
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                className={
                                  error
                                    ? 'mark-input mark-input--co mark-input--invalid'
                                    : 'mark-input mark-input--co'
                                }
                                value={row.co?.[a.coNumber] ?? ''}
                                disabled={row.isAbsent}
                                aria-invalid={error ? true : undefined}
                                title={error || undefined}
                                aria-label={`CO${a.coNumber} mark for ${student.name}, out of ${a.marksAllocated}`}
                                onFocus={(event) => event.target.select()}
                                onChange={(event) =>
                                  updateCoMark(student.id, a.coNumber, event.target.value)
                                }
                                onKeyDown={(event) =>
                                  handleKeyDown(event, index, `co${a.coNumber}`)
                                }
                              />
                            </td>
                          )
                        }

                        const value = row.isAbsent
                          ? '--'
                          : derivedCo && derivedCo[a.coNumber] !== undefined
                            ? derivedCo[a.coNumber]
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
            Press Enter or Down arrow to jump to the next student in the same column; Up arrow
            goes back. Absent rows are skipped.{' '}
            {manual
              ? 'Each CO is entered against its own allocation; the total is their sum.'
              : 'The total is entered; the per-CO marks follow from the split table.'}
          </p>

          <div className="mark-footer">
            <button
              type="button"
              className="mark-button"
              disabled={invalidCount > 0 || saveState.saving}
              onClick={handleSave}
            >
              {saveState.saving ? 'Saving…' : 'Save'}
            </button>

            {invalidCount > 0 && (
              <span className="mark-status mark-status--error">
                {invalidCount} {invalidCount === 1 ? 'entry is' : 'entries are'} invalid
                {manual ? ' (a CO mark exceeds its allocation)' : ` (allowed 0-${maxTotal})`}.
              </span>
            )}

            {invalidCount === 0 && saveNonce > 0 && (
              <span className="mark-status mark-status--saved">{savedLabel}</span>
            )}

            {invalidCount === 0 && saveNonce === 0 && !saveState.saving && !saveState.error && (
              <span className="mark-status">{idleLabel}</span>
            )}
          </div>

          {/* A rejected save wrote nothing; the entered marks stay on screen. */}
          <SaveFeedback state={saveState} />
        </>
      )}
    </>
  )
}
