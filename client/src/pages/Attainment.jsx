import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchAttainmentBands,
  fetchCoAllocations,
  fetchCoSplitValues,
  fetchCourses,
  fetchStudentAssessments,
  fetchStudentCoMarks,
  fetchStudents,
} from '../data/api'
import { coMarksToShow } from '../data/coMarks'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import { splitIndex } from '../utils/coSplit'
import {
  attainmentLevel,
  coPercent,
  isAchieved,
  needsRemedial,
  percentAchieved,
} from '../utils/attainment'
import './Attainment.css'

const LOADERS = {
  assessments: fetchAssessments,
  attainmentBands: fetchAttainmentBands,
  coAllocations: fetchCoAllocations,
  coSplitValues: fetchCoSplitValues,
  courses: fetchCourses,
  students: fetchStudents,
  studentAssessments: fetchStudentAssessments,
  studentCoMarks: fetchStudentCoMarks,
}

function formatPercent(value, digits = 2) {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}

function levelBadge(level) {
  const className = level === null ? 'att-badge att-badge--none' : `att-badge att-badge--${level}`
  return <span className={className}>{level === null ? '—' : level}</span>
}

export default function Attainment() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <AttainmentView {...data} />
}

function AttainmentView({
  assessments,
  attainmentBands,
  coAllocations,
  coSplitValues,
  courses,
  students,
  studentAssessments,
  studentCoMarks,
}) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)

  // Built once per data load so mapping 12 students does not rebuild it.
  const splits = useMemo(() => splitIndex(coSplitValues), [coSplitValues])

  // The optional test has no CO attainment sheet in the source workbook, so
  // it is not offered here at all.
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

  useEffect(() => {
    setAssessmentId(defaultAssessmentId)
  }, [defaultAssessmentId])

  const assessment = courseAssessments.find((a) => a.id === assessmentId) ?? null
  const kind = assessment ? assessment.kind : ''
  const targetPercent = course ? course.coTargetPercent : 0

  const allocation = useMemo(
    () =>
      coAllocations
        .filter((a) => a.assessmentId === assessmentId)
        .sort((a, b) => a.coNumber - b.coNumber),
    [coAllocations, assessmentId],
  )

  // One row per student. Absent students - and students with no mark on
  // record - are marked excluded and take no part in any count below.
  const rows = useMemo(() => {
    return students.map((student) => {
      const record = studentAssessments.find(
        (sa) => sa.assessmentId === assessmentId && sa.studentId === student.id,
      )

      if (!record || record.isAbsent) {
        return {
          student,
          excluded: true,
          reason: record && record.isAbsent ? 'Absent' : 'No mark entered',
          coMarks: null,
        }
      }

      if (record.totalObtained === null) {
        return { student, excluded: true, reason: 'No mark entered', coMarks: null }
      }

      return {
        student,
        excluded: false,
        reason: null,
        totalObtained: record.totalObtained,
        // Prefer what the API stored; fall back to deriving from the split
        // table. Behaviour still branches on splitMode, never on whether
        // coMarks came back empty.
        coMarks: coMarksToShow({
          assessment,
          studentId: student.id,
          totalObtained: record.totalObtained,
          studentCoMarks,
          splits,
        }),
      }
    })
  }, [assessment, assessmentId, students, studentAssessments, studentCoMarks, splits])

  const attendedRows = rows.filter((row) => !row.excluded)

  // Summary per CO, over attended students only.
  const summary = useMemo(() => {
    return allocation.map((alloc) => {
      let achievedCount = 0
      let remedialCount = 0

      for (const row of attendedRows) {
        const obtained = row.coMarks ? row.coMarks[alloc.coNumber] : null
        const percent = coPercent(obtained, alloc.marksAllocated)
        if (isAchieved(percent, targetPercent)) achievedCount += 1
        if (needsRemedial(percent, targetPercent)) remedialCount += 1
      }

      const percent = percentAchieved(achievedCount, attendedRows.length)

      return {
        coNumber: alloc.coNumber,
        marksAllocated: alloc.marksAllocated,
        achievedCount,
        remedialCount,
        percent,
        level: attainmentLevel(percent, attainmentBands),
      }
    })
  }, [allocation, attendedRows, targetPercent, attainmentBands])

  if (!course) {
    return (
      <>
        <Link to="/" className="back-link">
          &larr; Back to dashboard
        </Link>
        <header className="page-header">
          <h1 className="page-header__title">Attainment</h1>
          <p className="page-header__subtitle">Unknown course (id {id})</p>
        </header>
        <div className="placeholder">No such course in the current data.</div>
      </>
    )
  }

  return (
    <>
      <Link to={`/course/${courseId}`} className="back-link">
        &larr; Back to course
      </Link>
      {' · '}
      <Link to={`/course/${courseId}/marks`} className="back-link">
        Go to mark entry &rarr;
      </Link>
      {' · '}
      <Link to={`/course/${courseId}/remedial`} className="back-link">
        Remedial classes &rarr;
      </Link>
      {' · '}
      <Link to={`/course/${courseId}/final`} className="back-link">
        Final attainment &rarr;
      </Link>
      {' · '}
      <Link to={`/course/${courseId}/closing`} className="back-link">
        Closing report &rarr;
      </Link>

      <header className="page-header">
        <h1 className="page-header__title">CO Attainment</h1>
        <p className="page-header__subtitle">
          {course.code} — {course.title}
        </p>
      </header>

      {!assessment ? (
        <div className="placeholder">No assessments are configured for this course yet.</div>
      ) : (
        <>
          <div className="att-toolbar">
            <div className="att-field">
              <label className="att-field__label" htmlFor="attainment-assessment">
                Assessment
              </label>
              <select
                id="attainment-assessment"
                className="att-field__select"
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

          <section className="att-summary">
            <div className="att-summary__item">
              <span className="att-summary__label">Course</span>
              <span className="att-summary__value">
                {course.code} — {course.title}
              </span>
            </div>
            <div className="att-summary__item">
              <span className="att-summary__label">Assessment</span>
              <span className="att-summary__value">{kind}</span>
            </div>
            <div className="att-summary__item">
              <span className="att-summary__label">CO target</span>
              <span className="att-summary__value">{targetPercent.toFixed(2)}%</span>
            </div>
            <div className="att-summary__item">
              <span className="att-summary__label">Total students</span>
              <span className="att-summary__value">{students.length}</span>
            </div>
            <div className="att-summary__item">
              <span className="att-summary__label">Attended</span>
              <span className="att-summary__value">{attendedRows.length}</span>
            </div>
          </section>

          {attendedRows.length === 0 ? (
            <div className="att-empty">
              <p className="att-empty__title">No marks entered for {kind} yet.</p>
              <p>
                Attainment is calculated from the totals entered for this assessment. Enter them
                on the <Link to={`/course/${courseId}/marks`}>Mark Entry</Link> page and come
                back.
              </p>
            </div>
          ) : (
            <>
              <section className="att-section">
                <h2 className="att-section__title">Per-student CO marks</h2>
                <p className="att-section__note">
                  Marks are derived from each student&apos;s total using the CO split lookup.
                  Absent students are excluded from every count.
                </p>

                <div className="att-table-wrap">
                  <table className="att-table">
                    <thead>
                      <tr>
                        <th className="att-table__num" rowSpan={2}>
                          S.No
                        </th>
                        <th rowSpan={2}>Reg No</th>
                        <th rowSpan={2}>Name</th>
                        <th className="att-table__group" colSpan={allocation.length}>
                          Marks obtained / allocated
                        </th>
                        <th className="att-table__group" colSpan={allocation.length}>
                          Remedial?
                        </th>
                      </tr>
                      <tr>
                        {allocation.map((alloc) => (
                          <th key={`m-${alloc.coNumber}`} className="att-table__co">
                            CO{alloc.coNumber}
                          </th>
                        ))}
                        {allocation.map((alloc) => (
                          <th key={`r-${alloc.coNumber}`} className="att-table__flag">
                            CO{alloc.coNumber}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr
                          key={row.student.id}
                          className={row.excluded ? 'att-row--excluded' : undefined}
                        >
                          <td className="att-table__num">{index + 1}</td>
                          <td className="att-table__reg">{row.student.regNumber}</td>
                          <td>{row.student.name}</td>

                          {row.excluded ? (
                            <td
                              className="att-table__excluded-cell"
                              colSpan={allocation.length * 2}
                            >
                              {row.reason} — excluded from attainment
                            </td>
                          ) : (
                            <>
                              {allocation.map((alloc) => {
                                const obtained = row.coMarks ? row.coMarks[alloc.coNumber] : null
                                const percent = coPercent(obtained, alloc.marksAllocated)
                                return (
                                  <td key={`m-${alloc.coNumber}`} className="att-table__co">
                                    {obtained === null || obtained === undefined
                                      ? '—'
                                      : `${obtained} / ${alloc.marksAllocated}`}
                                    <span className="att-table__co-percent">
                                      {formatPercent(percent, 1)}
                                    </span>
                                  </td>
                                )
                              })}
                              {allocation.map((alloc) => {
                                const obtained = row.coMarks ? row.coMarks[alloc.coNumber] : null
                                const percent = coPercent(obtained, alloc.marksAllocated)
                                const remedial = needsRemedial(percent, targetPercent)
                                return (
                                  <td
                                    key={`r-${alloc.coNumber}`}
                                    className={
                                      remedial
                                        ? 'att-table__flag att-table__flag--yes'
                                        : 'att-table__flag att-table__flag--no'
                                    }
                                  >
                                    {remedial ? 'Yes' : 'No'}
                                  </td>
                                )
                              })}
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="att-section">
                <h2 className="att-section__title">CO attainment summary</h2>
                <p className="att-section__note">
                  Percentages are over the {attendedRows.length} students who attended, against a
                  target of {targetPercent.toFixed(2)}%.
                </p>

                <div className="att-table-wrap">
                  <table className="att-table">
                    <thead>
                      <tr>
                        <th>CO</th>
                        <th className="att-table__co">Marks allocated</th>
                        <th className="att-table__co">No. of students achieved the target</th>
                        <th className="att-table__co">Percentage of students achieved</th>
                        <th className="att-table__flag">CO attainment level</th>
                        <th className="att-table__co">No. of students needing remedial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.map((co) => (
                        <tr key={co.coNumber}>
                          <td>CO{co.coNumber}</td>
                          <td className="att-table__co">{co.marksAllocated}</td>
                          <td className="att-table__co">{co.achievedCount}</td>
                          <td className="att-table__co">{formatPercent(co.percent)}</td>
                          <td className="att-table__flag">{levelBadge(co.level)}</td>
                          <td className="att-table__co">{co.remedialCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  )
}
