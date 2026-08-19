import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchCoPoMatrix,
  fetchCourseNatures,
  fetchCourseOutcomes,
  fetchCourses,
  fetchProgramOutcomes,
  fetchProgramSpecificOutcomes,
  isApiMode,
  saveCourseOutcomes,
} from '../data/api'
import { DataError, DataLoading, SaveFeedback, useApiData } from '../data/useApiData'
import { useSave } from '../data/useSave'
import './CourseDetail.css'
// BEGIN REMOVABLE -- edit permission scope
import { useSession } from '../context/sessionStore'
import { canEditCourseOutcomes, READ_ONLY_NOTE } from '../components/permissions'
// END REMOVABLE -- edit permission scope

const MATRIX_VALUES = ['1', '2', '3']

const LOADERS = {
  coPoMatrix: fetchCoPoMatrix,
  courseNatures: fetchCourseNatures,
  courseOutcomes: fetchCourseOutcomes,
  courses: fetchCourses,
  programOutcomes: fetchProgramOutcomes,
  programSpecificOutcomes: fetchProgramSpecificOutcomes,
}

// One key per matrix cell.
function cellKey(coNumber, outcomeCode) {
  return `${coNumber}|${outcomeCode}`
}

function seedStatements(courseOutcomes, courseId, coCount) {
  const seeded = {}
  for (let co = 1; co <= coCount; co += 1) {
    const existing = courseOutcomes.find((o) => o.courseId === courseId && o.coNumber === co)
    seeded[co] = existing ? existing.statement : ''
  }
  return seeded
}

// Only correlated cells are stored, so everything else stays blank.
function seedMatrix(coPoMatrix, courseId) {
  const seeded = {}
  for (const row of coPoMatrix) {
    if (row.courseId === courseId) {
      seeded[cellKey(row.coNumber, row.outcomeCode)] = String(row.value)
    }
  }
  return seeded
}

function orNone(value, suffix = '') {
  return value === null || value === undefined ? null : `${value}${suffix}`
}

export default function CourseDetail() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="table" />
  if (error) return <DataError error={error} />
  return <CourseDetailView {...data} />
}

