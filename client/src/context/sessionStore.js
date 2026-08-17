import { createContext, useContext } from 'react'

// The context object and its hook live here, apart from the provider
// component, so that SessionContext.jsx only exports a component and
// fast refresh keeps working.
//
// The sessionStorage read/write helpers live here too, and for a related
// reason: the API data layer needs the TOKEN on every request, and it cannot
// import them from SessionContext.jsx without a cycle -- that file already
// imports the data layer. This module imports nothing but React, so both
// sides can depend on it.
export const SessionContext = createContext(null)

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used inside a SessionProvider')
  }
  return context
}

// ---------------------------------------------------------------
// WHERE THE SESSION LIVES
//
// WHY sessionStorage AND NOT localStorage
//   These are shared lab machines. sessionStorage is scoped to the browser
//   tab and is cleared when the browser closes, so walking away from a machine
//   does not leave the next person signed in as you. localStorage would
//   persist indefinitely, which is the wrong default here.
//
// TWO KEYS, NOT ONE
//   The faculty record is what the app renders; the token is what proves it.
//   They are stored side by side rather than nested so the existing faculty
//   key keeps exactly the shape it had, and so a token can be dropped on a
//   401 without disturbing anything else.
//
// THE TOKEN IS DATA, NOT A SECRET THE APP INSPECTS
//   Nothing here decodes it, reads its claims, or checks its expiry. It is
//   forwarded to the API untouched, and the SERVER decides what it is worth --
//   the frontend finds out a session is over by being told 401.
// ---------------------------------------------------------------
const FACULTY_KEY = 'cfp.session.faculty'
const TOKEN_KEY = 'cfp.session.token'
const NOTICE_KEY = 'cfp.session.notice'

/**
 * Fired when the API rejects the token. SessionProvider listens and signs out,
 * which drops the route guard back to /login.
 *
 * An event rather than a direct call because the data layer has no access to
 * React state, and a hard `window.location` jump would throw away the rest of
 * the app to make a change React can make on its own.
 */
export const SESSION_EXPIRED_EVENT = 'cfp:session-expired'

/** Read the stored faculty, tolerating absent, corrupt or foreign values. */
export function readStoredFaculty() {
  try {
    const raw = window.sessionStorage.getItem(FACULTY_KEY)
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

/** The stored bearer token, or null. Never decoded, only passed on. */
export function readStoredToken() {
  try {
    const raw = window.sessionStorage.getItem(TOKEN_KEY)
    return typeof raw === 'string' && raw !== '' ? raw : null
  } catch {
    return null
  }
}

/**
 * Store, or clear, the whole session.
 *
 * `token` is null in mock mode, where there is no server to have issued one
 * and no request that would carry it.
 */
export function writeStoredSession(faculty, token) {
  try {
    if (faculty) window.sessionStorage.setItem(FACULTY_KEY, JSON.stringify(faculty))
    else window.sessionStorage.removeItem(FACULTY_KEY)

    if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
    else window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Some privacy modes refuse storage. The session still works for this tab;
    // it just will not survive a refresh. Not worth failing the sign-in over.
  }
}

/** Read the pending sign-in notice and consume it, so it shows exactly once. */
export function takeSessionNotice() {
  try {
    const message = window.sessionStorage.getItem(NOTICE_KEY)
    if (message) window.sessionStorage.removeItem(NOTICE_KEY)
    return message || null
  } catch {
    return null
  }
}

/**
 * End the session because the API refused the token.
 *
 * Clears storage FIRST, so that even if the event listener is not mounted --
 * or the tab is reloaded before React reacts -- there is no stale token left
 * to retry with. The message is left behind for the sign-in page to show, so
 * the user is told why they are looking at it.
 */
export function expireSession(message) {
  writeStoredSession(null, null)
  try {
    window.sessionStorage.setItem(NOTICE_KEY, message)
  } catch {
    // Storage refused: the redirect still happens, just without the reason.
  }
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}
