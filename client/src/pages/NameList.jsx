import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchCourseStudents,
  fetchCourses,
  fetchInstitution,
  isApiMode,
  saveCourseStudents,
} from '../data/api'
import { DataError, DataLoading, EmptyState, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import './Documents.css'
// BEGIN REMOVABLE -- edit permission scope
import { useSession } from '../context/sessionStore'
import { canEditCourseFile, READ_ONLY_NOTE } from '../components/permissions'
// END REMOVABLE -- edit permission scope

const LOADERS = {
  courseStudents: fetchCourseStudents,
  courses: fetchCourses,
  institution: fetchInstitution,
}

const EMPTY_NEW = { regNumber: '', name: '' }

export default function NameList({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="sheet" />
  if (error) return <DataError error={error} />
  return <NameListView embedded={embedded} {...data} />
}

function NameListView({ embedded, courseStudents, courses, institution }) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)

  // The enrolled roll of THIS course. Not the institution-wide student list:
  // this screen edits enrolment, and a name list showing everyone would make
  // "remove from the course" look like it did nothing.
  const roll = useMemo(
    () => courseStudents.filter((s) => s.courseId === courseId),
    [courseStudents, courseId],
  )

  // BEGIN REMOVABLE -- edit permission scope
  const { faculty } = useSession()
  // END REMOVABLE -- edit permission scope
  const [editing, setEditing] = useState(false)
  // The list as edited: entries the save will send. An entry has no id until
  // the server creates the student row.
  const [entries, setEntries] = useState(() =>
    roll.map((s) => ({ id: s.id, regNumber: s.regNumber, name: s.name })),
  )
  const [pending, setPending] = useState(EMPTY_NEW)
  const [addError, setAddError] = useState(null)
  const [savedNonce, setSavedNonce] = useState(0)
  const [saveState, runSave] = useSave()

  useEffect(() => {
    setEntries(roll.map((s) => ({ id: s.id, regNumber: s.regNumber, name: s.name })))
    setEditing(false)
    setPending(EMPTY_NEW)
    setAddError(null)
  }, [roll])

  useEffect(() => {
    if (savedNonce === 0) return undefined
    const timer = setTimeout(() => setSavedNonce(0), 4000)
    return () => clearTimeout(timer)
  }, [savedNonce])

  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving adds and removes enrolments. Removing never deletes the student record.'
    : 'Nothing is sent to a server yet.'

  // Which rows the server refused, keyed by registration number, so the
  // blocked removal is shown against the student it belongs to.
  const serverIssues = {}
  for (const issue of saveState.issues ?? []) {
    if (issue.regNumber !== undefined) serverIssues[issue.regNumber] = issue.message
  }

  const removedCount = roll.filter(
    (s) => !entries.some((e) => e.regNumber === s.regNumber),
  ).length
  const addedCount = entries.filter(
    (e) => !roll.some((s) => s.regNumber === e.regNumber),
  ).length
  const dirty = removedCount > 0 || addedCount > 0

  function handleAdd() {
    const regNumber = pending.regNumber.trim()
    const name = pending.name.trim()

    if (regNumber === '') {
      setAddError('A registration number is required.')
      return
    }
    if (regNumber.length > 20) {
      setAddError('A registration number is at most 20 characters.')
      return
    }
    if (entries.some((e) => e.regNumber === regNumber)) {
      setAddError(`${regNumber} is already on this list.`)
      return
    }
    // A name is only required when the student does not exist yet, which only
    // the server knows. Asking for it here keeps that from being a round trip
    // for the common case of adding somebody genuinely new.
    if (name === '') {
      setAddError('A name is required to add a student.')
      return
    }
    if (name.length > 120) {
      setAddError('A name is at most 120 characters.')
      return
    }

    setEntries((prev) => [...prev, { id: null, regNumber, name }])
    setPending(EMPTY_NEW)
    setAddError(null)
  }

  function handleRemove(regNumber) {
    setEntries((prev) => prev.filter((e) => e.regNumber !== regNumber))
  }

  function handleSave() {
    runSave(
      () =>
        saveCourseStudents(
          courseId,
          entries.map((e) => ({ regNumber: e.regNumber, name: e.name })),
        ),
      () => {
        setSavedNonce((n) => n + 1)
        setEditing(false)
      },
    )
  }

  function handleCancel() {
    setEntries(roll.map((s) => ({ id: s.id, regNumber: s.regNumber, name: s.name })))
    setPending(EMPTY_NEW)
    setAddError(null)
    setEditing(false)
  }

  // In edit mode the list shown is the edited one; otherwise it is the roll.
  const shown = editing && !embedded ? entries : roll

  return (
    <section className="doc-card">
      {!embedded && (
        <header className="page-header doc-noprint">
          <h1 className="page-header__title">Student Name List</h1>
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

        <h2 className="doc-subtitle">STUDENT NAME LIST</h2>

        {course && (
          <p className="doc-statement">
            <strong>Course:</strong> {course.code} — {course.title}
          </p>
        )}

        {/* The Full Course File embeds this sheet read-only. */}
        {!embedded && (
          <div className="doc-edit-bar">
            {editing ? (
              <>
                <button
                  type="button"
                  className="doc-button btn--primary"
                  disabled={saveState.saving || !dirty}
                  onClick={handleSave}
                >
                  {saveState.saving ? 'Saving…' : 'Save name list'}
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
            ) : canEditCourseFile(faculty) ? (
              <button type="button" className="doc-button" onClick={() => setEditing(true)}>
                Edit name list
              </button>
            ) : (
              /* BEGIN REMOVABLE -- edit permission scope */
              <span className="doc-status">{READ_ONLY_NOTE}</span>
              /* END REMOVABLE -- edit permission scope */
            )}

            {editing && dirty ? (
              <span className="doc-status">
                {addedCount > 0 && `${addedCount} to add`}
                {addedCount > 0 && removedCount > 0 && ', '}
                {removedCount > 0 && `${removedCount} to remove`}.
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
        {shown.length === 0 && (
          <div className="doc-noprint">
            <EmptyState title="No students on this course roll yet.">
              The roll drives every mark sheet and the attendance register. Choose “Edit name list” above to add students, or ask the department to load the enrolment.
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
                {editing && !embedded && <th className="doc-row-actions">Remove</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((student, index) => {
                const issue = serverIssues[student.regNumber]
                return (
                  <tr key={student.regNumber}>
                    <td className="doc-table__num">{index + 1}</td>
                    <td className="doc-table__reg">{student.regNumber}</td>
                    <td>
                      {student.name}
                      {/* The server refused to remove this one. Shown against
                          the row so it is obvious WHO is blocked and why. */}
                      {issue && (
                        <>
                          {' '}
                          <span className="doc-value--muted">— {issue}</span>
                        </>
                      )}
                    </td>
                    {editing && !embedded && (
                      <td className="doc-row-actions">
                        <button
                          type="button"
                          className="doc-mini-button doc-mini-button--danger"
                          onClick={() => handleRemove(student.regNumber)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {editing && !embedded && (
          <>
            <div className="doc-add-row">
              <div className="doc-add-row__field">
                <label className="doc-add-row__label" htmlFor="add-reg-number">
                  Registration number
                </label>
                <input
                  id="add-reg-number"
                  type="text"
                  autoComplete="off"
                  maxLength={20}
                  className="doc-input"
                  value={pending.regNumber}
                  onChange={(event) =>
                    setPending((prev) => ({ ...prev, regNumber: event.target.value }))
                  }
                />
              </div>
              <div className="doc-add-row__field">
                <label className="doc-add-row__label" htmlFor="add-student-name">
                  Name
                </label>
                <input
                  id="add-student-name"
                  type="text"
                  autoComplete="off"
                  maxLength={120}
                  className="doc-input"
                  value={pending.name}
                  onChange={(event) =>
                    setPending((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <button type="button" className="doc-mini-button" onClick={handleAdd}>
                Add to course
              </button>
            </div>

            {addError && <p className="doc-note">{addError}</p>}

            <p className="doc-note">
              A registration number that already exists is enrolled as it stands — the name
              typed here is not applied to an existing student record. Removing takes the
              student off this course only; their record and their other courses are untouched.
            </p>
          </>
        )}

        {/* A rejected save wrote nothing at all: no addition went through
            either, and every edit is still on screen. */}
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
