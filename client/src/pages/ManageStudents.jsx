// ---------------------------------------------------------------
// BEGIN REMOVABLE -- faculty roll management (panel)
//
// "Manage students" on the Student Name List: fill this course's roll three
// ways -- pick from the directory, paste rows, upload a .csv/.xlsx -- and
// remove one student at a time.
//
// WHO SEES IT. Anyone who can open the course page: faculty allocated in
// either role, the department hod, admin. The server's requireCourseAccess
// is what enforces that; this panel draws nothing the API would refuse.
//
// SCREEN ONLY. NameList mounts it inside a .doc-noprint wrapper, outside the
// printed <article>, so the printed sheet's markup is untouched.
//
// NO NEW STYLES. The controls and tables are the Students directory's own
// (.users-*, .risk-table), the paste box is Course Setup's .setup-bulk, and
// the preview groups are the Allocations import's .alloc-import__*.
//
// Delete this file and its mount in NameList.jsx (plus courseStudentFile.js,
// the api.js block and the server half) to remove the feature.
// ---------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import {
  addCourseStudents,
  applyCourseStudentImport,
  fetchAvailableStudents,
  previewCourseStudentImport,
  removeCourseStudent,
} from '../data/api'
import { EmptyState, SaveFeedback } from '../data/useApiData'
import { useSave } from '../data/useSave'
import { parseCourseStudentText, readCourseStudentFile } from '../data/courseStudentFile'
import { ABSENT } from '../components/emptyField'
import './RiskReport.css'
import './Users.css'
import './CourseSetup.css'
import './Allocations.css'

const TABS = [
  { id: 'pick', label: 'Pick from directory' },
  { id: 'paste', label: 'Paste' },
  { id: 'upload', label: 'Upload file' },
]
const ALL = ''

function absent(text = ABSENT) {
  return <span className="risk-table__muted">{text}</span>
}

/** "2023 - 2027" and "2023-2027" are the same batch. */
function batchKey(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase()
}

export default function ManageStudents({ courseId, roll, onChanged }) {
  const [tab, setTab] = useState('pick')

  return (
    <section className="users-panel" aria-label="Manage students">
      <h2 className="users-panel__title">Manage students</h2>
      <p className="users-note">
        Add students to this course from the student directory, by pasting
        rows, or by uploading the template (.csv or .xlsx) with the headers
        “Register Number” and “Name”. Removing takes a student off this course
        only, and is refused while they have marks, attendance or remedial
        records here.
      </p>

      <EnrolledTable courseId={courseId} roll={roll} onChanged={onChanged} />

      <div className="users-actions" role="tablist" aria-label="Ways to add students">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'btn btn--primary' : 'btn btn--secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pick' && <PickTab courseId={courseId} onChanged={onChanged} />}
      {tab === 'paste' && <ImportTab courseId={courseId} onChanged={onChanged} mode="paste" />}
      {tab === 'upload' && <ImportTab courseId={courseId} onChanged={onChanged} mode="upload" />}
    </section>
  )
}

