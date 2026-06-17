import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getRetirement, saveRetirement } from '@/lib/db'
import type { RetirementPlan } from '@/types'

const KEY = ['retirement']

export function useRetirement() {
  return useQuery<RetirementPlan>({
    queryKey: KEY,
    queryFn: () => getRetirement(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useSaveRetirement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RetirementPlan) => saveRetirement(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
