import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCorpSim, saveCorpSim } from '@/lib/db'
import type { CorpSimPlan } from '@/types'

const KEY = ['corp-sim']

export function useCorpSim() {
  return useQuery<CorpSimPlan | null>({
    queryKey: KEY,
    queryFn: () => getCorpSim(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useSaveCorpSim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CorpSimPlan) => saveCorpSim(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
