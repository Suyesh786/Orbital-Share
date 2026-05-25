import { AnimatePresence, motion } from "framer-motion"
import { File } from "lucide-react"
import { ProfileAvatar } from "@/components/profile/ProfileAvatar"
import { GlowButton } from "@/components/shared/GlowButton"
import {
  selectAcceptIncomingTransferRequest,
  selectIncomingTransferRequest,
  selectRejectIncomingTransferRequest,
  useTransferStore,
} from "@/store/useTransferStore"
import { formatFileSize } from "@/lib/format"

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const },
  },
}

export function IncomingTransferRequestModal() {
  const request = useTransferStore(selectIncomingTransferRequest)
  const acceptRequest = useTransferStore(selectAcceptIncomingTransferRequest)
  const rejectRequest = useTransferStore(selectRejectIncomingTransferRequest)

  const fileLabel =
    request && request.fileCount === 1
      ? "1 file"
      : `${request?.fileCount ?? 0} files`

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="incoming-transfer-title"
        >
          <motion.div
            className="glass-panel glow-cyan w-full max-w-[320px] rounded-2xl border border-cyan-400/20 p-5"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="flex items-center gap-3">
              <ProfileAvatar username={request.senderUsername} size="lg" />
              <div className="min-w-0 flex-1">
                <p
                  id="incoming-transfer-title"
                  className="truncate text-base font-semibold text-white"
                >
                  {request.senderUsername}
                </p>
                <p className="text-sm text-white/45">wants to send files</p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-cyan-500/10">
                <File className="size-4 text-cyan-300/90" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-white/85">
                  {fileLabel}
                </p>
                <p className="text-[11px] text-white/40">
                  {formatFileSize(request.totalSize)} total
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <motion.button
                type="button"
                onClick={rejectRequest}
                className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-white/55 transition-colors hover:border-white/20 hover:text-white/75"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                Reject
              </motion.button>
              <GlowButton className="flex-1" onClick={acceptRequest}>
                Accept
              </GlowButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
