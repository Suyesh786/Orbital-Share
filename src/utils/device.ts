import {
  STORAGE_KEYS,
  type DevicePlatform,
  type DeviceType,
  type PersistedDeviceState,
} from "@/types/device"

const MIN_USERNAME_LENGTH = 3
const MAX_USERNAME_LENGTH = 20

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    mobile?: boolean
    platform?: string
  }
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage may be unavailable in restricted contexts
  }
}

export function generateDeviceId(): string {
  return crypto.randomUUID()
}

export function getOrCreateDeviceId(): string {
  const existing = readStorage(STORAGE_KEYS.deviceId)
  if (existing) return existing

  const deviceId = generateDeviceId()
  writeStorage(STORAGE_KEYS.deviceId, deviceId)
  return deviceId
}

export function getStoredUsername(): string | null {
  return readStorage(STORAGE_KEYS.username)
}

export function setStoredUsername(username: string): void {
  writeStorage(STORAGE_KEYS.username, username)
}

export function isOnboardingComplete(): boolean {
  return readStorage(STORAGE_KEYS.onboarding) === "true"
}

export function setOnboardingComplete(completed: boolean): void {
  writeStorage(STORAGE_KEYS.onboarding, completed ? "true" : "false")
}

export function loadPersistedDeviceState(): PersistedDeviceState {
  return {
    username: getStoredUsername(),
    deviceId: readStorage(STORAGE_KEYS.deviceId),
    onboardingCompleted: isOnboardingComplete(),
  }
}

export function normalizeUsername(value: string): string {
  return value.trim()
}

export function isValidUsername(value: string): boolean {
  return normalizeUsername(value).length >= MIN_USERNAME_LENGTH
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value)
  if (
    normalized.length < MIN_USERNAME_LENGTH ||
    normalized.length > MAX_USERNAME_LENGTH
  ) {
    return null
  }
  return normalized
}

export function getUsernameValidationError(value: string): string | null {
  const normalized = normalizeUsername(value)
  if (!normalized) return "Username cannot be empty"
  if (normalized.length < MIN_USERNAME_LENGTH) {
    return `Use at least ${MIN_USERNAME_LENGTH} characters`
  }
  if (normalized.length > MAX_USERNAME_LENGTH) {
    return `Maximum ${MAX_USERNAME_LENGTH} characters`
  }
  return null
}

export function getUsernameInitial(username: string): string {
  const trimmed = normalizeUsername(username)
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?"
}

export function detectLocalDeviceMetadata(): {
  deviceType: DeviceType
  platform: DevicePlatform
} {
  if (typeof navigator === "undefined") {
    return {
      deviceType: "unknown",
      platform: "unknown",
    }
  }

  const browserNavigator = navigator as NavigatorWithUAData
  const userAgent = navigator.userAgent.toLowerCase()
  const platformHint = (
    browserNavigator.userAgentData?.platform ||
    navigator.platform ||
    ""
  ).toLowerCase()
  const isMobile =
    browserNavigator.userAgentData?.mobile ??
    /android|iphone|ipad|ipod|mobile/.test(userAgent)

  if (userAgent.includes("android")) {
    return { deviceType: "mobile", platform: "android" }
  }

  if (
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    userAgent.includes("ipod")
  ) {
    return { deviceType: "mobile", platform: "ios" }
  }

  if (platformHint.includes("mac") || userAgent.includes("mac os x")) {
    return { deviceType: "desktop", platform: "macos" }
  }

  if (platformHint.includes("win") || userAgent.includes("windows")) {
    return { deviceType: "desktop", platform: "windows" }
  }

  if (
    platformHint.includes("linux") ||
    platformHint.includes("x11") ||
    userAgent.includes("linux")
  ) {
    return {
      deviceType: isMobile ? "mobile" : "desktop",
      platform: isMobile ? "android" : "linux",
    }
  }

  if (isMobile) {
    return { deviceType: "mobile", platform: "unknown" }
  }

  return { deviceType: "unknown", platform: "unknown" }
}

export function getDefaultUsernamePlaceholder(): string {
  const { deviceType, platform } = detectLocalDeviceMetadata()

  if (platform === "macos") return "MacBook"
  if (platform === "windows") return "Desktop User"
  if (platform === "linux") return "Desktop User"
  if (platform === "android") return "Nearby Device"
  if (platform === "ios") return "Nearby Device"
  if (deviceType === "desktop") return "Desktop User"
  if (deviceType === "mobile") return "Nearby Device"
  return "Nearby Device"
}

export const USERNAME_MIN_LENGTH = MIN_USERNAME_LENGTH
export const USERNAME_MAX_LENGTH = MAX_USERNAME_LENGTH
