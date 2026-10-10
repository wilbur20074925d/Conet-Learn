// scripts/stress-test.js
// Minimal dependency-free load test using built-in fetch (Node 18+)
// Usage:
//   node scripts/stress-test.js [URL] [concurrency] [requestsPerWorker]
// Example:
//   node scripts/stress-test.js http://localhost:3000 100 50

const { performance } = require('perf_hooks')

const target = process.argv[2] || process.env.STRESS_URL || 'http://localhost:3000/'
const concurrency = parseInt(process.argv[3] || process.env.STRESS_CONCURRENCY || '100', 10)
const requestsPerWorker = parseInt(process.argv[4] || process.env.STRESS_REQUESTS_PER_WORKER || '50', 10)
const timeoutMs = parseInt(process.argv[5] || process.env.STRESS_TIMEOUT_MS || '15000', 10)

if (!globalThis.fetch) {
	console.error('This script requires Node 18+ with global fetch available.')
	process.exit(1)
}

function sleep(ms) {
	return new Promise(r => setTimeout(r, ms))
}

async function timedFetch(url, init) {
	const start = performance.now()
	let ok = false
	let status = 0
	let errorMessage = undefined
	try {
		const controller = new AbortController()
		const id = setTimeout(() => controller.abort(), timeoutMs)
		const res = await fetch(url, { ...init, signal: controller.signal })
		clearTimeout(id)
		status = res.status
		ok = res.ok
		// Drain body to avoid socket buildup (best effort)
		try { await res.arrayBuffer() } catch (_) {}
	} catch (err) {
		errorMessage = err?.message || String(err)
	}
	const end = performance.now()
	return { ms: end - start, ok, status, errorMessage }
}

async function worker(id, url, count, stats) {
	for (let i = 0; i < count; i++) {
		const r = await timedFetch(url)
		stats.total++
		stats.latencies.push(r.ms)
		if (!r.ok) {
			stats.errors++
			stats.statusCounts[r.status] = (stats.statusCounts[r.status] || 0) + 1
			if (r.status === 502) stats.badGateway++
			if (r.errorMessage) stats.errorMessages.push(r.errorMessage)
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
	console.log(`Target: ${target}`)
	console.log(`Concurrency: ${concurrency}`)
	console.log(`Requests per worker: ${requestsPerWorker}`)
	console.log(`Timeout per request: ${timeoutMs} ms`)

	const stats = {
		total: 0,
		errors: 0,
		badGateway: 0,
		statusCounts: {},
		errorMessages: [],
		latencies: [],
	}

	const startAll = performance.now()
	await Promise.all(
		Array.from({ length: concurrency }, (_, i) => worker(i + 1, target, requestsPerWorker, stats))
	)
	const endAll = performance.now()

	const durationSec = ((endAll - startAll) / 1000).toFixed(2)
	const rps = (stats.total / (parseFloat(durationSec) || 1)).toFixed(2)

	console.log('\n=== Stress Test Summary ===')
	console.log(`Duration: ${durationSec}s  |  Total requests: ${stats.total}  |  RPS: ${rps}`)
	console.log(`Errors: ${stats.errors}  |  502 Bad Gateway: ${stats.badGateway}`)
	console.log('Status counts:', stats.statusCounts)
	if (stats.latencies.length) {
		console.log('Latency ms: p50=%d  p90=%d  p95=%d  p99=%d  max=%d',
			percentile(stats.latencies, 50).toFixed(1),
			percentile(stats.latencies, 90).toFixed(1),
			percentile(stats.latencies, 95).toFixed(1),
			percentile(stats.latencies, 99).toFixed(1),
			Math.max(...stats.latencies).toFixed(1)
		)
	}

	if (stats.badGateway > 0) {
		console.log('\nDetected 502 responses. Issue reproduced.')
		process.exitCode = 2
	}
})().catch(err => {
	console.error('Stress test failed:', err)
	process.exit(1)
})
