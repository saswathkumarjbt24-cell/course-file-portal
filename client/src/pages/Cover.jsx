import { useParams } from 'react-router-dom'
import { fetchCourses, fetchInstitution, fetchStudents } from '../data/api'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import './Documents.css'

const LOADERS = {
  courses: fetchCourses,
  institution: fetchInstitution,
  students: fetchStudents,
}

// Placeholders: these fields have no table yet. Replace with real values
// when the batch / academic-year / staff records exist.
const PROGRAMME = 'B.E. Computer Science and Engineering'
const BATCH = '2022 - 2026'
const ACADEMIC_YEAR = '2025 - 2026 (Odd Semester)'
const HANDLED_BY = 'Balakrishnaraja, Assistant Professor / CSE'
const FILE_INCHARGE = 'Tamilselvi prof, Associate Professor / CSE'

const ROMAN = ['-', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

function yearOfStudy(semester) {
  const sem = Number(semester)
  if (!sem) return '—'
  return ROMAN[Math.ceil(sem / 2)] ?? '—'
}

export default function Cover({ embedded = false }) {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <CoverView embedded={embedded} {...data} />
}

function CoverView({ embedded, courses, institution, students }) {
  const { id } = useParams()
  const course = courses.find((c) => c.id === Number(id))
  const semester = students[0]?.currentSem ?? null

  if (!course) {
    return <div className="placeholder">No such course in the current data.</div>
  }

  return (
    <section className="doc-card">
      <article className="doc-sheet">
        <header className="doc-head">
          <h1 className="doc-head__name">{institution.name}</h1>
          <p className="doc-head__line">{institution.place}</p>
          <p className="doc-head__line">{institution.affiliation}</p>
          <p className="doc-head__line">{institution.accreditation}</p>
        </header>

        <h2 className="doc-title">COURSE FILE</h2>

        <dl className="doc-fields">
          <div className="doc-field">
            <dt className="doc-field__term">Department</dt>
            <dd className="doc-field__value">{course.department}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Programme</dt>
            <dd className="doc-field__value">{PROGRAMME}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Batch</dt>
            <dd className="doc-field__value">{BATCH}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Academic year</dt>
            <dd className="doc-field__value">{ACADEMIC_YEAR}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Year of study</dt>
            <dd className="doc-field__value">{yearOfStudy(semester)}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Semester</dt>
            <dd className="doc-field__value">{semester ?? '—'}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Course code</dt>
            <dd className="doc-field__value">{course.code}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Course title</dt>
            <dd className="doc-field__value">{course.title}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Handled by</dt>
            <dd className="doc-field__value">{HANDLED_BY}</dd>
          </div>
          <div className="doc-field">
            <dt className="doc-field__term">Course file incharge</dt>
            <dd className="doc-field__value">{FILE_INCHARGE}</dd>
          </div>
        </dl>

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
