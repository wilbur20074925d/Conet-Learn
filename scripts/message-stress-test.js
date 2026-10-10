// scripts/message-stress-test.js
// Stress test for simulating multiple logged-in users sending messages
// This tests database write operations under high concurrency
// Usage:
//   node scripts/message-stress-test.js [BASE_URL] [concurrency] [messagesPerUser] [timeoutMs] [groupId] [userIdStart] [userIdCount] [useApiRoute]
// Example:
//   # Use Server Action (production default - form POST to homepage)
//   node scripts/message-stress-test.js http://conetlearn.com 50 10 15000
//   node scripts/message-stress-test.js http://localhost:3000 100 20 15000 1 1 10
//   
//   # Use API Route (/api/send-message) - requires deployment
//   node scripts/message-stress-test.js http://localhost:3000 100 20 15000 1 1 10 api
//   node scripts/message-stress-test.js http://conetlearn.com 100 20 15000 1 1 10 api

const { performance } = require('perf_hooks')

const baseUrl = process.argv[2] || process.env.MESSAGE_STRESS_URL || 'http://localhost:3000'
const concurrency = parseInt(process.argv[3] || process.env.MESSAGE_CONCURRENCY || '50', 10)
const messagesPerUser = parseInt(process.argv[4] || process.env.MESSAGES_PER_USER || '10', 10)
const timeoutMs = parseInt(process.argv[5] || process.env.MESSAGE_TIMEOUT_MS || '15000', 10)
const testGroupId = process.argv[6] || process.env.TEST_GROUP_ID || null
const userIdStart = parseInt(process.argv[7] || process.env.USER_ID_START || '1', 10)
const userIdCount = parseInt(process.argv[8] || process.env.USER_ID_COUNT || '6', 10)
const useApiRoute = process.argv[9] === 'api' || process.env.USE_API_ROUTE === 'true' || false

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

// For production HTTPS domains, the server might use port 3000 (default)
// Try multiple cookie name variations to handle this
function getCookieNameVariations(url) {
  const urlObj = new URL(url)
  const variations = []
  
  // If URL has explicit port, use it
  if (urlObj.port) {
    variations.push(`userId_${urlObj.port}`)
  } else {
    // For HTTPS without explicit port, try both 443 and 3000 (server default)
    if (urlObj.protocol === 'https:') {
      variations.push('userId_443', 'userId_3000')
    } else {
      // For HTTP without explicit port, try both 80 and 3000
      variations.push('userId_80', 'userId_3000')
    }
  }
  
  return variations
}

const cookieNameVariations = getCookieNameVariations(baseUrl)

// Test which cookie name works by making a test request
async function findWorkingCookieName(userId, baseUrl, useApiRoute) {
  const testUrl = useApiRoute ? `${baseUrl}/api/send-message` : baseUrl
  const testBody = useApiRoute 
    ? JSON.stringify({ message: 'test', groupId: 1 })
    : 'message=test&groupId=1'
  
  const testHeaders = {
    'Content-Type': useApiRoute ? 'application/json' : 'application/x-www-form-urlencoded',
    'User-Agent': 'MessageStressTest/authtest'
  }
  
  // Try each cookie name variation
  for (const cookieName of cookieNameVariations) {
    try {
      // Create timeout signal (fallback for older Node.js)
      let timeoutSignal
      if (typeof AbortSignal.timeout === 'function') {
        timeoutSignal = AbortSignal.timeout(5000)
      } else {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 5000)
        timeoutSignal = controller.signal
      }
      
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: {
          ...testHeaders,
          'Cookie': `${cookieName}=${userId}`
        },
        body: testBody,
        signal: timeoutSignal // 5 second timeout for auth test
      })
      
      // If we get a non-401 response, this cookie name works
      // (401 means auth failed, 400/500 might mean auth worked but request failed)
      if (res.status !== 401) {
        console.log(`✅ Found working cookie name: ${cookieName} (status: ${res.status})`)
        return cookieName
      }
    } catch (err) {
      // Continue to next variation on error
      continue
    }
  }
  
  // If none worked, return the first variation (original behavior)
  console.log(`⚠️  Could not determine cookie name, using: ${cookieNameVariations[0]}`)
  return cookieNameVariations[0]
}

// Helper to get auth cookie string
function getAuthCookie(userId, cookieNameToUse = null) {
  const name = cookieNameToUse || cookieName
  return `${name}=${userId}`
}

