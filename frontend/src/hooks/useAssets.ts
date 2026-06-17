import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllAssets, getChartData, createAsset, updateAsset, deleteAsset } from '@/lib/db'
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
