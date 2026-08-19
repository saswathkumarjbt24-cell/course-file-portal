// ---------------------------------------------------------------
// BEGIN REMOVABLE -- Courses screen
//
// Every course, and the controls to create or edit one, so that adding a
// course is a screen rather than a hand-written migration.
//
// ADMIN ONLY, AND GUARDED TWICE.
//   The sidebar link in Layout.jsx renders only for an admin, and this file
//   refuses to render the screen for anybody else -- so typing the URL gets a
//   refusal, not the table. Neither guard ENFORCES anything: the API answers
//   403 to a faculty or hod token regardless of what the browser drew.
//
// FOLLOWS Users.jsx DELIBERATELY.
//   Same loader shape, same table classes, same inline editor, same
//   DepartmentField -- imported from components/, not copied. A second table
//   style or a second department control would be two things to keep in step.
//
// THERE IS NO DELETE.
//   Marks, enrolments and assessments cascade off a course. See the note on
//   the server routes.
//
// Delete this file, Courses.css, the route in App.jsx, the sidebar entry in
// Layout.jsx and the three functions in data/api.js to remove the feature.
// ---------------------------------------------------------------

import { useState } from 'react'
import {
  createAdminCourse,
  fetchAdminCourses,
  fetchCourseNatures,
  fetchDepartments,
  updateAdminCourse,
} from '../data/api'
import {
  DataError,
  DataLoading,
  EmptyState,
  SaveFeedback,
  useApiData,
} from '../data/useApiData'
import { useSave } from '../data/useSave'
import { useSession } from '../context/sessionStore'
import { DepartmentField } from '../components/DepartmentField'
import { departmentToSend, listHas } from '../components/departments'
// The table style and the field styles, both already existing. Not redefined.
import './RiskReport.css'
import './Users.css'
import './Courses.css'

// Module level, not rebuilt per render: it is useApiData's effect dependency.
const LOADERS = {
  courses: fetchAdminCourses,
  departments: fetchDepartments,
  natures: fetchCourseNatures,
}

const EMPTY_DRAFT = {
  code: '',
  title: '',
  natureId: '',
  coTargetPercent: '',
  department: '',
  departmentIsNew: false,
  programme: '',
  batch: '',
  academicYear: '',
  yearOfStudy: '',
  semester: '',
  section: '',
}

/** A value the database has not recorded. A blank cell reads as a fault. */
function absent(text = 'Not recorded') {
  return <span className="risk-table__muted">{text}</span>
}

/** '' out of a text input means "not recorded", which the column holds NULL. */
function textToSend(value) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export default function Courses() {
  const { faculty } = useSession()

  // ROUTE GUARD. The sidebar hides the link, but a URL can still be typed.
  if (!faculty || faculty.role !== 'admin') {
    return (
      <>
        <header className="page-header">
          <h1 className="page-header__title">Courses</h1>
        </header>
        <div className="placeholder" role="alert">
          Managing courses needs the admin role.
          {faculty?.role ? ` Your account is '${faculty.role}'.` : ''} Ask an
          administrator if you need a course added or changed.
        </div>
      </>
    )
  }

  return <CoursesLoader />
}

function CoursesLoader() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="table" />
  if (error) return <DataError error={error} />
  return (
    <CoursesView
      courses={data.courses}
      departments={data.departments}
      natures={data.natures}
    />
  )
}

