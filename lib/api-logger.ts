import { NextRequest, NextResponse } from 'next/server'
import { createLogger, getRequestIdFromHeaders, hrMs } from './logger'

type Handler = (request: NextRequest) => Promise<Response | NextResponse>

export function withApiLogging(name: string, handler: Handler): Handler {
  return async function loggedHandler(request: NextRequest) {
    const rid = getRequestIdFromHeaders(request.headers)
    const logger = createLogger(`api:${name}`, rid)
    const start = performance.now()
    try {
      logger.info(`start ${request.method} ${request.nextUrl.pathname}`)
      const res = await handler(request)
      const ms = hrMs(start)
      logger.info(`end status=${'status' in res ? (res as any).status : 'n/a'} duration=${ms}ms`)
      return res
    } catch (err) {
      const ms = hrMs(start)
      logger.error(`error after ${ms}ms`, err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}



