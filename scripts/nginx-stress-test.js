// scripts/nginx-stress-test.js
// Enhanced stress test for diagnosing nginx upstream connection issues
// Usage:
//   node scripts/nginx-stress-test.js [BASE_URL] [concurrency] [requestsPerWorker] [timeoutMs] [userId] [useAuth]
// Example:
//   node scripts/nginx-stress-test.js https://test.conetlearn.com 100 50 15000
//   node scripts/nginx-stress-test.js http://43.154.127.194 50 30 10000 1 true
//   node scripts/nginx-stress-test.js http://localhost:3000 100 50 15000 1 true

const { performance } = require('perf_hooks')

const baseUrl = process.argv[2] || process.env.STRESS_URL || 'http://localhost:3000'
const concurrency = parseInt(process.argv[3] || process.env.STRESS_CONCURRENCY || '100', 10)
const requestsPerWorker = parseInt(process.argv[4] || process.env.STRESS_REQUESTS_PER_WORKER || '50', 10)
const timeoutMs = parseInt(process.argv[5] || process.env.STRESS_TIMEOUT_MS || '15000', 10)
const testUserId = process.argv[6] || process.env.STRESS_USER_ID || null
const useAuth = process.argv[7] === 'true' || process.env.STRESS_USE_AUTH === 'true' || false

// Extract port from URL for cookie name
function getPortFromUrl(url) {
  try {
    const urlObj = new URL(url)
    return urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')
  } catch {
    return '3000'
  }
}

const port = getPortFromUrl(baseUrl)
const cookieName = `userId_${port}`

// Helper to get auth cookie string
function getAuthCookie(userId) {
  if (!userId) return ''
  return `${cookieName}=${userId}`
}

// Test endpoints configuration
// Some endpoints require auth, some don't
const endpoints = [
  { path: '/', method: 'GET', name: 'homepage', requiresAuth: false },
  { path: '/api/user-consent-status', method: 'GET', name: 'consent-status', requiresAuth: true },
  { path: '/api/user-consent?userId=1', method: 'GET', name: 'consent-get', requiresAuth: false },
  { path: '/api/user-consent', method: 'POST', name: 'consent-post', requiresAuth: false, body: JSON.stringify({ userId: 1, consentGiven: true }) },
  { path: '/robots.txt', method: 'GET', name: 'robots', requiresAuth: false },
  { path: '/.well-known/security.txt', method: 'GET', name: 'security-txt', requiresAuth: false },
]

if (!globalThis.fetch) {
  console.error('This script requires Node 18+ with global fetch available.')
  process.exit(1)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function categorizeError(errorMessage) {
  if (!errorMessage) return 'unknown'
  const msg = errorMessage.toLowerCase()
  if (msg.includes('econnrefused') || msg.includes('connection refused')) return 'connection_refused'
  if (msg.includes('timeout') || msg.includes('aborted')) return 'timeout'
  if (msg.includes('econnreset') || msg.includes('connection reset')) return 'connection_reset'
  if (msg.includes('enotfound') || msg.includes('getaddrinfo')) return 'dns_error'
  if (msg.includes('econnaborted')) return 'connection_aborted'
  return 'network_error'
}

async function timedFetch(url, init, endpointName) {
  const start = performance.now()
  let ok = false
  let status = 0
  let errorMessage = undefined
  let errorCategory = 'none'
  let responseSize = 0
  
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { ...init, signal: controller.signal })
    clearTimeout(id)
    status = res.status
    ok = res.ok
    
    // Drain body to avoid socket buildup
    try {
      const body = await res.arrayBuffer()
      responseSize = body.byteLength
    } catch (_) {}
  } catch (err) {
    errorMessage = err?.message || String(err)
    errorCategory = categorizeError(errorMessage)
    // Status 0 typically means network error (connection refused, timeout, etc.)
    status = 0
  }
  
  const end = performance.now()
  return { 
    ms: end - start, 
    ok, 
    status, 
    errorMessage, 
    errorCategory,
    endpointName,
    responseSize
  }
}

