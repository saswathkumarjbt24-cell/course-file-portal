import { useParams } from 'react-router-dom'
import {
  fetchAssessments,
  fetchCourseNatures,
  fetchCourses,
  fetchInstitution,
  fetchInternalMarksDetail,
  fetchStudentAssessments,
  fetchStudents,
} from '../data/api'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import './Documents.css'

const LOADERS = {
  assessments: fetchAssessments,
  courseNatures: fetchCourseNatures,
  courses: fetchCourses,
  institution: fetchInstitution,
  students: fetchStudents,
  studentAssessments: fetchStudentAssessments,
  // null in MOCK mode, which is the signal to compute locally instead.
  internalMarksDetail: fetchInternalMarksDetail,
}

// `ctx` is { assessments, studentAssessments }, supplied by the caller
// instead of imported. No rule below changed.

// Raw mark for one assessment, before scaling.
function rawMark(ctx, courseId, kind, studentId) {
  const assessment = ctx.assessments.find((a) => a.courseId === courseId && a.kind === kind)
  if (!assessment) return { state: 'none' }

  const record = ctx.studentAssessments.find(
    (r) => r.assessmentId === assessment.id && r.studentId === studentId,
  )
  if (!record) return { state: 'none' }
  if (record.isAbsent || record.totalObtained === null) return { state: 'absent', outOf: assessment.maxTotal }

  return { state: 'ok', raw: record.totalObtained, outOf: assessment.maxTotal }
}

// Scale a periodical-test mark onto the nature's scale: mark * scaleMax / 50.
function scale(mark, scaleMax) {
  if (mark.state !== 'ok' || scaleMax === null || scaleMax === undefined) return null
  return (mark.raw * scaleMax) / mark.outOf
}

// IP1 and IP2 together make up the innovative-practice component.
function scaledIp(ctx, courseId, studentId, scaleMax) {
  if (scaleMax === null || scaleMax === undefined) return { state: 'none' }

  let obtained = 0
  let outOf = 0
  let seen = 0
  let absent = 0

  for (const kind of ['IP1', 'IP2']) {
    const mark = rawMark(ctx, courseId, kind, studentId)
    if (mark.state === 'none') continue
    seen += 1
    outOf += mark.outOf
    if (mark.state === 'absent') absent += 1
    else obtained += mark.raw
  }

  if (seen === 0 || outOf === 0) return { state: 'none' }
  if (absent === seen) return { state: 'absent', value: 0 }
  return { state: 'ok', value: (obtained / outOf) * scaleMax }
}

/**
 * The Optional Test rule, derived from the source workbook's own data:
 *
 *   INT = round( PT1_scaled + PT2_scaled + IP )
 *   PT_scaled = PT mark * nature.pt1Max / 50
 *
 * and if a student was ABSENT for a periodical test AND has an Optional Test
 * mark, the OT mark substitutes for that absent test.
 *
 * NOTE: the workbook never substitutes OT for a merely LOW periodical-test
 * mark - only for an absence - so that case is deliberately not implemented
 * here. Whether OT should also replace a poorer-but-present PT score is
 * UNCONFIRMED and awaiting the client.
 *
 * NOTE: one optional test can replace AT MOST ONE absent periodical test.
 * A student absent for both PT1 and PT2 with a single OT mark therefore has
 * it applied to PT1, and PT2 stays Absent. WHICH test the optional test
 * covers in that double-absence case is UNCONFIRMED and awaiting the client.
 */
function componentsFor(ctx, courseId, studentId, scaleMax) {
  const ot = rawMark(ctx, courseId, 'OT', studentId)
  const hasOt = ot.state === 'ok'
  let otSpent = false

  const build = (kind, ptScaleMax) => {
    const mark = rawMark(ctx, courseId, kind, studentId)
    if (mark.state === 'absent' && hasOt && !otSpent) {
      otSpent = true
      return { state: 'substituted', value: scale(ot, ptScaleMax) }
    }
    if (mark.state === 'absent') return { state: 'absent', value: 0 }
    if (mark.state === 'none') return { state: 'none' }
    return { state: 'ok', value: scale(mark, ptScaleMax) }
  }

  // Evaluated in order so the single substitution lands on PT1.
  const pt1 = build('PT1', scaleMax.pt1)
  const pt2 = build('PT2', scaleMax.pt2)

  return {
    pt1,
    pt2,
    ot: hasOt ? { state: 'ok', value: scale(ot, scaleMax.pt1) } : { state: 'none' },
  }
}

function markCell(mark) {
  if (!mark || mark.state === 'none') return <span className="doc-table__missing">-</span>
  if (mark.state === 'absent') return <span className="doc-table__missing">Absent</span>
  if (mark.state === 'substituted') {
    return (
      <>
        {mark.value.toFixed(2)} <span className="doc-table__sub">(OT)</span>
      </>
    )
  }
  return mark.value.toFixed(2)
}