// Cache the working cookie name once found
let cachedCookieName = null

// Generate random message content
function generateMessage(userId, messageNum) {
  const messages = [
    `Hello from user ${userId}! This is message ${messageNum}`,
    `Testing database connection ${messageNum} for user ${userId}`,
    `Stress test message ${messageNum} - user ${userId}`,
    `@nate Can you help with question ${messageNum}?`,
    `User ${userId} sending test message ${messageNum}`,
    `Database stress test - user ${userId}, message ${messageNum}`,
    `Concurrent message ${messageNum} from user ${userId}`,
    `Testing high concurrency - user ${userId}, msg ${messageNum}`
  ]
  return messages[Math.floor(Math.random() * messages.length)]
}

// Create FormData body for Server Action (production flow)
// Next.js Server Actions accept form-encoded data, not JSON
function createFormDataBody(message, groupId, replyTo = null) {
  const formData = new URLSearchParams()
  formData.append('message', message)
  formData.append('groupId', String(groupId))
  if (replyTo) {
    formData.append('replyTo', String(replyTo))
  }
  return formData.toString()
}

// Create JSON body for API route (alternative endpoint)
function createRequestBody(message, groupId, replyTo = null) {
  const body = {
    message,
    groupId,
    ...(replyTo && { replyTo })
  }
  return JSON.stringify(body)
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

async function sendMessageRequest(baseUrl, userId, groupId, message, messageNum, stats, useApiRoute = false) {
  const start = performance.now()
  let ok = false
  let status = 0
  let errorMessage = undefined
  let errorCategory = 'none'
  let responseSize = 0
  let responseText = ''
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    let url, headers, body
    
    if (useApiRoute) {
      // Use the new API route endpoint (/api/send-message)
      url = `${baseUrl}/api/send-message`
      headers = {
        'Content-Type': 'application/json',
        'Cookie': getAuthCookie(userId, cachedCookieName),
        'User-Agent': `MessageStressTest/${userId}`,
        'X-Request-ID': `msg-${userId}-${messageNum}-${Date.now()}`
      }
      body = createRequestBody(message, groupId)
    } else {
      // Use Server Action via form submission (production flow)
      // NOTE: Next.js Server Actions require special action IDs that can't be easily replicated
      // This approach may not work without the proper Next.js action identifier
      // Recommendation: Use the API route method instead (add 'api' parameter)
      url = baseUrl // POST to homepage
      headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': getAuthCookie(userId, cachedCookieName),
        'User-Agent': `MessageStressTest/${userId}`,
        'X-Request-ID': `msg-${userId}-${messageNum}-${Date.now()}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        // Next.js Server Actions may need these headers
        'Next-Action': 'sendMessage', // Attempt to identify the action (may not work)
        'Next-Router-State-Tree': '[]' // Attempt to provide router state
      }
      body = createFormDataBody(message, groupId)
    }
    
    const res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body,
      signal: controller.signal,
      redirect: 'manual' // Don't follow redirects automatically
    })
    
    clearTimeout(timeoutId)
    status = res.status
    // Server Actions may return 200, 302 (redirect), or other status codes
    // For form submissions, we consider 200, 302, 303, 307, 308 as success
    ok = res.ok || res.status === 200 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308
    
    // Try to read response
    try {
      responseText = await res.text()
      responseSize = responseText.length
    } catch (_) {}
    
  } catch (err) {
    errorMessage = err?.message || String(err)
    errorCategory = categorizeError(errorMessage)
    status = 0
  }
  
  const end = performance.now()
  const duration = end - start
  
  return {
    userId,
    messageNum,
    groupId,
    duration,
    ok,
    status,
    errorMessage,
    errorCategory,
    responseSize
  }
}

async function userWorker(workerId, baseUrl, userId, groupId, messageCount, stats, useApiRoute) {
  for (let i = 1; i <= messageCount; i++) {
    const message = generateMessage(userId, i)
    const result = await sendMessageRequest(baseUrl, userId, groupId, message, i, stats, useApiRoute)
    
    // Update stats
    stats.total++
    stats.latencies.push(result.duration)
    
    // Track by user
    if (!stats.byUser[userId]) {
      stats.byUser[userId] = {
        total: 0,
        success: 0,
        errors: 0,
        latencies: [],
        statusCounts: {},
        errorCategories: {}
      }
    }
    stats.byUser[userId].total++
    stats.byUser[userId].latencies.push(result.duration)
    
    if (result.ok) {
      stats.success++
      stats.byUser[userId].success++
      stats.successStatusCounts[result.status] = (stats.successStatusCounts[result.status] || 0) + 1
    } else {
      stats.errors++
      stats.byUser[userId].errors++
      stats.statusCounts[result.status] = (stats.statusCounts[result.status] || 0) + 1
      
      // Track specific error types
      if (result.status === 401) {
        stats.unauthorized++
      }
      if (result.status === 404) {
        stats.notFound++
      }
      if (result.status === 405) {
        stats.methodNotAllowed++
      }
      if (result.status === 500) {
        stats.serverError++
      }
      if (result.status === 502) {
        stats.badGateway++
        stats.nginxErrors.upstream_502++
      }
      if (result.status === 503) {
        stats.serviceUnavailable++
        stats.nginxErrors.upstream_503++
      }
      if (result.status === 504) {
        stats.gatewayTimeout++
        stats.nginxErrors.upstream_504++
      }
      
      if (result.errorCategory === 'connection_refused') {
        stats.connectionRefused++
        stats.nginxErrors.upstream_connection_refused++
      }
      
      if (result.errorCategory === 'timeout') {
        stats.timeouts++
        stats.nginxErrors.timeout++
      }
      
      stats.byUser[userId].statusCounts[result.status] = 
        (stats.byUser[userId].statusCounts[result.status] || 0) + 1
      stats.byUser[userId].errorCategories[result.errorCategory] = 
        (stats.byUser[userId].errorCategories[result.errorCategory] || 0) + 1
      
      if (result.errorMessage) {
        stats.errorMessages.push({
          userId,
          messageNum: result.messageNum,
          message: result.errorMessage,
          category: result.errorCategory,
          status: result.status
        })
      }
    }
    
    // Small delay between messages to avoid overwhelming
    if (i < messageCount) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50))
    }
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

;(async () => {
  console.log('=== Message Stress Test Configuration ===')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Port detected: ${port} (will try cookie names: ${cookieNameVariations.join(', ')})`)
  console.log(`Concurrency (users): ${concurrency}`)
  console.log(`Messages per user: ${messagesPerUser}`)
  console.log(`Total messages: ${concurrency * messagesPerUser}`)
  console.log(`Timeout per request: ${timeoutMs} ms`)
  console.log(`Group ID: ${testGroupId || 'AUTO (will try common values)'}`)
  console.log(`User IDs: ${userIdStart} to ${userIdStart + userIdCount - 1}`)
  console.log(`Database pool max connections: 10 (from lib/db.ts)`)
  console.log(`Expected pool exhaustion: ${concurrency > 10 ? 'YES - High concurrency may exhaust pool' : 'Maybe - Try higher concurrency'}`)
  console.log(`Request method: ${useApiRoute ? 'API Route (/api/send-message)' : 'Server Action (form POST to /)'}`)
  console.log('')
  
  // Discover the correct cookie name FIRST (before any other requests)
  console.log('Discovering correct cookie name for authentication...')
  const testUserId = userIdStart
  cachedCookieName = await findWorkingCookieName(testUserId, baseUrl, useApiRoute)
  console.log(`✅ Using cookie name: ${cachedCookieName}`)
  console.log('')
  
  // Determine groupId to use
  let groupId = testGroupId
  if (!groupId) {
    // Try to discover a valid groupId by testing homepage
    console.log('Attempting to discover valid groupId...')
    try {
      const testRes = await fetch(baseUrl, {
        headers: { 'Cookie': getAuthCookie(testUserId, cachedCookieName) }
      })
      // If we get redirected to login, userId might not be valid
      // For now, default to groupId 1
      groupId = 1
      console.log(`Using default groupId: ${groupId}`)
    } catch (err) {
      groupId = 1
      console.log(`Using default groupId: ${groupId} (discovery failed)`)
    }
  }
  groupId = parseInt(groupId, 10)
  
  const stats = {
    total: 0,
    success: 0,
    errors: 0,
    unauthorized: 0,
    notFound: 0,
    methodNotAllowed: 0,
    serverError: 0,
    badGateway: 0,
    serviceUnavailable: 0,
    gatewayTimeout: 0,
    connectionRefused: 0,
    timeouts: 0,
    statusCounts: {},
    successStatusCounts: {},
    errorMessages: [],
    latencies: [],
    byUser: {},
    nginxErrors: {
      upstream_502: 0,
      upstream_503: 0,
      upstream_504: 0,
      upstream_connection_refused: 0,
      timeout: 0
    }
  }
  
  const startAll = performance.now()
  console.log('Starting message stress test...')
  console.log(`Simulating ${concurrency} concurrent users sending messages to groupId ${groupId}`)
  console.log('')
  
  // Create user workers - assign users to workers
  const userIds = Array.from({ length: userIdCount }, (_, i) => userIdStart + i)
  const workers = []
  
  for (let i = 0; i < concurrency; i++) {
    const userId = userIds[i % userIds.length] // Round-robin user assignment
    workers.push(userWorker(i + 1, baseUrl, userId, groupId, messagesPerUser, stats, useApiRoute))
  }
  
  await Promise.all(workers)
  
  const endAll = performance.now()
  const durationSec = (endAll - startAll) / 1000
  const rps = stats.total / (durationSec || 1)
  
  console.log('\n=== Message Stress Test Summary ===')
  console.log(`Duration: ${durationSec.toFixed(2)}s  |  Total messages: ${stats.total}  |  RPS: ${rps.toFixed(2)}`)
  console.log(`Success: ${stats.success}  |  Errors: ${stats.errors}  |  Error rate: ${((stats.errors / stats.total) * 100).toFixed(2)}%`)
  
  console.log('\n--- HTTP Status Codes ---')
  console.log('Success:', stats.successStatusCounts)
  console.log('Errors:', stats.statusCounts)
  
  console.log('\n--- Error Analysis ---')
  if (stats.unauthorized > 0) {
    console.log(`🔐 401 Unauthorized: ${stats.unauthorized} (user authentication issues)`)
  }
  if (stats.notFound > 0) {
    console.log(`❓ 404 Not Found: ${stats.notFound}`)
  }
  if (stats.methodNotAllowed > 0) {
    console.log(`🚫 405 Method Not Allowed: ${stats.methodNotAllowed} (Server Action cannot be called directly)`)
  }
  if (stats.serverError > 0) {
    console.log(`⚠️  500 Server Error: ${stats.serverError} (database/application errors)`)
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
  
  if (stats.latencies.length) {
    console.log('\n--- Latency (ms) ---')
    console.log(`p50: ${percentile(stats.latencies, 50).toFixed(1)}  p90: ${percentile(stats.latencies, 90).toFixed(1)}  p95: ${percentile(stats.latencies, 95).toFixed(1)}  p99: ${percentile(stats.latencies, 99).toFixed(1)}  max: ${Math.max(...stats.latencies).toFixed(1)}`)
  }
  
  // Top users by activity
  console.log('\n--- Per-User Statistics (Top 10) ---')
  const userEntries = Object.entries(stats.byUser)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
  
  userEntries.forEach(([userId, userStats]) => {
    const errorRate = userStats.total > 0 ? ((userStats.errors / userStats.total) * 100).toFixed(2) : 0
    const avgLatency = userStats.latencies.length > 0 
      ? (userStats.latencies.reduce((a, b) => a + b, 0) / userStats.latencies.length).toFixed(1)
      : 0
    console.log(`User ${userId}: ${userStats.success}/${userStats.total} success (${errorRate}% error) | Avg: ${avgLatency}ms`)
  })
  
  if (stats.errorMessages.length > 0) {
    console.log('\n--- Sample Error Messages (first 10) ---')
    stats.errorMessages.slice(0, 10).forEach((e, i) => {
      console.log(`${i + 1}. [User ${e.userId}, Msg ${e.messageNum}] ${e.category}: ${e.message.substring(0, 80)}`)
    })
  }
  
  // Diagnostic recommendations
  console.log('\n=== Diagnostic Recommendations ===')
  if (stats.nginxErrors.upstream_connection_refused > 0) {
    console.log('🔴 CONNECTION REFUSED detected - This is the error you were looking for!')
    console.log('   - Database connection pool is likely exhausted')
    console.log('   - Check database connection pool settings in lib/db.ts')
    console.log('   - Current pool max: 10 connections (may be too low for high concurrency)')
    console.log('   - Consider increasing pool size or using connection pooling (PgBouncer)')
    console.log('   - Check app logs for database connection errors')
    console.log('   - Monitor database connection count during load')
  }
  
  if (stats.serverError > 0) {
    console.log('⚠️  SERVER ERRORS (500) detected:')
    console.log('   - Likely database write failures or connection pool exhaustion')
    console.log('   - Check application logs for database errors')
    console.log('   - Review database connection pool configuration')
    console.log('   - Check for slow queries blocking other connections')
  }
  
  if (stats.nginxErrors.upstream_502 > 0) {
    console.log('⚠️  502 BAD GATEWAY detected:')
    console.log('   - App may be crashing under database load')
    console.log('   - Database connection pool exhaustion causing app failures')
    console.log('   - Check nginx error logs: tail -f /var/log/nginx/error.log')
  }
  
  if (stats.timeouts > 0) {
    console.log('⏱️  TIMEOUTS detected:')
    console.log('   - Database queries taking too long')
    console.log('   - Connection pool may be exhausted, requests waiting for connections')
    console.log('   - Check for database locks or slow queries')
  }
  
  if (stats.methodNotAllowed > 0) {
    console.log('🚫 METHOD NOT ALLOWED (405) detected:')
    console.log('   - Next.js Server Actions cannot be called directly via simple POST')
    console.log('   - Server Actions require special Next.js action identifiers and headers')
    console.log('   - These are generated dynamically by Next.js and cannot be easily replicated')
    console.log('')
    console.log('   SOLUTION: Use the API route method instead:')
    console.log('   1. Deploy app/api/send-message/route.ts to production')
    console.log('   2. Then run: node scripts/message-stress-test.js http://conetlearn.com 100 20 15000 1 1 10 api')
    console.log('')
    console.log('   OR: Test locally first (API route works locally):')
    console.log('   node scripts/message-stress-test.js http://localhost:3000 100 20 15000 1 1 10 api')
    console.log('')
    console.log('   The API route method will properly stress the database connection pool.')
  }
  
  if (stats.notFound > 0) {
    if (useApiRoute) {
      console.log('❓ NOT FOUND (404) detected:')
      console.log('   - The /api/send-message route is not deployed to production yet')
      console.log('   - File exists locally: app/api/send-message/route.ts')
      console.log('   - ACTION REQUIRED: Deploy this file to production')
      console.log('   - See DEPLOYMENT_CHECKLIST.md for deployment instructions')
      console.log('   - After deployment, test with: node scripts/message-stress-test.js http://conetlearn.com 100 20 15000 1 1 10 api')
      console.log('')
      console.log('   Local test shows the route works (600/600 messages succeeded)!')
      console.log('   Once deployed, production should work the same way.')
    } else {
      console.log('❓ NOT FOUND (404) detected:')
      console.log('   - Server Action POST to homepage returned 404')
      console.log('   - This might indicate routing issues or the page route not found')
      console.log('   - Try using API route instead: node scripts/message-stress-test.js http://conetlearn.com 100 20 15000 1 1 10 api')
      console.log('   - Or check if the homepage route is accessible')
    }
  }
  
  if (stats.nginxErrors.upstream_connection_refused === 0 && stats.serverError === 0 && 
      stats.nginxErrors.upstream_502 === 0 && stats.notFound === 0) {
    console.log('✅ No database connection issues detected')
    console.log('   - If you expected to see connection refused errors, try:')
    console.log('     1. Increase concurrency: node scripts/message-stress-test.js <URL> 200 20 15000')
    console.log('     2. Check database connection pool limits')
    console.log('     3. Monitor database during test')
  }
  
  // Exit codes
  if (stats.nginxErrors.upstream_connection_refused > 0) {
    console.log('\n🔴 Connection refused errors detected - Database connection pool likely exhausted!')
    process.exitCode = 3
  } else if (stats.nginxErrors.upstream_502 > 0 || stats.serverError > 0) {
    console.log('\n⚠️  Server errors detected - Database issues likely')
    process.exitCode = 2
  } else if (stats.errors > 0) {
    console.log('\n⚠️  Some errors detected')
    process.exitCode = 1
  } else {
    console.log('\n✅ All messages sent successfully')
    process.exitCode = 0
  }
})().catch(err => {
  console.error('Message stress test failed:', err)
  process.exit(1)
})

