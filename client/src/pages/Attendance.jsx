import { useParams } from 'react-router-dom'
import { attendance, courses, institution, students } from '../data/mockData'
import './Documents.css'

// Institutional minimum attendance for exam eligibility.
const MINIMUM_PERCENT = 75

export default function Attendance({ embedded = false }) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)

  const rows = students.map((student) => {
    const record = attendance.find((a) => a.courseId === courseId && a.studentId === student.id)
    return { student, percentage: record ? record.percentage : null }
  })

  const below = rows.filter((r) => r.percentage !== null && r.percentage < MINIMUM_PERCENT)

  return (
    <section className="doc-card">
      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">
            {institution.place}
            {course ? ` — Department of ${course.department}` : ''}
          </p>
        </header>

        <h2 className="doc-subtitle">ATTENDANCE</h2>

        {course && (
          <p className="doc-statement">
            <strong>Course:</strong> {course.code} — {course.title}. Students below{' '}
            {MINIMUM_PERCENT}% are shown in red.
          </p>
        )}

        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-table__num">S.No</th>
                <th>Roll Number</th>
                <th>Name</th>
                <th>Attendance %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isBelow = row.percentage !== null && row.percentage < MINIMUM_PERCENT
                return (
                  <tr key={row.student.id}>
                    <td className="doc-table__num">{index + 1}</td>
                    <td className="doc-table__reg">{row.student.regNumber}</td>
                    <td>{row.student.name}</td>
                    <td
                      className={
                        row.percentage === null
                          ? 'doc-table__value doc-table__missing'
                          : isBelow
                            ? 'doc-table__value doc-table__below'
                            : 'doc-table__value'
                      }
                    >
                      {row.percentage === null ? 'Not recorded' : `${row.percentage}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="doc-statement">
          {below.length === 0
            ? `All students meet the ${MINIMUM_PERCENT}% requirement.`
            : `${below.length} student${below.length === 1 ? '' : 's'} below ${MINIMUM_PERCENT}%.`}
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
