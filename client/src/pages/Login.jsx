import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchFacultyList, fetchInstitution } from '../data/api'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import { useSession } from '../context/sessionStore'
import './Login.css'

const LOADERS = { facultyList: fetchFacultyList, institution: fetchInstitution }

export default function Login() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <LoginView {...data} />
}

function LoginView({ facultyList, institution }) {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(facultyList[0]?.id ?? null)

  const selected = facultyList.find((f) => f.id === selectedId) ?? null

  function handleSignIn(event) {
    event.preventDefault()
    if (!selected) return
    signIn(selected)
    navigate('/', { replace: true })
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSignIn}>
        <p className="login-institution">{institution.name}</p>
        <p className="login-place">{institution.place}</p>

        <hr className="login-rule" />

        <h1 className="login-title">Course File Portal</h1>
        <p className="login-description">
          Prepare, review and print the course file — mark entry, CO attainment, remedial records
          and the closing report.
        </p>

        <div className="login-field">
          <label className="login-field__label" htmlFor="login-faculty">
            Signing in as
          </label>
          <select
            id="login-faculty"
            className="login-field__select"
            value={selectedId ?? ''}
            onChange={(event) => setSelectedId(Number(event.target.value))}
          >
            {facultyList.map((faculty) => (
              <option key={faculty.id} value={faculty.id}>
                {faculty.name} — {faculty.designation}, {faculty.department}
              </option>
            ))}
          </select>
        </div>

        {selected && <p className="login-email">{selected.email}</p>}

        <button type="submit" className="login-button" disabled={!selected}>
          Sign in with institution email
        </button>

        <p className="login-note">
          Authentication is not wired up yet. Choosing a name simply sets who the session belongs
          to — there is no password check, and nothing is stored, so reloading the page signs you
          out.
        </p>
      </form>
    </div>
  )
}
