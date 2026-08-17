import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAuthConfig, fetchFacultyList, isApiMode, signInWithGoogle } from '../data/api'
import { DataError, DataLoading, useApiData } from '../data/useApiData'
import { takeSessionNotice, useSession } from '../context/sessionStore'
// Imported, not referenced by path: Vite fingerprints it and rewrites the URL
// with the configured base. A hard-coded /src or /public path would 404 on
// GitHub Pages, which serves the app from /course-file-portal/.
import bitLogo from '../assets/bit-logo.jpg'
import './Login.css'

const INSTITUTION_NAME = 'Bannari Amman Institute of Technology'
const INSTITUTION_SHORT = 'BIT Sathy'

// The faculty picker is a stand-in for real authentication. It is shown ONLY
// when BOTH are true at build time:
//
//   VITE_ALLOW_DEMO_LOGIN === 'true'   the flag is deliberately set, AND
//   VITE_API_URL is unset              this build has no server behind it
//
// The second condition is the important one. A build with an API configured is
// a real install, where signing in as any member of staff without a password
// would be a hole. A build without one is the public demo running on sample
// data, where Google sign-in cannot work at all -- there is no server to
// verify a token against -- so the picker is the only way in.
//
// Both are read at module scope. Vite inlines them, so this is decided when
// the bundle is built: a build that fails either test does not contain the
// picker at all, rather than hiding it.
const ALLOW_DEMO_LOGIN = import.meta.env.VITE_ALLOW_DEMO_LOGIN === 'true'
const IS_MOCK_BUILD = !import.meta.env.VITE_API_URL
const SHOW_DEMO_PICKER = ALLOW_DEMO_LOGIN && IS_MOCK_BUILD

// ---------------------------------------------------------------
// THE STAFF LIST IS LOADED ONLY WHEN THE DEMO PICKER EXISTS.
//
// It is the picker's options and has never had another use on this page. It
// now MUST NOT be requested otherwise: /api/faculty needs a session, and this
// page is where somebody goes who has not got one. Asking for it here would
// fail every time and useApiData would replace the whole sign-in form with an
// error, leaving no way to sign in at all.
//
// The two conditions coincide exactly -- the picker only exists in a build
// with no API -- so this is one flag, not two.
// ---------------------------------------------------------------
const LOADERS = SHOW_DEMO_PICKER
  ? { facultyList: fetchFacultyList, authConfig: fetchAuthConfig }
  : { authConfig: fetchAuthConfig }

// Public by design: this identifies the app to Google and is embedded in the
// bundle. It is not a secret, and it is not read from a component.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

// A HINT to Google's account chooser, nothing more. It biases which account is
// offered; it does not restrict who may sign in. The real domain check is on
// the server, against the verified email claim.
const HOSTED_DOMAIN_HINT = 'bitsathy.ac.in'

const GSI_SRC = 'https://accounts.google.com/gsi/client'

// One shared load, however many times the page mounts.
let gsiPromise = null

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gsiPromise) return gsiPromise

  gsiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google?.accounts?.id) resolve()
      else reject(new Error('Google sign-in loaded but did not start up.'))
    }
    script.onerror = () => {
      // Allow a later attempt: the network may simply have been down.
      gsiPromise = null
      reject(new Error('Could not reach Google to load sign-in.'))
    }
    document.head.appendChild(script)
  })

  return gsiPromise
}

/* ---------------- Icons: inline SVG, no icon package ---------------- */

