import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPortfolio, savePortfolio } from '@/lib/db'
import type { PortfolioSettings } from '@/types'

const KEY = ['portfolio']

const DEFAULT: PortfolioSettings = {
  holdings: [
    { ticker: 'SCHD', weight: 1 },
    { ticker: 'GPIQ', weight: 1 },
    { ticker: 'JEPQ', weight: 1 },
  ],
  blendedYield: 0,
}

export { DEFAULT as DEFAULT_PORTFOLIO }

export function usePortfolio() {
  return useQuery<PortfolioSettings>({
    queryKey: KEY,
    queryFn: async () => (await getPortfolio()) ?? DEFAULT,
    staleTime: 5 * 60 * 1000,
  })
}

export function useSavePortfolio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PortfolioSettings) => savePortfolio(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
