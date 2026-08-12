import { useMemo, useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchCoAllocations,
  fetchCoSplitValues,
  fetchCourses,
  fetchRemedialSchedule,
  fetchStudentAssessments,
  fetchStudentCoMarks,
  fetchStudents,
  isApiMode,
  saveRemedial,
} from '../data/api'
import { coMarksToShow } from '../data/coMarks'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import { splitIndex } from '../utils/coSplit'
import { coPercent, needsRemedial } from '../utils/attainment'
import './Remedial.css'

const TABS = [
  { key: 'names', label: 'Name list' },
  { key: 'circular', label: 'Circular' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'report', label: 'Assessment report' },
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
  const [savedTab, setSavedTab] = useState('')
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

  const scheduleClasses = schedule ? schedule.classes : []

  function attendanceValue(row, coNumber) {
    const key = cellKey(assessmentId, row.student.id, coNumber)
    if (attendanceEdits[key] !== undefined) return attendanceEdits[key]
    // Default: PR for the COs this student actually fell below target in.
    return row.cos[coNumber] && row.cos[coNumber].remedial ? 'PR' : '--'
  }

  function afterMarkValue(row, coNumber) {
    return afterMarks[cellKey(assessmentId, row.student.id, coNumber)] ?? ''
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

  // The plan's venue and classes go with EVERY save. The endpoint upserts the
  // schedule row, so omitting the venue would overwrite it with null, and the
  // register cannot be stored until its classes exist.
  function planFields() {
    return {
      venue: schedule ? schedule.venue : null,
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
      () => setSavedTab('attendance'),
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

          {attendedRows.length === 0 ? (
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
                                <td>{schedule.venue}</td>
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

                  <div className="rem-actions">{printButton}</div>
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
                    {schedule ? ` Venue: ${schedule.venue}.` : ''}
                  </p>

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
                    <button
                      type="button"
                      className="rem-button"
                      disabled={attendanceSave.saving}
                      onClick={handleSaveAttendance}
                    >
                      {attendanceSave.saving ? 'Saving...' : 'Save attendance'}
                    </button>
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
                    <button
                      type="button"
                      className="rem-button"
                      disabled={invalidCount > 0 || reportSave.saving}
                      onClick={handleSaveReport}
                    >
                      {reportSave.saving ? 'Saving...' : 'Save report'}
                    </button>
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
          )}
        </>
      )}
    </>
  )
}