function UserIcon() {
  return (
    <svg className="auth__field-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="6.75" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.75 16.5a6.25 6.25 0 0 1 12.5 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="auth__field-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="4.25" y="8.75" width="11.5" height="7.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 8.75V6.5a3 3 0 0 1 6 0v2.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="auth__field-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M1.75 10S4.75 4.75 10 4.75 18.25 10 18.25 10 15.25 15.25 10 15.25 1.75 10 1.75 10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg className="auth__field-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M4.4 5.15C2.72 6.63 1.75 10 1.75 10s3 5.25 8.25 5.25c1.4 0 2.63-.37 3.68-.93M8.2 5.1A7.6 7.6 0 0 1 10 4.75c5.25 0 8.25 5.25 8.25 5.25s-.8 1.4-2.25 2.77"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.23 8.23a2.5 2.5 0 0 0 3.54 3.54" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.25 3.25l13.5 13.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function Login() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading />
  if (error) return <DataError error={error} />
  return <LoginView {...data} />
}

// facultyList is absent in an API build -- see LOADERS above.
function LoginView({ facultyList = [], authConfig }) {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(facultyList[0]?.id ?? null)
  const [authError, setAuthError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scriptError, setScriptError] = useState(null)

  // Why the user is looking at this page rather than the one they were on:
  // the API refused their token. Read once and consumed, so it does not
  // reappear on the next visit. Null in the ordinary case of just arriving.
  const [sessionNotice] = useState(takeSessionNotice)

  // Decorative sign-in form state -- see the note above the markup.
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState(false)

  const buttonRef = useRef(null)

  const selected = facultyList.find((f) => f.id === selectedId) ?? null

  // Why Google sign-in may be unavailable, in the order it is worth saying.
  // Each is a different fix, so they are not collapsed into one message.
  let unavailable = null
  if (!GOOGLE_CLIENT_ID) unavailable = 'Institutional sign-in is not configured.'
  else if (!isApiMode()) {
    unavailable =
      'Institutional sign-in needs the portal server, which this demo build does not have.'
  } else if (!authConfig?.serverReachable) {
    unavailable = 'Institutional sign-in is unavailable: the portal server is not reachable.'
  } else if (!authConfig?.googleConfigured) {
    unavailable = 'Institutional sign-in is not configured on the portal server.'
  }

  const canUseGoogle = unavailable === null

  // The credential handler is held in a ref so Google is initialised once,
  // while the callback it invokes always sees current state.
  const onCredentialRef = useRef(null)
  onCredentialRef.current = async function onCredential(response) {
    setAuthError(null)
    setBusy(true)
    try {
      // Google's ID token is forwarded untouched and is never decoded here.
      // What comes back is the faculty record plus OUR session token, which is
      // split off and stored beside it -- neither is inspected in this file.
      const { token, ...faculty } = await signInWithGoogle(response.credential)
      signIn(faculty, token)
      navigate('/', { replace: true })
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!canUseGoogle) return undefined

    let cancelled = false
    loadGoogleIdentity()
      .then(() => {
        if (cancelled || !buttonRef.current) return
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => onCredentialRef.current(response),
          // Hint only -- see HOSTED_DOMAIN_HINT.
          hd: HOSTED_DOMAIN_HINT,
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 288,
        })
      })
      .catch((err) => {
        if (!cancelled) setScriptError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [canUseGoogle])

  function handleDemoSignIn(event) {
    event.preventDefault()
    if (!selected) return
    // No token: this path exists only in a build with no server to have issued
    // one, and makes no requests that would carry it.
    signIn(selected, null)
    navigate('/', { replace: true })
  }

  // ---------------------------------------------------------------
  // THE USERNAME AND PASSWORD FIELDS BELOW ARE PRESENTATIONAL ONLY.
  //
  // This system has no password authentication and the `faculty` table has no
  // password column, so there is nothing for them to be checked against. They
  // accept typing and the eye toggle works, but submitting them contacts no
  // endpoint and can never sign anyone in -- it only explains that and points
  // at the Google button.
  //
  // "Forgot password?" and "Remember me" are inert for the same reason. The
  // link is a <button> so it cannot navigate anywhere.
  //
  // They exist because the institution asked for this layout. If password
  // sign-in is ever added, this whole block has to be built properly rather
  // than wired up as it stands.
  // ---------------------------------------------------------------
  function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordNotice(true)
  }

  return (
    <div className="auth">
      <main className="auth__card">
        <header className="auth__brand">
          {/* The image already carries the institution name and motto, so no
              text wordmark sits beside it. Explicit width/height keep the card
              from jumping while it loads. */}
          <img
            className="auth__logo"
            src={bitLogo}
            width="112"
            height="112"
            alt="Bannari Amman Institute of Technology"
          />
        </header>

        <p className="auth__badge">{INSTITUTION_NAME}</p>

        <h1 className="auth__heading">Welcome back</h1>
        <p className="auth__subheading">
          Sign in with your @{authConfig?.allowedEmailDomain ?? HOSTED_DOMAIN_HINT} account to
          continue.
        </p>

        {/* Why they were sent back here. Reuses the existing note style; no
            new layout or CSS. */}
        {sessionNotice && (
          <p className="auth__inline-note" role="status">
            {sessionNotice}
          </p>
        )}

        <form className="auth__form" onSubmit={handlePasswordSubmit} noValidate>
          <div className="auth__field">
            <label className="auth__label" htmlFor="login-username">
              Username
            </label>
            <div className="auth__control">
              <span className="auth__control-icon">
                <UserIcon />
              </span>
              <input
                id="login-username"
                className="auth__input"
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </div>

          <div className="auth__field">
            <div className="auth__label-row">
              <label className="auth__label" htmlFor="login-password">
                Password
              </label>
              {/* A button, not an anchor: it must not navigate anywhere. */}
              <button type="button" className="auth__forgot">
                Forgot password?
              </button>
            </div>
            <div className="auth__control">
              <span className="auth__control-icon">
                <LockIcon />
              </span>
              <input
                id="login-password"
                className="auth__input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth__reveal"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <label className="auth__remember">
            <input
              type="checkbox"
              className="auth__checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>Remember me</span>
          </label>

          <button type="submit" className="auth__submit">
            Sign In
          </button>
        </form>

        {passwordNotice && (
          <p className="auth__inline-note" role="status">
            Password sign-in is not enabled. Please use your institution Google account below.
          </p>
        )}

        <div className="auth__divider">
          <span>or</span>
        </div>

        {canUseGoogle ? (
          <>
            {/* Google renders its own button into this element. */}
            <div className="auth__google-slot" ref={buttonRef} aria-busy={busy} />
            {busy && (
              <p className="auth__inline-note" role="status">
                Checking your account…
              </p>
            )}
          </>
        ) : (
          <p className="auth__inline-note" role="status">
            {unavailable}
          </p>
        )}

        {scriptError && (
          <p className="auth__inline-note auth__inline-note--error" role="status">
            {scriptError}
          </p>
        )}

        {authError && (
          <p className="auth__inline-note auth__inline-note--error" role="alert">
            {authError}
          </p>
        )}

        {SHOW_DEMO_PICKER && (
          <form className="auth__demo" onSubmit={handleDemoSignIn}>
            <select
              className="auth__select"
              aria-label="Demo sign-in: continue as"
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(Number(event.target.value))}
            >
              {facultyList.map((faculty) => (
                <option key={faculty.id} value={faculty.id}>
                  {faculty.name} — {faculty.designation}
                </option>
              ))}
            </select>

            <button type="submit" className="auth__demo-submit" disabled={!selected}>
              Continue
            </button>
          </form>
        )}

        <p className="auth__footer">
          © {new Date().getFullYear()} {INSTITUTION_SHORT}
        </p>
      </main>
    </div>
  )
}
