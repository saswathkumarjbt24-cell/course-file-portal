import { useMemo, useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchCoAllocations,
  fetchCoSplitValues,
  fetchCourseMeta,
  fetchCourses,
  fetchRemedialPapers,
  fetchRemedialSchedule,
  fetchStudentAssessments,
  fetchStudentCoMarks,
  fetchStudents,
  isApiMode,
  saveRemedial,
  saveRemedialPaper,
} from '../data/api'
import { coMarksToShow } from '../data/coMarks'
// BEGIN REMOVABLE -- stored remedial register
import { afterMarkCellValue, attendanceCellValue } from '../data/remedialCells'
// END REMOVABLE -- stored remedial register
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import { splitIndex } from '../utils/coSplit'
import { coPercent, needsRemedial } from '../utils/attainment'
import './Remedial.css'
// BEGIN REMOVABLE -- edit permission scope
import { useSession } from '../context/sessionStore'
import { canEditCourseFile, READ_ONLY_NOTE } from '../components/permissions'
// END REMOVABLE -- edit permission scope

const TABS = [
  { key: 'names', label: 'Name list' },
  { key: 'circular', label: 'Circular' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'report', label: 'Assessment report' },
  // BEGIN REMOVABLE -- remedial question paper
  { key: 'paper', label: 'Question paper' },
  // END REMOVABLE -- remedial question paper
]

const ATTENDANCE_OPTIONS = ['--', 'PR', 'AB']

const LOADERS = {
  assessments: fetchAssessments,
  coAllocations: fetchCoAllocations,
  coSplitValues: fetchCoSplitValues,
  courses: fetchCourses,
  remedialSchedule: fetchRemedialSchedule,
  students: fetchStudents,
  studentAssessments: fetchStudentAssessments,
  studentCoMarks: fetchStudentCoMarks,
  // BEGIN REMOVABLE -- remedial question paper
  courseMeta: fetchCourseMeta,
  remedialPapers: fetchRemedialPapers,
  // END REMOVABLE -- remedial question paper
}

// Institution heading for the printed circular. Placeholder text only -
// swap for the official letterhead wording when that is confirmed.
const INSTITUTION = 'BANNARI AMMAN INSTITUTE OF TECHNOLOGY'
const INSTITUTION_PLACE = 'Sathyamangalam'

function cellKey(assessmentId, studentId, coNumber) {
  return `${assessmentId}|${studentId}|${coNumber}`
}

