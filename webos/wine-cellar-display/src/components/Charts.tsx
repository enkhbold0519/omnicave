interface Props {
  values: number[]
  width: number
  height: number
  color?: string
  band?: [number, number] // shaded allowed range
  fill?: boolean
  labels?: [string, string]
}

/** Minimal dependency-free SVG line chart. */
export function LineChart({ values, width, height, color = 'var(--accent)', band, fill, labels }: Props) {
  if (values.length < 2) return <svg width={width} height={height} />
  const pad = 4
  let lo = Math.min(...values), hi = Math.max(...values)
  if (band) { lo = Math.min(lo, band[0]); hi = Math.max(hi, band[1]) }
  if (hi - lo < 1e-6) { hi += 1; lo -= 1 }
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2 - (labels ? 18 : 0))
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg width={width} height={height} className="chart">
      {band && <rect x={pad} width={width - pad * 2} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--band)" />}
      {fill && <path d={`${d}L${x(values.length - 1)},${height - pad - (labels ? 18 : 0)}L${x(0)},${height - pad - (labels ? 18 : 0)}Z`} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill={color} />
      {labels && (
        <>
          <text x={pad} y={height - 2} className="chart-label">{labels[0]}</text>
          <text x={width - pad} y={height - 2} className="chart-label" textAnchor="end">{labels[1]}</text>
        </>
      )}
    </svg>
  )
}
