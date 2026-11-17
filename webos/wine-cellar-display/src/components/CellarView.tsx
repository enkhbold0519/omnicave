import { useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactElement } from 'react'
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
  /** screen saver: no controls or touch, a slow continuous turn at a low frame rate */
  ambient?: boolean
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
  const fillCol = 64, frame = 16                     // a slim fill gauge per rack instead of a text column
  const s = Math.min((width - fillCol - frame * 2 - 8) / W, (height - frame * 2 - 8) / H)
  const ox = frame + 4 + Math.max(0, (width - fillCol - frame * 2 - 8 - W * s) / 2), oy = frame + 4
  const px = (x: number) => ox + x * s
  const py = (y: number) => oy + (H - y) * s
  const racks = [...cellar.racks].sort((a, b) => b.y_cm - a.y_cm)
  const sorted = useMemo(() => [...cellar.bottles].sort((a, b) => b.z - a.z), [cellar.bottles]) // far first
  const anySel = selectedId !== null && cellar.bottles.some(b => b.id === selectedId)
  const selB = anySel ? cellar.bottles.find(b => b.id === selectedId)! : null

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

  const glass = (b: Bottle, cx: number, cy: number, rr: number, back: boolean) => (
    <>
      <ellipse cx={cx} cy={cy + rr * 0.98} rx={rr * 0.95} ry={rr * 0.24} className="btl-shadow" />
      <circle cx={cx} cy={cy} r={rr} className="btl-glass" style={{ fill: colorVar(b.wine.color) }} />
      <circle cx={cx} cy={cy} r={rr * 0.8} className="btl-rim" />
      <path d={`M${cx - rr * 0.62},${cy - rr * 0.5} A${rr * 0.8},${rr * 0.8} 0 0 1 ${cx + rr * 0.62},${cy - rr * 0.5}`} className="btl-glint" />
      <circle cx={cx} cy={cy} r={rr * 0.36} className="btl-punt" />
      <circle cx={cx - rr * 0.38} cy={cy - rr * 0.4} r={rr * 0.13} className="btl-shine" />
      {back && <circle cx={cx} cy={cy} r={rr} className="btl-behind" />}
    </>
  )

  return (
    <svg width={width} height={height} className={`cellar-svg ${placing ? 'placing' : ''}`} onClick={clickBg}>
      <defs>
        <linearGradient id="cab-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2d6" stopOpacity="0.12" />
          <stop offset="0.3" stopColor="#fff2d6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* smoked-glass cabinet: frame, dark interior, a soft light from the top */}
      <rect x={px(0) - frame} y={py(H) - frame} width={W * s + frame * 2} height={H * s + frame * 2} rx={22} className="cab-frame" />
      <rect x={px(0)} y={py(H)} width={W * s} height={H * s} rx={8} className="cellar-box" />
      {cellar.zones.map(z => {
        const l = z.latest
        const out = !!l && (l.temp < z.temp_min || l.temp > z.temp_max || l.hum < z.hum_min || l.hum > z.hum_max)
        const top = py(Math.min(z.y_to, H))
        return (
          <g key={z.id}>
            <rect x={px(0)} y={top} width={W * s} height={(Math.min(z.y_to, H) - z.y_from) * s} className={`zone-band ${z.name.startsWith('Upper') ? 'cool' : 'warm'}`} />
            <text x={px(0) + 14} y={top + 26} className={`zone-text ${out ? 'out' : ''}`}>
              {z.name.split(' · ').pop()}
              {l && <tspan className="zone-reading">{`  ${l.temp.toFixed(1)} °C · ${Math.round(l.hum)} %`}</tspan>}
            </text>
          </g>
        )
      })}
      <rect x={px(0)} y={py(H)} width={W * s} height={H * s} rx={8} fill="url(#cab-light)" pointerEvents="none" />
      {racks.map(r => {
        const gx = px(W) + frame + 12, gy = py(r.y_cm)
        const ratio = r.capacity ? Math.min(1, r.count / r.capacity) : 0
        return (
          <g key={r.id}>
            {r.kind === 'shelf' && (r.present
              ? <><rect x={px(0)} y={gy} width={W * s} height={7} className="rack-rail" /><line x1={px(0)} x2={px(W)} y1={gy + 0.5} y2={gy + 0.5} className="rack-edge" /></>
              : <line x1={px(0)} x2={px(W)} y1={gy} y2={gy} className="rack-line removed" />)}
            {r.present
              ? <g className={`rack-gauge ${r.over_capacity ? 'over' : ''}`} aria-label={`${r.name}: ${r.count} of ${r.capacity}`}>
                  <rect x={gx} y={gy - 3} width={44} height={6} rx={3} className="gauge-track" />
                  <rect x={gx} y={gy - 3} width={44 * ratio} height={6} rx={3} className="gauge-fill" />
                  <text x={gx} y={gy + 22} className="rack-count">{r.count}/{r.capacity}</text>
                </g>
              : <text x={gx} y={gy + 6} className="rack-count">Out</text>}
          </g>
        )
      })}
      {sorted.map(b => {
        const back = b.layer === 'back'
        const sel = b.id === selectedId
        const rr = (D / 2) * s * (back ? 0.82 : 1) * (sel ? 1.15 : 1)
        const cls = `btl ${sel ? 'sel' : ''} ${highlight.has(b.id) ? 'hl' : ''} ${anySel && !sel ? 'dim' : ''}`
        const onClick = (e: RMouseEvent) => { if (!placing) { e.stopPropagation(); onSelect(b) } }
        const unsure = b.source === 'vision' && b.confidence != null && b.confidence < 0.8
        if (b.orientation === 'standing') {
          return <rect key={b.id} className={cls} onClick={onClick} style={{ fill: colorVar(b.wine.color) }}
                       x={px(b.x) - rr} y={py(b.y - D / 2 + 30)} width={rr * 2} height={30 * s} rx={rr} />
        }
        const cx = px(b.x), cy = py(b.y)
        return (
          // a glass bottle end seen through the door: shadow on the rail, tinted glass, rim lit from above, the dark punt
          <g key={b.id} className={cls} onClick={onClick}>
            <circle cx={cx} cy={cy} r={rr + 7} className="btl-ring" />
            {glass(b, cx, cy, rr, back)}
            {unsure && <circle cx={cx} cy={cy} r={rr + 5} className="btl-unsure" />}
          </g>
        )
      })}
      {ghosts.filter(g => g.cellar_id === cellar.id).map(g => (
        <g key={'g' + g.id} className="ghost" onClick={(e: RMouseEvent) => { e.stopPropagation(); onGhost(g) }}>
          <circle cx={px(g.payload.x)} cy={py(g.payload.y)} r={(D / 2) * s} />
          <text x={px(g.payload.x)} y={py(g.payload.y) + 7} textAnchor="middle">?</text>
        </g>
      ))}
      {selB && !placing && <Label x={px(selB.x)} y={py(selB.y) - (D / 2) * s * 1.15 - 12} text={`${selB.wine.name} ${selB.wine.vintage || 'NV'}`} max={width} />}
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * 3D view: dependency-free SVG projection (no WebGL needed on the
 * low-power cellar module). A solid smoked-glass cabinet seen through
 * its door, glass bottles with a neck and a visible bottle end, soft
 * shadows and depth fade. Drag to turn (with a little momentum),
 * presets ease into place, and it drifts gently when left alone.
 * ------------------------------------------------------------------ */
type V3 = [number, number, number]
type P2 = [number, number]

/* screen-saver build cycle (seconds): outline → walls → racks → bottles, hold, then apart in reverse */
const BUILD_CYCLE = 45, BUILD_HOLD = 20
const ease = (k: number) => 1 - Math.pow(1 - k, 3)
/** 0 before `inAt`, eases to 1, holds, eases back to 0 from `outAt`. */
function buildPart(t: number, inAt: number, inDur: number, outAt: number, outDur: number) {
  const a = Math.min(1, Math.max(0, (t - inAt) / inDur)), b = Math.min(1, Math.max(0, (t - outAt) / outDur))
  return ease(a) * (1 - ease(b))
}
interface Cam { yaw: number; pitch: number }

const PRESETS: [string, number, number][] = [['Front', 0, 0.05], ['Angle', -0.55, 0.32], ['Side', -1.45, 0.15], ['Top', 0, 1.3]]
const clampPitch = (p: number) => Math.max(-1.2, Math.min(1.35, p))
const pts = (ps: P2[]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

function View3D({ cellar, width, height, selectedId, highlight, onSelect, ambient }: Props) {
  const reduce = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const [cam, setCam] = useState<Cam>({ yaw: -0.55, pitch: 0.32 })
  const camRef = useRef(cam)
  camRef.current = cam
  const anim = useRef<number | null>(null)
  const lastInput = useRef(Date.now())
  const drag = useRef<{ x: number; y: number; cam: Cam; moved: number; bid: number | null; vx: number; vy: number; lx: number; ly: number; t: number } | null>(null)

  const W = cellar.width_cm, H = cellar.height_cm, Dp = cellar.depth_cm
  const BD = cellar.geometry.bottle_d, BL = cellar.geometry.bottle_l
  const dist = Math.max(W, H, Dp) * 2.4
  const f = (Math.min(width, height * 0.9) * 0.48 * dist) / (Math.max(W, H) * 0.55)
  const cx = width / 2, cy = height / 2 + 10

  /* ---- camera motion ---- */
  const stop = () => { if (anim.current !== null) { cancelAnimationFrame(anim.current); anim.current = null } }
  const touch = () => { stop(); lastInput.current = Date.now() }
  const tweenTo = (yaw: number, pitch: number) => {
    touch()
    if (reduce) { setCam({ yaw, pitch }); return }
    const from = camRef.current, t0 = performance.now(), D = 560
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3)
      setCam({ yaw: from.yaw + (yaw - from.yaw) * e, pitch: from.pitch + (pitch - from.pitch) * e })
      anim.current = k < 1 ? requestAnimationFrame(step) : null
    }
    anim.current = requestAnimationFrame(step)
  }
  const coast = (vx: number, vy: number) => {
    if (reduce) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(48, now - last) / 16.7
      last = now
      vx *= Math.pow(0.9, dt); vy *= Math.pow(0.9, dt)
      setCam(c => ({ yaw: c.yaw + vx * dt, pitch: clampPitch(c.pitch + vy * dt) }))
      anim.current = Math.abs(vx) + Math.abs(vy) > 0.0006 ? requestAnimationFrame(step) : null
    }
    anim.current = requestAnimationFrame(step)
  }
  // screen saver: one slow turn every ~2 minutes at ~20 fps (low power, the cellar module must stay cool),
  // while the cellar builds itself, holds, and takes itself apart again (BUILD_CYCLE seconds)
  const [clock, setClock] = useState(ambient && !reduce ? 0 : BUILD_HOLD)
  useEffect(() => {
    if (!ambient || reduce) return
    setCam({ yaw: -0.55, pitch: 0.26 })
    let last = 0
    const t0 = performance.now()
    const step = (now: number) => {
      if (now - last >= 50) {
        last = now
        setCam(c => ({ ...c, yaw: c.yaw + 0.0026 }))
        setClock(((now - t0) / 1000) % BUILD_CYCLE)
      }
      anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
    return stop
  }, [ambient, reduce]) // eslint-disable-line react-hooks/exhaustive-deps

  // left alone for 10 s: sway gently around the current angle (~30 fps, stops on any touch)
  useEffect(() => {
    if (reduce || ambient) return
    const t = setInterval(() => {
      if (anim.current !== null || drag.current || Date.now() - lastInput.current < 10_000) return
      const base = camRef.current.yaw, t0 = performance.now()
      let last = 0
      const step = (now: number) => {
        if (now - last >= 33) { last = now; setCam(c => ({ ...c, yaw: base + 0.32 * Math.sin((now - t0) / 4000) })) }
        anim.current = requestAnimationFrame(step)
      }
      anim.current = requestAnimationFrame(step)
    }, 1000)
    return () => { clearInterval(t); stop() }
  }, [reduce, ambient])

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    touch()
    const hit = (e.target as Element).closest?.('[data-bid]')
    drag.current = { x: e.clientX, y: e.clientY, cam: camRef.current, moved: 0, bid: hit ? Number(hit.getAttribute('data-bid')) : null,
                     vx: 0, vy: 0, lx: e.clientX, ly: e.clientY, t: performance.now() }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const now = performance.now(), dt = Math.max(1, now - d.t) / 16.7
    d.vx = ((e.clientX - d.lx) * 0.008) / dt; d.vy = ((e.clientY - d.ly) * 0.006) / dt
    d.lx = e.clientX; d.ly = e.clientY; d.t = now
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y))
    setCam({ yaw: d.cam.yaw + (e.clientX - d.x) * 0.008, pitch: clampPitch(d.cam.pitch + (e.clientY - d.y) * 0.006) })
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    lastInput.current = Date.now()
    if (!d) return
    if (d.moved < 10) {                       // a tap, not a drag
      const b = d.bid !== null ? cellar.bottles.find(x => x.id === d.bid) : null
      if (b) onSelect(b)
      return
    }
    if (performance.now() - d.t < 80) coast(d.vx, d.vy)
  }

  /* ---- projection ---- */
  const { yaw, pitch } = cam
  const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch)
  const rot = (x: number, y: number, z: number): V3 => {
    ;[x, z] = [x * cY + z * sY, -x * sY + z * cY]
    ;[y, z] = [y * cP - z * sP, y * sP + z * cP]
    return [x, y, z]
  }
  const proj = (p: V3): V3 => {
    const [x, y, z] = rot(p[0] - W / 2, p[1] - H / 2, p[2] - Dp / 2)
    const k = f / (dist + z)
    return [cx + x * k, cy - y * k, z]
  }
  const scale = (z: number) => f / (dist + z)
  const poly = (ps: V3[]) => pts(ps.map(proj).map(([x, y]) => [x, y] as P2))

  // build progress 0..1 for each part (always 1 outside the screen saver)
  const on = ambient && !reduce
  const be = on ? buildPart(clock, 0, 3, 40, 2) : 1                       // outline
  const bw = on ? buildPart(clock, 2.5, 2, 38.5, 1.5) : 1                  // walls, glass, LED
  const br = (k: number, n: number) => on ? buildPart(clock, 4 + (k / Math.max(1, n)) * 2.2, 0.9, 36.5 + ((n - 1 - k) / Math.max(1, n)) * 1.6, 0.6) : 1
  const bb = (k: number, n: number) => on ? buildPart(clock, 7 + (k / Math.max(1, n)) * 9, 0.9, 33 + ((n - 1 - k) / Math.max(1, n)) * 3.2, 0.6) : 1

  const scene = useMemo(() => {
    /* cabinet walls seen from inside: a face is drawn when its inner side looks at the camera */
    const faces: { cls: string; v: V3[]; n: V3 }[] = [
      { cls: 'wall3d back', v: [[0, 0, Dp], [W, 0, Dp], [W, H, Dp], [0, H, Dp]], n: [0, 0, -1] },
      { cls: 'wall3d side', v: [[0, 0, 0], [0, 0, Dp], [0, H, Dp], [0, H, 0]], n: [1, 0, 0] },
      { cls: 'wall3d side', v: [[W, 0, 0], [W, 0, Dp], [W, H, Dp], [W, H, 0]], n: [-1, 0, 0] },
      { cls: 'wall3d floor', v: [[0, 0, 0], [W, 0, 0], [W, 0, Dp], [0, 0, Dp]], n: [0, 1, 0] },
      { cls: 'wall3d ceil', v: [[0, H, 0], [W, H, 0], [W, H, Dp], [0, H, Dp]], n: [0, -1, 0] },
    ]
    const visible = (fc: (typeof faces)[number]) => {
      const c = fc.v.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4] as V3, [0, 0, 0] as V3)
      const pc = rot(c[0] - W / 2, c[1] - H / 2, c[2] - Dp / 2), n = rot(...fc.n)
      return n[0] * -pc[0] + n[1] * -pc[1] + n[2] * (-dist - pc[2]) > 0
    }
    const walls: ReactElement[] = []
    let ceilVisible = false
    faces.forEach((fc, i) => {
      if (!visible(fc)) return
      if (fc.cls.endsWith('ceil')) ceilVisible = true
      if (bw > 0) walls.push(<polygon key={'w' + i} points={poly(fc.v)} className={fc.cls} style={{ opacity: bw }} />)
    })
    if (ceilVisible && bw > 0) walls.push(<polygon key="led" points={poly([[3, H - 0.4, 1.5], [W - 3, H - 0.4, 1.5], [W - 3, H - 0.4, 4], [3, H - 0.4, 4]])} className="led3d" style={{ opacity: 0.55 * bw * bw }} />)
    // the outline that traces itself first (screen saver only)
    const edges: ReactElement[] = []
    if (ambient && be > 0) {
      const C: V3[] = [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], [0, 0, Dp], [W, 0, Dp], [W, H, Dp], [0, H, Dp]]
      const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
      E.forEach(([i, j], k) => {
        const a = proj(C[i]), b = proj(C[j])
        const e = Math.min(1, Math.max(0, be * 1.6 - (k / E.length) * 0.6))
        edges.push(<line key={'e' + k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - e} className="edge-build" />)
      })
    }

    const racks: ReactElement[] = []
    const rackOrder = [...cellar.racks].filter(r => r.kind !== 'floor').sort((a, b) => b.y_cm - a.y_cm).map(r => r.id)
    for (const r of cellar.racks) {
      if (r.kind === 'floor') continue
      const e = br(rackOrder.indexOf(r.id), rackOrder.length)
      if (e <= 0) continue
      const dz = -(1 - e) * Dp * 0.7                          // slides in through the door
      const plane: V3[] = [[0, r.y_cm, 2 + dz], [W, r.y_cm, 2 + dz], [W, r.y_cm, r.depth_cm + dz], [0, r.y_cm, r.depth_cm + dz]]
      const a = proj([0, r.y_cm, 2 + dz]), b = proj([W, r.y_cm, 2 + dz])
      racks.push(<g key={'r' + r.id} className={`rack3d ${r.present ? '' : 'removed'}`} style={{ opacity: e }}>
        <polygon points={poly(plane)} />
        {!!r.present && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="rail3d" />}
      </g>)
    }

    /* bottles: one silhouette (body, shoulder, neck), cylinder shading, the bottle end when it faces us */
    const shadows: ReactElement[] = []
    const bottles: { depth: number; el: ReactElement; label?: ReactElement }[] = []
    const depths = cellar.bottles.map(b => proj([b.x, b.y, b.z + BL / 2])[2])
    const dMin = Math.min(...depths), dMax = Math.max(...depths)
    const anySel = selectedId !== null && cellar.bottles.some(b => b.id === selectedId)
    const order = [...cellar.bottles].sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z).map(b => b.id)
    cellar.bottles.forEach((b, i) => {
      const e = bb(order.indexOf(b.id), order.length)
      if (e <= 0) return
      const sel = b.id === selectedId
      const standing = b.orientation === 'standing'
      const ax: V3 = standing ? [0, 1, 0] : [0, 0, 1]
      const z0 = Math.max(1, b.z - (sel ? 6 : 0)) - (1 - e) * 70   // slides in through the door to its spot
      const lift = (1 - e) * 6
      const A: V3 = standing ? [b.x, b.y - BD / 2 + lift, z0] : [b.x, b.y + lift, z0]
      const at = (t: number): V3 => [A[0] + ax[0] * BL * t, A[1] + ax[1] * BL * t, A[2] + ax[2] * BL * t]
      const r = BD / 2
      const prof: [number, number][] = [[0, r], [0.6, r], [0.74, r * 0.36], [0.95, r * 0.3]]   // (along axis, radius)
      const sp = prof.map(([t, rr]) => { const p = proj(at(t)); return { p, r: rr * scale(p[2]) } })
      const pa = sp[0].p, pe = sp[3].p
      let dx = sp[1].p[0] - pa[0], dy = sp[1].p[1] - pa[1]
      const len = Math.hypot(dx, dy) || 1
      dx /= len; dy /= len
      const nx = -dy, ny = dx
      const side = (s: number, q = 1) => sp.map(({ p, r: rr }) => [p[0] + nx * rr * s * q, p[1] + ny * rr * s * q] as P2)
      const outline = [...side(1), ...side(-1).reverse()]
      const lit = ny <= 0 ? 1 : -1                            // light comes from above
      const band = (from: number, to: number) => {
        const a1 = side(lit, from).slice(0, 2), a2 = side(lit, to).slice(0, 2)
        return pts([a1[0], a1[1], a2[1], a2[0]])
      }
      const rA = sp[0].r
      const ratio = Math.min(1, len / Math.max(0.01, BL * 0.6 * scale(pa[2])))
      const capRx = Math.max(0.6, rA * Math.sqrt(Math.max(0, 1 - ratio * ratio)))
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI
      const capFaces = pa[2] < pe[2]
      const cap = (
        <g transform={`translate(${pa[0].toFixed(1)} ${pa[1].toFixed(1)}) rotate(${ang.toFixed(1)})`}>
          <ellipse rx={capRx} ry={rA} className="btl-glass" style={{ fill: colorVar(b.wine.color) }} />
          {capFaces && <>
            <ellipse rx={capRx * 0.8} ry={rA * 0.8} className="btl-rim" />
            <ellipse rx={capRx * 0.36} ry={rA * 0.36} className="btl-punt" />
          </>}
        </g>
      )
      const dn = dMax > dMin ? (depths[i] - dMin) / (dMax - dMin) : 0
      const opacity = (1 - 0.4 * dn) * (anySel && !sel ? 0.45 : 1) * e
      const mid = (pa[2] + pe[2]) / 2
      bottles.push({
        depth: mid,
        el: (
          <g key={'b' + b.id} data-bid={b.id} className={`b3d ${sel ? 'sel' : ''} ${highlight.has(b.id) ? 'hl' : ''}`} style={{ opacity }}>
            {!capFaces && cap}
            <polygon points={pts(outline)} className="b3d-body" style={{ fill: colorVar(b.wine.color) }} />
            <polygon points={band(0.2, 0.5)} className="b3d-shine" />
            <polygon points={band(-0.55, -1)} className="b3d-shade" />
            {capFaces && cap}
          </g>
        ),
        label: sel ? <Label key="label" x={pa[0]} y={pa[1] - rA - 16} text={`${b.wine.name} ${b.wine.vintage || 'NV'}`} max={width} /> : undefined,
      })
      // soft shadow where the bottle rests
      const ys = b.y - BD / 2 + 0.3
      const w = BD * 0.55
      const sh: V3[] = standing
        ? Array.from({ length: 8 }, (_, k) => [b.x + Math.cos((k / 8) * Math.PI * 2) * w, ys, z0 + Math.sin((k / 8) * Math.PI * 2) * w] as V3)
        : [[b.x - w, ys, z0], [b.x + w, ys, z0], [b.x + w, ys, z0 + BL * 0.9], [b.x - w, ys, z0 + BL * 0.9]]
      shadows.push(<polygon key={'s' + b.id} points={poly(sh)} className="shadow3d" style={{ opacity: 0.5 * opacity }} />)
    })
    bottles.sort((p, q) => q.depth - p.depth)

    const door: V3[] = [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]]
    const streak: V3[] = [[W * 0.52, H, 0], [W * 0.64, H, 0], [W * 0.3, 0, 0], [W * 0.18, 0, 0]]
    return { walls, edges, racks, shadows, bottles, door, streak }
  }, [cellar, yaw, pitch, selectedId, highlight, width, height, clock]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="view3d" style={{ width, height }}>
      <svg width={width} height={height} className={`cellar-svg ${ambient ? '' : 'grab'}`}
           {...(ambient ? {} : { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp })}>
        <defs>
          <linearGradient id="wall3d-light" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2722" /><stop offset="0.45" stopColor="#121314" /><stop offset="1" stopColor="#0b0c0d" />
          </linearGradient>
        </defs>
        {scene.walls}
        {scene.edges}
        {scene.racks}
        {scene.shadows}
        {scene.bottles.map(b => b.el)}
        <g style={{ opacity: bw }}>
          <polygon points={poly(scene.door)} className="glass3d" />
          <polygon points={poly(scene.streak)} className="streak3d" />
          <polygon points={poly(scene.door)} className="frame3d" style={{ strokeWidth: Math.max(4, 3 * scale(proj([W / 2, H / 2, 0])[2])) }} />
        </g>
        {scene.bottles.map(b => b.label)}
      </svg>
      {!ambient && <div className="view3d-ctl">
        <span className="muted small">Drag to turn</span>
        <div className="seg mini">
          {PRESETS.map(([l, y, p]) => <button key={l} onClick={() => tweenTo(y, p)}>{l}</button>)}
        </div>
      </div>}
    </div>
  )
}

function Label({ x, y, text, max }: { x: number; y: number; text: string; max: number }) {
  const t = text.length > 32 ? text.slice(0, 31) + '…' : text
  const w = t.length * 11 + 32
  const lx = Math.max(4, Math.min(max - w - 4, x - w / 2)), ly = Math.max(4, y - 40)
  return (
    <g className="label3d" pointerEvents="none">
      <rect x={lx} y={ly} width={w} height={40} rx={20} />
      <text x={lx + w / 2} y={ly + 27} textAnchor="middle">{t}</text>
    </g>
  )
}
