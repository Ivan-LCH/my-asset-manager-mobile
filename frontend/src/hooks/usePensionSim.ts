import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPensionSim, savePensionSim } from '@/lib/db'
import type { PensionSimPlan } from '@/types'

const KEY = ['pension-sim']

export function usePensionSim() {
  return useQuery<PensionSimPlan | null>({
    queryKey: KEY,
    queryFn: () => getPensionSim(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useSavePensionSim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PensionSimPlan) => savePensionSim(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
