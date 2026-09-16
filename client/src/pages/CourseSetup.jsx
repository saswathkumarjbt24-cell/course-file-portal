// ---------------------------------------------------------------
// BEGIN REMOVABLE -- admin Course Setup screen
//
// The three things a course needs before a faculty member can enter one mark,
// in the order they have to happen: students, then assessments, then the CO
// allocations of each assessment. Until this screen existed all three lived
// only inside hand-written migrations, so 22BT009 worked and every other
// course was an empty shell a faculty member could open and do nothing with.
//
// ADMIN ONLY, AND GUARDED TWICE.
//   The sidebar link in Layout.jsx renders only for an admin, and this file
//   refuses to render for anybody else -- so typing the URL gets a refusal,
//   not the screen. Neither guard ENFORCES anything: the API answers 403 to a
//   faculty or hod token regardless of what the browser drew.
//
// IT CARRIES ITS OWN COURSE PICKER rather than being opened from a row of the
// Courses screen, because the Courses screen is not modified by this feature.
//
// FOLLOWS Users.jsx AND Courses.jsx DELIBERATELY.
//   Same loader shape, same risk-table classes, same users-panel form blocks,
//   same useSave. No new table style.
//
// WHAT IT DOES NOT DO.
//   It does not enter marks -- that is Mark Entry, which already exists and is
//   unchanged. It does not write CO statements -- that is Course Setup on the
//   course itself, also unchanged.
//
// Delete this file, CourseSetup.css, the route in App.jsx, the sidebar entry
// in Layout.jsx, the ten functions in data/api.js and the two fallbacks in
// data/mockData.js to remove the feature.
// ---------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import {
  createSetupAssessment,
  createSetupStudent,
  deleteSetupAssessment,
  deleteSetupStudent,
  fetchAdminCourses,
  fetchSetupAssessments,
  fetchSetupStudents,
  importSetupStudents,
  saveSetupAllocations,
  updateSetupAssessment,
  updateSetupStudent,
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
// The table style and the field styles, both already existing. Not redefined.
import './RiskReport.css'
import './Users.css'
import './CourseSetup.css'
// BEGIN REMOVABLE -- the empty-field mark
import { ABSENT } from '../components/emptyField'
// END REMOVABLE -- the empty-field mark

// Module level, not rebuilt per render: it is useApiData's effect dependency.
const LOADERS = { courses: fetchAdminCourses }

const ASSESSMENT_KINDS = ['PT1', 'PT2', 'IP1', 'IP2', 'OT', 'SEE']
const EMPTY_STUDENT = { regNumber: '', name: '' }
const EMPTY_ASSESSMENT = { kind: 'PT1', maxTotal: '', splitMode: 'manual', conductedOn: '' }

/** A value the database has not recorded. A blank cell reads as a fault. */
function absent(text = ABSENT) {
  return <span className="risk-table__muted">{text}</span>
}

/** '' out of a text input means "not recorded", which the column holds NULL. */
function textToSend(value) {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export default function CourseSetup() {
  const { faculty } = useSession()

  // ROUTE GUARD. The sidebar hides the link, but a URL can still be typed.
  if (!faculty || faculty.role !== 'admin') {
    return (
      <>
        <header className="page-header">
          <h1 className="page-header__title">Course Setup</h1>
        </header>
        <div className="placeholder" role="alert">
          Setting a course up needs the admin role.
          {faculty?.role ? ` Your account is '${faculty.role}'.` : ''} Ask an
          administrator to add the students, the assessments and their CO
          allocations.
        </div>
      </>
    )
  }

  return <CourseSetupLoader />
}

function CourseSetupLoader() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="table" />
  if (error) return <DataError error={error} />
  return <CourseSetupView courses={data.courses} />
}

function CourseSetupView({ courses }) {
  const [courseId, setCourseId] = useState(courses.length > 0 ? courses[0].id : null)
  const course = useMemo(
    () => courses.find((c) => c.id === Number(courseId)) ?? null,
    [courses, courseId]
  )

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Course Setup</h1>
        <p className="page-header__subtitle">
          Students, assessments and CO allocations. A course needs all three
          before a mark can be entered against it.
        </p>
      </header>

      <div className="users-toolbar">
        <div className="users-field">
          <label className="users-field__label" htmlFor="setup-course">
            Course
          </label>
          <select
            id="setup-course"
            className="users-select"
            value={courseId ?? ''}
            onChange={(event) => setCourseId(Number(event.target.value))}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {course === null ? (
        <EmptyState title="No courses yet">
          Create a course on the Courses screen first; this screen fills it in.
        </EmptyState>
      ) : (
        <CourseSetupPanels key={course.id} course={course} />
      )}
    </>
  )
}

