// lib/db.ts
import postgres from 'postgres'
import { createLogger, getRequestIdFromHeaders, hrMs } from './logger'
import { AsyncLocalStorage } from 'async_hooks'

// Get database URL - you need to set this in your .env.local file
// Format: postgresql://postgres:YOUR_PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    "Database connection string not found. Please set DATABASE_URL in your .env.local file.\n" +
    "Format: postgresql://postgres:1998614ny@db.lzvhzieiryzpqhioafwr.supabase.co:5432/postgres\n" +
    "Get your password from Supabase Dashboard > Settings > Database"
  )
}

const sqlBase = postgres(connectionString, {
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
  max: 10,
  prepare: false,
  // Better error handling - suppress notices
  onnotice: () => {}
})

// Request context to pick up request-id when available
type Context = { requestId?: string }
const als = new AsyncLocalStorage<Context>()

export function runWithRequestId<T>(rid: string | undefined, fn: () => Promise<T>): Promise<T> {
  return als.run({ requestId: rid }, fn)
}

function reconstructQuery(strings: TemplateStringsArray, values: unknown[]): string {
  const parts: string[] = []
  for (let i = 0; i < strings.length; i++) {
    parts.push(strings[i])
    if (i < values.length) parts.push(`$${i + 1}`)
  }
  return parts.join('')
}

const sql = new Proxy(sqlBase as any, {
  apply(target, thisArg, argArray: any[]) {
    const ctx = als.getStore() || {}
    const logger = createLogger('db', ctx.requestId)
    const start = performance.now()
    try {
      const strings = argArray[0] as TemplateStringsArray
      const values = Array.prototype.slice.call(argArray, 1) as unknown[]
      const queryText = reconstructQuery(strings, values)
      const p = Reflect.apply(target, thisArg, argArray) as Promise<unknown>
      return p.then((result: unknown) => {
        const ms = hrMs(start)
        // if (ms >= 200) {
        //   logger.warn(`slow query ${ms}ms: ${queryText}`)
        // } else {
        //   logger.debug(`query ${ms}ms: ${queryText}`)
        // }
        return result
      }).catch((err: unknown) => {
        const ms = hrMs(start)
        logger.error(`query failed after ${ms}ms: ${queryText}`, err)
        throw err
      })
    } catch (err) {
      logger.error('db proxy error', err)
      return Reflect.apply(target, thisArg, argArray)
    }
  }
})

export default sql as typeof sqlBase
