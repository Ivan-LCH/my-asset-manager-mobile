import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addHistory, updateHistory, deleteHistory } from '@/lib/db'
import type { HistoryItem } from '@/types'

export function useAddHistory(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: HistoryItem) => addHistory(assetId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['chart'] })
    },
  })
}

export function useUpdateHistory(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ date, data }: { date: string; data: Partial<HistoryItem> }) =>
      updateHistory(assetId, date, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['chart'] })
    },
  })
}

export function useDeleteHistory(assetId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (date: string) => deleteHistory(assetId, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['chart'] })
    },
  })
}