/**
 * Everything below the picker, remounted per course by the `key` above so no
 * draft, error or expanded row survives a change of course.
 */
function CourseSetupPanels({ course }) {
  const [students, setStudents] = useState(null)
  const [assessments, setAssessments] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let live = true
    setLoadError(null)
    Promise.all([fetchSetupStudents(course.id), fetchSetupAssessments(course.id)])
      .then(([roll, sheet]) => {
        if (!live) return
        setStudents(roll)
        setAssessments(sheet)
      })
      .catch((err) => {
        if (live) setLoadError(err)
      })
    return () => {
      live = false
    }
  }, [course.id, reloadCount])

  const reload = () => setReloadCount((n) => n + 1)

  if (loadError) return <DataError error={loadError} />
  if (students === null || assessments === null) return <DataLoading variant="table" />

  return (
    <>
      <SetupProgress course={course} students={students} assessments={assessments} />
      <StudentsPanel course={course} students={students} reload={reload} />
      <AssessmentsPanel course={course} sheet={assessments} reload={reload} />
    </>
  )
}

// ---------------------------------------------------------------
// The sequence, said plainly.
//
// An admin opening a course they did not set up cannot tell from the tables
// alone what is left to do, because "no assessments yet" and "assessments with
// no allocations" look equally empty until you open one. This says it.
// ---------------------------------------------------------------
function SetupProgress({ course, students, assessments }) {
  const list = assessments.assessments
  const withoutAllocations = list.filter((a) => !a.allocationsComplete)
  const steps = [
    {
      label: '1. Students enrolled',
      done: students.length > 0,
      detail:
        students.length > 0
          ? `${students.length} enrolled`
          : 'Nobody is on the roll, so there is nobody to mark.',
    },
    {
      label: '2. Assessments created',
      done: list.length > 0,
      detail:
        list.length > 0
          ? `${list.length} created: ${list.map((a) => a.kind).join(', ')}`
          : 'No PT1, PT2, IP or SEE exists yet.',
    },
    {
      label: '3. CO allocations complete',
      done: list.length > 0 && withoutAllocations.length === 0,
      detail:
        list.length === 0
          ? 'Nothing to allocate until an assessment exists.'
          : withoutAllocations.length === 0
            ? 'Every assessment adds up to its maximum.'
            : `Outstanding: ${withoutAllocations.map((a) => a.kind).join(', ')}`,
    },
  ]
  const ready = steps.every((s) => s.done)

  return (
    <section className="users-panel">
      <h2 className="users-panel__title">
        Setup sequence — {course.code}
      </h2>
      <ol className="setup-steps">
        {steps.map((step) => (
          <li key={step.label} className={step.done ? 'setup-step setup-step--done' : 'setup-step'}>
            <span className="setup-step__mark" aria-hidden="true">
              {step.done ? '✓' : '·'}
            </span>
            <span className="setup-step__label">{step.label}</span>
            <span className="setup-step__detail">{step.detail}</span>
          </li>
        ))}
      </ol>
      <p className="users-note">
        {ready
          ? 'This course is ready: a faculty member can now enter marks against it.'
          : 'Mark entry refuses a student who is not enrolled and a CO with no allocation, so every step above has to be done before a mark will save.'}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------
// 1. Students
// ---------------------------------------------------------------
function StudentsPanel({ course, students, reload }) {
  const [draft, setDraft] = useState(EMPTY_STUDENT)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(EMPTY_STUDENT)
  const [bulkText, setBulkText] = useState('')
  const [bulkLines, setBulkLines] = useState(null)
  const [note, setNote] = useState(null)

  const [addSave, runAdd] = useSave()
  const [editSave, runEdit] = useSave()
  const [removeSave, runRemove] = useSave()
  const [bulkSave, runBulk] = useSave()

  // What the paste box will do, worked out in the browser before anything is
  // sent, so an admin sees the plan and not just the outcome.
  const bulkPreview = useMemo(() => {
    const known = new Map(students.map((s) => [s.regNumber, s.name]))
    return bulkText
      .split(/\r?\n/)
      .map((raw, index) => ({ line: index + 1, text: raw.trim() }))
      .filter((row) => row.text !== '')
      .map((row) => {
        const parts = row.text.split(/\s*[,\t]\s*|\s{2,}/)
        const regNumber = (parts[0] || '').trim()
        const name = parts.slice(1).join(' ').trim()
        let plan = 'create'
        let message = name === '' ? 'no name given — only works if this student already exists' : `create and enrol ${name}`
        if (known.has(regNumber)) {
          plan = 'already-enrolled'
          message = `already on this course as ${known.get(regNumber)}`
        } else if (name === '') {
          plan = 'unknown'
        }
        return { ...row, regNumber, plan, message }
      })
  }, [bulkText, students])

  function handleAdd(event) {
    event.preventDefault()
    setNote(null)
    runAdd(
      () => createSetupStudent(course.id, {
        regNumber: draft.regNumber.trim(),
        name: textToSend(draft.name),
      }),
      (result) => {
        setDraft(EMPTY_STUDENT)
        if (result && result.outcome === 'already-enrolled') {
          setNote(`${result.regNumber} was already on this course. Nothing was written.`)
        } else if (result && result.outcome === 'enrolled-existing') {
          setNote(
            `${result.regNumber} already existed as ${result.nameOnFile} and was enrolled. ` +
              'The name on file was kept: it is the same student on every other course.'
          )
        }
        reload()
      }
    )
  }

  function handleEdit(event) {
    event.preventDefault()
    setNote(null)
    runEdit(
      () => updateSetupStudent(editingId, {
        regNumber: editDraft.regNumber.trim(),
        name: editDraft.name.trim(),
      }),
      (result) => {
        setEditingId(null)
        if (result && result.coursesAffected > 1) {
          setNote(`Corrected on all ${result.coursesAffected} courses this student is enrolled on.`)
        }
        reload()
      }
    )
  }

  function handleRemove(student) {
    setNote(null)
    runRemove(() => deleteSetupStudent(course.id, student.id), reload)
  }

  function handleBulk(event) {
    event.preventDefault()
    setNote(null)
    setBulkLines(null)
    runBulk(
      () => importSetupStudents(course.id, bulkText),
      (result) => {
        setBulkLines(result.lines ?? [])
        setBulkText('')
        reload()
      }
    )
  }

  return (
    <section className="users-panel">
      <h2 className="users-panel__title">Students — {students.length} enrolled</h2>
      <p className="users-note">
        A registration number already in the database is enrolled, not
        duplicated, and keeps the name it has: students are institution-wide,
        so renaming one here would rename them on every other course file.
      </p>

      <form className="users-panel__grid" onSubmit={handleAdd}>
        <div className="users-field">
          <label className="users-field__label" htmlFor="setup-reg">Roll number</label>
          <input
            id="setup-reg"
            className="users-input"
            value={draft.regNumber}
            maxLength={20}
            onChange={(e) => setDraft({ ...draft, regNumber: e.target.value })}
          />
        </div>
        <div className="users-field">
          <label className="users-field__label" htmlFor="setup-name">Name</label>
          <input
            id="setup-name"
            className="users-input"
            value={draft.name}
            maxLength={120}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="users-actions">
          <button type="submit" className="btn btn--primary" disabled={addSave.saving || draft.regNumber.trim() === ''}>
            {addSave.saving ? 'Adding…' : 'Add student'}
          </button>
        </div>
      </form>
      <SaveFeedback state={addSave} />
      {note && <p className="users-note" role="status">{note}</p>}

      {students.length === 0 ? (
        <EmptyState title="Nobody is enrolled yet">
          Add one above, or paste a whole roll below.
        </EmptyState>
      ) : (
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Roll number</th>
                <th className="risk-table__name">Name</th>
                <th>Semester</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const isEditing = editingId === student.id
                return (
                  <tr key={student.id}>
                    <td>
                      {isEditing ? (
                        <input
                          className="users-table-input"
                          value={editDraft.regNumber}
                          maxLength={20}
                          onChange={(e) => setEditDraft({ ...editDraft, regNumber: e.target.value })}
                        />
                      ) : (
                        student.regNumber
                      )}
                    </td>
                    <td className="risk-table__name">
                      {isEditing ? (
                        <input
                          className="users-table-input"
                          value={editDraft.name}
                          maxLength={120}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        />
                      ) : (
                        student.name
                      )}
                    </td>
                    <td>{student.currentSem ?? absent()}</td>
                    <td className="setup-row-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="btn btn--primary" disabled={editSave.saving} onClick={handleEdit}>
                            {editSave.saving ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" className="btn btn--quiet" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={() => {
                              setEditingId(student.id)
                              setEditDraft({ regNumber: student.regNumber, name: student.name })
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger"
                            disabled={removeSave.saving}
                            onClick={() => handleRemove(student)}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <SaveFeedback state={editSave} />
      <SaveFeedback state={removeSave} />

      <h3 className="users-panel__title">Paste a roll</h3>
      <p className="users-note">
        One student per line, <code>roll number, name</code>. A bad line means
        nothing at all is imported — a half-applied roll cannot be told apart
        from a complete one by looking at it.
      </p>
      <form onSubmit={handleBulk}>
        <textarea
          className="setup-bulk"
          rows={5}
          value={bulkText}
          placeholder={'7376232BT102, ABINAYA S\n7376232BT103, AFRITH K'}
          onChange={(e) => {
            setBulkText(e.target.value)
            setBulkLines(null)
          }}
        />
        <div className="users-actions">
          <button type="submit" className="btn btn--primary" disabled={bulkSave.saving || bulkText.trim() === ''}>
            {bulkSave.saving ? 'Importing…' : `Import ${bulkPreview.length} line${bulkPreview.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
      <SaveFeedback state={bulkSave} />

      {bulkPreview.length > 0 && bulkLines === null && (
        <BulkTable title="What this will do" rows={bulkPreview} field="message" />
      )}
      {bulkLines !== null && bulkLines.length > 0 && (
        <BulkTable
          title="What was done"
          rows={bulkLines.map((row) => ({
            line: row.line,
            regNumber: row.regNumber,
            plan: row.outcome,
            message: row.message ?? outcomeWords(row),
          }))}
          field="message"
        />
      )}
    </section>
  )
}

function outcomeWords(row) {
  if (row.outcome === 'created') return 'created and enrolled'
  if (row.outcome === 'enrolled-existing') return `already existed as ${row.nameOnFile}, enrolled`
  if (row.outcome === 'already-enrolled') return 'already on this course, nothing written'
  return row.outcome
}

function BulkTable({ title, rows, field }) {
  return (
    <>
      <h4 className="users-panel__title">{title}</h4>
      <div className="risk-table-wrap">
        <table className="risk-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Roll number</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.line}>
                <td>{row.line}</td>
                <td>{row.regNumber === '' ? absent() : row.regNumber}</td>
                <td className={row.plan === 'failed' || row.plan === 'unknown' ? 'setup-bad' : undefined}>
                  {row[field]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------------------------------------------------------------
// 2. Assessments, and 3. their CO allocations
// ---------------------------------------------------------------
function AssessmentsPanel({ course, sheet, reload }) {
  const [draft, setDraft] = useState(EMPTY_ASSESSMENT)
  const [addSave, runAdd] = useSave()
  const [rowSave, runRow] = useSave()
  const [openId, setOpenId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(EMPTY_ASSESSMENT)
  const [editSave, runEdit] = useSave()

  // conductedOn is always editable. maxTotal and splitMode are refused by
  // the server once marks exist, so the row disables those two inputs and
  // sends the date on its own rather than sending a request that is going
  // to be refused.
  function handleEdit(event) {
    event.preventDefault()
    runEdit(
      () => updateSetupAssessment(editingId, {
        maxTotal: Number(editDraft.maxTotal),
        splitMode: editDraft.splitMode,
        conductedOn: textToSend(editDraft.conductedOn),
      }),
      () => {
        setEditingId(null)
        reload()
      }
    )
  }

  function handleEditDateOnly(event) {
    event.preventDefault()
    runEdit(
      () => updateSetupAssessment(editingId, { conductedOn: textToSend(editDraft.conductedOn) }),
      () => {
        setEditingId(null)
        reload()
      }
    )
  }

  const taken = new Set(sheet.assessments.map((a) => a.kind))
  const free = ASSESSMENT_KINDS.filter((k) => !taken.has(k))

  function handleAdd(event) {
    event.preventDefault()
    runAdd(
      () => createSetupAssessment(course.id, {
        kind: draft.kind,
        maxTotal: Number(draft.maxTotal),
        splitMode: draft.splitMode,
        conductedOn: textToSend(draft.conductedOn),
      }),
      () => {
        setDraft({ ...EMPTY_ASSESSMENT, kind: free.find((k) => k !== draft.kind) ?? 'PT1' })
        reload()
      }
    )
  }

  return (
    <section className="users-panel">
      <h2 className="users-panel__title">Assessments — {sheet.assessments.length} created</h2>
      <p className="users-note">
        <strong>Marks entered per CO</strong> means a faculty member types one
        mark for each CO. <strong>Total, split by lookup</strong> means they
        type a single total and the split table breaks it down — which needs a
        split pattern whose total matches this maximum.
      </p>

      {free.length === 0 ? (
        <p className="users-note">All six kinds exist on this course.</p>
      ) : (
        <>
          <form className="users-panel__grid" onSubmit={handleAdd}>
            <div className="users-field">
              <label className="users-field__label" htmlFor="setup-kind">Kind</label>
              <select
                id="setup-kind"
                className="users-select"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                {free.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="users-field">
              <label className="users-field__label" htmlFor="setup-max">Maximum marks</label>
              <input
                id="setup-max"
                className="users-input"
                inputMode="decimal"
                value={draft.maxTotal}
                onChange={(e) => setDraft({ ...draft, maxTotal: e.target.value })}
              />
            </div>
            <div className="users-field">
              <label className="users-field__label" htmlFor="setup-split">Marks entered as</label>
              <select
                id="setup-split"
                className="users-select"
                value={draft.splitMode}
                onChange={(e) => setDraft({ ...draft, splitMode: e.target.value })}
              >
                <option value="manual">One mark per CO</option>
                <option value="lookup">A total, split by lookup</option>
              </select>
            </div>
            <div className="users-field">
              <label className="users-field__label" htmlFor="setup-date">Conducted on</label>
              <input
                id="setup-date"
                className="users-input"
                type="date"
                value={draft.conductedOn}
                onChange={(e) => setDraft({ ...draft, conductedOn: e.target.value })}
              />
            </div>
            <div className="users-actions">
              <button type="submit" className="btn btn--primary" disabled={addSave.saving || draft.maxTotal.trim() === ''}>
                {addSave.saving ? 'Adding…' : 'Add assessment'}
              </button>
            </div>
          </form>
          <SaveFeedback state={addSave} />
        </>
      )}

      {sheet.assessments.length === 0 ? (
        <EmptyState title="No assessments yet">
          A course with no assessment has nothing to mark. Add PT1 to begin.
        </EmptyState>
      ) : (
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Maximum</th>
                <th>Marks entered as</th>
                <th>Conducted on</th>
                <th>CO allocations</th>
                <th>Marks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sheet.assessments.map((a) => (
                <tr key={a.id}>
                  <td>{a.kind}</td>
                  <td className="risk-table__value">
                    {editingId === a.id ? (
                      <input
                        className="users-table-input"
                        inputMode="decimal"
                        disabled={a.marks.attempts > 0}
                        aria-label={`Maximum marks for ${a.kind}`}
                        value={editDraft.maxTotal}
                        onChange={(e) => setEditDraft({ ...editDraft, maxTotal: e.target.value })}
                      />
                    ) : (
                      a.maxTotal
                    )}
                  </td>
                  <td>
                    {editingId === a.id ? (
                      <select
                        className="users-table-input"
                        disabled={a.marks.attempts > 0}
                        aria-label={`How marks are entered for ${a.kind}`}
                        value={editDraft.splitMode}
                        onChange={(e) => setEditDraft({ ...editDraft, splitMode: e.target.value })}
                      >
                        <option value="manual">One mark per CO</option>
                        <option value="lookup">A total, split by lookup</option>
                      </select>
                    ) : a.splitMode === 'lookup' ? (
                      'A total, split by lookup'
                    ) : (
                      'One mark per CO'
                    )}
                  </td>
                  <td>
                    {editingId === a.id ? (
                      <input
                        className="users-table-input"
                        type="date"
                        aria-label={`Date ${a.kind} was conducted`}
                        value={editDraft.conductedOn}
                        onChange={(e) => setEditDraft({ ...editDraft, conductedOn: e.target.value })}
                      />
                    ) : a.conductedOn ? (
                      String(a.conductedOn).slice(0, 10)
                    ) : (
                      absent()
                    )}
                  </td>
                  <td className={a.allocationsComplete ? undefined : 'setup-bad'}>
                    {a.allocations.length === 0
                      ? ABSENT
                      : `${a.allocatedTotal} of ${a.maxTotal} across ${a.allocations.length} CO${a.allocations.length === 1 ? '' : 's'}`}
                  </td>
                  <td className="risk-table__value">{a.marks.attempts}</td>
                  <td className="setup-row-actions">
                    {editingId === a.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={editSave.saving}
                          onClick={a.marks.attempts > 0 ? handleEditDateOnly : handleEdit}
                        >
                          {editSave.saving
                            ? 'Saving\u2026'
                            : a.marks.attempts > 0
                              ? 'Save date'
                              : 'Save'}
                        </button>
                        <button type="button" className="btn btn--quiet" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn--secondary"
                          onClick={() => setOpenId(openId === a.id ? null : a.id)}
                        >
                          {openId === a.id ? 'Close' : 'CO allocations'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--secondary"
                          onClick={() => {
                            setEditingId(a.id)
                            setEditDraft({
                              kind: a.kind,
                              maxTotal: String(a.maxTotal),
                              splitMode: a.splitMode,
                              conductedOn: a.conductedOn ? String(a.conductedOn).slice(0, 10) : '',
                            })
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger"
                          disabled={rowSave.saving}
                          onClick={() => runRow(() => deleteSetupAssessment(a.id), reload)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SaveFeedback state={rowSave} />
      <SaveFeedback state={editSave} />

      {sheet.assessments
        .filter((a) => a.id === openId)
        .map((a) => (
          <AllocationEditor key={a.id} assessment={a} coCount={sheet.coCount} reload={reload} />
        ))}
    </section>
  )
}

// ---------------------------------------------------------------
// 3. CO allocations, one row per CO, with a running total.
//
// The running total is shown against the maximum at all times rather than
// only on save, because "the parts do not add up to the total" is the whole
// defect this screen is here to stop reaching a printed course file.
// ---------------------------------------------------------------
function AllocationEditor({ assessment, coCount, reload }) {
  const cos = useMemo(() => Array.from({ length: coCount }, (_, i) => i + 1), [coCount])
  const [rows, setRows] = useState(() => {
    const byCo = new Map(assessment.allocations.map((a) => [a.coNumber, a.marksAllocated]))
    return cos.map((co) => ({ coNumber: co, marks: byCo.has(co) ? String(byCo.get(co)) : '' }))
  })
  const [save, run] = useSave()

  const locked = assessment.marks.attempts > 0
  const total = rows.reduce((sum, r) => {
    const n = Number(r.marks)
    return sum + (r.marks.trim() === '' || Number.isNaN(n) ? 0 : n)
  }, 0)
  const rounded = Math.round(total * 100) / 100
  const balanced = rounded === assessment.maxTotal

  function handleSave(event) {
    event.preventDefault()
    const body = rows
      .filter((r) => r.marks.trim() !== '')
      .map((r) => ({ coNumber: r.coNumber, marksAllocated: Number(r.marks) }))
    run(() => saveSetupAllocations(assessment.id, body), reload)
  }

  return (
    <div className="setup-alloc">
      <h3 className="users-panel__title">
        CO allocations — {assessment.kind}, out of {assessment.maxTotal}
      </h3>

      {locked ? (
        <p className="users-note setup-bad" role="alert">
          {assessment.marks.attempts} mark row
          {assessment.marks.attempts === 1 ? '' : 's'} already exist against{' '}
          {assessment.kind}. These allocations are the denominator of every
          attainment figure for it, so changing them now would move every
          percentage, level and remedial list already published — with no record
          that anything happened. The server refuses the save; delete the marks
          first if the allocation really was wrong.
        </p>
      ) : (
        <p className="users-note">
          Leave a CO blank if this assessment does not cover it. The total has
          to equal the assessment maximum before it will save.
        </p>
      )}

      <form onSubmit={handleSave}>
        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Course Outcome</th>
                <th>Marks allocated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.coNumber}>
                  <td>CO{row.coNumber}</td>
                  <td>
                    <input
                      className="users-table-input"
                      inputMode="decimal"
                      disabled={locked}
                      value={row.marks}
                      aria-label={`Marks allocated to CO${row.coNumber}`}
                      onChange={(e) => {
                        const next = rows.slice()
                        next[index] = { ...row, marks: e.target.value }
                        setRows(next)
                      }}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">Total</th>
                <td className={balanced ? 'setup-good' : 'setup-bad'}>
                  {rounded} of {assessment.maxTotal}
                  {balanced ? ' ✓' : ` — ${(Math.round((assessment.maxTotal - rounded) * 100) / 100)} left to allocate`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="users-actions">
          <button type="submit" className="btn btn--primary" disabled={locked || save.saving || !balanced}>
            {save.saving ? 'Saving…' : 'Save allocations'}
          </button>
        </div>
      </form>
      <SaveFeedback state={save} />
    </div>
  )
}
// END REMOVABLE -- admin Course Setup screen
