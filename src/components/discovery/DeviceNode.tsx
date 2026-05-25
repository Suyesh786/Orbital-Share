import { motion } from "framer-motion"
import { Laptop, Smartphone } from "lucide-react"
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
}

export function DeviceNode({
  device,
  selected,
  onSelect,
  interactive,
}: DeviceNodeProps) {
  const Icon = ICONS[device.deviceType]
  const radius = 70 + device.orbit * 60
  const x = Math.cos((device.angle * Math.PI) / 180) * radius
  const y = Math.sin((device.angle * Math.PI) / 180) * radius
  const offsetX = x - 28
  const floatY = y - 28
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
      initial={{ opacity: 0, scale: 0, x: offsetX, y: floatY }}
      animate={{
        opacity: 1,
        scale: 1,
        x: offsetX,
        y: [floatY, floatY - 4, floatY],
      }}
      transition={{
        opacity: { duration: 0.5 },
        scale: { type: "spring", stiffness: 300, damping: 20 },
        y: { duration: 3 + device.orbit, repeat: Infinity, ease: "easeInOut" },
      }}
      whileHover={canSelect ? { scale: 1.1 } : undefined}
    >
      <div
        className={cn(
          "relative flex size-14 items-center justify-center rounded-2xl glass-panel transition-all",
          selected &&
            "border-cyan-400/50 shadow-[0_0_24px_rgba(61,217,245,0.4)]",
          canSelect && !selected && "hover:border-cyan-500/30"
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
            selected ? "text-cyan-300" : "text-white/70"
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
      <span
        className={cn(
          "max-w-[80px] truncate text-[10px] font-medium",
          selected ? "text-cyan-300" : "text-white/50"
        )}
      >
        {device.username}
      </span>
    </motion.button>
  )
}
