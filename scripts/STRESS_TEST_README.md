# Stress Test Scripts for Nginx Upstream Issues

This directory contains scripts to diagnose nginx upstream connection issues, specifically the "Connection refused" errors you're experiencing.

## Scripts

### 1. `nginx-stress-test.js` - Comprehensive Load Test

Full-featured stress test that tests multiple endpoints and categorizes errors.

**Usage:**
```bash
# Test production domain (without authentication)
node scripts/nginx-stress-test.js https://test.conetlearn.com 100 50 15000

# Test with authentication (userId and useAuth flag)
node scripts/nginx-stress-test.js http://localhost:3000 100 50 15000 1 true

# Test via IP
node scripts/nginx-stress-test.js http://43.154.127.194 50 30 10000

# With environment variables
STRESS_URL=https://test.conetlearn.com STRESS_CONCURRENCY=100 STRESS_USER_ID=1 STRESS_USE_AUTH=true node scripts/nginx-stress-test.js
```

**Parameters:**
- `BASE_URL` - Base URL to test (default: http://localhost:3000)
- `concurrency` - Number of concurrent workers (default: 100)
- `requestsPerWorker` - Requests per worker (default: 50)
- `timeoutMs` - Timeout per request in ms (default: 15000)
- `userId` - User ID for authentication (optional)
- `useAuth` - Set to 'true' to enable authentication (optional, default: false)

**Note:** Some API endpoints require authentication. If you see 401 Unauthorized errors, that's expected when testing without authentication. To test with authentication, provide a valid userId and set useAuth to 'true'.

**What it tests:**
- Homepage (`/`)
- API endpoints (`/api/user-consent-status`, `/api/user-consent`)
- Static files (`/robots.txt`, `/.well-known/security.txt`)

**Output includes:**
- Overall success/error rates
- Per-endpoint statistics
- Error categorization (connection refused, timeouts, etc.)
- Nginx-specific error detection (502, 503, 504)
- Latency percentiles
- Diagnostic recommendations

### 2. `message-stress-test.js` - Database Write Stress Test

**NEW:** Simulates multiple logged-in users sending messages to stress database writes.

This is specifically designed to trigger database connection pool exhaustion that causes nginx "Connection refused" errors.

**Usage:**
```bash
# Test with default settings (50 users, 10 messages each)
node scripts/message-stress-test.js http://conetlearn.com

# Test with high concurrency (100 users, 20 messages each)
node scripts/message-stress-test.js http://conetlearn.com 100 20 15000

# Test with specific groupId and userId range
node scripts/message-stress-test.js http://localhost:3000 50 10 15000 1 1 20

# With environment variables
MESSAGE_STRESS_URL=http://conetlearn.com MESSAGE_CONCURRENCY=100 MESSAGES_PER_USER=20 node scripts/message-stress-test.js
```

**Parameters:**
- `BASE_URL` - Base URL to test (default: http://localhost:3000)
- `concurrency` - Number of concurrent users (default: 50)
- `messagesPerUser` - Messages each user sends (default: 10)
- `timeoutMs` - Timeout per request in ms (default: 15000)
- `groupId` - Group ID to send messages to (optional, defaults to 1)
- `userIdStart` - Starting user ID (default: 1)
- `userIdCount` - Number of user IDs to cycle through (default: 10)

**What it does:**
- Simulates multiple logged-in users (with authentication cookies)
- Sends POST requests with FormData (mimicking Server Action calls)
- Each user sends multiple messages to stress database writes
- Tests database connection pool under high concurrent write load
- This should trigger the "Connection refused" errors you saw before

**Output includes:**
- Success/error rates for database writes
- Connection refused detection (the error you're looking for!)
- Per-user statistics
- Database-related error analysis
- Specific recommendations for connection pool issues

**Note:** This script specifically targets database write operations, which is where connection pool exhaustion typically occurs.

### 3. `nginx-health-check.js` - Quick Health Check

Lightweight script for quick connectivity checks.

**Usage:**
```bash
# Quick check (10 requests, 1 second interval)
node scripts/nginx-health-check.js https://test.conetlearn.com

# Custom interval and count
node scripts/nginx-health-check.js https://test.conetlearn.com 500 20

# With environment variables
HEALTH_URL=https://test.conetlearn.com HEALTH_INTERVAL=2000 HEALTH_COUNT=5 node scripts/nginx-health-check.js
```

**Parameters:**
- `BASE_URL` - Base URL to test (default: http://localhost:3000)
- `intervalMs` - Interval between checks in ms (default: 1000)
- `count` - Number of checks to run (default: 10)

## Common Issues and Solutions

### Connection Refused (ECONNREFUSED)

**Symptoms:**
```
nginx error: connect() failed (111: Connection refused) while connecting to upstream
```

**Diagnosis:**
```bash
# Check if app is running
curl http://127.0.0.1:3000

# Check process status (if using PM2)
pm2 status

# Check process status (if using systemd)
systemctl status your-app-name

# Check if port is listening
netstat -tlnp | grep 3000
# or
ss -tlnp | grep 3000
```

**Solutions:**
1. **App not running:** Start the Next.js application
2. **App crashed:** Check application logs for errors
3. **Wrong port:** Verify nginx upstream points to correct port
4. **Firewall:** Check if local firewall is blocking connections

### 502 Bad Gateway

**Symptoms:**
- High number of 502 responses in stress test
- nginx error logs show upstream connection failures

**Diagnosis:**
```bash
# Check nginx error logs
tail -f /var/log/nginx/error.log

# Check app logs
pm2 logs your-app-name
# or
journalctl -u your-app-name -f

# Check database connection
# (if using Supabase, check connection pool)
```

**Solutions:**
1. **App crashing:** Review app logs for errors
2. **Database pool exhaustion:** Increase connection pool size in `lib/db.ts`
3. **Memory issues:** Check system memory usage
4. **Process management:** Use PM2 or systemd with auto-restart

### 504 Gateway Timeout

**Symptoms:**
- Requests taking longer than nginx timeout
- App responding but very slowly

**Solutions:**
1. **Increase nginx timeouts:**
   ```nginx
   proxy_read_timeout 60s;
   proxy_connect_timeout 60s;
   proxy_send_timeout 60s;
   ```

2. **Optimize slow queries:** Check database query logs
3. **Increase app resources:** More CPU/memory for Node.js
4. **Add caching:** Cache frequently accessed data

### High Error Rate Under Load

**Symptoms:**
- Stress test shows high error rate (>10%)
- Mostly connection refused or timeouts

**Solutions:**
1. **Connection pool:** Increase database pool size (currently 10)
2. **Rate limiting:** Add rate limiting to prevent overload
3. **Horizontal scaling:** Run multiple app instances with load balancing
4. **Resource limits:** Increase system resources (CPU, memory, file descriptors)

## Nginx Configuration Recommendations

### Upstream Configuration

```nginx
upstream nextjs_backend {
    # Use least_conn for better load distribution
    least_conn;
    
    # Add multiple instances if available
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    # server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;  # If running multiple instances
    keepalive 32;
}

server {
    listen 80;
    server_name test.conetlearn.com;
    
    location / {
        proxy_pass http://nextjs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }
}
```

### Monitoring

Add nginx status monitoring:

```nginx
location /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;
    deny all;
}
```

Then monitor:
```bash
watch -n 1 'curl -s http://localhost/nginx_status'
```

## Database Connection Pool Tuning

The current pool settings in `lib/db.ts`:
- `max: 10` - Maximum connections
- `idle_timeout: 20` - Idle timeout
- `connect_timeout: 10` - Connection timeout

For high concurrency, consider:
```typescript
const sql = postgres(connectionString, {
  max: 20,  // Increase for higher concurrency
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
  prepare: false  // Disable prepared statements for better performance
})
```

**Note:** Don't exceed your database's max connection limit. Check Supabase dashboard for connection limits.

## Example Test Scenarios

### Scenario 1: Baseline Test
```bash
# Low concurrency to establish baseline
node scripts/nginx-stress-test.js https://test.conetlearn.com 10 20 10000
```

### Scenario 2: Production Load Simulation
```bash
# Simulate production traffic
node scripts/nginx-stress-test.js https://test.conetlearn.com 100 50 15000
```

### Scenario 3: Burst Test
```bash
# Simulate traffic spike
node scripts/nginx-stress-test.js https://test.conetlearn.com 200 100 20000
```

### Scenario 4: Continuous Monitoring
```bash
# Run health check every 5 seconds
while true; do
  node scripts/nginx-health-check.js https://test.conetlearn.com 5000 1
  sleep 5
done
```

## Interpreting Results

### Good Results
- Error rate < 1%
- No connection refused errors
- p95 latency < 5000ms
- No 502/503/504 errors

### Warning Signs
- Error rate 1-5%
- Occasional connection refused
- p95 latency 5000-10000ms
- Some 502 errors

### Critical Issues
- Error rate > 5%
- Frequent connection refused
- p95 latency > 10000ms
- Many 502/503/504 errors

## Next Steps After Diagnosis

1. **Review logs:** Check application logs with request IDs
2. **Database optimization:** Review slow query logs
3. **Resource monitoring:** Monitor CPU, memory, file descriptors
4. **Scale horizontally:** Run multiple app instances
5. **Add caching:** Cache frequently accessed data
6. **Database connection pooling:** Use PgBouncer or similar

## Support

If issues persist after following these recommendations:
1. Collect stress test results
2. Check nginx error logs
3. Check application logs with request IDs
4. Review database connection metrics
5. Check system resource usage (CPU, memory, disk)

