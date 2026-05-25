const IS_DEV = process.env.NODE_ENV !== "production"

/**
 * @param {string} tag
 * @param {string} detail
 */
export function logProduction(tag, detail) {
  if (!IS_DEV) return
  console.log(`[${tag}] ${detail}`)
}