function CourseDetailView({
  coPoMatrix,
  courseNatures,
  courseOutcomes,
  courses,
  programOutcomes,
  programSpecificOutcomes,
}) {
  const { id } = useParams()
  const courseId = Number(id)
  const course = courses.find((c) => c.id === courseId)
  const coCount = course ? course.coCount : 0
  const nature = course ? courseNatures.find((n) => n.id === course.natureId) : null

  const coNumbers = useMemo(
    () => Array.from({ length: coCount }, (_, i) => i + 1),
    [coCount],
  )

  // PO1..PO12 then PSO1..PSO3 - 15 columns.
  const outcomeColumns = useMemo(
    () => [
      ...programOutcomes.map((o) => ({ ...o, type: 'PO' })),
      ...programSpecificOutcomes.map((o) => ({ ...o, type: 'PSO' })),
    ],
    [programOutcomes, programSpecificOutcomes],
  )

  const [statements, setStatements] = useState(() =>
    seedStatements(courseOutcomes, courseId, coCount),
  )
  const [matrix, setMatrix] = useState(() => seedMatrix(coPoMatrix, courseId))
  const [savedOutcomes, setSavedOutcomes] = useState(0)
  const [savedMatrix, setSavedMatrix] = useState(0)
  // BEGIN REMOVABLE -- edit permission scope
  const { faculty } = useSession()
  // Course setup uses its OWN permission, not canEditCourseFile: this one
  // screen is writable by an allocated faculty member again, while the other
  // six course-file sheets stay hod-or-admin. The server decides -- see the
  // note on PUT /:id/outcomes in routes/courses.js.
  const canEdit = canEditCourseOutcomes(faculty)
  // END REMOVABLE -- edit permission scope
  const [outcomeSave, runOutcomeSave] = useSave()
  const [matrixSave, runMatrixSave] = useSave()

  // MOCK mode keeps the original wording so the public demo is unchanged.
  const savedLabel = isApiMode() ? 'Saved' : 'Saved (mock)'
  const idleLabel = isApiMode()
    ? 'Saving writes to the database.'
    : 'Nothing is sent to a server yet.'

  // Reseed when the route points at a different course.
  useEffect(() => {
    setStatements(seedStatements(courseOutcomes, courseId, coCount))
    setMatrix(seedMatrix(coPoMatrix, courseId))
  }, [courseId, coCount, courseOutcomes, coPoMatrix])

  useEffect(() => {
    if (savedOutcomes === 0) return undefined
    const timer = setTimeout(() => setSavedOutcomes(0), 4000)
    return () => clearTimeout(timer)
  }, [savedOutcomes])

  useEffect(() => {
    if (savedMatrix === 0) return undefined
    const timer = setTimeout(() => setSavedMatrix(0), 4000)
    return () => clearTimeout(timer)
  }, [savedMatrix])

  // How many PO/PSO columns each CO is mapped to.
  const mappingCounts = useMemo(() => {
    const counts = {}
    for (const co of coNumbers) {
      counts[co] = outcomeColumns.filter((col) => matrix[cellKey(co, col.code)]).length
    }
    return counts
  }, [coNumbers, outcomeColumns, matrix])

  function handleSaveOutcomes() {
    runOutcomeSave(
      () =>
        saveCourseOutcomes(courseId, {
          courseOutcomes: coNumbers.map((co) => ({
            coNumber: co,
            statement: statements[co] ?? '',
          })),
        }),
      () => setSavedOutcomes((n) => n + 1),
    )
  }

  function handleSaveMatrix() {
    // EVERY cell is sent, including the blank ones as null. A blank cell has
    // to be sent explicitly, because on the server a null value DELETES the
    // cell -- send only the filled ones and clearing a correlation would
    // silently do nothing.
    const entries = []
    for (const co of coNumbers) {
      for (const col of outcomeColumns) {
        const value = matrix[cellKey(co, col.code)]
        entries.push({
          coNumber: co,
          outcomeType: col.type,
          outcomeCode: col.code,
          value: value ? Number(value) : null,
        })
      }
    }
    runMatrixSave(
      () => saveCourseOutcomes(courseId, { coPoMatrix: entries }),
      () => setSavedMatrix((n) => n + 1),
    )
  }

  if (!course) {
    return (
      <>
        <Link to="/" className="back-link">
          &larr; Back to dashboard
        </Link>
        <header className="page-header">
          <h1 className="page-header__title">Course Setup</h1>
          <p className="page-header__subtitle">Unknown course (id {id})</p>
        </header>
        <div className="placeholder">No such course in the current data.</div>
      </>
    )
  }

  const scale = [
    { label: 'PT1 max', value: nature ? orNone(nature.pt1Max) : null },
    { label: 'PT2 max', value: nature ? orNone(nature.pt2Max) : null },
    { label: 'IP max', value: nature ? orNone(nature.ipMax) : null },
    { label: 'INT total', value: nature ? orNone(nature.intTotal) : null },
    { label: 'SEE total', value: nature ? orNone(nature.seeTotal) : null },
  ]

  return (
    <>
      <nav className="cd-nav">
        <Link to="/">&larr; Dashboard</Link>
        <span className="cd-nav__sep">|</span>
        <Link to={`/course/${courseId}/marks`}>Mark entry</Link>
        <span className="cd-nav__sep">·</span>
        <Link to={`/course/${courseId}/attainment`}>CO attainment</Link>
      </nav>

      <header className="page-header">
        <h1 className="page-header__title">Course Setup</h1>
        <p className="page-header__subtitle">
          {course.code} — {course.title}
        </p>
      </header>

      {/* ---------------- Section A ---------------- */}
      <section className="cd-card">
        <h2 className="cd-section__title">Course details</h2>
        <p className="cd-section__note">
          Read-only. These come from the course record and its course nature.
        </p>

        <dl className="cd-details">
          <div className="cd-details__item">
            <dt className="cd-details__term">Code</dt>
            <dd className="cd-details__value">{course.code}</dd>
          </div>
          <div className="cd-details__item">
            <dt className="cd-details__term">Title</dt>
            <dd className="cd-details__value">{course.title}</dd>
          </div>
          <div className="cd-details__item">
            <dt className="cd-details__term">Nature</dt>
            <dd className="cd-details__value">{nature ? nature.name : 'Unknown'}</dd>
          </div>
          <div className="cd-details__item">
            <dt className="cd-details__term">Department</dt>
            <dd className="cd-details__value">{course.department}</dd>
          </div>
          <div className="cd-details__item">
            <dt className="cd-details__term">Regulation year</dt>
            <dd className="cd-details__value">{course.regulationYear ?? '—'}</dd>
          </div>
          <div className="cd-details__item">
            <dt className="cd-details__term">CO count</dt>
            <dd className="cd-details__value">{course.coCount}</dd>
          </div>
          <div className="cd-details__item">
            <dt className="cd-details__term">CO target</dt>
            <dd className="cd-details__value">{course.coTargetPercent.toFixed(2)}%</dd>
          </div>
        </dl>

        <h3 className="cd-subheading">Mark scale ({nature ? nature.name : 'unknown nature'})</h3>
        <dl className="cd-details">
          {scale.map((item) => (
            <div className="cd-details__item" key={item.label}>
              <dt className="cd-details__term">{item.label}</dt>
              <dd
                className={
                  item.value === null
                    ? 'cd-details__value cd-details__value--muted'
                    : 'cd-details__value'
                }
              >
                {item.value === null ? 'Not stated' : item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- Section B ---------------- */}
      <section className="cd-card">
        <h2 className="cd-section__title">Course Outcomes</h2>
        <p className="cd-section__note">
          {coCount} outcomes for this course. Edits are held in the browser only.
        </p>

        <div className="cd-co-list">
          {coNumbers.map((co) => (
            <div className="cd-co-row" key={co}>
              <label className="cd-co-label" htmlFor={`co-statement-${co}`}>
                CO{co}
              </label>
              <textarea
                id={`co-statement-${co}`}
                className="cd-textarea"
                rows={2}
                placeholder={`Statement for CO${co}`}
                value={statements[co] ?? ''}
                /* BEGIN REMOVABLE -- edit permission scope. Read-only rather
                   than hidden: the statement must still be readable. */
                readOnly={!canEdit}
                /* END REMOVABLE -- edit permission scope */
                onChange={(event) =>
                  setStatements((prev) => ({ ...prev, [co]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <div className="cd-actions">
          {/* BEGIN REMOVABLE -- edit permission scope */}
          {canEdit ? (
            <button
              type="button"
              className="cd-button"
              disabled={outcomeSave.saving}
              onClick={handleSaveOutcomes}
            >
              {outcomeSave.saving ? 'Saving…' : 'Save outcomes'}
            </button>
          ) : (
            <span className="cd-status">{READ_ONLY_NOTE}</span>
          )}
          {/* END REMOVABLE -- edit permission scope */}
          {savedOutcomes > 0 ? (
            <span className="cd-status cd-status--saved">{savedLabel}</span>
          ) : (
            <span className="cd-status">{idleLabel}</span>
          )}
        </div>

        {/* A rejected save wrote nothing; the typed statements stay put. */}
        <SaveFeedback state={outcomeSave} />
      </section>

      {/* ---------------- Section C ---------------- */}
      <section className="cd-card">
        <h2 className="cd-section__title">CO — PO / PSO articulation matrix</h2>
        <p className="cd-section__note">
          Correlation strength 1 (low) to 3 (high). Blank means no correlation. Hover a column
          header for the outcome title.
        </p>

        <div className="cd-matrix-wrap">
          <table className="cd-matrix">
            <thead>
              <tr>
                <th className="cd-matrix__co">CO</th>
                {outcomeColumns.map((col) => (
                  <th
                    key={col.code}
                    className={col.type === 'PSO' ? 'cd-matrix__pso' : undefined}
                    title={col.title}
                  >
                    {col.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coNumbers.map((co) => (
                <tr key={co}>
                  <th scope="row" className="cd-matrix__co">
                    CO{co}
                  </th>
                  {outcomeColumns.map((col) => {
                    const key = cellKey(co, col.code)
                    const value = matrix[key] ?? ''
                    return (
                      <td key={col.code}>
                        <select
                          className={
                            value ? 'cd-matrix__select cd-matrix__select--set' : 'cd-matrix__select'
                          }
                          value={value}
                          aria-label={`CO${co} to ${col.code}`}
                          /* BEGIN REMOVABLE -- edit permission scope */
                          disabled={!canEdit}
                          /* END REMOVABLE -- edit permission scope */
                          onChange={(event) =>
                            setMatrix((prev) => ({ ...prev, [key]: event.target.value }))
                          }
                        >
                          <option value="">—</option>
                          {MATRIX_VALUES.map((v) => (
                            <option key={v} value={v}>
                              {v}
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

        <div className="cd-counts">
          {coNumbers.map((co) => (
            <span
              key={co}
              className={
                mappingCounts[co] === 0 ? 'cd-count-chip cd-count-chip--zero' : 'cd-count-chip'
              }
            >
              CO{co}: mapped to {mappingCounts[co]} of {outcomeColumns.length}
            </span>
          ))}
        </div>

        <div className="cd-actions">
          {/* BEGIN REMOVABLE -- edit permission scope */}
          {canEdit ? (
            <button
              type="button"
              className="cd-button"
              disabled={matrixSave.saving}
              onClick={handleSaveMatrix}
            >
              {matrixSave.saving ? 'Saving…' : 'Save matrix'}
            </button>
          ) : (
            <span className="cd-status">{READ_ONLY_NOTE}</span>
          )}
          {/* END REMOVABLE -- edit permission scope */}
          {savedMatrix > 0 ? (
            <span className="cd-status cd-status--saved">{savedLabel}</span>
          ) : (
            <span className="cd-status">{idleLabel}</span>
          )}
        </div>

        {/* A rejected save wrote nothing; the chosen values stay put. */}
        <SaveFeedback state={matrixSave} />
      </section>
    </>
  )
}
