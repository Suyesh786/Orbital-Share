/**
 * Client-side authoritative session identity (server-issued only).
 */
export interface TransferSessionIdentity {
  transferId: string
  sessionToken: string
  senderSocketId: string
  receiverSocketId: string
}

export function isValidSessionToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 32
}

export function buildSessionIdentity(
  payload: {
    transferId: string
    sessionToken: string
    senderSocketId: string
    receiverSocketId: string
  },
  localSocketId: string
): TransferSessionIdentity | null {
  if (!payload.transferId || !isValidSessionToken(payload.sessionToken)) {
    return null
  }
  if (
    localSocketId !== payload.senderSocketId &&
    localSocketId !== payload.receiverSocketId
  ) {
    return null
  }
  return {
    transferId: payload.transferId,
    sessionToken: payload.sessionToken,
    senderSocketId: payload.senderSocketId,
    receiverSocketId: payload.receiverSocketId,
  }
}