export default function InternalMarks({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="sheet" />
  if (error) return <DataError error={error} />
  return <InternalMarksView embedded={embedded} {...data} />
}

function InternalMarksView({
  embedded,
  assessments,
  courseNatures,
  courses,
  institution,
  students,
  studentAssessments,
  internalMarksDetail,
}) {
  const ctx = { assessments, studentAssessments }
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)
  const nature = course ? courseNatures.find((n) => n.id === course.natureId) : null

  const scaleMax = {
    pt1: nature ? nature.pt1Max : null,
    pt2: nature ? nature.pt2Max : null,
    ip: nature ? nature.ipMax : null,
    int: nature ? nature.intTotal : null,
  }

  const header = (label, max) => (max === null || max === undefined ? label : `${label} (${max})`)

  // WHERE THE NUMBERS COME FROM
  //   API mode  - the server derives the component states and recomputes the
  //               total from the assessment rows, and internal_marks holds the
  //               stored total. The STORED total is what is printed; if the two
  //               disagree the row is flagged rather than quietly reconciled.
  //   MOCK mode - internalMarksDetail is null, so the local computation below
  //               is used exactly as before. It is the fallback, not a second
  //               source of truth.
  const detailByStudent = new Map(
    (internalMarksDetail ?? [])
      .filter((d) => d.courseId === courseId)
      .map((d) => [d.studentId, d]),
  )
  const usingApi = internalMarksDetail !== null

  const rows = students.map((student) => {
    const detail = detailByStudent.get(student.id)

    if (usingApi && detail) {
      const c = detail.components
      return {
        student,
        pt1: c.pt1,
        pt2: c.pt2,
        // The optional test has no state of its own: a value means it was sat.
        ot: detail.otValue === null ? { state: 'none' } : { state: 'ok', value: detail.otValue },
        ip: c.ip,
        // The STORED total, per the record.
        total: detail.total,
        substituted: detail.substituted,
        mismatch: detail.totalMismatch,
        computedTotal: detail.computedTotal,
      }
    }

    // MOCK mode, or a student with no stored internal-mark row.
    const { pt1, pt2, ot } = componentsFor(ctx, courseId, student.id, scaleMax)
    const ip = scaledIp(ctx, courseId, student.id, scaleMax.ip)

    const contributes = [pt1, pt2, ip].filter((m) => m.state !== 'none')
    const total =
      contributes.length === 0
        ? null
        : Math.round(contributes.reduce((sum, m) => sum + (m.value ?? 0), 0))

    return {
      student,
      pt1,
      pt2,
      ot,
      ip,
      total,
      substituted: pt1.state === 'substituted' || pt2.state === 'substituted',
      mismatch: false,
      computedTotal: total,
    }
  })

  const substitutedCount = rows.filter((r) => r.substituted).length
  const mismatchCount = rows.filter((r) => r.mismatch).length

  return (
    <section className="doc-card">
      {!embedded && (
        <header className="page-header doc-noprint">
          <h1 className="page-header__title">Internal Marks</h1>
          <p className="page-header__course">
            <span className="page-header__course-code">{course.code}</span>
            <span className="page-header__course-title">{course.title}</span>
          </p>
        </header>
      )}

      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">
            {institution.place}
            {course ? ` — Department of ${course.department}` : ''}
          </p>
        </header>

        <h2 className="doc-subtitle">INTERNAL MARKS</h2>

        {course && (
          <p className="doc-statement">
            <strong>Course:</strong> {course.code} — {course.title} (
            {nature ? nature.name : 'unknown nature'})
          </p>
        )}

        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-table__num">S.No</th>
                <th>Roll Number</th>
                <th>Name</th>
                <th>{header('PT1', scaleMax.pt1)}</th>
                <th>{header('PT2', scaleMax.pt2)}</th>
                <th>{header('Optional Test', scaleMax.pt1)}</th>
                <th>{header('IP', scaleMax.ip)}</th>
                <th>{header('INT total', scaleMax.int)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.student.id}>
                  <td className="doc-table__num">{index + 1}</td>
                  <td className="doc-table__reg">{row.student.regNumber}</td>
                  <td>{row.student.name}</td>
                  <td className="doc-table__value">{markCell(row.pt1)}</td>
                  <td className="doc-table__value">{markCell(row.pt2)}</td>
                  <td className="doc-table__value">{markCell(row.ot)}</td>
                  <td className="doc-table__value">{markCell(row.ip)}</td>
                  <td className="doc-table__value">
                    {row.total === null ? (
                      <span className="doc-table__missing">-</span>
                    ) : (
                      <>
                        {row.total}
                        {row.mismatch && (
                          <span
                            className="doc-table__sub"
                            title={`Stored ${row.total}, recomputed ${row.computedTotal}`}
                          >
                            {' '}
                            (!)
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="doc-footnote">
          INT = round(PT1 + PT2 + IP), each periodical test scaled as mark ×{' '}
          {scaleMax.pt1 ?? '—'} / 50; where a student was absent for a periodical test and sat the
          Optional Test, the Optional Test mark substitutes for that one test and the cell is
          marked &quot;(OT)&quot;. One optional test replaces at most one absent periodical test.
          This rule is derived from the source workbook&apos;s own data, not from documented
          regulations.
          {substitutedCount === 0
            ? ' No substitution applies to the current marks.'
            : ` ${substitutedCount} substitution${substitutedCount === 1 ? '' : 's'} applied.`}
          {mismatchCount > 0 &&
            ` ${mismatchCount} stored total${mismatchCount === 1 ? '' : 's'} disagree${
              mismatchCount === 1 ? 's' : ''
            } with the recomputed figure and ${
              mismatchCount === 1 ? 'is' : 'are'
            } marked (!). The stored figure is shown.`}
        </p>

        <div className="doc-sign">
          <div className="doc-sign__block">
            <div className="doc-sign__line">Course Faculty</div>
          </div>
          <div className="doc-sign__block">
            <div className="doc-sign__line">HOD</div>
          </div>
        </div>
      </article>

      {!embedded && (
        <div className="doc-actions">
          <button type="button" className="doc-button" onClick={() => window.print()}>
            Print
          </button>
          <span className="doc-status">Printing drops the navigation and buttons.</span>
        </div>
      )}
    </section>
  )
}