function formatDate(iso) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}-${month}-${year}`
}

export default function Remedial() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <RemedialView {...data} />
}

function RemedialView({
  assessments,
  coAllocations,
  coSplitValues,
  courses,
  remedialSchedule,
  students,
  studentAssessments,
  studentCoMarks,
  // BEGIN REMOVABLE -- remedial question paper
  courseMeta,
  remedialPapers,
  // END REMOVABLE -- remedial question paper
}) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)
  const targetPercent = course ? course.coTargetPercent : 0

  // Remedial follows CO attainment, and the optional test has none.
  const courseAssessments = useMemo(
    () => assessments.filter((a) => a.courseId === courseId && a.kind !== 'OT'),
    [assessments, courseId],
  )

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
  const [activeTab, setActiveTab] = useState('names')
  // Only cells the user has actually changed are stored; everything else
  // falls back to the derived default.
  const [attendanceEdits, setAttendanceEdits] = useState({})
  const [afterMarks, setAfterMarks] = useState({})
  // BEGIN REMOVABLE -- stored remedial register
  // The classes whose register was saved in THIS session. The loaded bundle is
  // not re-fetched after a save, so without this a register the user just
  // marked would still be reported as unmarked.
  const [savedRegisterCos, setSavedRegisterCos] = useState([])
  // END REMOVABLE -- stored remedial register
  // BEGIN REMOVABLE -- circular editor
  // The plan as last SAVED by this session, and the draft being edited.
  // Both carry the kind they belong to, so switching assessment drops them
  // without an effect that could fire in the wrong order.
  const [planOverride, setPlanOverride] = useState(null)
  const [circularDraft, setCircularDraft] = useState(null)
  const [circularSave, runCircularSave] = useSave()
  // END REMOVABLE -- circular editor
  const [savedTab, setSavedTab] = useState('')
  // BEGIN REMOVABLE -- edit permission scope
  const { faculty } = useSession()
  const canEdit = canEditCourseFile(faculty)
  // END REMOVABLE -- edit permission scope
  const [attendanceSave, runAttendanceSave] = useSave()
  const [reportSave, runReportSave] = useSave()

  // MOCK mode keeps the original wording so the public demo is unchanged.
  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving writes to the database.'
    : 'Nothing is sent to a server yet.'

  useEffect(() => {
    setAssessmentId(defaultAssessmentId)
  }, [defaultAssessmentId])

  useEffect(() => {
    if (!savedTab) return undefined
    const timer = setTimeout(() => setSavedTab(''), 4000)
    return () => clearTimeout(timer)
  }, [savedTab])

  const assessment = courseAssessments.find((a) => a.id === assessmentId) ?? null
  const kind = assessment ? assessment.kind : ''

  const allocation = useMemo(
    () =>
      coAllocations
        .filter((a) => a.assessmentId === assessmentId)
        .sort((a, b) => a.coNumber - b.coNumber),
    [coAllocations, assessmentId],
  )

  // Built once per data load so mapping every student does not rebuild it.
  const splits = useMemo(() => splitIndex(coSplitValues), [coSplitValues])

  const schedule = useMemo(
    () => remedialSchedule.find((r) => r.courseId === courseId && r.assessmentKind === kind) ?? null,
    [remedialSchedule, courseId, kind],
  )

  // Same derivation as the Attainment screen: total -> split -> CO marks.
  // Absent students (and students with no mark) are excluded outright.
  const attendedRows = useMemo(() => {
    const derived = []
    for (const student of students) {
      const record = studentAssessments.find(
        (sa) => sa.assessmentId === assessmentId && sa.studentId === student.id,
      )
      if (!record || record.isAbsent || record.totalObtained === null) continue
      derived.push({
        student,
        totalObtained: record.totalObtained,
        // Prefer what the API stored; fall back to deriving from the split
        // table. Behaviour still branches on splitMode.
        coMarks: coMarksToShow({
          assessment,
          studentId: student.id,
          totalObtained: record.totalObtained,
          studentCoMarks,
          splits,
        }),
      })
    }
    return derived
  }, [assessment, assessmentId, students, studentAssessments, studentCoMarks, splits])

  // Per-CO remedial flags for every attended student.
  const evaluated = useMemo(() => {
    return attendedRows.map((row) => {
      const cos = {}
      for (const alloc of allocation) {
        const obtained = row.coMarks ? row.coMarks[alloc.coNumber] : null
        const percent = coPercent(obtained, alloc.marksAllocated)
        cos[alloc.coNumber] = {
          obtained,
          percent,
          marksAllocated: alloc.marksAllocated,
          remedial: needsRemedial(percent, targetPercent),
        }
      }
      return {
        ...row,
        cos,
        anyRemedial: allocation.some((alloc) => cos[alloc.coNumber].remedial),
      }
    })
  }, [attendedRows, allocation, targetPercent])

  const remedialStudents = useMemo(() => evaluated.filter((e) => e.anyRemedial), [evaluated])

  // BEGIN REMOVABLE -- circular editor
  // What the plan IS right now: what the server sent, or what this session
  // last saved over it. Every read of the venue and the classes goes through
  // this, so a saved circular is on screen without a page reload.
  const plan = planOverride && planOverride.kind === kind ? planOverride : schedule
  // END REMOVABLE -- circular editor

  const scheduleClasses = plan ? plan.classes : []

  // BEGIN REMOVABLE -- stored remedial register
  //
  // THE HAND-MARKED REGISTER IS AUTHORITATIVE.
  //   The derived value -- PR for a CO the student fell below target in -- is
  //   the STARTING STATE of a class nobody has marked yet, and nothing more.
  //   Once a row exists for a (student, class) pair it wins, here and in the
  //   printed course file.
  //
  //   That distinction is the whole point: a stored NA displays as "--" and
  //   must NEVER be replaced by a derived PR. Reading a recorded "not
  //   required" back as "present" would put a student in a register they were
  //   never in.
  const storedAttendance = useMemo(() => {
    const map = new Map()
    for (const cls of plan ? plan.classes : []) {
      for (const entry of cls.attendance ?? []) {
        map.set(`${entry.studentId}|${cls.coNumber}`, entry.status)
      }
    }
    return map
  }, [plan])

  // Keyed the same way. A stored mark of 0 is a real mark and must render as
  // "0"; only null means "no mark recorded" and renders as an empty box.
  const storedResults = useMemo(() => {
    const map = new Map()
    for (const entry of (plan && plan.results) ?? []) {
      map.set(`${entry.studentId}|${entry.coNumber}`, entry.afterRemedialMark)
    }
    return map
  }, [plan])

  // Which classes have a register at all. Stored rows, plus any class saved in
  // this session, because the loaded data is not re-fetched after a save.
  const markedCos = useMemo(() => {
    const marked = new Set()
    for (const cls of scheduleClasses) {
      if ((cls.attendance ?? []).length > 0) marked.add(cls.coNumber)
    }
    for (const co of savedRegisterCos) marked.add(co)
    return marked
    // scheduleClasses is derived from schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, savedRegisterCos])
  // END REMOVABLE -- stored remedial register

  function attendanceValue(row, coNumber) {
    const key = cellKey(assessmentId, row.student.id, coNumber)
    // Default: PR for the COs this student actually fell below target in --
    // used only where no row has been marked. See ../data/remedialCells.
    return attendanceCellValue({
      edit: attendanceEdits[key],
      stored: storedAttendance.get(`${row.student.id}|${coNumber}`),
      derived: Boolean(row.cos[coNumber] && row.cos[coNumber].remedial),
    })
  }

  function afterMarkValue(row, coNumber) {
    const key = cellKey(assessmentId, row.student.id, coNumber)
    return afterMarkCellValue({
      edit: afterMarks[key],
      stored: storedResults.get(`${row.student.id}|${coNumber}`),
    })
  }

  function afterMarkError(row, coNumber) {
    const co = row.cos[coNumber]
    if (!co || !co.remedial) return null
    const raw = afterMarkValue(row, coNumber).trim()
    if (raw === '') return null
    if (!/^\d+$/.test(raw)) return 'whole number'
    if (Number(raw) > co.marksAllocated) return `max ${co.marksAllocated}`
    return null
  }

  const invalidCount = useMemo(() => {
    let count = 0
    for (const row of remedialStudents) {
      for (const alloc of allocation) {
        if (afterMarkError(row, alloc.coNumber)) count += 1
      }
    }
    return count
    // afterMarkError reads afterMarks/assessmentId from scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remedialStudents, allocation, afterMarks, assessmentId])

  // BEGIN REMOVABLE -- stored remedial register
  /** "Register: CO1, CO2 marked. CO3 not marked yet, showing defaults." */
  function registerStatusLine() {
    const marked = scheduleClasses.filter((c) => markedCos.has(c.coNumber))
    const unmarked = scheduleClasses.filter((c) => !markedCos.has(c.coNumber))
    const list = (rows) => rows.map((c) => `CO${c.coNumber}`).join(', ')
    if (unmarked.length === 0) return `Register marked for ${list(marked)}.`
    if (marked.length === 0) {
      return `No register saved yet for ${list(unmarked)} — showing the derived default, not a marked roll.`
    }
    return `Register marked for ${list(marked)}. Not marked yet for ${list(unmarked)} — those columns show the derived default.`
  }
  // END REMOVABLE -- stored remedial register

  // BEGIN REMOVABLE -- circular editor
  //
  // EVERY CO OF THE ASSESSMENT GETS A ROW, whether or not a class exists for
  // it, which is what makes a plan creatable rather than only editable.
  function startCircularEdit() {
    const byCo = new Map(scheduleClasses.map((c) => [c.coNumber, c]))
    setCircularDraft({
      venue: plan && plan.venue ? plan.venue : '',
      rows: allocation.map((alloc) => {
        const existing = byCo.get(alloc.coNumber)
        return {
          coNumber: alloc.coNumber,
          date: existing && existing.date ? existing.date : '',
          timing: existing && existing.timing ? existing.timing : '',
          exists: existing !== undefined,
        }
      }),
    })
  }

  function patchCircularRow(coNumber, field, value) {
    setCircularDraft((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.coNumber === coNumber ? { ...r, [field]: value } : r)),
    }))
  }

  function handleSaveCircular() {
    // A CO IS SENT ONLY IF IT ALREADY EXISTS OR HAS SOMETHING IN IT.
    //   The endpoint upserts, so sending an untouched CO would CREATE a class
    //   with no date and no timing -- and there is no way to delete one. An
    //   empty row is therefore left unsent rather than turned into a class
    //   nobody can take back.
    const rows = circularDraft.rows.filter(
      (r) => r.exists || r.date.trim() !== '' || r.timing.trim() !== '',
    )
    const classes = rows.map((r) => ({
      coNumber: r.coNumber,
      date: r.date.trim() === '' ? null : r.date,
      timing: r.timing.trim() === '' ? null : r.timing,
    }))
    const venue = circularDraft.venue.trim() === '' ? null : circularDraft.venue.trim()

    runCircularSave(
      () => saveRemedial(courseId, kind, { venue, classes }),
      () => {
        // The register of a class survives an edit to its date or timing, so
        // it is carried across rather than dropped by the overlay.
        const byCo = new Map(scheduleClasses.map((c) => [c.coNumber, c]))
        setPlanOverride({
          kind,
          courseId,
          assessmentKind: kind,
          venue,
          classes: classes.map((c) => ({
            ...c,
            attendance: (byCo.get(c.coNumber) || {}).attendance ?? [],
          })),
          results: (plan && plan.results) ?? [],
        })
        setCircularDraft(null)
        setSavedTab('circular')
      },
    )
  }
  // END REMOVABLE -- circular editor

  // The plan's venue and classes go with EVERY save. The endpoint upserts the
  // schedule row, so omitting the venue would overwrite it with null, and the
  // register cannot be stored until its classes exist.
  function planFields() {
    return {
      venue: plan ? plan.venue : null,
      classes: scheduleClasses.map((cls) => ({
        coNumber: cls.coNumber,
        date: cls.date,
        timing: cls.timing,
      })),
    }
  }

  function handleSaveAttendance() {
    // The register is flat on the wire: one row per (class, student).
    // The UI's blank option means "not recorded", which is NA in the
    // database and is deliberately distinct from AB.
    const attendance = []
    for (const row of remedialStudents) {
      for (const cls of scheduleClasses) {
        const value = attendanceValue(row, cls.coNumber)
        attendance.push({
          coNumber: cls.coNumber,
          studentId: row.student.id,
          status: value === ATTENDANCE_OPTIONS[0] ? 'NA' : value,
        })
      }
    }

    runAttendanceSave(
      () => saveRemedial(courseId, kind, { ...planFields(), attendance }),
      () => {
        setSavedTab('attendance')
        // BEGIN REMOVABLE -- stored remedial register
        // Every class in the plan now HAS a register, whatever was in it.
        setSavedRegisterCos(scheduleClasses.map((cls) => cls.coNumber))
        // END REMOVABLE -- stored remedial register
      },
    )
  }

  function handleSaveReport() {
    // One row per (student, CO) that actually needed remedial work.
    const results = []
    for (const row of remedialStudents) {
      for (const alloc of allocation) {
        if (!row.cos[alloc.coNumber].remedial) continue
        const raw = afterMarkValue(row, alloc.coNumber).trim()
        results.push({
          studentId: row.student.id,
          coNumber: alloc.coNumber,
          afterRemedialMark: raw === '' ? null : Number(raw),
        })
      }
    }

    runReportSave(
      () => saveRemedial(courseId, kind, { ...planFields(), results }),
      () => setSavedTab('report'),
    )
  }

  if (!course) {
    return (
      <>
        <Link to="/" className="back-link">
          &larr; Back to dashboard
        </Link>
        <header className="page-header">
          <h1 className="page-header__title">Remedial Classes</h1>
          <p className="page-header__subtitle">Unknown course (id {id})</p>
        </header>
        <div className="placeholder">No such course in the current data.</div>
      </>
    )
  }

  const printButton = (
    <button type="button" className="rem-button rem-button--ghost" onClick={() => window.print()}>
      Print
    </button>
  )

  return (
    <>
      <div className="rem-noprint">
        <Link to={`/course/${courseId}`} className="back-link">
          &larr; Back to course
        </Link>
        {' · '}
        <Link to={`/course/${courseId}/attainment`} className="back-link">
          CO attainment
        </Link>
      </div>

      <header className="page-header">
        <h1 className="page-header__title">Remedial Classes</h1>
        <p className="page-header__subtitle">
          {course.code} — {course.title}
        </p>
      </header>

      {!assessment ? (
        <div className="placeholder">No assessments are configured for this course yet.</div>
      ) : (
        <>
          <div className="rem-toolbar">
            <div className="rem-field">
              <label className="rem-field__label" htmlFor="remedial-assessment">
                Assessment
              </label>
              <select
                id="remedial-assessment"
                className="rem-field__select"
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

          <div className="rem-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'rem-tab rem-tab--active' : 'rem-tab'}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* BEGIN REMOVABLE -- remedial question paper.
              The paper belongs to a scheduled CLASS, not to a mark, so it is
              the one tab that still has something to show before any mark is
              entered. Tabs 1 to 4 are unchanged inside the branch below. */}
          {activeTab === 'paper' && (
            <QuestionPaperTab
              course={course}
              meta={courseMeta.find((m) => m.courseId === courseId) ?? null}
              kind={kind}
              courseId={courseId}
              papers={remedialPapers}
              canEdit={canEdit}
              printButton={printButton}
            />
          )}
          {/* END REMOVABLE -- remedial question paper */}

          {activeTab !== 'paper' && (attendedRows.length === 0 ? (
            <div className="rem-panel">
              <p className="rem-panel__title">No marks entered for {kind} yet.</p>
              <p>
                The remedial list is derived from the marks for this assessment. Enter them on the{' '}
                <Link to={`/course/${courseId}/marks`}>Mark Entry</Link> page and come back.
              </p>
            </div>
          ) : (
            <>
              {/* ---------------- Tab 1: name list ---------------- */}
              {activeTab === 'names' && (
                <section className="rem-panel">
                  <h2 className="rem-panel__title">
                    Remedial name list — {course.code} / {kind}
                  </h2>
                  <p className="rem-panel__note">
                    Students below the CO target of {targetPercent.toFixed(2)}% in at least one CO.
                    Absent students are not listed.
                  </p>

                  {remedialStudents.length === 0 ? (
                    <div className="rem-nil">
                      NIL
                      <span className="rem-nil__note">
                        All {attendedRows.length} attended students reached the target in every CO.
                      </span>
                    </div>
                  ) : (
                    <>
                      <p>
                        <strong>
                          {remedialStudents.length} of {attendedRows.length}
                        </strong>{' '}
                        attended students need remedial in at least one CO.
                      </p>

                      <div className="rem-table-wrap">
                        <table className="rem-table">
                          <thead>
                            <tr>
                              <th className="rem-table__num">S.No</th>
                              <th>Reg No</th>
                              <th>Name</th>
                              {allocation.map((alloc) => (
                                <th key={alloc.coNumber}>CO{alloc.coNumber}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {remedialStudents.map((row, index) => (
                              <tr key={row.student.id}>
                                <td className="rem-table__num">{index + 1}</td>
                                <td className="rem-table__reg">{row.student.regNumber}</td>
                                <td>{row.student.name}</td>
                                {allocation.map((alloc) => {
                                  const flag = row.cos[alloc.coNumber].remedial
                                  return (
                                    <td
                                      key={alloc.coNumber}
                                      className={
                                        flag
                                          ? 'rem-table__center rem-table__flag--yes'
                                          : 'rem-table__center rem-table__flag--no'
                                      }
                                    >
                                      {flag ? 'Yes' : 'No'}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  <div className="rem-actions">{printButton}</div>
                </section>
              )}

              {/* ---------------- Tab 2: circular ---------------- */}
              {activeTab === 'circular' && (
                <section className="rem-panel">
                  <article className="rem-doc">
                    <header className="rem-doc__head">
                      <h2 className="rem-doc__institution">{INSTITUTION}</h2>
                      <p className="rem-doc__dept">
                        {INSTITUTION_PLACE} — Department of {course.department}
                      </p>
                    </header>

                    <div className="rem-doc__ref">
                      <span>
                        Ref: REM/{course.code}/{kind}
                      </span>
                      <span>Date: {new Date().toLocaleDateString('en-GB')}</span>
                    </div>

                    <h3 className="rem-doc__subject">CIRCULAR — REMEDIAL CLASSES</h3>

                    <div className="rem-doc__body">
                      <p>
                        The students listed in the accompanying name list have not attained the
                        Course Outcome target of {targetPercent.toFixed(2)}% in {kind} of{' '}
                        {course.code} — {course.title}. Remedial classes are arranged for the
                        Course Outcomes concerned as detailed below. All the students named in the
                        list are instructed to attend the classes without fail.
                      </p>

                      {scheduleClasses.length === 0 ? (
                        <p>
                          <em>No remedial classes have been scheduled for {kind} yet.</em>
                        </p>
                      ) : (
                        <table className="rem-doc__table">
                          <thead>
                            <tr>
                              <th>S.No</th>
                              <th>Course Outcome</th>
                              <th>Date</th>
                              <th>Timing</th>
                              <th>Venue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scheduleClasses.map((cls, index) => (
                              <tr key={cls.coNumber}>
                                <td>{index + 1}</td>
                                <td>CO{cls.coNumber}</td>
                                <td>{formatDate(cls.date)}</td>
                                <td>{cls.timing}</td>
                                <td>{plan.venue}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      <p>
                        Faculty handling the course will maintain the attendance record and submit
                        the after-remedial assessment report on completion.
                      </p>
                    </div>

                    <div className="rem-sign">
                      <div className="rem-sign__block">
                        <div className="rem-sign__line">Course Faculty</div>
                      </div>
                      <div className="rem-sign__block">
                        <div className="rem-sign__line">HOD</div>
                        <span>Department of {course.department}</span>
                      </div>
                    </div>
                  </article>

                  {/* BEGIN REMOVABLE -- circular editor.
                      The document above is untouched and prints exactly as it
                      did. Everything below carries rem-noprint, which the
                      existing print block already hides, so no print rule was
                      added or changed. */}
                  {circularDraft && (
                    <div className="rem-noprint rem-cir-editor">
                      <label className="rem-cir-field">
                        <span>Venue</span>
                        <input
                          type="text"
                          autoComplete="off"
                          maxLength={150}
                          className="rem-cir-venue"
                          placeholder="Where the classes are held"
                          value={circularDraft.venue}
                          onChange={(event) =>
                            setCircularDraft((prev) => ({ ...prev, venue: event.target.value }))
                          }
                        />
                      </label>

                      {circularDraft.rows.map((row) => (
                        <div className="rem-cir-row" key={row.coNumber}>
                          <span className="rem-cir-co">CO{row.coNumber}</span>
                          <input
                            type="date"
                            className="rem-cir-date"
                            aria-label={`CO${row.coNumber} class date`}
                            value={row.date}
                            onChange={(event) =>
                              patchCircularRow(row.coNumber, 'date', event.target.value)
                            }
                          />
                          <input
                            type="text"
                            autoComplete="off"
                            maxLength={60}
                            className="rem-cir-timing"
                            placeholder="e.g. 4:30PM to 5:30PM"
                            aria-label={`CO${row.coNumber} class timing`}
                            value={row.timing}
                            onChange={(event) =>
                              patchCircularRow(row.coNumber, 'timing', event.target.value)
                            }
                          />
                          <span className="rem-status">
                            {row.exists ? 'scheduled' : 'not scheduled yet'}
                          </span>
                        </div>
                      ))}

                      <p className="rem-status">
                        A CO left blank is not scheduled. A class that has been saved cannot be
                        removed here — the API only ever adds or updates a class, because deleting
                        one would take its attendance register with it. Correct a mistake by
                        changing its date and timing.
                      </p>

                      <div className="rem-actions">
                        <button
                          type="button"
                          className="rem-button"
                          disabled={circularSave.saving}
                          onClick={handleSaveCircular}
                        >
                          {circularSave.saving ? 'Saving...' : 'Save circular'}
                        </button>
                        <button
                          type="button"
                          className="rem-button rem-button--ghost"
                          onClick={() => setCircularDraft(null)}
                        >
                          Cancel
                        </button>
                      </div>

                      {/* A rejected save wrote nothing; the draft stays. */}
                      <SaveFeedback state={circularSave} />
                    </div>
                  )}
                  {/* END REMOVABLE -- circular editor */}

                  <div className="rem-actions">
                    {/* BEGIN REMOVABLE -- circular editor */}
                    {canEdit ? (
                      !circularDraft && (
                        <button type="button" className="rem-button" onClick={startCircularEdit}>
                          {scheduleClasses.length === 0 ? 'Schedule classes' : 'Edit circular'}
                        </button>
                      )
                    ) : (
                      <span className="rem-status">{READ_ONLY_NOTE}</span>
                    )}
                    {/* END REMOVABLE -- circular editor */}
                    {printButton}
                    {/* BEGIN REMOVABLE -- circular editor */}
                    {savedTab === 'circular' && (
                      <span className="rem-status rem-status--saved">{savedLabel}</span>
                    )}
                    {/* END REMOVABLE -- circular editor */}
                  </div>
                </section>
              )}

              {/* ---------------- Tab 3: attendance ---------------- */}
              {activeTab === 'attendance' && (
                <section className="rem-panel">
                  <h2 className="rem-panel__title">
                    Remedial attendance — {course.code} / {kind}
                  </h2>
                  <p className="rem-panel__note">
                    PR present, AB absent, -- not required for that CO.
                    {plan ? ` Venue: ${plan.venue}.` : ''}
                  </p>
                  {/* BEGIN REMOVABLE -- stored remedial register.
                      Says which classes hold a real register and which are
                      still showing the derived starting state, so "everyone
                      was present" is distinguishable from "nobody has marked
                      this yet". */}
                  {scheduleClasses.length > 0 && (
                    <p className="rem-panel__note">{registerStatusLine()}</p>
                  )}
                  {/* END REMOVABLE -- stored remedial register */}

                  {remedialStudents.length === 0 ? (
                    <div className="rem-nil">
                      NIL
                      <span className="rem-nil__note">No remedial classes required.</span>
                    </div>
                  ) : scheduleClasses.length === 0 ? (
                    <p>
                      <em>No remedial classes have been scheduled for {kind} yet.</em>
                    </p>
                  ) : (
                    <>
                      <div className="rem-table-wrap">
                        <table className="rem-table">
                          <thead>
                            <tr>
                              <th className="rem-table__num">S.No</th>
                              <th>Reg No</th>
                              <th>Name</th>
                              {scheduleClasses.map((cls) => (
                                <th key={cls.coNumber}>
                                  CO{cls.coNumber}
                                  <br />
                                  {formatDate(cls.date)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {remedialStudents.map((row, index) => (
                              <tr key={row.student.id}>
                                <td className="rem-table__num">{index + 1}</td>
                                <td className="rem-table__reg">{row.student.regNumber}</td>
                                <td>{row.student.name}</td>
                                {scheduleClasses.map((cls) => {
                                  const key = cellKey(assessmentId, row.student.id, cls.coNumber)
                                  const value = attendanceValue(row, cls.coNumber)
                                  const modifier =
                                    value === 'PR'
                                      ? ' rem-select--pr'
                                      : value === 'AB'
                                        ? ' rem-select--ab'
                                        : ''
                                  return (
                                    <td key={cls.coNumber} className="rem-table__center">
                                      <select
                                        /* BEGIN REMOVABLE -- edit permission
                                           scope */
                                        disabled={!canEdit}
                                        /* END REMOVABLE */
                                        className={`rem-select${modifier}`}
                                        value={value}
                                        aria-label={`CO${cls.coNumber} attendance for ${row.student.name}`}
                                        onChange={(event) =>
                                          setAttendanceEdits((prev) => ({
                                            ...prev,
                                            [key]: event.target.value,
                                          }))
                                        }
                                      >
                                        {ATTENDANCE_OPTIONS.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="rem-sign">
                        <div className="rem-sign__block">
                          <div className="rem-sign__line">Course Faculty</div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="rem-actions">
                    {/* BEGIN REMOVABLE -- edit permission scope */}
                    {canEdit ? (
                      <button
                        type="button"
                        className="rem-button"
                        disabled={attendanceSave.saving}
                        onClick={handleSaveAttendance}
                      >
                        {attendanceSave.saving ? 'Saving...' : 'Save attendance'}
                      </button>
                    ) : (
                      <span className="rem-status">{READ_ONLY_NOTE}</span>
                    )}
                    {/* END REMOVABLE -- edit permission scope */}
                    {printButton}
                    {savedTab === 'attendance' ? (
                      <span className="rem-status rem-status--saved">{savedLabel}</span>
                    ) : (
                      <span className="rem-status">{idleLabel}</span>
                    )}
                  </div>

                  {/* A rejected save wrote nothing; the register stays as set. */}
                  <SaveFeedback state={attendanceSave} />
                </section>
              )}

              {/* ---------------- Tab 4: assessment report ---------------- */}
              {activeTab === 'report' && (
                <section className="rem-panel">
                  <h2 className="rem-panel__title">
                    After-remedial assessment report — {course.code} / {kind}
                  </h2>
                  <p className="rem-panel__note">
                    Enter the mark scored in the re-assessment for each CO the student needed
                    remedial in. COs already at target show --.
                  </p>

                  {remedialStudents.length === 0 ? (
                    <div className="rem-nil">
                      NIL
                      <span className="rem-nil__note">No re-assessment required.</span>
                    </div>
                  ) : (
                    <>
                      <div className="rem-table-wrap">
                        <table className="rem-table">
                          <thead>
                            <tr>
                              <th className="rem-table__num" rowSpan={2}>
                                S.No
                              </th>
                              <th rowSpan={2}>Reg No</th>
                              <th rowSpan={2}>Name</th>
                              {allocation.map((alloc) => (
                                <th key={alloc.coNumber} colSpan={2}>
                                  CO{alloc.coNumber} (max {alloc.marksAllocated})
                                </th>
                              ))}
                            </tr>
                            <tr>
                              {allocation.map((alloc) => [
                                <th key={`o-${alloc.coNumber}`}>Original</th>,
                                <th key={`a-${alloc.coNumber}`}>After remedial</th>,
                              ])}
                            </tr>
                          </thead>
                          <tbody>
                            {remedialStudents.map((row, index) => (
                              <tr key={row.student.id}>
                                <td className="rem-table__num">{index + 1}</td>
                                <td className="rem-table__reg">{row.student.regNumber}</td>
                                <td>{row.student.name}</td>
                                {allocation.map((alloc) => {
                                  const co = row.cos[alloc.coNumber]
                                  const key = cellKey(assessmentId, row.student.id, alloc.coNumber)
                                  if (!co.remedial) {
                                    return [
                                      <td
                                        key={`o-${alloc.coNumber}`}
                                        className="rem-table__center rem-table__muted"
                                      >
                                        --
                                      </td>,
                                      <td
                                        key={`a-${alloc.coNumber}`}
                                        className="rem-table__center rem-table__muted"
                                      >
                                        --
                                      </td>,
                                    ]
                                  }
                                  const error = afterMarkError(row, alloc.coNumber)
                                  return [
                                    <td key={`o-${alloc.coNumber}`} className="rem-table__center">
                                      {co.obtained} / {alloc.marksAllocated}
                                    </td>,
                                    <td key={`a-${alloc.coNumber}`} className="rem-table__center">
                                      <input
                                        /* BEGIN REMOVABLE -- edit permission
                                           scope */
                                        readOnly={!canEdit}
                                        /* END REMOVABLE */
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        className={error ? 'rem-input rem-input--invalid' : 'rem-input'}
                                        value={afterMarkValue(row, alloc.coNumber)}
                                        title={error || undefined}
                                        aria-invalid={error ? true : undefined}
                                        aria-label={`CO${alloc.coNumber} after remedial mark for ${row.student.name}`}
                                        onChange={(event) =>
                                          setAfterMarks((prev) => ({
                                            ...prev,
                                            [key]: event.target.value,
                                          }))
                                        }
                                      />
                                    </td>,
                                  ]
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="rem-sign">
                        <div className="rem-sign__block">
                          <div className="rem-sign__line">Course Faculty</div>
                        </div>
                        <div className="rem-sign__block">
                          <div className="rem-sign__line">HOD</div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="rem-actions">
                    {/* BEGIN REMOVABLE -- edit permission scope */}
                    {canEdit ? (
                      <button
                        type="button"
                        className="rem-button"
                        disabled={invalidCount > 0 || reportSave.saving}
                        onClick={handleSaveReport}
                      >
                        {reportSave.saving ? 'Saving...' : 'Save report'}
                      </button>
                    ) : (
                      <span className="rem-status">{READ_ONLY_NOTE}</span>
                    )}
                    {/* END REMOVABLE -- edit permission scope */}
                    {printButton}
                    {invalidCount > 0 ? (
                      <span className="rem-status rem-status--error">
                        {invalidCount} {invalidCount === 1 ? 'mark is' : 'marks are'} invalid.
                      </span>
                    ) : savedTab === 'report' ? (
                      <span className="rem-status rem-status--saved">{savedLabel}</span>
                    ) : (
                      <span className="rem-status">{idleLabel}</span>
                    )}
                  </div>

                  {/* A rejected save wrote nothing; the marks stay on screen. */}
                  <SaveFeedback state={reportSave} />
                </section>
              )}
            </>
          ))}
        </>
      )}
    </>
  )
}

// BEGIN REMOVABLE -- remedial question paper
// ---------------------------------------------------------------
// Tab 5: the remedial assessment question paper.
//
// ONE PAPER PER REMEDIAL CLASS, and the tab lists every class of the plan so
// a class without a paper is visible rather than absent.
//
// THE DOCUMENT AND THE EDITOR ARE TWO BLOCKS, DELIBERATELY.
//   The document reuses the circular tab's own classes -- rem-doc,
//   rem-doc__table, rem-sign -- so the printed sheet is styled by rules that
//   already existed and no @media print block had to be touched. The editor
//   sits underneath it carrying rem-noprint, which the existing print block
//   already hides, so every rule it needs is screen-only by construction.
//
//   While a paper is being edited the document renders the DRAFT, so the
//   sheet above the editor is what the save would produce.
//
// WHAT IS ENTERED AND WHAT IS NOT
//   Entered: the maximum, the duration, and each question's text, marks and
//   optional CO. Computed: Q.No, which is the row's position and is renumbered
//   from 1 on every save, so reordering cannot leave a gap or a duplicate; the
//   running total; and the CO shown against a question that carries none,
//   which is its class's CO exactly as the column means.
// ---------------------------------------------------------------

const PAPER_TITLES = {
  PT1: 'Periodical Test 1',
  PT2: 'Periodical Test 2',
  IP1: 'Innovative Practice 1',
  IP2: 'Innovative Practice 2',
  SEE: 'Semester End Examination',
}

function paperTitle(kind) {
  return `${PAPER_TITLES[kind] ?? kind}: Remedial Class - Assessment Question Paper`
}

function blankQuestion() {
  return { text: '', marks: '', co: '' }
}

/** A stored paper -> the editor's draft, all fields as strings. */
function toDraft(paper) {
  return {
    totalMarks: paper && paper.totalMarks !== null ? String(paper.totalMarks) : '',
    durationMinutes:
      paper && paper.durationMinutes !== null ? String(paper.durationMinutes) : '',
    questions:
      paper && paper.questions.length > 0
        ? paper.questions.map((q) => ({
            text: q.text,
            marks: String(q.marksAllotted),
            co: q.coNumber === null ? '' : String(q.coNumber),
          }))
        : [blankQuestion()],
  }
}

/** The draft rendered as a paper, so the document above the editor is live. */
function draftAsPaper(base, draft) {
  return {
    ...base,
    hasPaper: true,
    totalMarks: draft.totalMarks.trim() === '' ? null : Number(draft.totalMarks),
    durationMinutes:
      draft.durationMinutes.trim() === '' ? null : Number(draft.durationMinutes),
    questions: draft.questions.map((q, i) => ({
      qNo: i + 1,
      text: q.text,
      marksAllotted: q.marks.trim() === '' ? null : Number(q.marks),
      coNumber: q.co.trim() === '' ? null : Number(q.co),
    })),
  }
}

function marksSum(draft) {
  let sum = 0
  for (const q of draft.questions) {
    const n = Number(q.marks)
    if (q.marks.trim() !== '' && Number.isFinite(n)) sum += n
  }
  return Math.round(sum * 100) / 100
}

function QuestionPaperTab({ course, meta, kind, courseId, papers, canEdit, printButton }) {
  // What the server last confirmed, overlaid on what it first sent. A save
  // returns no document of its own, so the draft that was accepted IS the
  // saved state until the next full load.
  const [saved, setSaved] = useState({})
  const [editingCo, setEditingCo] = useState(null)
  const [draft, setDraft] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [savedCo, setSavedCo] = useState(null)
  const [paperSave, runPaperSave] = useSave()

  const forPlan = useMemo(
    () =>
      papers
        .filter((p) => p.courseId === courseId && p.assessmentKind === kind)
        .sort((a, b) => a.coNumber - b.coNumber),
    [papers, courseId, kind],
  )

  function current(paper) {
    return saved[`${kind}|${paper.coNumber}`] ?? paper
  }

  function startEdit(paper) {
    setEditingCo(paper.coNumber)
    setDraft(toDraft(current(paper)))
    setWarnings([])
    setSavedCo(null)
  }

  function cancelEdit() {
    setEditingCo(null)
    setDraft(null)
  }

  function patchQuestion(index, field, value) {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    }))
  }

  function addQuestion() {
    setDraft((prev) => ({ ...prev, questions: [...prev.questions, blankQuestion()] }))
  }

  function removeQuestion(index) {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }))
  }

  function moveQuestion(index, delta) {
    setDraft((prev) => {
      const next = [...prev.questions]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row)
      return { ...prev, questions: next }
    })
  }

  function handleSave(paper) {
    // Q.No is the row's position, renumbered from 1 on every save. An empty
    // trailing row the editor never filled in is dropped rather than sent as
    // a question with no text, which the server would refuse.
    const questions = draft.questions
      .filter((q) => q.text.trim() !== '' || q.marks.trim() !== '')
      .map((q, i) => ({
        qNo: i + 1,
        text: q.text.trim(),
        marksAllotted: q.marks.trim() === '' ? null : Number(q.marks),
        coNumber: q.co.trim() === '' ? null : Number(q.co),
      }))

    const body = {
      totalMarks: draft.totalMarks.trim() === '' ? null : Number(draft.totalMarks),
      durationMinutes:
        draft.durationMinutes.trim() === '' ? null : Number(draft.durationMinutes),
      questions,
    }

    runPaperSave(
      () => saveRemedialPaper(courseId, kind, paper.coNumber, body),
      (result) => {
        setSaved((prev) => ({
          ...prev,
          [`${kind}|${paper.coNumber}`]: draftAsPaper(paper, draft),
        }))
        setWarnings(Array.isArray(result?.warnings) ? result.warnings : [])
        setSavedCo(paper.coNumber)
        setEditingCo(null)
        setDraft(null)
      },
    )
  }

  if (forPlan.length === 0) {
    return (
      <section className="rem-panel">
        <h2 className="rem-panel__title">Remedial question paper - {course.code} / {kind}</h2>
        <p>
          <em>
            No remedial classes have been scheduled for {kind} yet, so there is no class for a
            question paper to belong to.
          </em>
        </p>
        <div className="rem-actions">{printButton}</div>
      </section>
    )
  }

  return (
    <section className="rem-panel">
      <h2 className="rem-panel__title">Remedial question paper - {course.code} / {kind}</h2>
      <p className="rem-panel__note">
        One paper per remedial class. Each class covers a single Course Outcome.
      </p>

      {forPlan.map((base) => {
        const stored = current(base)
        const editing = editingCo === base.coNumber
        const view = editing ? draftAsPaper(stored, draft) : stored
        const sum = editing ? marksSum(draft) : null
        const stated =
          editing && draft.totalMarks.trim() !== '' ? Number(draft.totalMarks) : null

        return (
          <div key={base.coNumber}>
            <h3 className="rem-panel__title">
              CO{base.coNumber} - class on {formatDate(base.classDate)}
            </h3>

            {!view.hasPaper ? (
              <>
                <p>
                  <em>
                    No question paper has been prepared for the CO{base.coNumber} remedial class
                    yet.
                  </em>
                </p>
                <div className="rem-actions rem-noprint">
                  {canEdit ? (
                    <button
                      type="button"
                      className="rem-button"
                      onClick={() => startEdit(base)}
                    >
                      Create question paper
                    </button>
                  ) : (
                    <span className="rem-status">{READ_ONLY_NOTE}</span>
                  )}
                </div>
              </>
            ) : (
              <article className="rem-doc">
                <header className="rem-doc__head">
                  <h2 className="rem-doc__institution">{paperTitle(kind)}</h2>
                </header>

                <table className="rem-doc__table">
                  <tbody>
                    <tr>
                      <th>Academic Year</th>
                      <td>{meta?.academicYear ?? 'Not recorded'}</td>
                    </tr>
                    <tr>
                      <th>Year &amp; Semester</th>
                      <td>
                        {meta?.yearOfStudy ?? 'Not recorded'} / {meta?.semester ?? 'Not recorded'}
                      </td>
                    </tr>
                    <tr>
                      <th>Course Code &amp; Title</th>
                      <td>
                        {course.code} - {course.title}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="rem-doc__ref">
                  <span>
                    Maximum Marks: {view.totalMarks === null ? 'Not stated' : view.totalMarks}
                  </span>
                  <span>
                    Time Duration:{' '}
                    {view.durationMinutes === null
                      ? 'Not stated'
                      : `${view.durationMinutes} Minutes`}
                  </span>
                </div>

                {view.questions.length === 0 ? (
                  <p>
                    <em>This paper has no questions yet.</em>
                  </p>
                ) : (
                  <table className="rem-doc__table">
                    <thead>
                      <tr>
                        <th>Q. No.</th>
                        <th>Questions</th>
                        <th>Marks Allotted</th>
                        <th>CO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.questions.map((q) => (
                        <tr key={q.qNo}>
                          <td className="rem-table__center">{q.qNo}</td>
                          <td>{q.text}</td>
                          <td className="rem-table__center">
                            {q.marksAllotted === null ? '—' : q.marksAllotted}
                          </td>
                          <td className="rem-table__center">
                            CO{q.coNumber === null ? base.coNumber : q.coNumber}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* An empty first block puts the signature on the right, which
                    is where the department's sheet carries it. rem-sign is
                    already space-between, so this needs no rule of its own and
                    prints exactly as it draws. */}
                <div className="rem-sign">
                  <div className="rem-sign__block" aria-hidden="true" />
                  <div className="rem-sign__block">
                    <div className="rem-sign__line">Signature of Faculty</div>
                  </div>
                </div>
              </article>
            )}

            {editing && (
              <div className="rem-noprint rem-qp-editor">
                <div className="rem-qp-header">
                  <label className="rem-qp-field">
                    <span>Maximum marks</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="rem-input"
                      value={draft.totalMarks}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, totalMarks: e.target.value }))
                      }
                    />
                  </label>
                  <label className="rem-qp-field">
                    <span>Duration (minutes)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="rem-input"
                      value={draft.durationMinutes}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, durationMinutes: e.target.value }))
                      }
                    />
                  </label>
                </div>

                {draft.questions.map((q, index) => (
                  <div className="rem-qp-row" key={index}>
                    <span className="rem-qp-no">Q{index + 1}</span>
                    <input
                      type="text"
                      autoComplete="off"
                      className="rem-qp-text"
                      placeholder="Question"
                      aria-label={`Question ${index + 1} text`}
                      value={q.text}
                      onChange={(e) => patchQuestion(index, 'text', e.target.value)}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="rem-input"
                      placeholder="Marks"
                      aria-label={`Question ${index + 1} marks`}
                      value={q.marks}
                      onChange={(e) => patchQuestion(index, 'marks', e.target.value)}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="rem-input"
                      placeholder={`CO${base.coNumber}`}
                      aria-label={`Question ${index + 1} CO`}
                      value={q.co}
                      onChange={(e) => patchQuestion(index, 'co', e.target.value)}
                    />
                    <button
                      type="button"
                      className="rem-button rem-button--ghost"
                      aria-label={`Move question ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveQuestion(index, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="rem-button rem-button--ghost"
                      aria-label={`Move question ${index + 1} down`}
                      disabled={index === draft.questions.length - 1}
                      onClick={() => moveQuestion(index, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="rem-button rem-button--ghost"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() => removeQuestion(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <div className="rem-actions">
                  <button type="button" className="rem-button rem-button--ghost" onClick={addQuestion}>
                    Add question
                  </button>
                  <span
                    className={
                      stated !== null && stated !== sum
                        ? 'rem-status rem-status--error'
                        : 'rem-status'
                    }
                  >
                    Questions total {sum}
                    {stated === null ? ' (no maximum stated)' : ` of a stated maximum of ${stated}`}
                  </span>
                </div>

                <div className="rem-actions">
                  <button
                    type="button"
                    className="rem-button"
                    disabled={paperSave.saving}
                    onClick={() => handleSave(base)}
                  >
                    {paperSave.saving ? 'Saving...' : 'Save question paper'}
                  </button>
                  <button type="button" className="rem-button rem-button--ghost" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>

                {/* A rejected save wrote nothing; the draft stays on screen. */}
                <SaveFeedback state={paperSave} />
              </div>
            )}

            {!editing && view.hasPaper && (
              <div className="rem-actions rem-noprint">
                {canEdit ? (
                  <button type="button" className="rem-button" onClick={() => startEdit(base)}>
                    Edit question paper
                  </button>
                ) : (
                  <span className="rem-status">{READ_ONLY_NOTE}</span>
                )}
                {savedCo === base.coNumber && (
                  <span className="rem-status rem-status--saved">
                    {isApiMode() ? 'Saved' : 'Saved (mock)'}
                  </span>
                )}
              </div>
            )}

            {savedCo === base.coNumber &&
              warnings.map((w, i) => (
                <p className="rem-status rem-status--error rem-noprint" key={i}>
                  {w.message}
                </p>
              ))}

            {!editing && view.hasPaper && view.totalMarks !== null && base.allocatedMarks !== null &&
              view.totalMarks !== base.allocatedMarks && (
                <p className="rem-status rem-noprint">
                  Note: this paper states {view.totalMarks} marks, while CO{base.coNumber} is
                  allocated {base.allocatedMarks} marks in {kind}.
                </p>
              )}
          </div>
        )
      })}

      <div className="rem-actions">{printButton}</div>
    </section>
  )
}
// END REMOVABLE -- remedial question paper
