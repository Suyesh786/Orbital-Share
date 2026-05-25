import { Laptop, Smartphone } from "lucide-react"
import { motion } from "framer-motion"
import {
  selectNearbyDevices,
  selectSelectedReceiver,
  selectRequestTransferToReceiver,
  selectTransferState,
  useTransferStore,
} from "@/store/useTransferStore"
import type { NearbyDevice } from "@/types/device"
import { cn } from "@/lib/utils"

const TYPE_ICONS = {
  mac: Laptop,
  android: Smartphone,
} as const

function SignalBars({ strength }: { strength: number }) {
  const bars = 4
  const active = Math.round((strength / 100) * bars)

  return (
    <div className="flex items-end gap-0.5" aria-label={`Signal ${strength}%`}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-0.5 rounded-full bg-cyan-400/80",
            i < active ? "opacity-100" : "opacity-20",
            i === 0 && "h-1",
            i === 1 && "h-1.5",
            i === 2 && "h-2",
            i === 3 && "h-2.5"
          )}
        />
      ))}
    </div>
  )
}

function DeviceRow({
  device,
  selected,
  onSelect,
}: {
  device: NearbyDevice
  selected: boolean
  onSelect: () => void
}) {
  const Icon = TYPE_ICONS[device.deviceType]
  const selectable = device.status === "available"

  return (
    <motion.button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-cyan-400/40 bg-cyan-500/10"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/12",
        !selectable && "cursor-not-allowed opacity-50"
      )}
      whileHover={selectable ? { x: 2 } : undefined}
      whileTap={selectable ? { scale: 0.99 } : undefined}
    >
      <div className="flex size-9 items-center justify-center rounded-lg glass-panel">
        <Icon className="size-4 text-cyan-300/90" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white">
          {device.username}
        </p>
        <p className="text-[10px] capitalize text-white/35">
          {device.deviceType} · {device.status}
        </p>
      </div>
      <SignalBars strength={device.signalStrength} />
    </motion.button>
  )
}

export function DiscoveryDeviceList() {
  const devices = useTransferStore(selectNearbyDevices)
  const selectedReceiver = useTransferStore(selectSelectedReceiver)
  const requestTransfer = useTransferStore(selectRequestTransferToReceiver)
  const transferState = useTransferStore(selectTransferState)
  const canSelect = transferState === "discovering"

  if (!devices.length) return null

  return (
    <div className="mt-4 flex max-h-[140px] flex-col gap-1.5 overflow-y-auto scrollbar-thin px-1">
      {devices.map((device) => (
        <DeviceRow
          key={device.socketId}
          device={device}
          selected={selectedReceiver?.socketId === device.socketId}
          onSelect={() => canSelect && requestTransfer(device)}
        />
      ))}
    </div>
  )
}
