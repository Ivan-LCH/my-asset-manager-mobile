import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, saveSettings } from '@/lib/db'
import type { Settings } from '@/types'

const SETTINGS_KEY = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getSettings,
    staleTime: 10 * 60 * 1000,
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Settings>) => saveSettings(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
