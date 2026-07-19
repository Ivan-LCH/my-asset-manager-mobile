import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getStockAccountOwnership, saveStockAccountOwnership } from '@/lib/db'

const KEY = ['stock_account_ownership']

export function useStockAccountOwnership() {
  return useQuery<Record<string, { husband: number; wife: number }>>({
    queryKey: KEY,
    queryFn: () => getStockAccountOwnership(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useSaveStockAccountOwnership() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (map: Record<string, { husband: number; wife: number }>) => saveStockAccountOwnership(map),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
