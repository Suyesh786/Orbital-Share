import type { OrbitalPlacement } from "@/utils/orbitalPlacement"
import { computePlacementAvoiding } from "@/utils/orbitalPlacement"

/** Stable radar positions keyed by deviceId (survives discovery polls). */
const placementByDeviceId = new Map<string, OrbitalPlacement>()

export function getStablePlacement(deviceId: string): OrbitalPlacement | undefined {
  return placementByDeviceId.get(deviceId)
}

export function setStablePlacement(
  deviceId: string,
  placement: OrbitalPlacement
): void {
  placementByDeviceId.set(deviceId, placement)
}

export function removeStablePlacement(deviceId: string): void {
  placementByDeviceId.delete(deviceId)
}

export function clearDiscoveryLayoutRegistry(): void {
  placementByDeviceId.clear()
}

export function getAllStablePlacements(): OrbitalPlacement[] {
  return [...placementByDeviceId.values()]
}

/**
 * Returns existing placement or assigns a new collision-safe position.
 */
export function resolveStablePlacement(deviceId: string): OrbitalPlacement {
  const existing = placementByDeviceId.get(deviceId)
  if (existing) return existing

  const placement = computePlacementAvoiding(getAllStablePlacements(), deviceId)
  placementByDeviceId.set(deviceId, placement)
  return placement
}

/**
 * Drop placements for devices no longer discovered.
 */
export function pruneStablePlacements(activeDeviceIds: string[]): void {
  const active = new Set(activeDeviceIds)
  for (const id of placementByDeviceId.keys()) {
    if (!active.has(id)) {
      placementByDeviceId.delete(id)
    }
  }
}
