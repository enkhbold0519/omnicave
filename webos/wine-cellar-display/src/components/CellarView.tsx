import { useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactElement } from 'react'
import type { Bottle, Cellar, Detection } from '../types'
import { colorVar } from './ui'

export type ViewMode = 'door' | '3d'
export interface PlacePoint { x: number; y: number; z: number }

interface Props {
  cellar: Cellar
  mode: ViewMode
  width: number
  height: number
  selectedId: number | null
  highlight: Set<number>
  ghosts: Detection[]
  onSelect: (b: Bottle) => void
  placing: null | { layer: 'front' | 'back' }
  onPlace: (p: PlacePoint) => void
  onGhost: (d: Detection) => void
}

export default function CellarView(p: Props) {
  return p.mode === 'door' || p.placing ? <DoorView {...p} /> : <View3D {...p} />
}

/* ------------------------------------------------------------------ *
 * Door view: 1:1 elevation of what you see through the glass door.
 * Back-row bottles are drawn smaller and dimmer behind the front row.
 * ------------------------------------------------------------------ */
function DoorView({ cellar, width, height, selectedId, highlight, ghosts, onSelect, placing, onPlace, onGhost }: Props) {
  const W = cellar.width_cm, H = cellar.height_cm, D = cellar.geometry.bottle_d
  const labelCol = 230
  const s = Math.min((width - labelCol - 20) / W, (height - 16) / H)
  const ox = 10, oy = 8
  const px = (x: number) => ox + x * s
  const py = (y: number) => oy + (H - y) * s
  const racks = [...cellar.racks].sort((a, b) => b.y_cm - a.y_cm)
  const sorted = useMemo(() => [...cellar.bottles].sort((a, b) => b.z - a.z), [cellar.bottles]) // far first

  const clickBg = (e: RMouseEvent<SVGSVGElement>) => {
    if (!placing) return
    // getScreenCTM handles the stage's scale *and* 90° rotation
    const svg = e.currentTarget
    const m = svg.getScreenCTM()
    if (!m) return
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const x = (pt.x - ox) / s, y = H - (pt.y - oy) / s
    if (x < 0 || x > W || y < 0 || y > H) return
    onPlace({ x, y, z: placing.layer === 'front' ? 6 : Math.round(cellar.depth_cm / 2) })
  }

  return (
    <svg width={width} height={height} className={`cellar-svg ${placing ? 'placing' : ''}`} onClick={clickBg}>
      <rect x={px(0)} y={py(H)} width={W * s} height={H * s} rx={14} className="cellar-box" />
      {cellar.zones.map(z => (
        <g key={z.id}>
          <rect x={px(0)} y={py(Math.min(z.y_to, H))} width={W * s} height={(Math.min(z.y_to, H) - z.y_from) * s} className={`zone-band ${z.name.startsWith('Upper') ? 'cool' : 'warm'}`} />
          <text x={px(0) + 12} y={py(Math.min(z.y_to, H)) + 22} className="zone-text">{z.name}</text>
        </g>
      ))}
      {racks.map(r => (
        <g key={r.id}>
          {r.kind === 'shelf' && <line x1={px(0)} x2={px(W)} y1={py(r.y_cm)} y2={py(r.y_cm)} className={`rack-line ${r.present ? '' : 'removed'}`} />}
          <text x={px(W) + 14} y={py(r.y_cm) - 4} className="rack-name">{r.name}{r.present ? '' : ' · pulled out'}</text>
          {!!r.present && (
            <text x={px(W) + 14} y={py(r.y_cm) + 20} className={`rack-count ${r.over_capacity ? 'over' : ''}`}>
              {r.count}/{r.capacity}{r.over_capacity ? ' over nominal' : ''}
            </text>
          )}
        </g>
      ))}
      {sorted.map(b => {
        const back = b.layer === 'back'
        const rr = (D / 2) * s * (back ? 0.82 : 1)
        const sel = b.id === selectedId
        const hl = highlight.has(b.id)
        const common = {
          className: `btl ${back ? 'back' : ''} ${sel ? 'sel' : ''} ${hl ? 'hl' : ''}`,
          onClick: (e: RMouseEvent) => { if (!placing) { e.stopPropagation(); onSelect(b) } },
          style: { fill: colorVar(b.wine.color) },
        }
        return b.orientation === 'standing'
          ? <rect key={b.id} {...common} x={px(b.x) - rr} y={py(b.y - D / 2 + 30)} width={rr * 2} height={30 * s} rx={rr} />
          : <circle key={b.id} {...common} cx={px(b.x)} cy={py(b.y)} r={rr} />
      })}
      {sorted.filter(b => b.level > 0).map(b => (
        <text key={'l' + b.id} x={px(b.x)} y={py(b.y) + 5} className="lvl-text" textAnchor="middle">{b.level}</text>
      ))}
      {ghosts.filter(g => g.cellar_id === cellar.id).map(g => (
        <g key={'g' + g.id} className="ghost" onClick={(e: RMouseEvent) => { e.stopPropagation(); onGhost(g) }}>
          <circle cx={px(g.payload.x)} cy={py(g.payload.y)} r={(D / 2) * s} />
          <text x={px(g.payload.x)} y={py(g.payload.y) + 7} textAnchor="middle">?</text>
        </g>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * 3D view: dependency-free SVG projection (no WebGL needed on the
 * low-power cellar module). Drag to orbit, buttons for preset angles.
 * ------------------------------------------------------------------ */
type V3 = [number, number, number]

function View3D({ cellar, width, height, selectedId, highlight, onSelect }: Props) {
  const [yaw, setYaw] = useState(-0.55)
  const [pitch, setPitch] = useState(0.32)
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const W = cellar.width_cm, H = cellar.height_cm, Dp = cellar.depth_cm
  const BD = cellar.geometry.bottle_d, BL = cellar.geometry.bottle_l
  const dist = Math.max(W, H, Dp) * 2.4
  const f = (Math.min(width, height * 0.9) * 0.48 * dist) / (Math.max(W, H) * 0.55)
  const cx = width / 2, cy = height / 2

  const proj = (p: V3): [number, number, number] => {
    // world: centre the cellar, z grows away from the viewer (door at the front)
    let x = p[0] - W / 2, y = p[1] - H / 2, z = p[2] - Dp / 2
    const cY = Math.cos(yaw), sY = Math.sin(yaw)
    ;[x, z] = [x * cY + z * sY, -x * sY + z * cY]
    const cP = Math.cos(pitch), sP = Math.sin(pitch)
    ;[y, z] = [y * cP - z * sP, y * sP + z * cP]
    const k = f / (dist + z)
    return [cx + x * k, cy - y * k, z]
  }
  const poly = (pts: V3[]) => pts.map(proj).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const onDown = (e: RPointerEvent<SVGSVGElement>) => { drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }; e.currentTarget.setPointerCapture(e.pointerId) }
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    setYaw(d.yaw + (e.clientX - d.x) * 0.008)
    setPitch(Math.max(-1.2, Math.min(1.35, d.pitch + (e.clientY - d.y) * 0.006)))
  }
  const onUp = () => { drag.current = null }

  const corners: V3[] = [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], [0, 0, Dp], [W, 0, Dp], [W, H, Dp], [0, H, Dp]]
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]

  const items = useMemo(() => {
    const out: { key: string; depth: number; el: ReactElement }[] = []
    for (const r of cellar.racks) {
      if (r.kind === 'floor') continue
      const pts: V3[] = [[0, r.y_cm, 2], [W, r.y_cm, 2], [W, r.y_cm, r.depth_cm], [0, r.y_cm, r.depth_cm]]
      const depth = proj([W / 2, r.y_cm, r.depth_cm / 2])[2]
      out.push({ key: 'r' + r.id, depth: depth + 1000, el: <polygon key={'r' + r.id} points={poly(pts)} className={`rack3d ${r.present ? '' : 'removed'}`} /> })
    }
    for (const b of cellar.bottles) {
      const a: V3 = b.orientation === 'standing' ? [b.x, b.y - BD / 2, b.z] : [b.x, b.y, b.z]
      const c: V3 = b.orientation === 'standing' ? [b.x, b.y - BD / 2 + BL, b.z] : [b.x, b.y, b.z + BL * 0.8]
      const pa = proj(a), pc = proj(c)
      const mid = (pa[2] + pc[2]) / 2
      const w = (BD * f) / (dist + mid)
      const sel = b.id === selectedId
      out.push({
        key: 'b' + b.id, depth: mid,
        el: (
          <g key={'b' + b.id} className={`btl3d ${sel ? 'sel' : ''} ${highlight.has(b.id) ? 'hl' : ''}`} onClick={() => onSelect(b)}>
            <line x1={pa[0]} y1={pa[1]} x2={pc[0]} y2={pc[1]} strokeWidth={w} style={{ stroke: colorVar(b.wine.color) }} />
            <circle cx={pa[0]} cy={pa[1]} r={w / 2} className="base" />
          </g>
        ),
      })
    }
    return out.sort((p, q) => q.depth - p.depth)
  }, [cellar, yaw, pitch, selectedId, highlight, width, height]) // eslint-disable-line react-hooks/exhaustive-deps

  const presets: [string, number, number][] = [['Front', 0, 0.05], ['Angle', -0.55, 0.32], ['Side', -1.45, 0.15], ['Top', 0, 1.3]]
  return (
    <div className="view3d" style={{ width, height }}>
      <svg width={width} height={height} className="cellar-svg grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {edges.map(([i, j], k) => {
          const a = proj(corners[i]), b = proj(corners[j])
          const front = corners[i][2] === 0 && corners[j][2] === 0
          return <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={`edge3d ${front ? 'door' : ''}`} />
        })}
        <polygon points={poly([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]])} className="glass3d" />
        {items.map(i => i.el)}
      </svg>
      <div className="view3d-ctl">
        {presets.map(([l, y, p]) => <button key={l} className="pill" onClick={() => { setYaw(y); setPitch(p) }}>{l}</button>)}
        <span className="muted tiny">drag to rotate</span>
      </div>
    </div>
  )
}
