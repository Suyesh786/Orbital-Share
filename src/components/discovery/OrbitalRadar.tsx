import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Monitor } from "lucide-react"
import { DeviceNode } from "@/components/discovery/DeviceNode"
import { OrbitRings } from "@/components/discovery/OrbitRings"
import {
  selectNearbyDevices,
  selectSelectedReceiver,
  selectRequestTransferToReceiver,
  selectTransferState,
  useTransferStore,
} from "@/store/useTransferStore"
import type { NearbyDevice } from "@/types/device"

export function OrbitalRadar() {
  const nearbyDevices = useTransferStore(selectNearbyDevices)
  const selectedReceiver = useTransferStore(selectSelectedReceiver)
  const requestTransfer = useTransferStore(selectRequestTransferToReceiver)
  const transferState = useTransferStore(selectTransferState)
  const canSelect = transferState === "discovering"
  const [visibleDevices, setVisibleDevices] = useState<NearbyDevice[]>([])

  useEffect(() => {
    if (!nearbyDevices.length) {
      setVisibleDevices([])
      return
    }

    const timeouts: ReturnType<typeof setTimeout>[] = []
    setVisibleDevices([])

    nearbyDevices.forEach((device, index) => {
      const timeout = setTimeout(() => {
        setVisibleDevices((prev) => [...prev, device])
      }, 400 + index * 450)
      timeouts.push(timeout)
    })

    return () => timeouts.forEach(clearTimeout)
  }, [nearbyDevices])

  return (
    <div className="relative mx-auto flex h-[320px] w-full max-w-md items-center justify-center">
      <OrbitRings />

      <motion.div
        className="relative z-20 flex size-16 flex-col items-center justify-center rounded-2xl glass-panel glow-cyan"
        animate={{
          boxShadow: [
            "0 0 20px rgba(61,217,245,0.2)",
            "0 0 40px rgba(61,217,245,0.35)",
            "0 0 20px rgba(61,217,245,0.2)",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <Monitor className="size-7 text-cyan-400" />
        <span className="mt-0.5 text-[9px] font-medium text-white/50">You</span>
      </motion.div>

      {visibleDevices.map((device) => (
        <DeviceNode
          key={device.id}
          device={device}
          selected={selectedReceiver?.socketId === device.socketId}
          onSelect={() => canSelect && requestTransfer(device)}
          interactive={canSelect}
        />
      ))}
    </div>
  )
}