function CoursesView({ courses, departments, natures }) {
  // Held locally so a save can put the row the server returned straight back
  // on screen without refetching the whole table.
  const [rows, setRows] = useState(courses)
  const [departmentList, setDepartmentList] = useState(departments)

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [createState, runCreate] = useSave()

  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState(null)

  const [busyId, setBusyId] = useState(null)
  const [rowState, runRow] = useSave()

  // What the server said about a mark-scale change, held until the next edit.
  // NOT a toast: changing the nature re-scales every attainment figure for the
  // course, and that deserves a line that stays on screen.
  const [natureNotice, setNatureNotice] = useState(null)

  function rememberDepartment(saved) {
    const stored = saved?.department
    if (typeof stored !== 'string' || stored.trim() === '') return
    setDepartmentList((prev) =>
      listHas(prev, stored) ? prev : [...prev, stored].sort((a, b) => a.localeCompare(b)),
    )
  }

  function applyRow(saved) {
    // Mock mode resolves { mock: true } with no row to apply. The table is
    // left as it is rather than showing an invented change.
    if (!saved || typeof saved.id !== 'number') return
    setRows((prev) => prev.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)))
    rememberDepartment(saved)
  }

  function beginEdit(row) {
    setNatureNotice(null)
    setEditingId(row.id)
    setEdit({
      title: row.title,
      natureId: String(row.natureId),
      coTargetPercent: String(row.coTargetPercent ?? ''),
      department: row.department ?? '',
      departmentIsNew: false,
      programme: row.programme ?? '',
      batch: row.batch ?? '',
      academicYear: row.academicYear ?? '',
      yearOfStudy: row.yearOfStudy ?? '',
      semester: row.semester ?? '',
      section: row.section ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEdit(null)
  }

  function saveEdit(row) {
    setBusyId(row.id)
    runRow(
      () =>
        updateAdminCourse(row.id, {
          title: edit.title,
          natureId: Number(edit.natureId),
          // Sent as typed; the server refuses anything outside 1..100 and
          // never fills in a default of its own.
          coTargetPercent: edit.coTargetPercent,
          department: departmentToSend(edit.department),
          programme: textToSend(edit.programme),
          batch: textToSend(edit.batch),
          academicYear: textToSend(edit.academicYear),
          yearOfStudy: textToSend(edit.yearOfStudy),
          semester: textToSend(edit.semester),
          section: textToSend(edit.section),
        }),
      (saved) => {
        applyRow(saved)
        // The server tells us when the mark scale moved. Say so out loud.
        if (saved?.natureChanged) {
          setNatureNotice({ code: row.code, ...saved.natureChanged })
        }
        cancelEdit()
      },
    )
  }

  function submitNew(event) {
    event.preventDefault()
    runCreate(
      () =>
        createAdminCourse({
          code: draft.code,
          title: draft.title,
          natureId: draft.natureId === '' ? null : Number(draft.natureId),
          coTargetPercent: draft.coTargetPercent,
          department: departmentToSend(draft.department),
          programme: textToSend(draft.programme),
          batch: textToSend(draft.batch),
          academicYear: textToSend(draft.academicYear),
          yearOfStudy: textToSend(draft.yearOfStudy),
          semester: textToSend(draft.semester),
          section: textToSend(draft.section),
        }),
      (created) => {
        if (created && typeof created.id === 'number') {
          setRows((prev) =>
            [...prev, created].sort((a, b) => a.code.localeCompare(b.code)),
          )
          rememberDepartment(created)
        }
        setDraft(EMPTY_DRAFT)
        setAdding(false)
      },
    )
  }

  const unallocated = rows.filter((r) => r.allocationCount === 0).length

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Courses</h1>
        <p className="page-header__subtitle">
          Every course in the portal. A course code names the course on every
          printed file and cannot be changed once set. The CO target is never
          defaulted — every attainment figure is computed against it.
        </p>
      </header>

      <div className="users-toolbar">
        <span className="users-toolbar__count">
          {rows.length} courses
          {unallocated > 0 && ` · ${unallocated} with nobody allocated`}
        </span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? 'Close' : 'Add course'}
        </button>
      </div>

      {natureNotice && (
        <div className="courses-notice" role="status">
          <strong>{natureNotice.code}</strong> moved from{' '}
          <strong>{natureNotice.from.name}</strong> to{' '}
          <strong>{natureNotice.to.name}</strong>. That changes the mark scale,
          so every CO attainment figure for this course is recomputed against
          the new totals. No stored mark was altered — check the attainment
          sheets before printing.
          <button
            type="button"
            className="btn btn--quiet courses-notice__dismiss"
            onClick={() => setNatureNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {adding && (
        <form className="users-panel" onSubmit={submitNew}>
          <h2 className="users-panel__title">Add a course</h2>

          <div className="users-panel__grid">
            <label className="users-field">
              <span className="users-field__label">Code</span>
              <input
                className="users-input"
                type="text"
                value={draft.code}
                required
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Title</span>
              <input
                className="users-input"
                type="text"
                value={draft.title}
                required
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Nature</span>
              <select
                className="users-select"
                value={draft.natureId}
                required
                onChange={(e) => setDraft({ ...draft, natureId: e.target.value })}
              >
                <option value="">Choose a nature</option>
                {natures.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="users-field">
              <span className="users-field__label">CO target %</span>
              <input
                className="users-input"
                type="number"
                min="1"
                max="100"
                step="0.01"
                value={draft.coTargetPercent}
                required
                onChange={(e) =>
                  setDraft({ ...draft, coTargetPercent: e.target.value })
                }
              />
            </label>

            <div className="users-field">
              <span className="users-field__label">Department</span>
              <DepartmentField
                departments={departmentList}
                value={draft.department}
                isNew={draft.departmentIsNew}
                onChange={({ value, isNew }) =>
                  setDraft({ ...draft, department: value, departmentIsNew: isNew })
                }
              />
            </div>

            <label className="users-field">
              <span className="users-field__label">Programme</span>
              <input
                className="users-input"
                type="text"
                value={draft.programme}
                onChange={(e) => setDraft({ ...draft, programme: e.target.value })}
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Batch</span>
              <input
                className="users-input"
                type="text"
                value={draft.batch}
                onChange={(e) => setDraft({ ...draft, batch: e.target.value })}
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Academic year</span>
              <input
                className="users-input"
                type="text"
                value={draft.academicYear}
                onChange={(e) =>
                  setDraft({ ...draft, academicYear: e.target.value })
                }
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Year of study</span>
              <input
                className="users-input"
                type="text"
                value={draft.yearOfStudy}
                onChange={(e) =>
                  setDraft({ ...draft, yearOfStudy: e.target.value })
                }
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Semester</span>
              <input
                className="users-input"
                type="text"
                value={draft.semester}
                onChange={(e) => setDraft({ ...draft, semester: e.target.value })}
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Section</span>
              <input
                className="users-input"
                type="text"
                value={draft.section}
                onChange={(e) => setDraft({ ...draft, section: e.target.value })}
              />
            </label>
          </div>

          <div className="users-actions">
            <button type="submit" className="btn btn--primary" disabled={createState.saving}>
              {createState.saving ? 'Creating…' : 'Create course'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setAdding(false)
                setDraft(EMPTY_DRAFT)
              }}
            >
              Cancel
            </button>
          </div>

          <div className="users-feedback">
            <SaveFeedback state={createState} />
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No courses yet.">
          Use “Add course” above to create the first one. A code, a title, a
          nature and a CO target are required; everything else can be filled in
          later from this screen.
        </EmptyState>
      ) : (
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Nature</th>
                <th className="risk-table__value">CO target</th>
                <th>Department</th>
                <th>Programme</th>
                <th>Batch</th>
                <th>Academic year</th>
                <th>Semester</th>
                <th>Section</th>
                <th className="risk-table__value">Allocations</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = row.id === editingId
                const busy = rowState.saving && busyId === row.id

                return (
                  <tr key={row.id}>
                    {/* Never editable: the server refuses a code change. */}
                    <td className="risk-table__muted">{row.code}</td>

                    <td>
                      {isEditing ? (
                        <input
                          className="users-input users-table-input"
                          type="text"
                          aria-label="Title"
                          value={edit.title}
                          onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                        />
                      ) : (
                        row.title
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <select
                          className="users-select users-table-input"
                          aria-label="Nature"
                          value={edit.natureId}
                          onChange={(e) => setEdit({ ...edit, natureId: e.target.value })}
                        >
                          {natures.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.natureName
                      )}
                      {isEditing && String(edit.natureId) !== String(row.natureId) && (
                        <span className="users-note">
                          Changing the nature changes the mark scale and
                          recomputes every attainment figure for this course.
                        </span>
                      )}
                    </td>

                    <td className="risk-table__value">
                      {isEditing ? (
                        <input
                          className="users-input courses-number"
                          type="number"
                          min="1"
                          max="100"
                          step="0.01"
                          aria-label="CO target percent"
                          value={edit.coTargetPercent}
                          onChange={(e) =>
                            setEdit({ ...edit, coTargetPercent: e.target.value })
                          }
                        />
                      ) : (
                        `${row.coTargetPercent}%`
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <DepartmentField
                          departments={departmentList}
                          value={edit.department}
                          isNew={edit.departmentIsNew}
                          inTable
                          onChange={({ value, isNew }) =>
                            setEdit({ ...edit, department: value, departmentIsNew: isNew })
                          }
                        />
                      ) : (
                        row.department ?? absent()
                      )}
                    </td>

                    {[
                      'programme',
                      'batch',
                      'academicYear',
                      'semester',
                      'section',
                    ].map((field) => (
                      <td key={field}>
                        {isEditing ? (
                          <input
                            className="users-input users-table-input"
                            type="text"
                            aria-label={field}
                            value={edit[field]}
                            onChange={(e) => setEdit({ ...edit, [field]: e.target.value })}
                          />
                        ) : (
                          row[field] ?? absent()
                        )}
                      </td>
                    ))}

                    <td className="risk-table__value">
                      {row.allocationCount === 0 ? (
                        <span className="courses-warn" title="Nobody is allocated to this course">
                          0
                        </span>
                      ) : (
                        row.allocationCount
                      )}
                    </td>

                    <td>
                      <div className="users-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="btn btn--primary"
                              disabled={busy}
                              onClick={() => saveEdit(row)}
                            >
                              {busy ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={() => beginEdit(row)}
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {busyId === row.id && <SaveFeedback state={rowState} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// END REMOVABLE -- Courses screen
