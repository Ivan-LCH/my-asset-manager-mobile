import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllAssets, getChartData, createAsset, updateAsset, deleteAsset, renameStockAccount } from '@/lib/db'
import type { Asset, AssetType, ChartParams } from '@/types'

const ASSETS_KEY = ['assets'] as const

export function useAssets() {
  return useQuery({
    queryKey: ASSETS_KEY,
    queryFn: () => getAllAssets(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useAssetsByType(type: AssetType): Asset[] {
  const { data } = useAssets()
  return data?.filter((a) => a.type === type) ?? []
}

export function useChart(params: ChartParams) {
  return useQuery({
    queryKey: ['chart', params],
    queryFn: () => getChartData(params),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createAsset(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY })
      qc.invalidateQueries({ queryKey: ['chart'] })
    },
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateAsset(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY })
      qc.invalidateQueries({ queryKey: ['chart'] })
    },
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY })
      qc.invalidateQueries({ queryKey: ['chart'] })
    },
  })
}

/** 주식 계좌명 일괄 변경 — 종목/연금연동/계좌별 명의까지 모두 갱신 */
export function useRenameStockAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      renameStockAccount(oldName, newName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSETS_KEY })
      qc.invalidateQueries({ queryKey: ['chart'] })
      qc.invalidateQueries({ queryKey: ['stock_account_ownership'] })
      qc.invalidateQueries({ queryKey: ['dividends', 'summary'] })
    },
  })
}
