import { Laptop, Smartphone } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { TrustedBadge } from "@/components/trust/TrustedBadge"
import { isTrustedDevice } from "@/lib/trustedDevices"
import {
  selectNearbyDevices,
  selectSelectedReceiver,
  selectCanRequestTransfer,
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
  const trusted = isTrustedDevice(device.id)

  return (
    <motion.button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-cyan-400/40 bg-cyan-500/10"
          : trusted
            ? "border-cyan-400/20 bg-cyan-500/[0.06] hover:border-cyan-400/35 hover:shadow-[0_0_20px_rgba(61,217,245,0.12)]"
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
        <p
          className={cn(
            "truncate text-[13px] font-medium",
            trusted
              ? "text-cyan-200/95 [text-shadow:0_0_14px_rgba(61,217,245,0.28)]"
              : "text-white"
          )}
        >
          {device.username}
          {trusted && (
            <>
              {" "}
              <TrustedBadge variant="subtle" className="inline" />
            </>
          )}
        </p>
        <p className="text-[10px] capitalize text-white/35">
          {device.deviceType} · {device.status}
        </p>
      </div>
      <SignalBars strength={device.signalStrength} />
    </motion.button>
  )
}

interface DiscoveryDeviceListProps {
  onRequestTransfer: (device: NearbyDevice) => void
}

export function DiscoveryDeviceList({ onRequestTransfer }: DiscoveryDeviceListProps) {
  const devices = useTransferStore(selectNearbyDevices)
  const selectedReceiver = useTransferStore(selectSelectedReceiver)
  const canSelect = useTransferStore(selectCanRequestTransfer)

  if (!devices.length) return null

  return (
    <div className="mt-4 flex max-h-[140px] flex-col gap-1.5 overflow-y-auto scrollbar-thin px-1">
      <AnimatePresence mode="popLayout" initial={false}>
        {devices.map((device) => (
          <motion.div
            key={device.id}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <DeviceRow
              device={device}
              selected={selectedReceiver?.socketId === device.socketId}
              onSelect={() => canSelect && onRequestTransfer(device)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
