import { useMemo } from 'react'
import { Trade } from '../types'

interface EquitySparklineProps {
  trades: Trade[]
}

export function EquitySparkline({ trades }: EquitySparklineProps) {
  const data = useMemo(() => {
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
    if (sorted.length < 2) return null

    let running = 0
    const points = sorted.map((t) => {
      running += t.result
      return running
    })

    const W = 140
    const H = 40
    const min = Math.min(0, ...points)
    const max = Math.max(0, ...points)
    const range = max - min || 1

    const toX = (i: number) => (i / (points.length - 1)) * W
    const toY = (v: number) => H - ((v - min) / range) * H

    const pathD = points
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
      .join(' ')

    const fillD =
      pathD +
      ` L ${W} ${H} L 0 ${H} Z`

    const final = points[points.length - 1]

    return { pathD, fillD, W, H, final }
  }, [trades])

  if (!data) return null

  const { pathD, fillD, W, H, final } = data
  const isLight = document.documentElement.dataset.theme === 'light'
  const color = final >= 0
    ? (isLight ? '#059669' : '#4ade80')
    : (isLight ? '#dc2626' : '#f87171')

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      className="opacity-80"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#spark-fill)" />
      <path
        d={pathD}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
