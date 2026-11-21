// ---------------------------------------------------------------
// BEGIN REMOVABLE -- Student Directory
//
// One institution-wide list of students: search it, correct a name, batch or
// programme in place, and bulk-load it by pasting rows from a spreadsheet.
//
// ADMIN ONLY, AND GUARDED TWICE -- the same arrangement as Users.jsx. The
// sidebar link is rendered for an admin only and this page refuses to draw
// for anybody else, but neither enforces anything: the API answers 403 to a
// faculty or hod token whatever the browser decides.
//
// NO NEW STYLES. The table is .risk-table, the panels and fields are the
// .users-* ones, the paste box is Course Setup's .setup-bulk and the four
// preview groups are the Allocations import's .alloc-import__* -- all
// existing, all inside @media screen. This page adds no stylesheet.
//
// THE SERVER DECIDES. The paste is parsed here only to show what was read
// (studentPaste.js); preview and apply each send the raw text and the server
// parses it again with its own copy. Nothing the browser concluded is sent.
//
// Delete this file, the route in App.jsx, the link in Layout.jsx, the
// Student Directory block in data/api.js and data/studentPaste.js (plus the
// server half) to remove the feature.
// ---------------------------------------------------------------

import { useMemo, useState } from 'react'
import {
  applyStudentImport,
  fetchAdminStudents,
  previewStudentImport,
  updateDirectoryStudent,
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
import { DEFAULT_FILTER, parseStudentPaste } from '../data/studentPaste'
import { ABSENT } from '../components/emptyField'
// Existing styles only -- see the header.
import './RiskReport.css'
import './Users.css'
import './CourseSetup.css'
import './Allocations.css'

// Module level, not rebuilt per render: it is useApiData's effect dependency.
const LOADERS = { directory: fetchAdminStudents }

// Every batch, every programme, and the one value no row can hold.
const ALL = ''
const NOT_RECORDED = '\u0000none'

function absent(text = ABSENT) {
  return <span className="risk-table__muted">{text}</span>
}

/** Trim, collapse inner whitespace; '' stays ''. */
function squash(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export default function StudentDirectory() {
  const { faculty } = useSession()

  if (!faculty || faculty.role !== 'admin') {
    return (
      <>
        <header className="page-header">
          <h1 className="page-header__title">Students</h1>
        </header>
        <div className="placeholder" role="alert">
          The student directory needs the admin role.
          {faculty?.role ? ` Your account is '${faculty.role}'.` : ''} Ask an
          administrator if you need a change made.
        </div>
      </>
    )
  }

  return <DirectoryLoader />
}

function DirectoryLoader() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="table" />
  if (error) return <DataError error={error} />
  return <DirectoryView initial={data.directory} />
}

function DirectoryView({ initial }) {
  // Held locally so a save can put the row the server returned straight back
  // on screen, and an import can reload the list, without a page reload.
  const [rows, setRows] = useState(initial.students ?? [])
  const [query, setQuery] = useState('')
  const [batch, setBatch] = useState(ALL)
  const [programme, setProgramme] = useState(ALL)

  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [rowState, runRow] = useSave()

  const [importOpen, setImportOpen] = useState(false)

  const batches = useMemo(() => distinct(rows, 'batch'), [rows])
  const programmes = useMemo(() => distinct(rows, 'programme'), [rows])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (needle !== '' &&
          !row.regNumber.toLowerCase().includes(needle) &&
          !row.name.toLowerCase().includes(needle)) return false
      if (batch === NOT_RECORDED ? row.batch !== null : batch !== ALL && row.batch !== batch) return false
      if (programme === NOT_RECORDED
        ? row.programme !== null
        : programme !== ALL && row.programme !== programme) return false
      return true
    })
  }, [rows, query, batch, programme])

  const onNoCourse = rows.filter((r) => r.courseCount === 0).length

  async function reloadAll() {
    const fresh = await fetchAdminStudents()
    setRows(fresh.students ?? [])
  }

  function beginEdit(row) {
    setEditingId(row.id)
    setEdit({ name: row.name, batch: row.batch ?? '', programme: row.programme ?? '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEdit(null)
  }

  function saveEdit(row) {
    setBusyId(row.id)
    runRow(
      () =>
        updateDirectoryStudent(row.id, {
          name: squash(edit.name),
          // '' is "not recorded"; the server stores it as NULL.
          batch: edit.batch.trim(),
          programme: squash(edit.programme),
        }),
      (saved) => {
        // Mock mode returns no row; the table is left exactly as it was.
        if (saved && typeof saved.id === 'number') {
          setRows((prev) =>
            prev.map((r) =>
              r.id === saved.id
                ? { ...r, name: saved.name, batch: saved.batch, programme: saved.programme }
                : r,
            ),
          )
        }
        cancelEdit()
      },
    )
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Students</h1>
        <p className="page-header__subtitle">
          Every student on the portal, across all courses. Register numbers are
          fixed here; name, batch and programme can be corrected. A correction
          applies on every course the student is enrolled on. Courses shows how
          many courses each student is attached to; 0 means none.
        </p>
      </header>

      <div className="users-toolbar">
        <span className="users-toolbar__count">
          {visible.length === rows.length
            ? `${rows.length} students`
            : `${visible.length} of ${rows.length} students`}
          {' · '}
          {onNoCourse} on no course
        </span>
        <button
          type="button"
          className="btn btn--primary"
          aria-expanded={importOpen}
          onClick={() => setImportOpen((open) => !open)}
        >
          {importOpen ? 'Close bulk import' : 'Bulk import'}
        </button>
      </div>

      {importOpen && <ImportPanel onApplied={reloadAll} />}

      <div className="users-panel">
        <div className="users-panel__grid">
          <label className="users-field">
            <span className="users-field__label">Search</span>
            <input
              className="users-input"
              type="search"
              value={query}
              placeholder="Register number or name"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="users-field">
            <span className="users-field__label">Batch</span>
            <select className="users-select" value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value={ALL}>All batches</option>
              {batches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value={NOT_RECORDED}>Not recorded</option>
            </select>
          </label>
          <label className="users-field">
            <span className="users-field__label">Programme</span>
            <select className="users-select" value={programme} onChange={(e) => setProgramme(e.target.value)}>
              <option value={ALL}>All programmes</option>
              {programmes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value={NOT_RECORDED}>Not recorded</option>
            </select>
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No students yet.">
          Use “Bulk import” above to paste a list from a spreadsheet.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="No student matches.">
          Clear the search or the filters to see everyone.
        </EmptyState>
      ) : (
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Register number</th>
                <th className="risk-table__name">Name</th>
                <th>Batch</th>
                <th>Programme</th>
                <th className="risk-table__value">Courses</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const isEditing = row.id === editingId
                const busy = rowState.saving && busyId === row.id
                return (
                  <tr key={row.id}>
                    {/* Never editable here. */}
                    <td>{row.regNumber}</td>
                    <td className="risk-table__name">
                      {isEditing ? (
                        <input
                          className="users-input users-table-input"
                          aria-label="Name"
                          value={edit.name}
                          maxLength={120}
                          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        />
                      ) : (
                        row.name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="users-input users-table-input"
                          aria-label="Batch"
                          value={edit.batch}
                          maxLength={20}
                          placeholder="2023-2027"
                          onChange={(e) => setEdit({ ...edit, batch: e.target.value })}
                        />
                      ) : (
                        row.batch ?? absent()
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="users-input users-table-input"
                          aria-label="Programme"
                          value={edit.programme}
                          maxLength={120}
                          placeholder="B Tech"
                          onChange={(e) => setEdit({ ...edit, programme: e.target.value })}
                        />
                      ) : (
                        row.programme ?? absent()
                      )}
                    </td>
                    <td className="risk-table__value">
                      {row.courseCount === 0 ? absent('0') : row.courseCount}
                    </td>
                    <td>
                      <div className="users-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="btn btn--primary"
                              disabled={busy || squash(edit.name) === ''}
                              onClick={() => saveEdit(row)}
                            >
                              {busy ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" className="btn btn--secondary" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn btn--secondary" onClick={() => beginEdit(row)}>
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

/** Distinct non-null values of one field, sorted. */
function distinct(rows, field) {
  return [...new Set(rows.map((r) => r[field]).filter((v) => v !== null && v !== ''))].sort(
    (a, b) => a.localeCompare(b),
  )
}

// ---------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------

/** One heading and its count -- the Allocations import's own markup. */
function ImportGroup({ title, count, tone, blurb, children }) {
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

function ImportPanel({ onApplied }) {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState(DEFAULT_FILTER)
  // The text and filter the preview was drawn from. Apply sends exactly
  // these, so editing the box after previewing cannot slip into the write.
  const [previewed, setPreviewed] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirmNames, setConfirmNames] = useState(false)
  const [notice, setNotice] = useState(null)
  const [applied, setApplied] = useState(null)
  const [previewState, runPreview] = useSave()
  const [applyState, runApply] = useSave()

  // What the browser reads, live, before anything is sent.
  const local = useMemo(() => (text.trim() === '' ? null : parseStudentPaste(text, filter)), [text, filter])
  const tooBig = text.length > 95000

  function clearResult() {
    setPreview(null)
    setPreviewed(null)
    setConfirmNames(false)
    setApplied(null)
    setNotice(null)
  }

  function doPreview(sentText, sentFilter) {
    runPreview(
      () => previewStudentImport(sentText, sentFilter),
      (result) => {
        if (!result || result.mock) return
        setPreview(result)
        setPreviewed({ text: sentText, filter: sentFilter })
        setConfirmNames(false)
      },
    )
  }

  function handlePreview(event) {
    event.preventDefault()
    clearResult()
    doPreview(text, filter)
  }

  function handleApply() {
    if (!preview || !previewed) return
    setNotice(null)
    runApply(
      async () => {
        try {
          return await applyStudentImport(previewed.text, previewed.filter, preview.token, confirmNames)
        } catch (err) {
          // 409: the students moved since this preview -- including a second
          // click of Apply. NOTHING WAS WRITTEN. Re-preview so what is on
          // screen is the truth, then rethrow so the failure is reported.
          if (err.status === 409) {
            setNotice('The students changed since this preview, so nothing was written. Below is what the paste would do now.')
            doPreview(previewed.text, previewed.filter)
          }
          throw err
        }
      },
      async (result) => {
        if (!result || result.mock) return
        setApplied(result)
        setPreview(null)
        setPreviewed(null)
        setConfirmNames(false)
        await onApplied()
      },
    )
  }

  const totals = preview?.totals
  const needsConfirm = (totals?.nameConflicts ?? 0) > 0
  const nothingToDo = totals && totals.add === 0 && totals.update === 0

  return (
    <section className="users-panel">
      <h2 className="users-panel__title">Bulk import</h2>
      <p className="users-note">
        Paste rows straight from a spreadsheet, tab- or comma-separated, with
        no header row. Columns in order: register number, name, batch,
        programme, department, year, email. Department, year and email are
        read past and not stored. A row whose register number does not
        contain the filter text is skipped. Existing students are never
        deleted, and a blank batch or programme never clears one on record.
      </p>

      <form onSubmit={handlePreview}>
        <textarea
          className="setup-bulk"
          rows={12}
          value={text}
          aria-label="Rows to import"
          placeholder={'7376232BT102\tABINAYA S\t2023-2027\tB.Tech\tBiotechnology\tIII\tabinaya@example.edu'}
          onChange={(e) => {
            setText(e.target.value)
            clearResult()
          }}
        />
        <div className="users-panel__grid">
          <label className="users-field">
            <span className="users-field__label">Register number must contain</span>
            <input
              className="users-input"
              value={filter}
              maxLength={20}
              onChange={(e) => {
                setFilter(e.target.value)
                clearResult()
              }}
            />
          </label>
        </div>
        {local && (
          <p className="users-note">
            Read {local.rows.length} row{local.rows.length === 1 ? '' : 's'} (
            {local.separator === 'tab' ? 'tab' : 'comma'}-separated), {local.skipped.length} skipped,
            filter “{local.filter}”.
          </p>
        )}
        {tooBig && (
          <p className="placeholder" role="alert">
            This paste is close to the server's 100 KB request limit and may be refused. Split it into two.
          </p>
        )}
        <div className="users-actions">
          <button type="submit" className="btn btn--primary" disabled={previewState.saving || text.trim() === ''}>
            {previewState.saving ? 'Checking…' : 'Preview'}
          </button>
        </div>
      </form>
      <SaveFeedback state={previewState} />

      {notice && <p className="placeholder" role="status">{notice}</p>}

      {applied && (
        <p className="users-note" role="status">
          Done: {applied.added} added, {applied.updated} updated.
        </p>
      )}

      {preview && (
        <>
          {preview.nameConflicts.length > 0 && (
            <div className="placeholder" role="alert">
              <strong>
                {preview.nameConflicts.length} register number
                {preview.nameConflicts.length === 1 ? ' is' : 's are'} already on file under a DIFFERENT NAME.
              </strong>{' '}
              Each is either a typo or two different people. Check every one below
              before applying — applying renames the student on every course.
            </div>
          )}

          <ImportGroup title="Name differs — check these" count={preview.nameConflicts.length} tone="unmatched">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Register number</th>
                    <th className="risk-table__name">Name on file</th>
                    <th className="risk-table__name">Name in paste</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.nameConflicts.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{r.regNumber}</td>
                      <td className="risk-table__name">{r.oldName}</td>
                      <td className="risk-table__name">{r.newName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup title="Will add" count={totals.add} tone="added">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Register number</th>
                    <th className="risk-table__name">Name</th>
                    <th>Batch</th>
                    <th>Programme</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.add.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{r.regNumber}</td>
                      <td className="risk-table__name">{r.name}</td>
                      <td>{r.batch ?? absent()}</td>
                      <td>{r.programme ?? absent()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup title="Will update" count={totals.update} tone="added">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Register number</th>
                    <th>Field</th>
                    <th>Old value</th>
                    <th>New value</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.update.flatMap((r) =>
                    r.changes.map((c) => (
                      <tr key={`${r.line}-${c.field}`}>
                        <td>{r.line}</td>
                        <td>{r.regNumber}</td>
                        <td>{c.field}</td>
                        <td>{c.old ?? absent()}</td>
                        <td>{c.new}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup
            title="Already there"
            count={totals.alreadyThere}
            tone="unchanged"
            blurb={totals.alreadyThere > 0 ? 'On file with exactly these details. Nothing will be written for them.' : undefined}
          >
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Register number</th>
                    <th className="risk-table__name">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.alreadyThere.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{r.regNumber}</td>
                      <td className="risk-table__name">{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup title="Skipped" count={totals.skipped} tone="unmatched">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Register number</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.skipped.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{r.regNumber || absent()}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          <ImportGroup
            title="Programme values found"
            count={preview.programmes.length}
            tone="unchanged"
            blurb="Each distinct programme after normalising to Title Case, with the spellings that became it."
          >
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Stored as</th>
                    <th className="risk-table__value">Rows</th>
                    <th>Spellings in the paste</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.programmes.map((p) => (
                    <tr key={p.value}>
                      <td>{p.value}</td>
                      <td className="risk-table__value">{p.count}</td>
                      <td>{p.spellings.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ImportGroup>

          {needsConfirm && (
            <label className="users-field">
              <span className="users-field__label">
                <input
                  type="checkbox"
                  checked={confirmNames}
                  onChange={(e) => setConfirmNames(e.target.checked)}
                />{' '}
                I have checked the {totals.nameConflicts} name change{totals.nameConflicts === 1 ? '' : 's'} above
              </span>
            </label>
          )}

          <div className="users-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={applyState.saving || nothingToDo || (needsConfirm && !confirmNames)}
              onClick={handleApply}
            >
              {applyState.saving
                ? 'Applying…'
                : nothingToDo
                  ? 'Nothing to apply'
                  : `Apply: add ${totals.add}, update ${totals.update}`}
            </button>
          </div>
          <SaveFeedback state={applyState} />
        </>
      )}
    </section>
  )
}

// END REMOVABLE -- Student Directory
