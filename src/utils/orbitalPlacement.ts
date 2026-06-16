/**
 * Dynamic orbital node placement with collision avoidance (discovery radar UI).
 */

export interface OrbitalPlacement {
  angle: number
  /** Pixel distance from radar center */
  radiusPx: number
  /** Legacy ring index for float animation timing */
  orbit: number
}

const RADAR_HALF = 160
const NODE_HALF = 28
const MIN_RADIUS = 88
const MAX_RADIUS = 132
const MIN_NODE_DISTANCE = 76
const MAX_PLACEMENT_ATTEMPTS = 48

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededUnit(seed: number, salt: number): number {
  const x = Math.sin((seed + salt) * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function polarToXY(angleDeg: number, radiusPx: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: Math.cos(rad) * radiusPx,
    y: Math.sin(rad) * radiusPx,
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function isInsideRadar(x: number, y: number): boolean {
  const max = RADAR_HALF - NODE_HALF - 10
  return Math.hypot(x, y) <= max
}

function collides(
  candidate: { x: number; y: number },
  placed: { x: number; y: number }[]
): boolean {
  return placed.some((p) => distance(candidate, p) < MIN_NODE_DISTANCE)
}

/**
 * Assigns non-overlapping polar positions for discovery nodes.
 * Uses per-device seed + list salt for organic but stable layout between polls.
 */
export function computeOrbitalPlacements(
  deviceIds: string[],
  listSalt = 0
): OrbitalPlacement[] {
  const count = deviceIds.length
  if (count === 0) return []

  const placed: { x: number; y: number }[] = []
  const results: OrbitalPlacement[] = []

  for (let index = 0; index < count; index++) {
    const id = deviceIds[index]
    const baseSeed = hashSeed(`${id}:${listSalt}`)

    let chosen: OrbitalPlacement | null = null

    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      const attemptSeed = baseSeed + attempt * 997 + index * 31
      const angle =
        seededUnit(attemptSeed, 1) * 360 +
        (360 / count) * index * 0.35
      const radiusPx =
        MIN_RADIUS +
        seededUnit(attemptSeed, 2) * (MAX_RADIUS - MIN_RADIUS)

      const { x, y } = polarToXY(angle, radiusPx)
      if (!isInsideRadar(x, y)) continue
      if (collides({ x, y }, placed)) continue

      placed.push({ x, y })
      const orbit = radiusPx < (MIN_RADIUS + MAX_RADIUS) / 2 ? 1 : 2
      chosen = { angle: ((angle % 360) + 360) % 360, radiusPx, orbit }
      break
    }

    if (!chosen) {
      const fallbackAngle = (360 / count) * index - 90
      const fallbackRadius =
        MIN_RADIUS + (index % 3) * ((MAX_RADIUS - MIN_RADIUS) / 2)
      const { x, y } = polarToXY(fallbackAngle, fallbackRadius)
      placed.push({ x, y })
      chosen = {
        angle: fallbackAngle,
        radiusPx: fallbackRadius,
        orbit: (index % 2) + 1,
      }
    }

    results.push(chosen)
  }

  return results
}

/**
 * Single-device placement avoiding existing radar nodes.
 */
export function computePlacementAvoiding(
  existing: OrbitalPlacement[],
  deviceId: string
): OrbitalPlacement {
  const placed = existing.map((p) => polarToXY(p.angle, p.radiusPx))
  const baseSeed = hashSeed(deviceId)

  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
    const attemptSeed = baseSeed + attempt * 997
    const angle = seededUnit(attemptSeed, 1) * 360
    const radiusPx =
      MIN_RADIUS + seededUnit(attemptSeed, 2) * (MAX_RADIUS - MIN_RADIUS)
    const { x, y } = polarToXY(angle, radiusPx)
    if (!isInsideRadar(x, y)) continue
    if (collides({ x, y }, placed)) continue

    const orbit = radiusPx < (MIN_RADIUS + MAX_RADIUS) / 2 ? 1 : 2
    return { angle: ((angle % 360) + 360) % 360, radiusPx, orbit }
  }

  const fallbackAngle = (hashSeed(deviceId) % 360) - 90
  const fallbackRadius =
    MIN_RADIUS + (hashSeed(`${deviceId}:r`) % 100) / 100 * (MAX_RADIUS - MIN_RADIUS)

  return {
    angle: fallbackAngle,
    radiusPx: fallbackRadius,
    orbit: fallbackRadius < (MIN_RADIUS + MAX_RADIUS) / 2 ? 1 : 2,
  }
}
