// ---------------------------------------------------------------
// BEGIN REMOVABLE -- Allocations screen
//
// Who teaches what. Assigning a faculty member to a course, and removing that
// assignment, so neither needs a hand-written migration.
//
// WHY THIS SCREEN MATTERS MORE THAN IT LOOKS
//   course_allocations is not a label. courseScope() in server/auth.js grants
//   an ordinary faculty member access to a course THROUGH this table, so a row
//   here is what makes a course appear on somebody's dashboard and their mark
//   sheets editable. Removing the last 'handling' row hides the course from
//   everyone except an admin, and nothing in the app reports that -- which is
//   why the server refuses it and this screen says so.
//
// ADMIN ONLY, AND GUARDED TWICE, like the Users and Courses screens.
//
// Delete this file, the route in App.jsx, the sidebar entry in Layout.jsx and
// the three functions in data/api.js to remove the feature. Courses.css is
// shared with the Courses screen.
// ---------------------------------------------------------------

import { useState } from 'react'
import {
  createAdminAllocation,
  deleteAdminAllocation,
  fetchAdminAllocations,
  fetchAdminCourses,
  fetchAdminUsers,
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
import './RiskReport.css'
import './Users.css'
import './Courses.css'

// Module level, not rebuilt per render: it is useApiData's effect dependency.
//
// fetchAdminUsers rather than fetchFacultyList: this screen has to tell an
// active account from an inactive one, and the directory endpoint returns only
// the active ones with no status field to check.
const LOADERS = {
  allocations: fetchAdminAllocations,
  courses: fetchAdminCourses,
  users: fetchAdminUsers,
}

// The ENUM migration 006 declared on course_allocations.role.
const ROLES = ['handling', 'incharge']

const EMPTY_DRAFT = {
  courseId: '',
  facultyId: '',
  role: 'handling',
  academicYear: '',
  semester: '',
  section: '',
}

function absent(text = 'Not recorded') {
  return <span className="risk-table__muted">{text}</span>
}

function textToSend(value) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export default function Allocations() {
  const { faculty } = useSession()

  // ROUTE GUARD. The sidebar hides the link, but a URL can still be typed.
  if (!faculty || faculty.role !== 'admin') {
    return (
      <>
        <header className="page-header">
          <h1 className="page-header__title">Allocations</h1>
        </header>
        <div className="placeholder" role="alert">
          Managing course allocations needs the admin role.
          {faculty?.role ? ` Your account is '${faculty.role}'.` : ''} Ask an
          administrator if you need an allocation changed.
        </div>
      </>
    )
  }

  return <AllocationsLoader />
}

function AllocationsLoader() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="table" />
  if (error) return <DataError error={error} />
  return (
    <AllocationsView
      allocations={data.allocations}
      courses={data.courses}
      users={data.users}
    />
  )
}

