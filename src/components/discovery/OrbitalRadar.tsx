import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Monitor } from "lucide-react"
import { DeviceNode } from "@/components/discovery/DeviceNode"
import { OrbitAmbientParticles } from "@/components/discovery/OrbitAmbientParticles"
import { OrbitRings } from "@/components/discovery/OrbitRings"
import {
  selectNearbyDevices,
  selectSelectedReceiver,
  selectCanRequestTransfer,
  useTransferStore,
} from "@/store/useTransferStore"
import type { NearbyDevice } from "@/types/device"

interface OrbitalRadarProps {
  onRequestTransfer: (device: NearbyDevice) => void
}

export function OrbitalRadar({ onRequestTransfer }: OrbitalRadarProps) {
  const nearbyDevices = useTransferStore(selectNearbyDevices)
  const selectedReceiver = useTransferStore(selectSelectedReceiver)
  const canSelect = useTransferStore(selectCanRequestTransfer)
  const seenDeviceIdsRef = useRef(new Set<string>())
  const [joinPulseIds, setJoinPulseIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (nearbyDevices.length === 0) {
      seenDeviceIdsRef.current.clear()
      setJoinPulseIds(new Set())
      return
    }

    const newlyJoined = new Set<string>()
    for (const device of nearbyDevices) {
      if (!seenDeviceIdsRef.current.has(device.id)) {
        newlyJoined.add(device.id)
      }
      seenDeviceIdsRef.current.add(device.id)
    }

    for (const id of [...seenDeviceIdsRef.current]) {
      if (!nearbyDevices.some((d) => d.id === id)) {
        seenDeviceIdsRef.current.delete(id)
      }
    }

    if (newlyJoined.size > 0) {
      setJoinPulseIds(newlyJoined)
      const timer = window.setTimeout(() => setJoinPulseIds(new Set()), 1400)
      return () => window.clearTimeout(timer)
    }
  }, [nearbyDevices])

  return (
    <div className="relative mx-auto flex h-[320px] w-full max-w-md items-center justify-center">
      <OrbitRings />
      <OrbitAmbientParticles />

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

      <AnimatePresence mode="popLayout">
        {nearbyDevices.map((device) => (
          <motion.div
            key={device.id}
            className="absolute left-1/2 top-1/2 z-10"
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            layout
            layoutId={`radar-node-${device.id}`}
          >
            <DeviceNode
              device={device}
              selected={selectedReceiver?.socketId === device.socketId}
              onSelect={() => canSelect && onRequestTransfer(device)}
              interactive={canSelect}
              showJoinPulse={joinPulseIds.has(device.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