// ---------------------------------------------------------------
// The enrolled roll, each row with Remove
// ---------------------------------------------------------------
function EnrolledTable({ courseId, roll, onChanged }) {
  const [busyId, setBusyId] = useState(null)
  const [refusals, setRefusals] = useState({})
  const [removeState, runRemove] = useSave()

  function handleRemove(student) {
    setBusyId(student.id)
    setRefusals((prev) => ({ ...prev, [student.id]: undefined }))
    runRemove(
      async () => {
        try {
          return await removeCourseStudent(courseId, student.id)
        } catch (err) {
          // The server's own sentence: it names what exists. Shown on the row.
          setRefusals((prev) => ({ ...prev, [student.id]: err.message }))
          throw err
        }
      },
      () => onChanged(),
    )
  }

  if (roll.length === 0) {
    return <p className="users-note">Nobody is on this course yet.</p>
  }

  return (
    <div className="risk-table-wrap">
      <table className="risk-table">
        <thead>
          <tr>
            <th>Register number</th>
            <th className="risk-table__name">Name</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {roll.map((s) => (
            <tr key={s.id}>
              <td>{s.regNumber}</td>
              <td className="risk-table__name">
                {s.name}
                {refusals[s.id] && (
                  <span className="users-note" role="alert">{refusals[s.id]}</span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={removeState.saving && busyId === s.id}
                  onClick={() => handleRemove(s)}
                >
                  {removeState.saving && busyId === s.id ? 'Removing…' : 'Remove'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {removeState.error && !Object.values(refusals).some(Boolean) && <SaveFeedback state={removeState} />}
    </div>
  )
}

// ---------------------------------------------------------------
// Pick from directory
// ---------------------------------------------------------------
function PickTab({ courseId, onChanged }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [query, setQuery] = useState('')
  const [batch, setBatch] = useState(ALL)
  const [programme, setProgramme] = useState(ALL)
  const [batchNote, setBatchNote] = useState(null)
  const [picked, setPicked] = useState(() => new Set())
  const [done, setDone] = useState(null)
  const [addState, runAdd] = useSave()

  async function load(first) {
    try {
      const result = await fetchAvailableStudents(courseId)
      setData(result)
      setLoadError(null)
      if (first) {
        // Default the batch filter to the course's own batch, matched with
        // spaces ignored ("2023 - 2027" on the course, "2023-2027" on a
        // student). If no student carries it, show everyone and say so.
        const own = result.course?.batch
        if (own) {
          const match = (result.batches ?? []).find((b) => batchKey(b) === batchKey(own))
          if (match) setBatch(match)
          else setBatchNote(`No student in the directory has this course's batch (${own}), so every batch is shown.`)
        }
      }
    } catch (err) {
      setLoadError(err.message)
    }
  }

  useEffect(() => {
    load(true)
    // Loaded once per course; the panel is keyed by course id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    return data.students.filter((s) => {
      if (needle && !s.regNumber.toLowerCase().includes(needle) && !s.name.toLowerCase().includes(needle)) return false
      if (batch !== ALL && s.batch !== batch) return false
      if (programme !== ALL && s.programme !== programme) return false
      return true
    })
  }, [data, query, batch, programme])

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allShownPicked = visible.length > 0 && visible.every((s) => picked.has(s.id))
  function toggleAllShown() {
    setPicked((prev) => {
      const next = new Set(prev)
      for (const s of visible) {
        if (allShownPicked) next.delete(s.id)
        else next.add(s.id)
      }
      return next
    })
  }

  function handleAdd() {
    setDone(null)
    runAdd(
      () => addCourseStudents(courseId, [...picked]),
      async (result) => {
        if (result && !result.mock) setDone(result)
        setPicked(new Set())
        await onChanged()
        await load(false)
      },
    )
  }

  if (loadError) return <p className="placeholder" role="alert">Could not load the directory: {loadError}</p>
  if (!data) return <p className="users-note">Loading the directory…</p>

  return (
    <div>
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
            {data.batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="users-field">
          <span className="users-field__label">Programme</span>
          <select className="users-select" value={programme} onChange={(e) => setProgramme(e.target.value)}>
            <option value={ALL}>All programmes</option>
            {data.programmes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      {batchNote && <p className="users-note">{batchNote}</p>}

      <div className="users-toolbar">
        <span className="users-toolbar__count">
          {visible.length} shown · {picked.size} ticked
        </span>
        <button
          type="button"
          className="btn btn--primary"
          disabled={addState.saving || picked.size === 0}
          onClick={handleAdd}
        >
          {addState.saving ? 'Adding…' : `Add ${picked.size} to this course`}
        </button>
      </div>
      <SaveFeedback state={addState} />
      {done && (
        <p className="users-note" role="status">
          Added {done.added}.{done.alreadyEnrolled > 0 ? ` ${done.alreadyEnrolled} were already on the course.` : ''}
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState title="No student matches.">
          Everyone matching these filters is already on the course, or the
          filters are too narrow. Clear them to see the whole directory.
        </EmptyState>
      ) : (
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Tick every student shown"
                    checked={allShownPicked}
                    onChange={toggleAllShown}
                  />
                </th>
                <th>Register number</th>
                <th className="risk-table__name">Name</th>
                <th>Batch</th>
                <th>Programme</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Tick ${s.regNumber}`}
                      checked={picked.has(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                  </td>
                  <td>{s.regNumber}</td>
                  <td className="risk-table__name">{s.name}</td>
                  <td>{s.batch ?? absent()}</td>
                  <td>{s.programme ?? absent()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Paste and Upload -- both read rows, then preview, then apply
// ---------------------------------------------------------------
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

function ImportTab({ courseId, onChanged, mode }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState(null)
  // What was read from the paste or file. Apply sends exactly these rows.
  const [read, setRead] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [confirmNames, setConfirmNames] = useState(false)
  const [notice, setNotice] = useState(null)
  const [applied, setApplied] = useState(null)
  const [previewState, runPreview] = useSave()
  const [applyState, runApply] = useSave()

  function reset() {
    setRead(null)
    setPreview(null)
    setConfirmCreate(false)
    setConfirmNames(false)
    setNotice(null)
    setApplied(null)
  }

  function sendPreview(parsed) {
    setRead(parsed)
    if (parsed.error || parsed.rows.length === 0) return
    runPreview(
      () => previewCourseStudentImport(courseId, parsed.rows),
      (result) => {
        if (!result || result.mock) return
        setPreview(result)
        setConfirmCreate(false)
        setConfirmNames(false)
      },
    )
  }

  function handlePaste(event) {
    event.preventDefault()
    reset()
    sendPreview(parseCourseStudentText(text))
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    reset()
    setFileName(file.name)
    sendPreview(await readCourseStudentFile(file))
  }

  function handleApply() {
    if (!preview || !read) return
    setNotice(null)
    runApply(
      async () => {
        try {
          return await applyCourseStudentImport(courseId, read.rows, preview.token, confirmCreate, confirmNames)
        } catch (err) {
          // 409: the roll or the directory moved since the preview -- also a
          // second click of Apply. NOTHING WAS WRITTEN. Show the fresh one.
          if (err.status === 409) {
            setNotice('The roll changed since this preview, so nothing was written. Below is what this would do now.')
            sendPreview(read)
          }
          throw err
        }
      },
      async (result) => {
        if (!result || result.mock) return
        setApplied(result)
        setPreview(null)
        setConfirmCreate(false)
        setConfirmNames(false)
        await onChanged()
      },
    )
  }

  const totals = preview?.totals
  const skipped = useMemo(() => {
    const local = read?.skipped ?? []
    const server = preview?.skipped ?? []
    return [...local, ...server].sort((a, b) => a.line - b.line)
  }, [read, preview])
  const toWrite = totals ? totals.enrol + totals.create + totals.nameDiffers : 0
  const blocked = totals && ((totals.create > 0 && !confirmCreate) || (totals.nameDiffers > 0 && !confirmNames))

  return (
    <div>
      {mode === 'paste' ? (
        <form onSubmit={handlePaste}>
          <p className="users-note">
            Paste from the template, header row included: “Register Number”
            and “Name”. Other columns are ignored.
          </p>
          <textarea
            className="setup-bulk"
            rows={8}
            value={text}
            aria-label="Rows to add"
            placeholder={'Register Number\tName\n7376232BT102\tABINAYA S'}
            onChange={(e) => {
              setText(e.target.value)
              reset()
            }}
          />
          <div className="users-actions">
            <button type="submit" className="btn btn--primary" disabled={previewState.saving || text.trim() === ''}>
              {previewState.saving ? 'Checking…' : 'Preview'}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p className="users-note">
            Upload the template as .csv or .xlsx (first sheet only). The first
            row must hold “Register Number” and “Name”; other columns are ignored.
          </p>
          <label className="users-field">
            <span className="users-field__label">File</span>
            <input type="file" accept=".csv,.xlsx" onChange={handleFile} disabled={previewState.saving} />
          </label>
          {fileName && <p className="users-note">Read: {fileName}</p>}
        </div>
      )}

      {read?.error && <p className="placeholder" role="alert">{read.error}</p>}
      {read && !read.error && read.rows.length === 0 && (
        <p className="placeholder" role="alert">No student rows were found under the header.</p>
      )}
      <SaveFeedback state={previewState} />
      {notice && <p className="placeholder" role="status">{notice}</p>}
      {applied && (
        <p className="users-note" role="status">
          Done: {applied.enrolled} enrolled, {applied.created} created as new students.
        </p>
      )}

      {preview && (
        <>
          {/* WILL CREATE first, on its own and loud: these are the typos. */}
          {totals.create > 0 && (
            <div className="placeholder" role="alert">
              <strong>
                {totals.create} register number{totals.create === 1 ? ' is' : 's are'} NOT in the
                student directory.
              </strong>{' '}
              Applying creates {totals.create === 1 ? 'it' : 'them'} as new
              student{totals.create === 1 ? '' : 's'}. A mistyped register number
              ends up here — check every one.
            </div>
          )}
          <ImportGroup title="Will create — new students" count={totals.create} tone="unmatched">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Register number</th>
                    <th className="risk-table__name">Name</th>
                    <th>Batch (from the course)</th>
                    <th>Programme (from the course)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.create.map((r) => (
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
            <label className="users-field">
              <span className="users-field__label">
                <input
                  type="checkbox"
                  checked={confirmCreate}
                  onChange={(e) => setConfirmCreate(e.target.checked)}
                />{' '}
                Create these as new students
              </span>
            </label>
          </ImportGroup>

          <ImportGroup
            title="Name differs"
            count={totals.nameDiffers}
            tone="unmatched"
            blurb={totals.nameDiffers > 0
              ? 'On file under a different name. Applying enrols the student on file and keeps their name. A wrong register number would enrol somebody else.'
              : undefined}
          >
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Register number</th>
                    <th className="risk-table__name">Name on file</th>
                    <th className="risk-table__name">Name in your file</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.nameDiffers.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{r.regNumber}</td>
                      <td className="risk-table__name">{r.nameOnFile}</td>
                      <td className="risk-table__name">{r.nameInFile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="users-field">
              <span className="users-field__label">
                <input
                  type="checkbox"
                  checked={confirmNames}
                  onChange={(e) => setConfirmNames(e.target.checked)}
                />{' '}
                These are the right students — enrol them as on file
              </span>
            </label>
          </ImportGroup>

          <ImportGroup title="Will enrol" count={totals.enrol} tone="added">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Register number</th>
                    <th className="risk-table__name">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.enrol.map((r) => (
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

          <ImportGroup title="Already here" count={totals.alreadyHere} tone="unchanged">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Register number</th>
                    <th className="risk-table__name">Name on file</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.alreadyHere.map((r) => (
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

          <ImportGroup title="Skipped" count={skipped.length} tone="unmatched">
            <div className="risk-table-wrap">
              <table className="risk-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Register number</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {skipped.map((r) => (
                    <tr key={`${r.line}-${r.reason}`}>
                      <td>{r.line}</td>
                      <td>{r.regNumber || absent()}</td>
                      <td>{r.reason}</td>
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
              disabled={applyState.saving || toWrite === 0 || blocked}
              onClick={handleApply}
            >
              {applyState.saving
                ? 'Applying…'
                : toWrite === 0
                  ? 'Nothing to apply'
                  : `Apply: enrol ${toWrite}${totals.create > 0 ? `, creating ${totals.create}` : ''}`}
            </button>
          </div>
          <SaveFeedback state={applyState} />
        </>
      )}
    </div>
  )
}

// END REMOVABLE -- faculty roll management (panel)