async function worker(id, baseUrl, endpoints, count, stats, userId, useAuth) {
  for (let i = 0; i < count; i++) {
    // Randomly select an endpoint for variety
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)]
    const url = `${baseUrl}${endpoint.path}`
    
    const init = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `StressTest/${id}`,
        'X-Request-ID': `test-${id}-${i}-${Date.now()}`
      }
    }
    
    // Add authentication cookie if enabled and endpoint requires it
    if (useAuth && userId && endpoint.requiresAuth) {
      init.headers['Cookie'] = getAuthCookie(userId)
    }
    
    if (endpoint.body) {
      init.body = endpoint.body
    }
    
    const r = await timedFetch(url, init, endpoint.name)
    
    // Update stats
    stats.total++
    stats.latencies.push(r.ms)
    stats.byEndpoint[r.endpointName] = stats.byEndpoint[r.endpointName] || {
      total: 0,
      errors: 0,
      latencies: [],
      statusCounts: {},
      errorCategories: {}
    }
    stats.byEndpoint[r.endpointName].total++
    stats.byEndpoint[r.endpointName].latencies.push(r.ms)
    
    if (!r.ok || r.status === 0) {
      stats.errors++
      stats.statusCounts[r.status] = (stats.statusCounts[r.status] || 0) + 1
      
      // Track nginx-specific errors
      if (r.status === 401) {
        stats.unauthorized++
        stats.nginxErrors.auth_required++
      }
      if (r.status === 404) {
        stats.notFound++
        stats.nginxErrors.route_not_found++
      }
      if (r.status === 502) {
        stats.badGateway++
        stats.nginxErrors.upstream_502++
      }
      if (r.status === 503) {
        stats.serviceUnavailable++
        stats.nginxErrors.upstream_503++
      }
      if (r.status === 504) {
        stats.gatewayTimeout++
        stats.nginxErrors.upstream_504++
      }
      
      // Track connection refused (nginx upstream connection refused)
      if (r.errorCategory === 'connection_refused') {
        stats.connectionRefused++
        stats.nginxErrors.upstream_connection_refused++
      }
      
      if (r.errorCategory === 'timeout') {
        stats.timeouts++
        stats.nginxErrors.timeout++
      }
      
      // Track by endpoint
      stats.byEndpoint[r.endpointName].errors++
      stats.byEndpoint[r.endpointName].statusCounts[r.status] = 
        (stats.byEndpoint[r.endpointName].statusCounts[r.status] || 0) + 1
      stats.byEndpoint[r.endpointName].errorCategories[r.errorCategory] = 
        (stats.byEndpoint[r.endpointName].errorCategories[r.errorCategory] || 0) + 1
      
      if (r.errorMessage) {
        stats.errorMessages.push({
          endpoint: r.endpointName,
          message: r.errorMessage,
          category: r.errorCategory,
          status: r.status
        })
      }
    } else {
      // Track successful responses
      stats.success++
      stats.successStatusCounts[r.status] = (stats.successStatusCounts[r.status] || 0) + 1
    }
    
    // Track response sizes
    if (r.responseSize > 0) {
      stats.responseSizes.push(r.responseSize)
    }
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

