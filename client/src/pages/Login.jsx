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

/* There is no EyeOffIcon any more. The reveal control is inert, so the
   password field is never shown as text and the "hidden" state is the only
   one it can be in. */

export default function Login() {
  const { loading, error, data } = useApiData(LOADERS)
  if (loading) return <DataLoading variant="auth" />
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

  // The decorative form holds NO state. It used to keep a username, a
  // password, a reveal toggle and a "remember me" flag; none of them can
  // change any more, because nothing in that block can be typed into or
  // clicked. See the note above the markup.
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
          // Pill, to match the field and button shapes around it. This is a
          // rendering option only -- it changes what Google draws, not what
          // is verified or what the callback above receives.
          shape: 'pill',
          logo_alignment: 'left',
          // 288px inside a 320px column: 32px of slack, 16px either side.
          //
          // THIS NUMBER MUST STAY BELOW THE 20rem CAP ON .auth__panel-inner.
          // It is a FIXED pixel value -- Google sets it once, here -- so it
          // cannot shrink with the column. Sizing it to exactly the column
          // width is what produced the horizontal scrollbar under the
          // button: no slack, so any sub-pixel rounding overflowed.
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

  // ===============================================================
  // THE BLOCK MARKED .auth__decor BELOW IS DECORATION. IT IS NOT A FORM.
  //
  // This system has no password authentication and the `faculty` table has no
  // password column, so there is nothing for these fields to be checked
  // against. They exist because the institution asked for this layout, and
  // for no other reason.
  //
  // They are not merely ignored -- they CANNOT BE USED:
  //
  //   readOnly        nothing can be typed into them
  //   tabIndex={-1}   the keyboard cannot reach them
  //   aria-hidden     a screen reader is not told they exist
  //   pointer-events: none (on .auth__decor)  no click, drag or focus
  //   cursor: default they do not even invite a click
  //
  // "Forgot password?" and the reveal toggle are plain <span>s rather than
  // <button>s, so they are inert by construction and not merely by being
  // told not to act. "Remember me" is uncontrolled and unreachable.
  //
  // THE ONLY LIVE CONTROL IN THE FORM IS THE SUBMIT BUTTON, and all it does
  // is set the notice below, which points at the Google button. Signing in
  // happens THERE and nowhere else.
  //
  // If password sign-in is ever really added, this whole block has to be
  // built properly rather than wired up as it stands.
  // ===============================================================
  function handlePasswordSubmit(event) {
    event.preventDefault()
    setPasswordNotice(true)
  }

  return (
    <div className="auth">
      {/* ONE card, split by the curve. The curve itself is a clip-path on
          .auth__brand -- see the long note in Login.css for its geometry
          and for why no text can end up underneath it. */}
      <div className="auth__card">
        {/* ---- Brand panel: what this is, and whose it is ---- */}
        <section className="auth__brand">
          {/* The texture is a ::before on this section. The content sits in
              its own wrapper above it -- see .auth__brand-inner. */}
          <div className="auth__brand-inner">
            {/* The crest is a full-colour image on white, so it keeps a light
                plate behind it on the brand ground rather than being knocked
                out. Explicit width/height reserve the space while it loads. */}
            <img className="auth__logo" src={bitLogo} width="84" height="84" alt="" />

            {/* HEADING ORDER IS SEMANTIC, NOT VISUAL.
                The product name is what this page IS, so it is the h1 even
                though "Welcome Back" is the larger thing on screen. Both keep
                the classes they had, and those classes set margin, font-size,
                font-weight, letter-spacing and line-height explicitly -- so
                the tags change the outline and nothing you can see. Class
                beats element on specificity, so neither the UA's heading
                defaults nor the h1/h2 rule in index.css reaches them. */}
            <h1 className="auth__wordmark">Course File Portal</h1>

            <h2 className="auth__welcome">Welcome Back</h2>

            <p className="auth__tagline">
              Course outcome attainment, internal marks and the complete course file, in one
              place.
            </p>

            <hr className="auth__rule" />

            <p className="auth__brand-footer">{INSTITUTION_NAME}</p>
          </div>
        </section>

        {/* ---- Form panel ---- */}
        <main className="auth__panel">
          <div className="auth__panel-inner">
            <h2 className="auth__heading">Sign in</h2>
            <p className="auth__subheading">
              Use your @{authConfig?.allowedEmailDomain ?? HOSTED_DOMAIN_HINT} account to
              continue.
            </p>

            {/* Why they were sent back here. Reuses the existing note style. */}
            {sessionNotice && (
              <p className="auth__inline-note" role="status">
                {sessionNotice}
              </p>
            )}

            <form className="auth__form" onSubmit={handlePasswordSubmit} noValidate>
              {/* DECORATION ONLY -- see the block comment above
                  handlePasswordSubmit. Nothing in here can be typed into,
                  clicked or reached by keyboard. */}
              <div className="auth__decor" aria-hidden="true">
                <div className="auth__field">
                  <span className="auth__label">Username</span>
                  <div className="auth__control">
                    <span className="auth__control-icon">
                      <UserIcon />
                    </span>
                    <input
                      className="auth__input"
                      type="text"
                      value=""
                      readOnly
                      tabIndex={-1}
                      aria-hidden="true"
                      autoComplete="off"
                      placeholder="Enter your username"
                    />
                  </div>
                </div>

                <div className="auth__field">
                  <div className="auth__label-row">
                    <span className="auth__label">Password</span>
                    {/* A span, not a button: nothing to focus and nowhere to go. */}
                    <span className="auth__forgot">Forgot password?</span>
                  </div>
                  <div className="auth__control">
                    <span className="auth__control-icon">
                      <LockIcon />
                    </span>
                    <input
                      className="auth__input"
                      type="password"
                      value=""
                      readOnly
                      tabIndex={-1}
                      aria-hidden="true"
                      autoComplete="off"
                      placeholder="Enter your password"
                    />
                    {/* Visible, and inert: a span cannot be pressed. */}
                    <span className="auth__reveal">
                      <EyeIcon />
                    </span>
                  </div>
                </div>

                <span className="auth__remember">
                  <input
                    type="checkbox"
                    className="auth__checkbox"
                    defaultChecked={false}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span>Remember me</span>
                </span>
              </div>

              {/* The one live control in the form. It signs nobody in; it says
                  so, and points at the Google button. */}
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
              <div className="auth__primary">
                <p className="auth__primary-label">Institutional sign-in</p>
                {/* Google renders its own button into this element. */}
                <div className="auth__google-slot" ref={buttonRef} aria-busy={busy} />
                {busy && (
                  <p className="auth__inline-note" role="status">
                    Checking your account…
                  </p>
                )}
              </div>
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
          </div>
        </main>
      </div>
    </div>
  )
}
