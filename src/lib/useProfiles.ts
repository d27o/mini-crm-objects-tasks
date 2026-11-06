import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Profile } from './types'

// Сотрудников немного — загружаем всех разом и ищем по id.
export function useProfiles(): Map<string, Profile> {
  const [map, setMap] = useState<Map<string, Profile>>(new Map())
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data }) => setMap(new Map((data ?? []).map((p: Profile) => [p.id, p]))))
  }, [])
  return map
}