;(async () => {
  console.log('=== Nginx Stress Test Configuration ===')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Port detected: ${port} (cookie: ${cookieName})`)
  console.log(`Concurrency: ${concurrency}`)
  console.log(`Requests per worker: ${requestsPerWorker}`)
  console.log(`Total requests: ${concurrency * requestsPerWorker}`)
  console.log(`Timeout per request: ${timeoutMs} ms`)
  console.log(`Authentication: ${useAuth ? `Enabled (userId: ${testUserId})` : 'Disabled'}`)
  console.log(`Endpoints to test: ${endpoints.map(e => e.name).join(', ')}`)
  console.log('')

  const stats = {
    total: 0,
    success: 0,
    errors: 0,
    unauthorized: 0,
    notFound: 0,
    badGateway: 0,
    serviceUnavailable: 0,
    gatewayTimeout: 0,
    connectionRefused: 0,
    timeouts: 0,
    statusCounts: {},
    successStatusCounts: {},
    errorMessages: [],
    latencies: [],
    responseSizes: [],
    byEndpoint: {},
    nginxErrors: {
      auth_required: 0,
      route_not_found: 0,
      upstream_502: 0,
      upstream_503: 0,
      upstream_504: 0,
      upstream_connection_refused: 0,
      timeout: 0
    }
  }

  const startAll = performance.now()
  console.log('Starting stress test...')
  if (useAuth && testUserId) {
    console.log(`Using authentication with userId: ${testUserId} (cookie: ${cookieName})`)
  } else {
    console.log('Running without authentication (401/404 expected for protected endpoints)')
  }
  
  await Promise.all(
    Array.from({ length: concurrency }, (_, i) => 
      worker(i + 1, baseUrl, endpoints, requestsPerWorker, stats, testUserId, useAuth)
    )
  )
  
  const endAll = performance.now()
  const durationSec = (endAll - startAll) / 1000
  const rps = stats.total / (durationSec || 1)

  console.log('\n=== Stress Test Summary ===')
  console.log(`Duration: ${durationSec.toFixed(2)}s  |  Total requests: ${stats.total}  |  RPS: ${rps.toFixed(2)}`)
  console.log(`Success: ${stats.success}  |  Errors: ${stats.errors}  |  Error rate: ${((stats.errors / stats.total) * 100).toFixed(2)}%`)
  
  console.log('\n--- HTTP Status Codes ---')
  console.log('Success:', stats.successStatusCounts)
  console.log('Errors:', stats.statusCounts)
  
  console.log('\n--- HTTP Status Analysis ---')
  if (stats.unauthorized > 0) {
    console.log(`🔐 401 Unauthorized: ${stats.unauthorized} (authentication required - expected if not logged in)`)
  }
  if (stats.notFound > 0) {
    console.log(`❓ 404 Not Found: ${stats.notFound} (route not found or not deployed)`)
  }
  
  console.log('\n--- Nginx Upstream Errors (Critical) ---')
  if (stats.nginxErrors.upstream_502 > 0) {
    console.log(`⚠️  502 Bad Gateway: ${stats.nginxErrors.upstream_502} (nginx can't connect to upstream)`)
  }
  if (stats.nginxErrors.upstream_503 > 0) {
    console.log(`⚠️  503 Service Unavailable: ${stats.nginxErrors.upstream_503}`)
  }
  if (stats.nginxErrors.upstream_504 > 0) {
    console.log(`⚠️  504 Gateway Timeout: ${stats.nginxErrors.upstream_504}`)
  }
  if (stats.nginxErrors.upstream_connection_refused > 0) {
    console.log(`🔴 Connection Refused: ${stats.nginxErrors.upstream_connection_refused} (upstream app not responding)`)
  }
  if (stats.nginxErrors.timeout > 0) {
    console.log(`⏱️  Timeouts: ${stats.nginxErrors.timeout}`)
  }
  if (stats.nginxErrors.upstream_502 === 0 && stats.nginxErrors.upstream_503 === 0 && 
      stats.nginxErrors.upstream_504 === 0 && stats.nginxErrors.upstream_connection_refused === 0 && 
      stats.nginxErrors.timeout === 0) {
    console.log('✅ No nginx upstream errors detected')
  }
  
  console.log('\n--- Error Categories ---')
  const errorCategories = {}
  stats.errorMessages.forEach(e => {
    errorCategories[e.category] = (errorCategories[e.category] || 0) + 1
  })
  console.log(errorCategories)
  
  if (stats.latencies.length) {
    console.log('\n--- Overall Latency (ms) ---')
    console.log(`p50: ${percentile(stats.latencies, 50).toFixed(1)}  p90: ${percentile(stats.latencies, 90).toFixed(1)}  p95: ${percentile(stats.latencies, 95).toFixed(1)}  p99: ${percentile(stats.latencies, 99).toFixed(1)}  max: ${Math.max(...stats.latencies).toFixed(1)}`)
  }
  
  if (stats.responseSizes.length > 0) {
    const avgSize = stats.responseSizes.reduce((a, b) => a + b, 0) / stats.responseSizes.length
    console.log('\n--- Response Sizes ---')
    console.log(`Average: ${formatBytes(avgSize)}  |  Total: ${formatBytes(stats.responseSizes.reduce((a, b) => a + b, 0))}`)
  }
  
  console.log('\n--- Per-Endpoint Statistics ---')
  Object.entries(stats.byEndpoint).forEach(([name, ep]) => {
    const errorRate = ep.total > 0 ? ((ep.errors / ep.total) * 100).toFixed(2) : 0
    console.log(`\n${name}:`)
    console.log(`  Total: ${ep.total}  |  Errors: ${ep.errors} (${errorRate}%)`)
    console.log(`  Status: ${JSON.stringify(ep.statusCounts)}`)
    if (ep.errors > 0) {
      console.log(`  Error categories: ${JSON.stringify(ep.errorCategories)}`)
    }
    if (ep.latencies.length > 0) {
      console.log(`  Latency: p50=${percentile(ep.latencies, 50).toFixed(1)}ms  p95=${percentile(ep.latencies, 95).toFixed(1)}ms`)
    }
  })
  
  if (stats.errorMessages.length > 0) {
    console.log('\n--- Sample Error Messages (first 10) ---')
    stats.errorMessages.slice(0, 10).forEach((e, i) => {
      console.log(`${i + 1}. [${e.endpoint}] ${e.category}: ${e.message.substring(0, 100)}`)
    })
  }
  
  // Diagnostic recommendations
  console.log('\n=== Diagnostic Recommendations ===')
  if (stats.unauthorized > 0 && !useAuth) {
    console.log('🔐 UNAUTHORIZED (401) detected:')
    console.log('   - This is expected if testing without authentication')
    console.log('   - To test with auth: node scripts/nginx-stress-test.js <URL> <concurrency> <requests> <timeout> <userId> true')
    console.log('   - Example: node scripts/nginx-stress-test.js http://localhost:3000 100 50 15000 1 true')
  }
  
  if (stats.notFound > 0) {
    console.log('❓ NOT FOUND (404) detected:')
    console.log('   - Some routes may not be deployed (robots.txt, security.txt are optional)')
    console.log('   - API routes returning 404 might indicate routing issues')
    console.log('   - Check if Next.js app is properly built and deployed')
    console.log('   - Verify route files exist in app/api/ directory')
  }
  
  if (stats.nginxErrors.upstream_connection_refused > 0) {
    console.log('🔴 CONNECTION REFUSED detected:')
    console.log('   - Check if Next.js app is running on port 3000')
    console.log('   - Check nginx upstream configuration (upstream backend)')
    console.log('   - Verify app health: curl http://127.0.0.1:3000')
    console.log('   - Check app logs for crashes or restarts')
    console.log('   - Consider increasing app process management (PM2, systemd)')
  }
  
  if (stats.nginxErrors.upstream_502 > 0) {
    console.log('⚠️  502 BAD GATEWAY detected:')
    console.log('   - App may be crashing or restarting')
    console.log('   - Check database connection pool limits')
    console.log('   - Review app memory/CPU usage')
    console.log('   - Check nginx error logs: tail -f /var/log/nginx/error.log')
  }
  
  if (stats.timeouts > 0) {
    console.log('⏱️  TIMEOUTS detected:')
    console.log('   - App may be overloaded')
    console.log('   - Consider increasing nginx proxy_read_timeout')
    console.log('   - Optimize slow database queries')
    console.log('   - Check for connection pool exhaustion')
  }
  
  if (stats.nginxErrors.upstream_504 > 0) {
    console.log('⏱️  504 GATEWAY TIMEOUT detected:')
    console.log('   - App taking too long to respond')
    console.log('   - Increase nginx proxy_read_timeout and proxy_connect_timeout')
    console.log('   - Check for slow queries or external API calls')
  }
  
  if (stats.nginxErrors.upstream_502 === 0 && stats.nginxErrors.upstream_connection_refused === 0) {
    console.log('✅ No upstream connection issues detected')
    console.log('   - If still seeing issues, check nginx access logs')
    console.log('   - Monitor app resource usage during load')
  }
  
  // Exit codes
  if (stats.nginxErrors.upstream_connection_refused > 0) {
    console.log('\n⚠️  Connection refused errors detected - upstream app may be down')
    process.exitCode = 3
  } else if (stats.nginxErrors.upstream_502 > 0) {
    console.log('\n⚠️  502 Bad Gateway errors detected')
    process.exitCode = 2
  } else if (stats.errors > 0 && (stats.unauthorized === 0 || useAuth)) {
    // Only treat as errors if not just unauthorized (or if auth was used)
    console.log('\n⚠️  Some errors detected but not critical')
    process.exitCode = 1
  } else {
    console.log('\n✅ All requests successful (or only expected 401/404)')
    process.exitCode = 0
  }
})().catch(err => {
  console.error('Stress test failed:', err)
  process.exit(1)
})

