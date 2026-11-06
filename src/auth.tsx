import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './lib/types'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
}

const AuthContext = createContext<AuthState>({ loading: true, session: null, profile: null })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, profile: null })

  useEffect(() => {
    let cancelled = false

    async function load(session: Session | null) {
      if (!session) {
        if (!cancelled) setState({ loading: false, session: null, profile: null })
        return
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (!cancelled) setState({ loading: false, session, profile: data as Profile | null })
    }

    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Обновление токена не меняет пользователя — профиль не перечитываем.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => load(session), 0)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

// Внутри защищённых страниц профиль гарантированно есть.
export function useMe(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('useMe() вне защищённой зоны')
  return profile
}
