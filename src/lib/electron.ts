/** True when running inside the Electron renderer (desktop shell). */
export function isElectron(): boolean {
  if (typeof navigator === "undefined") return false
  return navigator.userAgent.includes("Electron")
}
