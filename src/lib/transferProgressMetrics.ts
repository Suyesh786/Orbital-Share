let lastSampleAt = 0
let lastSampleBytes = 0

export function resetProgressMetricsSample(): void {
  lastSampleAt = 0
  lastSampleBytes = 0
}

export function computeTransferMetrics(
  bytesTransferred: number,
  totalBytes: number
): {
  progress: number
  speed: number
  estimatedTimeRemaining: number
} {
  const now = Date.now()
  const elapsedSec =
    lastSampleAt > 0 ? Math.max((now - lastSampleAt) / 1000, 0.001) : 0
  const deltaBytes = Math.max(0, bytesTransferred - lastSampleBytes)
  const speed = lastSampleAt > 0 ? deltaBytes / elapsedSec : 0

  lastSampleAt = now
  lastSampleBytes = bytesTransferred

  const progress =
    totalBytes > 0
      ? Math.min(100, (bytesTransferred / totalBytes) * 100)
      : 0
  const remainingBytes = Math.max(0, totalBytes - bytesTransferred)
  const estimatedTimeRemaining =
    speed > 0 && remainingBytes > 0 ? remainingBytes / speed : 0

  return { progress, speed, estimatedTimeRemaining }
}
