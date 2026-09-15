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

import { useRef, useState } from 'react'
import {
  // BEGIN REMOVABLE -- allocation CSV import (screen half)
  applyAllocationImport,
  previewAllocationImport,
  // END REMOVABLE -- allocation CSV import (screen half)
  createAdminAllocation,
  deleteAdminAllocation,
  fetchAdminAllocations,
  fetchAdminCourses,
  fetchAdminUsers,
} from '../data/api'
// BEGIN REMOVABLE -- allocation CSV import (screen half)
import { readAllocationCsv } from '../data/allocationCsv'
// END REMOVABLE -- allocation CSV import (screen half)
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
// BEGIN REMOVABLE -- allocation CSV import (screen half)
import './Allocations.css'
// END REMOVABLE -- allocation CSV import (screen half)

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

  // BEGIN REMOVABLE -- allocation CSV import (screen half)
  const [importOpen, setImportOpen] = useState(false)
  // The parsed file is kept so Apply re-sends the SAME rows the preview was
  // given. The server re-resolves them; it is never sent a decision.
  const [file, setFile] = useState(null)
  const [parseError, setParseError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [applied, setApplied] = useState(null)
  const [driftNotice, setDriftNotice] = useState(null)
  const [previewState, runPreview] = useSave()
  const [applyState, runApply] = useSave()
  const fileInput = useRef(null)

  function resetImport() {
    setFile(null)
    setParseError(null)
    setPreview(null)
    setApplied(null)
    setDriftNotice(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function chooseFile(event) {
    const chosen = event.target.files?.[0]
    if (!chosen) return
    setParseError(null)
    setPreview(null)
    setApplied(null)
    setDriftNotice(null)

    let parsed
    let text
    try {
      text = await chosen.text()
    } catch {
      setFile(null)
      setParseError('That file could not be read. Try exporting the sheet again.')
      return
    }

    try {
      parsed = readAllocationCsv(text)
    } catch (err) {
      // A parse failure is a FILE problem, not a server one, and its message
      // already names what is wrong. Shown on its own rather than as a failed
      // save, because nothing was sent.
      setFile(null)
      setParseError(err.message)
      return
    }

    setFile({ name: chosen.name, ...parsed })
    runPreview(
      () => previewAllocationImport(parsed.rows),
      (result) => setPreview(result),
    )
  }

  function apply() {
    if (!file || !preview) return
    setDriftNotice(null)
    runApply(
      async () => {
        try {
          return await applyAllocationImport(file.rows, preview.fingerprint)
        } catch (err) {
          // A 409 means the allocations moved between the preview and this
          // click -- including a second click of Apply, where the first one
          // turned every addition into an existing row. NOTHING WAS WRITTEN.
          // Re-preview so the admin is looking at the truth rather than at a
          // stale screen, then rethrow so the failure is still reported.
          if (err.status === 409) {
            setDriftNotice(
              'The allocations changed since this preview, so nothing was written. ' +
                'Below is what the file would do now.',
            )
            runPreview(
              () => previewAllocationImport(file.rows),
              (result) => setPreview(result),
            )
          }
          throw err
        }
      },
      (result) => {
        const created = result?.created ?? []
        setApplied(created)
        setPreview(null)
        if (created.length > 0) {
          setRows((prev) =>
            [...prev, ...created].sort(
              (a, b) =>
                a.courseCode.localeCompare(b.courseCode) ||
                a.facultyName.localeCompare(b.facultyName),
            ),
          )
        }
      },
    )
  }
  // END REMOVABLE -- allocation CSV import (screen half)

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
        {/* BEGIN REMOVABLE -- allocation CSV import (screen half) */}
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            setImportOpen((open) => {
              if (open) resetImport()
              return !open
            })
          }}
        >
          {importOpen ? 'Close import' : 'Import from CSV'}
        </button>
        {/* END REMOVABLE -- allocation CSV import (screen half) */}
      </div>

      {/* BEGIN REMOVABLE -- allocation CSV import (screen half) */}
      {importOpen && (
        <ImportPanel
          file={file}
          fileInput={fileInput}
          onChoose={chooseFile}
          onReset={resetImport}
          parseError={parseError}
          preview={preview}
          previewState={previewState}
          applyState={applyState}
          applied={applied}
          driftNotice={driftNotice}
          onApply={apply}
        />
      )}
      {/* END REMOVABLE -- allocation CSV import (screen half) */}

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

// ---------------------------------------------------------------
// BEGIN REMOVABLE -- allocation CSV import (screen half)
//
// The import panel. Delete this block, the marked spans in AllocationsView
// above, the marked imports at the top, ../data/allocationCsv.js, the two
// functions in ../data/api.js and ./Allocations.css to remove the feature.
//
// NOTHING HERE DECIDES ANYTHING. The file is turned into rows of strings and
// posted; every match, every refusal and every reason on screen is the
// server's, re-derived from scratch when Apply is clicked. The panel's job is
// to make the whole consequence visible BEFORE the write, which is the only
// reason preview and apply are separate requests.
// ---------------------------------------------------------------

/** One heading and its count, so no group is read without its size. */
function ImportGroup({ title, count, tone, children, blurb }) {
  return (
    <section className={`alloc-import__group alloc-import__group--${tone}`}>
      <h3 className="alloc-import__heading">
        {title}
        <span className="alloc-import__count">{count}</span>
      </h3>
      {blurb && <p className="alloc-import__blurb">{blurb}</p>}
      {count > 0 && children}
    </section>
  )
}

/** The course / faculty / role columns every group shares. */
function ImportRowCells({ row }) {
  return (
    <>
      <td>{row.line}</td>
      <td>{row.courseCode || row.fileCourseCode}</td>
      <td>{row.courseTitle || row.fileCourseTitle}</td>
      <td>{row.facultyName || row.fileFacultyName || row.fileFacultyEmail}</td>
      <td>
        <span
          className={row.role === 'incharge' ? 'alloc-role alloc-role--incharge' : 'alloc-role'}
        >
          {row.role ?? '—'}
        </span>
      </td>
    </>
  )
}

function ImportPanel({
  file,
  fileInput,
  onChoose,
  onReset,
  parseError,
  preview,
  previewState,
  applyState,
  applied,
  driftNotice,
  onApply,
}) {
  const counts = preview?.counts
  const nothingToAdd = !counts || counts.toAdd === 0

  return (
    <section className="users-panel alloc-import">
      <h2 className="users-panel__title">Import allocations from the department sheet</h2>

      <p className="alloc-import__blurb">
        Download the allocation sheet as CSV and choose it here. Nothing is written until
        you approve it. <strong>An import only ever adds.</strong> An allocation that is in
        the portal but not in the file is listed below for information and is left exactly
        as it is — removing one stays a deliberate act through the Remove button, which
        refuses to take away the last handling faculty of a course.
      </p>

      <div className="users-actions">
        {/* The input itself is hidden so the control carries the app's own
            button styling; the label below reports what was chosen, which a
            native file input would otherwise be the only place to see. */}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="alloc-import__file"
          onChange={onChoose}
        />
        <button
          type="button"
          className="btn btn--primary"
          disabled={previewState.saving}
          onClick={() => fileInput.current?.click()}
        >
          {previewState.saving ? 'Reading…' : 'Choose CSV file'}
        </button>
        {(file || parseError || applied) && (
          <button type="button" className="btn btn--quiet" onClick={onReset}>
            Clear
          </button>
        )}
      </div>

      {file && (
        <p className="users-note">
          {file.name} — {file.rows.length} row{file.rows.length === 1 ? '' : 's'}, columns{' '}
          {file.headers.join(', ')}.
          {file.missingOptional.includes('Allocated Faculty Email') &&
            ' This sheet has no email column, so faculty were matched by name.'}
        </p>
      )}

      {parseError && (
        <p className="placeholder" role="alert">
          {parseError}
        </p>
      )}

      <div className="users-feedback">
        <SaveFeedback state={previewState} />
      </div>

      {driftNotice && (
        <p className="placeholder" role="alert">
          {driftNotice}
        </p>
      )}

      {/* WHAT WAS ACTUALLY WRITTEN, read back from the database by the server
          -- not the preview repeated, and not a silently refreshed table.
          There is nothing to check a refresh against. */}
      {applied && (
        <ImportGroup
          title="Written"
          count={applied.length}
          tone="added"
          blurb={
            applied.length === 0
              ? 'Nothing was written.'
              : 'These rows are now in the portal. Nothing was removed.'
          }
        >
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
                </tr>
              </thead>
              <tbody>
                {applied.map((row) => (
                  <tr key={row.id}>
                    <td>{row.courseCode}</td>
                    <td>{row.courseTitle}</td>
                    <td>{row.facultyName}</td>
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
                    <td>{row.academicYear ?? '—'}</td>
                    <td>{row.semester ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ImportGroup>
      )}

      {preview && (
        <>
          <ImportGroup
            title="Will be added"
            count={counts.toAdd}
            tone="added"
            blurb={
              counts.toAdd === 0 ? 'Nothing in this file is new to the portal.' : undefined
            }
          >
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Course code</th>
                    <th>Course title</th>
                    <th>Faculty</th>
                    <th>Role</th>
                    <th>Matched by</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.toAdd.map((row) => (
                    <tr key={row.line}>
                      <ImportRowCells row={row} />
                      <td>
                        {row.matchedBy}
                        {row.note && <span className="users-note">{row.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup
            title="Already present"
            count={counts.unchanged}
            tone="same"
            blurb="These allocations are already in the portal exactly as the file has them. They will not be written again."
          >
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Course code</th>
                    <th>Course title</th>
                    <th>Faculty</th>
                    <th>Role</th>
                    <th>Matched by</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.unchanged.map((row) => (
                    <tr key={row.line}>
                      <ImportRowCells row={row} />
                      <td>
                        {row.matchedBy}
                        {row.note && <span className="users-note">{row.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup
            title="Could not be matched"
            count={counts.unmatched}
            tone="unmatched"
            blurb="These rows will be skipped. Each one says why; fix the sheet, or the account, and import again."
          >
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Course code</th>
                    <th>Course title</th>
                    <th>Faculty in the file</th>
                    <th>Role</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.unmatched.map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.fileCourseCode || <span className="risk-table__muted">blank</span>}</td>
                      <td>{row.fileCourseTitle}</td>
                      <td>
                        {row.fileFacultyName || row.fileFacultyEmail || (
                          <span className="risk-table__muted">blank</span>
                        )}
                      </td>
                      <td>{row.role || <span className="risk-table__muted">blank</span>}</td>
                      <td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup
            title="In the portal, not in the file"
            count={counts.inPortalNotInFile}
            tone="info"
            blurb="Information only. These WILL NOT be removed. The import never deletes an allocation; use the Remove button on the table below if one really should go."
          >
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
                  </tr>
                </thead>
                <tbody>
                  {preview.inPortalNotInFile.map((row) => (
                    <tr key={row.id}>
                      <td>{row.courseCode}</td>
                      <td>{row.courseTitle}</td>
                      <td>{row.facultyName}</td>
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
                      <td>{row.academicYear ?? '—'}</td>
                      <td>{row.semester ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <div className="users-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={nothingToAdd || applyState.saving}
              onClick={onApply}
            >
              {applyState.saving
                ? 'Applying…'
                : nothingToAdd
                  ? 'Nothing to add'
                  : `Add ${counts.toAdd} allocation${counts.toAdd === 1 ? '' : 's'}`}
            </button>
          </div>

          <div className="users-feedback">
            <SaveFeedback state={applyState} />
          </div>
        </>
      )}
    </section>
  )
}
// END REMOVABLE -- allocation CSV import (screen half)

// END REMOVABLE -- Allocations screen
