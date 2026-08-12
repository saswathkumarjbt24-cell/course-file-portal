import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchFacultyList } from '../data/api'
import { SessionContext } from './sessionStore'

// Who is using the portal.
//
// THIS IS NOT AUTHENTICATION. There is no password, token or session cookie -
// signing in picks a faculty record, and signing out forgets it.
//
// WHY sessionStorage AND NOT localStorage
//   These are shared lab machines. sessionStorage is scoped to the browser
//   tab and is cleared when the browser closes, so walking away from a machine
//   does not leave the next person signed in as you. localStorage would
//   persist indefinitely, which is the wrong default here.
const STORAGE_KEY = 'cfp.session.faculty'

/** Read the stored session, tolerating absent, corrupt or foreign values. */
function readStored() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Anything can end up under a storage key. Only accept a shape we can use.
    if (!parsed || typeof parsed !== 'object') return null
    if (!Number.isInteger(parsed.id) || typeof parsed.name !== 'string') return null
    return parsed
  } catch {
    // Malformed JSON, or storage blocked entirely.
    return null
  }
}

function writeStored(faculty) {
  try {
    if (faculty) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(faculty))
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Some privacy modes refuse storage. The session still works for this tab;
    // it just will not survive a refresh. Not worth failing the sign-in over.
  }
}

export function SessionProvider({ children }) {
  // Restored SYNCHRONOUSLY in the state initialiser, so the very first render
  // already has the faculty. That is what makes a refresh stay put: the route
  // guard in App.jsx never observes a null session and never redirects to
  // /login. Restoring in an effect instead would render null once, bounce, and
  // lose the page the user was on.
  const [faculty, setFaculty] = useState(readStored)

  const signIn = useCallback((selected) => {
    writeStored(selected)
    setFaculty(selected)
  }, [])

  const signOut = useCallback(() => {
    writeStored(null)
    setFaculty(null)
  }, [])

  // The stored id may name a faculty member who has since been removed or
  // deactivated. Check it once, in the background, and clear the session if so
  // -- the route guard then sends the user to /login rather than the app
  // rendering against a person who no longer exists.
  //
  // A FAILED LOOKUP IS NOT PROOF THE ACCOUNT IS GONE. If the API is
  // unreachable the session is left alone, so a dropped connection does not
  // sign everyone out mid-edit.
  const facultyId = faculty ? faculty.id : null
  useEffect(() => {
    if (facultyId === null) return undefined

    let cancelled = false
    fetchFacultyList()
      .then((list) => {
        if (cancelled) return
        if (!list.some((f) => f.id === facultyId)) signOut()
      })
      .catch(() => {
        // Unreachable or erroring: keep the session.
      })

    return () => {
      cancelled = true
    }
  }, [facultyId, signOut])

  const value = useMemo(
    () => ({ faculty, signIn, signOut }),
    [faculty, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
