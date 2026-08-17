import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchFacultyList } from '../data/api'
import {
  SESSION_EXPIRED_EVENT,
  SessionContext,
  readStoredFaculty,
  readStoredToken,
  writeStoredSession,
} from './sessionStore'

// Who is using the portal.
//
// SIGNING IN IS NOW REAL AUTHENTICATION. Google verifies who you are, the
// server checks you are on staff and issues a signed token, and that token is
// what every later request carries. The token is stored beside the faculty
// record; see sessionStore.js for where and why.
//
// THE SERVER IS STILL THE ONLY AUTHORITY. What is held here decides what to
// RENDER, never what is allowed: the API re-reads the faculty row on every
// request and enforces the rules itself, so editing anything in storage buys
// nothing but a 401.

export function SessionProvider({ children }) {
  // Restored SYNCHRONOUSLY in the state initialiser, so the very first render
  // already has the faculty. That is what makes a refresh stay put: the route
  // guard in App.jsx never observes a null session and never redirects to
  // /login. Restoring in an effect instead would render null once, bounce, and
  // lose the page the user was on.
  const [faculty, setFaculty] = useState(readStoredFaculty)

  const signIn = useCallback((selected, token = null) => {
    writeStoredSession(selected, token)
    setFaculty(selected)
  }, [])

  const signOut = useCallback(() => {
    writeStoredSession(null, null)
    setFaculty(null)
  }, [])

  // The API rejected the token: expired, revoked, or belonging to an account
  // that has since been deactivated. The data layer has already cleared
  // storage and left a message for the sign-in page; all that is left is to
  // drop the in-memory session, which makes the route guard redirect.
  useEffect(() => {
    function onExpired() {
      setFaculty(null)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  // The stored id may name a faculty member who has since been removed or
  // deactivated. Check it once, in the background, and clear the session if so
  // -- the route guard then sends the user to /login rather than the app
  // rendering against a person who no longer exists.
  //
  // A FAILED LOOKUP IS NOT PROOF THE ACCOUNT IS GONE. If the API is
  // unreachable the session is left alone, so a dropped connection does not
  // sign everyone out mid-edit. That now covers one more case: the staff
  // directory needs the hod or admin role, so for an ordinary faculty member
  // this check answers 403 and is skipped. Nothing is lost by that -- the
  // server re-reads the faculty row on EVERY request and answers 401 the
  // moment the account stops being valid, which is stricter than this check
  // ever was and does not depend on it running.
  const facultyId = faculty ? faculty.id : null
  useEffect(() => {
    if (facultyId === null) return undefined
    // Mock mode has no token and no server; the fixtures always agree.
    if (readStoredToken() === null) return undefined

    let cancelled = false
    fetchFacultyList()
      .then((list) => {
        if (cancelled) return
        if (!list.some((f) => f.id === facultyId)) signOut()
      })
      .catch(() => {
        // Unreachable, erroring, or forbidden to this role: keep the session.
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
