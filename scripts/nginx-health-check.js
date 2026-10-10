// scripts/nginx-health-check.js
// Quick health check script to test nginx upstream connectivity
// Usage:
//   node scripts/nginx-health-check.js [BASE_URL] [intervalMs] [count]
// Example:
//   node scripts/nginx-health-check.js https://test.conetlearn.com 1000 10

const baseUrl = process.argv[2] || process.env.HEALTH_URL || 'http://localhost:3000'
const intervalMs = parseInt(process.argv[3] || process.env.HEALTH_INTERVAL || '1000', 10)
const count = parseInt(process.argv[4] || process.env.HEALTH_COUNT || '10', 10)

const endpoints = [
  { path: '/', name: 'Homepage' },
  { path: '/api/user-consent-status', name: 'Consent Status' },
  { path: '/robots.txt', name: 'Robots.txt' },
]

if (!globalThis.fetch) {
  console.error('This script requires Node 18+ with global fetch available.')
  process.exit(1)
}

async function checkEndpoint(url, name) {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'HealthCheck/1.0' }
    })
    clearTimeout(timeout)
    const duration = Date.now() - start
    const body = await res.text().catch(() => '')
    
    return {
      name,
      url,
      status: res.status,
      ok: res.ok,
      duration,
      size: body.length,
      error: null
    }
  } catch (err) {
    const duration = Date.now() - start
    return {
      name,
      url,
      status: 0,
      ok: false,
      duration,
      size: 0,
      error: err.message
    }
  }
}

async function runCheck() {
  console.log(`\n=== Health Check: ${baseUrl} ===`)
  console.log(`Interval: ${intervalMs}ms  |  Checks: ${count}\n`)
  
  const results = []
  
  for (let i = 0; i < count; i++) {
    console.log(`\n[Check ${i + 1}/${count}] ${new Date().toISOString()}`)
    console.log('─'.repeat(60))
    
    for (const endpoint of endpoints) {
      const url = `${baseUrl}${endpoint.path}`
      const result = await checkEndpoint(url, endpoint.name)
      results.push(result)
      
      const statusIcon = result.ok ? '✅' : '❌'
      const statusText = result.status > 0 ? `HTTP ${result.status}` : 'ERROR'
      const errorText = result.error ? ` (${result.error})` : ''
      
      console.log(`${statusIcon} ${result.name.padEnd(20)} ${statusText.padEnd(10)} ${result.duration}ms${errorText}`)
    }
    
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  
  const byEndpoint = {}
  results.forEach(r => {
    if (!byEndpoint[r.name]) {
      byEndpoint[r.name] = { total: 0, success: 0, errors: 0, durations: [], statusCounts: {} }
    }
    byEndpoint[r.name].total++
    byEndpoint[r.name].durations.push(r.duration)
    byEndpoint[r.name].statusCounts[r.status] = (byEndpoint[r.name].statusCounts[r.status] || 0) + 1
    
    if (r.ok) {
      byEndpoint[r.name].success++
    } else {
      byEndpoint[r.name].errors++
    }
  })
  
  Object.entries(byEndpoint).forEach(([name, stats]) => {
    const successRate = ((stats.success / stats.total) * 100).toFixed(1)
    const avgDuration = (stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length).toFixed(1)
    const icon = stats.errors === 0 ? '✅' : stats.errors < stats.total ? '⚠️' : '❌'
    
    console.log(`\n${icon} ${name}:`)
    console.log(`   Success: ${stats.success}/${stats.total} (${successRate}%)`)
    console.log(`   Status codes: ${JSON.stringify(stats.statusCounts)}`)
    console.log(`   Avg duration: ${avgDuration}ms`)
  })
  
  // Check for specific issues
  const connectionRefused = results.filter(r => r.error && r.error.includes('ECONNREFUSED')).length
  const timeouts = results.filter(r => r.error && (r.error.includes('timeout') || r.error.includes('aborted'))).length
  const status502 = results.filter(r => r.status === 502).length
  const status503 = results.filter(r => r.status === 503).length
  const status504 = results.filter(r => r.status === 504).length
  
  console.log('\n' + '='.repeat(60))
  console.log('Issue Detection')
  console.log('='.repeat(60))
  
  if (connectionRefused > 0) {
    console.log(`🔴 Connection Refused: ${connectionRefused} requests`)
    console.log('   → Upstream app (port 3000) is not responding')
    console.log('   → Check: systemctl status <your-app> or pm2 status')
    console.log('   → Check: curl http://127.0.0.1:3000')
  }
  
  if (status502 > 0) {
    console.log(`⚠️  502 Bad Gateway: ${status502} requests`)
    console.log('   → Nginx can\'t connect to upstream')
    console.log('   → Check nginx error logs: tail -f /var/log/nginx/error.log')
  }
  
  if (status503 > 0) {
    console.log(`⚠️  503 Service Unavailable: ${status503} requests`)
    console.log('   → Upstream server is overloaded or down')
  }
  
  if (status504 > 0) {
    console.log(`⏱️  504 Gateway Timeout: ${status504} requests`)
    console.log('   → Upstream server taking too long to respond')
    console.log('   → Check nginx proxy_read_timeout setting')
  }
  
  if (timeouts > 0) {
    console.log(`⏱️  Timeouts: ${timeouts} requests`)
    console.log('   → Requests taking longer than 5 seconds')
  }
  
  if (connectionRefused === 0 && status502 === 0 && status503 === 0 && status504 === 0 && timeouts === 0) {
    console.log('✅ No critical issues detected')
  }
  
  process.exitCode = (connectionRefused > 0 || status502 > 0 || status503 > 0) ? 1 : 0
}

runCheck().catch(err => {
  console.error('Health check failed:', err)
  process.exit(1)
})

