import { createContext, useContext } from 'react'

// The context object and its hook live here, apart from the provider
// component, so that SessionContext.jsx only exports a component and
// fast refresh keeps working.
export const SessionContext = createContext(null)

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used inside a SessionProvider')
  }
  return context
}
