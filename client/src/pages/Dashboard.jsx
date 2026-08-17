import { Link } from 'react-router-dom'
import { fetchCourseNatures, fetchCourses } from '../data/api'
import { DataError, DataLoading, useApiData } from '../data/useApiData'

const LOADERS = { courseNatures: fetchCourseNatures, courses: fetchCourses }

export default function Dashboard() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="cards" />
  if (error) return <DataError error={error} />
  return <DashboardView {...data} />
}

function DashboardView({ courseNatures, courses }) {
  const natureName = (natureId) => {
    const nature = courseNatures.find((n) => n.id === natureId)
    return nature ? nature.name : 'Unknown'
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Dashboard</h1>
        <p className="page-header__subtitle">
          {courses.length} course files assigned to you this semester.
        </p>
      </header>

      <div className="card-grid">
        {courses.map((course) => (
          <Link key={course.id} to={`/course/${course.id}`} className="course-card">
            <span className="course-card__code">{course.code}</span>
            <h2 className="course-card__title">{course.title}</h2>

            <dl className="course-card__meta">
              <div>
                <dt>Nature</dt>
                <dd>{natureName(course.natureId)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{course.department}</dd>
              </div>
            </dl>

            <div className="course-card__footer">
              <span className="course-card__footer-label">CO target</span>
              <span className="tag">{course.coTargetPercent.toFixed(2)}%</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
