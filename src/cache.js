const cache = new Map()

export function getCache(key, ttlMs = 60000) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key)
    return null
  }
  return entry.data
}

export function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() })
}

export function clearCache(key) {
  if (key) cache.delete(key)
  else cache.clear()
}

export function invalidatePrefix(prefix) {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k)
  }
}
