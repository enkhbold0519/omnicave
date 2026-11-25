export type Color = 'red' | 'white' | 'sparkling' | 'rose'

export interface Wine {
  id?: number
  name: string
  producer: string
  region?: string | null
  country?: string | null
  grape?: string | null
  color: Color
  vintage: number
  drink_from?: number
  drink_to?: number
  base_price?: number
}

export interface Market { price: number; change_12m: number; currency: string; source: string }

export interface Reading { temp: number; hum: number; ts: string }

export interface Bottle {
  id: number
  serial: string
  cellar_id: number
  cellar_name?: string
  /** free 3D position in cm: x from left wall, y from floor, z from the door */
  x: number
  y: number
  z: number
  orientation: 'lying' | 'standing'
  level: number
  rack_id: number | null
  rack_name: string | null
  layer: 'front' | 'back'
  location: string
  source: 'manual' | 'vision'
  confidence: number | null
  added_at: string
  wine: Wine
  window_status: 'ready' | 'young' | 'past-peak'
  drinking_advice?: string | null
  market: Market
  zone?: { id: number; name: string; latest: Reading | null } | null
  warnings?: string[]
}

export interface Rack {
  id: number
  name: string
  kind: 'shelf' | 'floor'
  y_cm: number
  depth_cm: number
  capacity: number
  present: number
  count: number
  base_count: number
  over_capacity: boolean
}

export interface Device {
  id: number
  uid: string
  name: string | null
  model?: string | null
  kind: string
  cellar_id: number | null
  cellar_name?: string | null
  last_seen: string | null
  last_scan?: string | null
  last_telemetry?: string | null
  online: boolean
}

export interface ScanResult {
  detections: number
  unchanged: number
  occluded: number
  moved: { bottle_id: number; label: string }[]
  new: (Detection['payload'] & { detection_id: number })[]
  removed: { bottle_id: number; label: string }[]
  missing: string[]
  simulated?: { event: string; wine?: string }
  provider?: string
}

export interface Zone {
  id: number
  name: string
  y_from: number
  y_to: number
  target_temp: number
  target_hum: number
  temp_min: number
  temp_max: number
  hum_min: number
  hum_max: number
  alert_minutes: number
  latest: Reading | null
}

export interface EnvZone extends Zone {
  history: Reading[]
  sensor_online: boolean
  simulated_disconnect: boolean
  simulated_spike: boolean
  hum_stability: number | null
  in_range: boolean
}

export interface Cellar {
  id: number
  name: string
  model?: string | null
  width_cm: number
  height_cm: number
  depth_cm: number
  bottle_count?: number
  racks: Rack[]
  zones: Zone[]
  bottles: Bottle[]
  devices: Device[]
  bottles_out_with_racks: number
  geometry: { bottle_d: number; bottle_l: number; stack_step: number }
}

export type CellarSummary = Pick<Cellar, 'id' | 'name' | 'model' | 'width_cm' | 'height_cm' | 'depth_cm' | 'bottle_count' | 'devices'>

export interface User {
  id: number
  username: string
  email: string
  display_name: string
  preferences: { styles?: string[]; regions?: string[]; grapes?: string[]; likes?: string; dislikes?: string }
  briefing_time: string
  birth_date?: string | null
  email_verified?: boolean
  /** a new address waiting for its emailed code */
  pending_email?: string | null
  /** latest decision per consent key (terms, privacy, overseas, marketing; 'legacy' for old accounts) */
  consents?: Record<string, boolean>
}

/** GET /api/legal: what the sign-up screen asks the user to agree to, and the full texts. */
export interface Consent { key: string; required: boolean; title: string; summary: string; document: 'terms' | 'privacy' | null }
export interface LegalInfo { version: string; consents: Consent[]; documents: { terms: string; privacy: string } }

export interface Notification {
  id: number
  kind: string
  level: 'info' | 'warning' | 'critical'
  message: string
  read: number
  created_at: string
}

export interface Detection {
  id: number
  kind: string
  status: string
  cellar_id: number
  payload: {
    wine: Partial<Wine> & { name: string; producer: string }
    x: number
    y: number
    z: number
    level: number
    rack_id: number | null
    rack_name: string
    stacked: boolean
    confidence: number
    note: string | null
    tag: string
    orientation: 'lying' | 'standing'
  }
}

export type Scoring = 'hundred' | 'twenty' | 'stars'
export type Focus = 'old-world' | 'new-world' | 'everywhere'
export type Love = 'power' | 'elegance' | 'acidity' | 'oak' | 'fruit' | 'age' | 'value' | 'terroir'
export type Tone = 'formal' | 'warm' | 'playful' | 'blunt'
export interface PersonaTraits { scoring: Scoring; focus: Focus; loves: Love[]; strictness: number; tone: Tone; description: string }
/** A sommelier at the tasting table: built-in (server, read-only) or the user's own. */
export interface Persona {
  id: string; name: string; title: string; color: string; lora_adapter?: string
  built_in?: boolean; traits?: PersonaTraits; philosophy?: string; memory?: string[]
}

export interface LlmInfo { provider: string; model: string; configured: boolean; lora_swapping: boolean }

export type StreamEvent =
  | { type: 'items'; items: Bottle[]; purchase?: (Wine & { market: Market })[]; profile?: unknown }
  | { type: 'delta'; text: string; persona?: string }
  | { type: 'meta'; personas?: Persona[]; provider: LlmInfo }
  | { type: 'pick'; persona: string; bottle: Bottle }
  | { type: 'turn'; persona: string; name: string; title: string; color: string; adapter?: string }
  | { type: 'turn_end'; persona: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

/** GET /api/bottles/{id}/drinking-note: model-written when the backend has an LLM, else the fixed line. */
export interface DrinkingNote {
  bottle_id: number
  window: { from: number | null; to: number | null }
  text: string | null
  source: 'model' | 'template'
}