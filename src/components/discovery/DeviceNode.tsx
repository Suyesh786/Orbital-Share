import { motion } from "framer-motion"
import { Laptop, Smartphone } from "lucide-react"
import { TrustedBadge } from "@/components/trust/TrustedBadge"
import { isTrustedDevice } from "@/lib/trustedDevices"
import type { NearbyDevice } from "@/types/device"
import { cn } from "@/lib/utils"

const ICONS = {
  mac: Laptop,
  android: Smartphone,
} as const

interface DeviceNodeProps {
  device: NearbyDevice
  selected: boolean
  onSelect: () => void
  interactive: boolean
  showJoinPulse?: boolean
}

export function DeviceNode({
  device,
  selected,
  onSelect,
  interactive,
  showJoinPulse = false,
}: DeviceNodeProps) {
  const Icon = ICONS[device.deviceType]
  const trusted = isTrustedDevice(device.id)
  const radius = device.radiusPx ?? 70 + device.orbit * 60
  const x = Math.cos((device.angle * Math.PI) / 180) * radius
  const y = Math.sin((device.angle * Math.PI) / 180) * radius
  const offsetX = x - 28
  const floatY = y - 28
  const driftPhase = (device.angle + device.id.length * 17) % 360
  const canSelect = interactive && device.status === "available"

  return (
    <motion.button
      type="button"
      disabled={!canSelect}
      onClick={onSelect}
      className={cn(
        "absolute left-1/2 top-1/2 z-10 flex w-14 flex-col items-center gap-1",
        canSelect ? "cursor-pointer" : "cursor-default opacity-60"
      )}
      initial={false}
      animate={{
        x: [offsetX, offsetX + Math.cos(driftPhase) * 2, offsetX],
        y: [floatY, floatY - 5, floatY + 1, floatY],
      }}
      transition={{
        opacity: { duration: 0.5 },
        scale: { type: "spring", stiffness: 300, damping: 20 },
        x: {
          duration: 5 + device.orbit * 0.6,
          repeat: Infinity,
          ease: "easeInOut",
        },
        y: {
          duration: 3.5 + device.orbit * 0.5,
          repeat: Infinity,
          ease: "easeInOut",
        },
      }}
      whileHover={canSelect ? { scale: trusted ? 1.12 : 1.1 } : undefined}
    >
      {showJoinPulse && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl border border-cyan-400/50"
          initial={{ opacity: 0.7, scale: 1 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          aria-hidden
        />
      )}
      <div
        className={cn(
          "relative flex size-14 items-center justify-center rounded-2xl glass-panel transition-all",
          trusted &&
            !selected &&
            "border-cyan-400/25 shadow-[0_0_18px_rgba(61,217,245,0.22)]",
          selected &&
            "border-cyan-400/50 shadow-[0_0_24px_rgba(61,217,245,0.4)]",
          canSelect &&
            !selected &&
            (trusted
              ? "hover:border-cyan-400/45 hover:shadow-[0_0_28px_rgba(61,217,245,0.35)]"
              : "hover:border-cyan-500/30")
        )}
      >
        {selected && (
          <motion.div
            className="absolute inset-0 rounded-2xl bg-cyan-500/10"
            layoutId="device-glow"
          />
        )}
        <Icon
          className={cn(
            "relative size-6",
            selected || trusted ? "text-cyan-300" : "text-white/70"
          )}
        />
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 size-2 rounded-full",
            device.status === "available" && "bg-emerald-400",
            device.status === "busy" && "bg-amber-400",
            device.status === "offline" && "bg-white/25"
          )}
          aria-hidden
        />
      </div>
      <div className="flex max-w-[96px] flex-col items-center gap-0.5">
        <span
          className={cn(
            "w-full truncate text-center text-[10px] font-medium",
            selected || trusted
              ? "text-cyan-300/95 [text-shadow:0_0_12px_rgba(61,217,245,0.35)]"
              : "text-white/50"
          )}
        >
          {device.username}
        </span>
        {trusted && <TrustedBadge variant="subtle" />}
      </div>
    </motion.button>
  )
}
