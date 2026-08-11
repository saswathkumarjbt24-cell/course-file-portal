import { useMemo, useState } from 'react'
import { SessionContext } from './sessionStore'

// Who is using the portal, held in React state only.
//
// THIS IS NOT AUTHENTICATION. There is no password, token or session
// cookie - signing in picks a faculty record from mock data, and signing
// out forgets it. Nothing is persisted, so a page reload signs you out.
export function SessionProvider({ children }) {
  const [faculty, setFaculty] = useState(null)

  const value = useMemo(
    () => ({
      faculty,
      signIn: (selected) => setFaculty(selected),
      signOut: () => setFaculty(null),
    }),
    [faculty],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
