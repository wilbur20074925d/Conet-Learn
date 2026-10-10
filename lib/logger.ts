// lib/logger.ts
// Use Web Crypto API for Edge Runtime compatibility
function generateUUID(): string {
  // Web Crypto API is available in Edge Runtime
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  // Fallback for Node.js runtime (though should not be needed in Edge)
  // Simple UUID v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatNow() {
  const d = new Date()
  return d.toISOString()
}

export function getRequestIdFromHeaders(headers?: Headers | Record<string, string | string[] | undefined>): string | undefined {
  if (!headers) return undefined
  if (headers instanceof Headers) return headers.get('x-request-id') || undefined
  const v = (headers as Record<string, string | string[] | undefined>)['x-request-id']
  return Array.isArray(v) ? v[0] : v
}

export function ensureRequestId(current?: string | null): string {
  return current && current.length > 0 ? current : generateUUID()
}

export function createLogger(scope: string, requestId?: string) {
  const base = `[${formatNow()}] [${scope}]${requestId ? ` [rid:${requestId}]` : ''}`
  const log = (level: LogLevel, message: string, extra?: unknown) => {
    const line = `${base} ${level.toUpperCase()}: ${message}`
    if (extra !== undefined) {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](line, extra)
    } else {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](line)
    }
  }
  return {
    debug: (m: string, e?: unknown) => log('debug', m, e),
    info: (m: string, e?: unknown) => log('info', m, e),
    warn: (m: string, e?: unknown) => log('warn', m, e),
    error: (m: string, e?: unknown) => log('error', m, e)
  }
}

export function hrMs(start: number): number {
  return Math.round((performance.now() - start))
}



