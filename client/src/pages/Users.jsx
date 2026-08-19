// ---------------------------------------------------------------
// BEGIN REMOVABLE -- admin Users screen
//
// Every faculty account, and the controls to manage one, so that adding a
// member of staff or changing a role is a screen rather than a hand-written
// SQL migration.
//
// ADMIN ONLY, AND GUARDED TWICE.
//   The sidebar link in Layout.jsx is only rendered for an admin, and this
//   file refuses to render the screen for anybody else -- so typing the URL
//   gets a refusal, not the table. Neither guard is what ENFORCES anything:
//   the API answers 403 to a faculty or hod token regardless of what the
//   browser decided to draw. They exist so the refusal is a sentence the user
//   can read rather than a failed request.
//
// THE SERVER OWNS THE RULES.
//   Domain, duplicate address, valid role, and the two self-lockout guards
//   are all enforced in server/routes/admin.js. This screen mirrors the
//   self-lockout ones by disabling the controls, because a disabled control
//   with a reason beside it is a better answer than a 400 after the click --
//   but it never assumes its copy is the authority.
//
// Delete this file, Users.css, the route in App.jsx, the sidebar entry in
// Layout.jsx, and the three functions in data/api.js to remove the feature.
// ---------------------------------------------------------------

import { useState } from 'react'
import {
  createAdminUser,
  fetchAdminUsers,
  // BEGIN REMOVABLE -- department picker
  fetchDepartments,
  // END REMOVABLE -- department picker
  updateAdminUser,
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
// BEGIN REMOVABLE -- department picker. Moved out of this file unchanged when
// the Courses screen needed the same control; see the note in that module.
import { DepartmentField } from '../components/DepartmentField'
import { departmentToSend, listHas } from '../components/departments'
// END REMOVABLE -- department picker
// The table style, which already exists. Not redefined here -- see Users.css.
import './RiskReport.css'
import './Users.css'

// Module level, not rebuilt per render: it is useApiData's effect dependency.
const LOADERS = { users: fetchAdminUsers, departments: fetchDepartments }

// The ENUM migration 013 declared, in the same order the server accepts.
const ROLES = ['faculty', 'hod', 'admin']

const EMPTY_DRAFT = {
  name: '',
  email: '',
  department: '',
  // BEGIN REMOVABLE -- department picker
  departmentIsNew: false,
  // END REMOVABLE -- department picker
  role: 'faculty',
}

/**
 * A value the database has not recorded.
 *
 * A blank cell looks like a rendering fault; this says which absence it is.
 * lastLoginAt null means "has not signed in since login tracking was switched
 * on" -- migration 018 seeded nothing -- and NOT "has never used the portal".
 */
function absent(text) {
  return <span className="risk-table__muted">{text}</span>
}

export default function Users() {
  const { faculty } = useSession()

  // ROUTE GUARD. The sidebar hides the link, but a URL can still be typed.
  if (!faculty || faculty.role !== 'admin') {
    return (
      <>
        <header className="page-header">
          <h1 className="page-header__title">Users</h1>
        </header>
        <div className="placeholder" role="alert">
          Managing faculty accounts needs the admin role.
          {faculty?.role ? ` Your account is '${faculty.role}'.` : ''} Ask an
          administrator if you need a change made.
        </div>
      </>
    )
  }

  return <UsersLoader adminId={faculty.id} />
}

function UsersLoader({ adminId }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="table" />
  if (error) return <DataError error={error} />
  return (
    <UsersView
      users={data.users}
      departments={data.departments}
      adminId={adminId}
    />
  )
}

function UsersView({ users, departments, adminId }) {
  // Held locally so a save can put the row the server returned straight back
  // on screen without refetching the whole table.
  const [rows, setRows] = useState(users)

  // BEGIN REMOVABLE -- department picker.
  // Local too, for the same reason: a department invented on this screen has
  // to appear in the next row's select without a reload. It is only ever
  // extended with a spelling the SERVER returned, never with what was typed --
  // the server may have matched it to an existing department instead.
  const [departmentList, setDepartmentList] = useState(departments)

  function rememberDepartment(saved) {
    const stored = saved?.department
    if (typeof stored !== 'string' || stored.trim() === '') return
    setDepartmentList((prev) =>
      listHas(prev, stored) ? prev : [...prev, stored].sort((a, b) => a.localeCompare(b)),
    )
  }
  // END REMOVABLE -- department picker

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [createState, runCreate] = useSave()

  // Which row is open for editing, and the values being typed into it. A
  // failed save never clears either -- what the user typed stays on screen.
  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState(null)

  // Which row a save is running for, so the in-flight state and any error
  // land on that row rather than on all of them.
  const [busyId, setBusyId] = useState(null)
  const [rowState, runRow] = useSave()

  /** Replace one row with what the server returned. */
  function applyRow(saved) {
    // Mock mode resolves { mock: true } with no row to apply. The table is
    // left exactly as it is rather than showing an invented change.
    if (!saved || typeof saved.id !== 'number') return
    setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))
    // BEGIN REMOVABLE -- department picker
    rememberDepartment(saved)
    // END REMOVABLE -- department picker
  }

  function beginEdit(row) {
    setEditingId(row.id)
    setEdit({
      name: row.name,
      // An existing department is always the SELECTED value, never a
      // half-typed new one -- DepartmentField offers it as its own option
      // when the list does not carry it.
      department: row.department ?? '',
      departmentIsNew: false,
      role: row.role,
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
        updateAdminUser(row.id, {
          name: edit.name,
          // Trimmed here; '' is "not recorded", which the column holds as
          // NULL. The server trims again and settles the spelling.
          department: departmentToSend(edit.department),
          // The server refuses an admin demoting themselves; the select is
          // disabled on that row, so this only ever sends an unchanged value.
          role: edit.role,
        }),
      (saved) => {
        applyRow(saved)
        cancelEdit()
      },
    )
  }

  function toggleActive(row) {
    setBusyId(row.id)
    runRow(() => updateAdminUser(row.id, { isActive: !row.isActive }), applyRow)
  }

  function submitNew(event) {
    event.preventDefault()
    runCreate(
      () =>
        createAdminUser({
          name: draft.name,
          email: draft.email,
          department: departmentToSend(draft.department),
          role: draft.role,
        }),
      (created) => {
        if (created && typeof created.id === 'number') {
          setRows((prev) =>
            [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
          )
          // BEGIN REMOVABLE -- department picker
          rememberDepartment(created)
          // END REMOVABLE -- department picker
        }
        setDraft(EMPTY_DRAFT)
        setAdding(false)
      },
    )
  }

  const activeCount = rows.filter((r) => r.isActive).length

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Users</h1>
        <p className="page-header__subtitle">
          Every faculty account on the portal, active and inactive. Email is set
          when the account is created and cannot be changed afterwards. A
          sign-in count of zero means none has been recorded since login
          tracking was switched on, not that the account has never been used.
        </p>
      </header>

      <div className="users-toolbar">
        <span className="users-toolbar__count">
          {rows.length} accounts · {activeCount} active
        </span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? 'Close' : 'Add user'}
        </button>
      </div>

      {adding && (
        <form className="users-panel" onSubmit={submitNew}>
          <h2 className="users-panel__title">Add a faculty account</h2>

          <div className="users-panel__grid">
            <label className="users-field">
              <span className="users-field__label">Name</span>
              <input
                className="users-input"
                type="text"
                value={draft.name}
                required
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>

            <label className="users-field">
              <span className="users-field__label">Email</span>
              <input
                className="users-input"
                type="email"
                value={draft.email}
                required
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>

            {/* BEGIN REMOVABLE -- department picker. Was a free-text input.
                Not a <label> wrapper any more: the control is a select and
                sometimes a second input, and one label cannot name both --
                each carries its own aria-label instead. */}
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
            {/* END REMOVABLE -- department picker */}

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
          </div>

          <div className="users-actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={createState.saving}
            >
              {createState.saving ? 'Creating…' : 'Create account'}
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
        <EmptyState title="No faculty accounts yet.">
          Use “Add user” above to create the first one. It must be an address in
          the institution’s sign-in domain, or the server will refuse it.
        </EmptyState>
      ) : (
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th className="risk-table__value">Sign-ins</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelf = row.id === adminId
                const isEditing = row.id === editingId
                const busy = rowState.saving && busyId === row.id

                return (
                  <tr key={row.id}>
                    <td>
                      {isEditing ? (
                        <input
                          className="users-input users-table-input"
                          type="text"
                          aria-label="Name"
                          value={edit.name}
                          onChange={(e) =>
                            setEdit({ ...edit, name: e.target.value })
                          }
                        />
                      ) : (
                        row.name
                      )}
                    </td>

                    {/* Never editable. It is the address Google signs in
                        with, and the server refuses a change outright. */}
                    <td className="risk-table__muted">{row.email}</td>

                    <td>
                      {isEditing ? (
                        /* BEGIN REMOVABLE -- department picker.
                           Was a free-text input. */
                        <DepartmentField
                          departments={departmentList}
                          value={edit.department}
                          isNew={edit.departmentIsNew}
                          inTable
                          onChange={({ value, isNew }) =>
                            setEdit({
                              ...edit,
                              department: value,
                              departmentIsNew: isNew,
                            })
                          }
                        />
                      ) : (
                        /* END REMOVABLE -- department picker */
                        row.department ?? absent('Not recorded')
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <select
                          className="users-select users-table-input"
                          aria-label="Role"
                          value={edit.role}
                          disabled={isSelf}
                          onChange={(e) =>
                            setEdit({ ...edit, role: e.target.value })
                          }
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.role
                      )}
                      {isSelf && isEditing && (
                        <span className="users-note">
                          Your own role. Another admin has to change it.
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        className={
                          row.isActive
                            ? 'users-status users-status--active'
                            : 'users-status users-status--inactive'
                        }
                      >
                        {row.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {isSelf && (
                        <span className="users-note">
                          Your own account. You cannot deactivate yourself or
                          change your own role — ask another admin.
                        </span>
                      )}
                    </td>

                    <td>{row.lastLoginAt ?? absent('Not recorded')}</td>

                    <td className="risk-table__value">{row.signInCount}</td>

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

                        <button
                          type="button"
                          className="btn btn--quiet"
                          disabled={isSelf || busy}
                          onClick={() => toggleActive(row)}
                        >
                          {row.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>

                      {busyId === row.id && (
                        <SaveFeedback state={rowState} />
                      )}
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

// END REMOVABLE -- admin Users screen
