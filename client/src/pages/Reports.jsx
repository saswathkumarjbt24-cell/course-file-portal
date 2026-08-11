import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { courseNatures, courses, internalMarks, students } from '../data/mockData'
import { bandFor, isLowInternalMark, marksBelowThreshold } from '../utils/internalMarks'
import './RiskReport.css'

// The "marks required" list only tracks students within reach of the
// threshold; anyone further behind is counted separately.
const SHORTFALL_STEPS = [1, 2, 3]

// Distribution bands are defined relative to each nature's own threshold,
// so the same five buckets are meaningful for every mark scale.
function bandsFor(threshold) {
  return [
    { label: `${threshold + 15} and above`, min: threshold + 15 },
    { label: `${threshold + 10} to ${threshold + 15}`, min: threshold + 10 },
    { label: `${threshold + 5} to ${threshold + 10}`, min: threshold + 5 },
    { label: `${threshold} to ${threshold + 5}`, min: threshold },
    { label: `Below ${threshold} (low)`, min: Number.NEGATIVE_INFINITY },
  ]
}

function pctClass(percent) {
  if (percent > 30) return 'risk-pct risk-pct--high'
  if (percent >= 15) return 'risk-pct risk-pct--medium'
  return 'risk-pct risk-pct--low'
}

export default function Reports() {
  // Every internal-mark record joined to its course and course nature.
  const records = useMemo(() => {
    return internalMarks.map((record) => {
      const course = courses.find((c) => c.id === record.courseId) ?? null
      const nature = course ? courseNatures.find((n) => n.id === course.natureId) : null
      const threshold = nature ? nature.lowImThreshold : null
      return {
        ...record,
        course,
        nature,
        threshold,
        student: students.find((s) => s.id === record.studentId) ?? null,
        low: isLowInternalMark(record.total, threshold),
        shortfall: marksBelowThreshold(record.total, threshold),
      }
    })
  }, [])

  const lowCount = records.filter((r) => r.low).length
  const enoughCount = records.length - lowCount
  const lowPercent = records.length === 0 ? 0 : (lowCount * 100) / records.length

  // Per nature: totals, low counts and the shortfall buckets.
  const byNature = useMemo(() => {
    return courseNatures.map((nature) => {
      const rows = records.filter((r) => r.nature && r.nature.id === nature.id)
      const low = rows.filter((r) => r.low)
      const steps = SHORTFALL_STEPS.map((step) => ({
        step,
        count: low.filter((r) => Math.ceil(r.shortfall) === step).length,
      }))
      const beyond = low.filter((r) => Math.ceil(r.shortfall) > 3).length

      const bands = bandsFor(nature.lowImThreshold)
      const distribution = bands.map((band) => ({
        label: band.label,
        isLow: band.min === Number.NEGATIVE_INFINITY,
        count: rows.filter((r) => bandFor(r.total, bands)?.label === band.label).length,
      }))

      return {
        nature,
        rows,
        lowCount: low.length,
        percent: rows.length === 0 ? null : (low.length * 100) / rows.length,
        steps,
        beyond,
        distribution,
        maxCount: Math.max(1, ...distribution.map((d) => d.count)),
      }
    })
  }, [records])

  // Per course, sorted by the share of low internal marks.
  const byCourse = useMemo(() => {
    return courses
      .map((course) => {
        const rows = records.filter((r) => r.courseId === course.id)
        const low = rows.filter((r) => r.low).length
        return {
          course,
          nature: courseNatures.find((n) => n.id === course.natureId) ?? null,
          studentCount: rows.length,
          lowCount: low,
          enoughCount: rows.length - low,
          percent: rows.length === 0 ? 0 : (low * 100) / rows.length,
        }
      })
      .sort((a, b) => b.percent - a.percent)
  }, [records])

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Reports</h1>
        <p className="page-header__subtitle">
          Internal-mark risk across {courses.length} courses and {students.length} students. A
          mark is low when it falls below its course nature&apos;s threshold.
        </p>
      </header>

      {/* ---------------- 1. Summary ---------------- */}
      <section className="risk-section">
        <h2 className="risk-section__title">1. Summary</h2>
        <p className="risk-section__note">
          One record per student per course. Thresholds:{' '}
          {courseNatures.map((n) => `${n.name} ${n.lowImThreshold}`).join(', ')}.
        </p>

        <div className="risk-cards">
          <div className="risk-card">
            <span className="risk-card__label">Total records</span>
            <span className="risk-card__value">{records.length}</span>
            <span className="risk-card__sub">
              {students.length} students &times; {courses.length} courses
            </span>
          </div>
          <div className="risk-card risk-card--danger">
            <span className="risk-card__label">Low internal mark</span>
            <span className="risk-card__value">{lowCount}</span>
            <span className="risk-card__sub">below the nature threshold</span>
          </div>
          <div className="risk-card risk-card--success">
            <span className="risk-card__label">Enough</span>
            <span className="risk-card__value">{enoughCount}</span>
            <span className="risk-card__sub">at or above the threshold</span>
          </div>
          <div className="risk-card risk-card--warning">
            <span className="risk-card__label">Low share</span>
            <span className="risk-card__value">{lowPercent.toFixed(1)}%</span>
            <span className="risk-card__sub">of all records</span>
          </div>

          {byNature.map((group) => (
            <div className="risk-card" key={group.nature.id}>
              <span className="risk-card__label">{group.nature.name}</span>
              <span className="risk-card__value">
                {group.lowCount} / {group.rows.length}
              </span>
              <span className="risk-card__sub">
                {group.percent === null ? 'no records' : `${group.percent.toFixed(1)}% low`} ·
                threshold {group.nature.lowImThreshold}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- 2. Course-wise ---------------- */}
      <section className="risk-section">
        <h2 className="risk-section__title">2. Course-wise risk</h2>
        <p className="risk-section__note">
          Sorted by the share of low internal marks, worst first. Red above 30%, amber 15-30%,
          green below 15%.
        </p>

        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Nature</th>
                <th className="risk-table__value">Students</th>
                <th className="risk-table__value">Low</th>
                <th className="risk-table__value">Enough</th>
                <th className="risk-table__value">Low IM %</th>
              </tr>
            </thead>
            <tbody>
              {byCourse.map((row) => (
                <tr key={row.course.id}>
                  <td>
                    <Link to={`/course/${row.course.id}`}>{row.course.code}</Link>
                  </td>
                  <td>{row.course.title}</td>
                  <td className="risk-table__muted">{row.nature ? row.nature.name : 'Unknown'}</td>
                  <td className="risk-table__value">{row.studentCount}</td>
                  <td className="risk-table__value">{row.lowCount}</td>
                  <td className="risk-table__value">{row.enoughCount}</td>
                  <td className="risk-table__value">
                    <span className={pctClass(row.percent)}>{row.percent.toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- 3. Marks required ---------------- */}
      <section className="risk-section">
        <h2 className="risk-section__title">3. Marks required to reach the minimum</h2>
        <p className="risk-section__note">
          How many students sit 1, 2 or 3 marks below their threshold — the ones a single
          re-assessment or remedial class can lift over the line.
        </p>

        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Course nature</th>
                <th className="risk-table__value">Threshold</th>
                {SHORTFALL_STEPS.map((step) => (
                  <th key={step} className="risk-table__value">
                    {step} mark{step === 1 ? '' : 's'} short
                  </th>
                ))}
                <th className="risk-table__value">More than 3 short</th>
                <th className="risk-table__value">Total low</th>
              </tr>
            </thead>
            <tbody>
              {byNature.map((group) => (
                <tr key={group.nature.id}>
                  <td>{group.nature.name}</td>
                  <td className="risk-table__value">{group.nature.lowImThreshold}</td>
                  {group.steps.map((s) => (
                    <td key={s.step} className="risk-table__value">
                      {s.count}
                    </td>
                  ))}
                  <td className="risk-table__value">{group.beyond}</td>
                  <td className="risk-table__value">{group.lowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="risk-section__note" style={{ marginTop: 'var(--space-3)' }}>
          Students within three marks of the threshold, by name:
        </p>

        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Roll Number</th>
                <th>Name</th>
                <th>Course</th>
                <th className="risk-table__value">Internal mark</th>
                <th className="risk-table__value">Threshold</th>
                <th className="risk-table__value">Marks short</th>
              </tr>
            </thead>
            <tbody>
              {records.filter((r) => r.low && Math.ceil(r.shortfall) <= 3).length === 0 ? (
                <tr>
                  <td colSpan={6} className="risk-empty">
                    No student is within three marks of their threshold.
                  </td>
                </tr>
              ) : (
                records
                  .filter((r) => r.low && Math.ceil(r.shortfall) <= 3)
                  .sort((a, b) => a.shortfall - b.shortfall)
                  .map((r) => (
                    <tr key={`${r.studentId}-${r.courseId}`}>
                      <td>{r.student ? r.student.regNumber : '—'}</td>
                      <td>{r.student ? r.student.name : '—'}</td>
                      <td>
                        {r.course ? (
                          <Link to={`/course/${r.course.id}`}>{r.course.code}</Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="risk-table__value">{r.total}</td>
                      <td className="risk-table__value">{r.threshold}</td>
                      <td className="risk-table__value">{r.shortfall}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- 4. Distribution ---------------- */}
      <section className="risk-section">
        <h2 className="risk-section__title">4. Distribution by course nature</h2>
        <p className="risk-section__note">
          Bands are set relative to each nature&apos;s own threshold. Bars are sized against the
          largest band in that nature.
        </p>

        {byNature.map((group) => (
          <div className="risk-nature" key={group.nature.id}>
            <h3 className="risk-nature__title">{group.nature.name}</h3>
            <p className="risk-nature__note">
              {group.rows.length} records · threshold {group.nature.lowImThreshold} ·{' '}
              {group.lowCount} low
            </p>

            {group.rows.length === 0 ? (
              <p className="risk-empty">No records for this nature.</p>
            ) : (
              <div className="risk-bars">
                {group.distribution.map((band) => (
                  <div className="risk-bar-row" key={band.label}>
                    <span className="risk-bar-label">{band.label}</span>
                    <span className="risk-bar-track">
                      <span
                        className={band.isLow ? 'risk-bar-fill risk-bar-fill--low' : 'risk-bar-fill'}
                        style={{ width: `${(band.count / group.maxCount) * 100}%` }}
                      />
                    </span>
                    <span className="risk-bar-count">{band.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  )
}