function AllocationsView({ allocations, courses, users }) {
  const [rows, setRows] = useState(allocations)

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [createState, runCreate] = useSave()

  // Which row is awaiting confirmation, and which is mid-removal. A remove is
  // two steps: the server refuses the dangerous case anyway, so this step is
  // about intent rather than safety.
  const [confirmingId, setConfirmingId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rowState, runRow] = useSave()

  // Only ACTIVE accounts can be allocated -- the server refuses an inactive
  // one, because requireAuth rejects it on every request and the course would
  // show a name that cannot sign in.
  const activeUsers = users.filter((u) => u.isActive)

  function submitNew(event) {
    event.preventDefault()
    runCreate(
      () =>
        createAdminAllocation({
          courseId: draft.courseId === '' ? null : Number(draft.courseId),
          facultyId: draft.facultyId === '' ? null : Number(draft.facultyId),
          role: draft.role,
          academicYear: textToSend(draft.academicYear),
          semester: textToSend(draft.semester),
          section: textToSend(draft.section),
        }),
      (created) => {
        if (created && typeof created.id === 'number') {
          setRows((prev) =>
            [...prev, created].sort(
              (a, b) =>
                a.courseCode.localeCompare(b.courseCode) ||
                a.facultyName.localeCompare(b.facultyName),
            ),
          )
        }
        setDraft(EMPTY_DRAFT)
        setAdding(false)
      },
    )
  }

  function remove(row) {
    setBusyId(row.id)
    runRow(
      () => deleteAdminAllocation(row.id),
      (result) => {
        // Mock mode resolves { mock: true }; drop the row only on a real
        // removal the server confirmed.
        if (result?.removed?.id === row.id) {
          setRows((prev) => prev.filter((r) => r.id !== row.id))
        }
        setConfirmingId(null)
      },
    )
  }

  // How many 'handling' rows each course has, so the screen can warn BEFORE
  // the click rather than only reporting the server's refusal afterwards.
  const handlingCounts = rows.reduce((acc, r) => {
    if (r.role === 'handling') acc[r.courseId] = (acc[r.courseId] ?? 0) + 1
    return acc
  }, {})

  const courseCount = new Set(rows.map((r) => r.courseId)).size

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Allocations</h1>
        <p className="page-header__subtitle">
          Who teaches what. A handling allocation is what lets a faculty member
          reach a course at all; an incharge allocation records who owns the
          course file. A course with no handling faculty is invisible to
          everyone except an admin, so the last one cannot be removed.
        </p>
      </header>

      <div className="users-toolbar">
        <span className="users-toolbar__count">
          {rows.length} allocations across {courseCount} courses
        </span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? 'Close' : 'Add allocation'}
        </button>
      </div>

      {adding && (
        <form className="users-panel" onSubmit={submitNew}>
          <h2 className="users-panel__title">Allocate a faculty member</h2>

          <div className="users-panel__grid">
            <label className="users-field">
              <span className="users-field__label">Course</span>
              <select
                className="users-select"
                value={draft.courseId}
                required
                onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}
              >
                <option value="">Choose a course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="users-field">
              <span className="users-field__label">Faculty</span>
              <select
                className="users-select"
                value={draft.facultyId}
                required
                onChange={(e) => setDraft({ ...draft, facultyId: e.target.value })}
              >
                <option value="">Choose a faculty member</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
              <span className="users-note">
                Only active accounts are listed. An inactive account cannot sign
                in, so allocating one would name somebody who cannot open the
                course.
              </span>
            </label>

            <label className="users-field">
              <span className="users-field__label">Role</span>
              <select
                className="users-select"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label className="users-field">
              <span className="users-field__label">Academic year</span>
              <input
                className="users-input"
                type="text"
                value={draft.academicYear}
                onChange={(e) => setDraft({ ...draft, academicYear: e.target.value })}
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
              {createState.saving ? 'Allocating…' : 'Allocate'}
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
        <EmptyState title="Nobody is allocated to any course.">
          Every course is currently invisible to its faculty. Use “Add
          allocation” above to assign a handling faculty member to a course.
        </EmptyState>
      ) : (
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Course code</th>
                <th>Course title</th>
                <th>Faculty</th>
                <th>Role</th>
                <th>Academic year</th>
                <th>Semester</th>
                <th>Section</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const busy = rowState.saving && busyId === row.id
                const confirming = row.id === confirmingId
                // The server refuses this; saying so up front is kinder than
                // letting the click fail.
                const isLastHandling =
                  row.role === 'handling' && (handlingCounts[row.courseId] ?? 0) <= 1
                // Sorted by course code, so a change of code starts a group.
                const startsGroup =
                  index === 0 || rows[index - 1].courseCode !== row.courseCode

                return (
                  <tr key={row.id} className={startsGroup ? 'alloc-group-start' : undefined}>
                    <td>{row.courseCode}</td>
                    <td>{row.courseTitle}</td>
                    <td>
                      {row.facultyName}
                      {!row.facultyIsActive && (
                        <span className="users-note">
                          This account is inactive and cannot sign in.
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          row.role === 'incharge'
                            ? 'alloc-role alloc-role--incharge'
                            : 'alloc-role'
                        }
                      >
                        {row.role}
                      </span>
                    </td>
                    <td>{row.academicYear ?? absent()}</td>
                    <td>{row.semester ?? absent()}</td>
                    <td>{row.section ?? absent()}</td>

                    <td>
                      {confirming ? (
                        <div className="alloc-confirm">
                          <span className="alloc-confirm__question">
                            Remove {row.facultyName} from {row.courseCode} as{' '}
                            {row.role}?
                          </span>
                          <div className="users-actions">
                            <button
                              type="button"
                              className="btn btn--danger"
                              disabled={busy}
                              onClick={() => remove(row)}
                            >
                              {busy ? 'Removing…' : 'Yes, remove'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary"
                              onClick={() => setConfirmingId(null)}
                            >
                              Keep
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="users-actions">
                          <button
                            type="button"
                            className="btn btn--quiet"
                            disabled={isLastHandling}
                            onClick={() => setConfirmingId(row.id)}
                          >
                            Remove
                          </button>
                        </div>
                      )}

                      {isLastHandling && !confirming && (
                        <span className="users-note">
                          The last handling faculty for {row.courseCode}.
                          Allocate a replacement first.
                        </span>
                      )}

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

// END REMOVABLE -- Allocations screen
