import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDividends, getDividendSummary, addDividend, removeDividend, updateDividendSettings,
} from '@/lib/db'
import type { DividendRecord } from '@/types'

export function useDividends(assetId: string) {
  return useQuery<DividendRecord[]>({
    queryKey: ['dividends', assetId],
    queryFn:  () => getDividends(assetId),
    enabled:  !!assetId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useDividendSummary() {
  return useQuery({
    queryKey: ['dividends', 'summary'],
    queryFn:  () => getDividendSummary(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useAddDividend(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<DividendRecord, 'id' | 'assetId'>) => addDividend(assetId, data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['dividends', assetId] })
      qc.invalidateQueries({ queryKey: ['dividends', 'summary'] })
    },
  })
}

export function useDeleteDividend(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => removeDividend(assetId, id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['dividends', assetId] })
      qc.invalidateQueries({ queryKey: ['dividends', 'summary'] })
    },
  })
}

export function useUpdateDividendSettings(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { dividendYield?: number; dividendDps?: number; dividendCycle?: string }) =>
      updateDividendSettings(assetId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['dividends', 'summary'] })
    },
  })
}
