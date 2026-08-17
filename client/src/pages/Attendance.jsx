import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchAttendance,
  fetchCourseStudents,
  fetchCourses,
  fetchInstitution,
  isApiMode,
  saveCourseAttendance,
} from '../data/api'
import { DataError, DataLoading, EmptyState, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import './Documents.css'

// Institutional minimum attendance for exam eligibility.
const MINIMUM_PERCENT = 75

const LOADERS = {
  attendance: fetchAttendance,
  courseStudents: fetchCourseStudents,
  courses: fetchCourses,
  institution: fetchInstitution,
}

// A percentage, to at most one decimal place. A blank is "not recorded yet",
// which is a valid state and not an error -- 0 would mean the student
// attended nothing, which is a different claim entirely.
function rowError(raw) {
  const text = raw.trim()
  if (text === '') return null
  if (!/^\d{1,3}(\.\d)?$/.test(text)) return 'Use a number 0-100 with at most one decimal'
  if (Number(text) > 100) return 'Maximum is 100'
  return null
}

// Seed the inputs from the saved percentages. A student with no attendance
// row starts blank rather than at zero.
function seedValues(attendance, courseId, roll) {
  const seeded = {}
  for (const student of roll) {
    const record = attendance.find(
      (a) => a.courseId === courseId && a.studentId === student.id,
    )
    seeded[student.id] =
      record && record.percentage !== null ? String(record.percentage) : ''
  }
  return seeded
}

export default function Attendance({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="sheet" />
  if (error) return <DataError error={error} />
  return <AttendanceView embedded={embedded} {...data} />
}

function AttendanceView({ embedded, attendance, courseStudents, courses, institution }) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)

  // The ENROLLED roll, not the institution-wide student list: the attendance
  // endpoint rejects a percentage for anyone who is not enrolled in this
  // course, so the sheet has to show exactly the roll it saves against.
  const roll = useMemo(
    () => courseStudents.filter((s) => s.courseId === courseId),
    [courseStudents, courseId],
  )

  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState(() => seedValues(attendance, courseId, roll))
  const [savedNonce, setSavedNonce] = useState(0)
  const [saveState, runSave] = useSave()

  // Reseed when the route points at a different course.
  useEffect(() => {
    setValues(seedValues(attendance, courseId, roll))
    setEditing(false)
  }, [attendance, courseId, roll])

  useEffect(() => {
    if (savedNonce === 0) return undefined
    const timer = setTimeout(() => setSavedNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [savedNonce])

  const errors = useMemo(() => {
    const found = {}
    for (const student of roll) {
      const message = rowError(values[student.id] ?? '')
      if (message) found[student.id] = message
    }
    return found
  }, [roll, values])

  const invalidCount = Object.keys(errors).length

  // A rejected save comes back with one issue per offending row.
  const serverIssues = {}
  for (const issue of saveState.issues ?? []) {
    if (issue.studentId !== undefined) serverIssues[issue.studentId] = issue.message
  }

  const rows = roll.map((student) => {
    const raw = (values[student.id] ?? '').trim()
    const percentage = raw === '' || errors[student.id] ? null : Number(raw)
    return { student, raw, percentage }
  })

  const below = rows.filter(
    (r) => r.percentage !== null && r.percentage < MINIMUM_PERCENT,
  )

  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving writes the percentages to the database.'
    : 'Nothing is sent to a server yet.'

  function handleSave() {
    // Every student on the roll is sent, blanks included as null -- a blank
    // has to be sent explicitly or clearing a percentage would do nothing.
    const payload = rows.map((row) => ({
      studentId: row.student.id,
      percentage: row.raw === '' ? null : Number(row.raw),
    }))
    runSave(
      () => saveCourseAttendance(courseId, payload),
      () => {
        setSavedNonce((n) => n + 1)
        setEditing(false)
      },
    )
  }

  function handleCancel() {
    setValues(seedValues(attendance, courseId, roll))
    setEditing(false)
  }

  return (
    <section className="doc-card">
      {!embedded && (
        <header className="page-header doc-noprint">
          <h1 className="page-header__title">Attendance</h1>
          <p className="page-header__course">
            <span className="page-header__course-code">{course.code}</span>
            <span className="page-header__course-title">{course.title}</span>
          </p>
        </header>
      )}

      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">
            {institution.place}
            {course ? ` — Department of ${course.department}` : ''}
          </p>
        </header>

        <h2 className="doc-subtitle">ATTENDANCE</h2>

        {course && (
          <p className="doc-statement">
            <strong>Course:</strong> {course.code} — {course.title}. Students below{' '}
            {MINIMUM_PERCENT}% are shown in red.
          </p>
        )}

        {/* The Full Course File embeds this sheet read-only, so the edit
            controls appear only on the standalone page. */}
        {!embedded && (
          <div className="doc-edit-bar">
            {editing ? (
              <>
                <button
                  type="button"
                  className="doc-button btn--primary"
                  disabled={invalidCount > 0 || saveState.saving}
                  onClick={handleSave}
                >
                  {saveState.saving ? 'Saving…' : 'Save attendance'}
                </button>
                <button
                  type="button"
                  className="doc-button"
                  disabled={saveState.saving}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="doc-button" onClick={() => setEditing(true)}>
                Edit attendance
              </button>
            )}

            {invalidCount > 0 ? (
              <span className="doc-status doc-value--muted">
                {invalidCount} {invalidCount === 1 ? 'row has' : 'rows have'} an invalid
                percentage.
              </span>
            ) : savedNonce > 0 ? (
              <span className="doc-status doc-status--saved">{savedLabel}</span>
            ) : (
              <span className="doc-status">{idleLabel}</span>
            )}
          </div>
        )}

        {/* Screen only: the table below still renders (and still prints)
            when the roll is empty, so the printed sheet is unchanged. This
            says what is missing rather than leaving a blank grid. */}
        {rows.length === 0 && (
          <div className="doc-noprint">
            <EmptyState title="No students on this course roll yet.">
              Attendance is recorded against the enrolled roll, so there is nothing to
              record until the roll exists. Add students on the Student name list sheet
              first.
            </EmptyState>
          </div>
        )}

        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-table__num">S.No</th>
                <th>Roll Number</th>
                <th>Name</th>
                <th>Attendance %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isBelow =
                  row.percentage !== null && row.percentage < MINIMUM_PERCENT
                const error = errors[row.student.id] ?? serverIssues[row.student.id]
                const display =
                  row.raw === '' ? 'Not recorded' : `${row.raw}%`
                const valueClass =
                  row.raw === ''
                    ? 'doc-table__value doc-table__missing'
                    : isBelow
                      ? 'doc-table__value doc-table__below'
                      : 'doc-table__value'

                return (
                  <tr key={row.student.id}>
                    <td className="doc-table__num">{index + 1}</td>
                    <td className="doc-table__reg">{row.student.regNumber}</td>
                    <td>{row.student.name}</td>
                    <td className={valueClass}>
                      {editing && !embedded ? (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className={
                              error
                                ? 'doc-input doc-input--number doc-input--invalid'
                                : 'doc-input doc-input--number'
                            }
                            value={values[row.student.id] ?? ''}
                            aria-invalid={error ? true : undefined}
                            aria-label={`Attendance percentage for ${row.student.name}`}
                            title={error || undefined}
                            onFocus={(event) => event.target.select()}
                            onChange={(event) =>
                              setValues((prev) => ({
                                ...prev,
                                [row.student.id]: event.target.value,
                              }))
                            }
                          />
                          {/* Printing while editing shows the value, not the box. */}
                          <span className="doc-print-value">{display}</span>
                        </>
                      ) : (
                        display
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="doc-statement">
          {below.length === 0
            ? `All students meet the ${MINIMUM_PERCENT}% requirement.`
            : `${below.length} student${below.length === 1 ? '' : 's'} below ${MINIMUM_PERCENT}%.`}
        </p>

        {/* A rejected save wrote nothing; the typed percentages stay on screen. */}
        {!embedded && <SaveFeedback state={saveState} />}

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
