# Nginx Optimization Guide

## Current Issues

Based on your nginx error logs:
```
connect() failed (111: Connection refused) while connecting to upstream
```

This indicates the upstream Next.js app is not responding, likely due to:
1. Database connection pool exhaustion
2. App crashes/restarts under load
3. Insufficient nginx timeout/retry configuration

## Recommended Nginx Configuration

### 1. Upstream Configuration with Health Checks

```nginx
upstream nextjs_backend {
    # Use least_conn for better load distribution
    least_conn;
    
    # Primary server
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    
    # Keep connections alive to reduce overhead
    keepalive 32;
    keepalive_timeout 60s;
    keepalive_requests 100;
}

# Health check endpoint (optional but recommended)
server {
    listen 8080;
    server_name localhost;
    
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

### 2. Main Server Configuration with Robust Error Handling

```nginx
server {
    listen 80;
    server_name conetlearn.com test.conetlearn.com;
    
    # Increase timeouts for database operations
    proxy_connect_timeout 30s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Buffer settings to handle slow responses
    proxy_buffering on;
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 8k;
    proxy_temp_file_write_size 8k;
    
    # Connection reuse
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    
    # Headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Retry logic for upstream failures
    proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
    proxy_next_upstream_tries 3;
    proxy_next_upstream_timeout 10s;
    
    location / {
        proxy_pass http://nextjs_backend;
        proxy_cache_bypass $http_upgrade;
        
        # Additional error handling
        proxy_intercept_errors on;
        error_page 502 503 504 = @fallback;
    }
    
    # Fallback handler for upstream errors
    location @fallback {
        default_type application/json;
        return 503 '{"error":"Service temporarily unavailable","retry_after":5}';
        add_header Retry-After 5;
    }
    
    # Static files caching
    location /_next/static {
        proxy_pass http://nextjs_backend;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3. Error Log Monitoring

Add to your nginx configuration:

```nginx
# Separate error log for upstream issues
error_log /var/log/nginx/error.log warn;
error_log /var/log/nginx/upstream_error.log error;

# Log upstream connection issues specifically
log_format upstream_log '$remote_addr - $remote_user [$time_local] '
                       '"$request" $status $body_bytes_sent '
                       '"$http_referer" "$http_user_agent" '
                       'upstream: $upstream_addr '
                       'upstream_status: $upstream_status '
                       'upstream_response_time: $upstream_response_time '
                       'request_time: $request_time';

access_log /var/log/nginx/access.log upstream_log;
```

### 4. Rate Limiting (Prevent Connection Pool Exhaustion)

```nginx
# Define rate limit zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=message_limit:10m rate=2r/s;

server {
    # ... other config ...
    
    # Rate limiting for API endpoints
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        limit_req_status 429;
        
        proxy_pass http://nextjs_backend;
        # ... proxy settings ...
    }
    
    # Stricter rate limiting for message sending
    location ~ ^/api/(send-message|user-consent) {
        limit_req zone=message_limit burst=5 nodelay;
        limit_req_status 429;
        
        proxy_pass http://nextjs_backend;
        # ... proxy settings ...
    }
}
```

### 5. Connection Pool Monitoring

Add nginx status monitoring:

```nginx
location /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;
    deny all;
}
```

Monitor with:
```bash
watch -n 1 'curl -s http://localhost/nginx_status'
```

## Application-Level Improvements

### 1. Database Connection Pool

Current: `max: 10` connections

For high concurrency, consider:
```typescript
// lib/db.ts
const sqlBase = postgres(connectionString, {
  max: 15, // Increased from 10
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
  prepare: false,
  retry: {
    max: 3,
    timeout: 5000,
    backoff: (attempt) => Math.min(attempt * 1000, 5000)
  }
})
```

### 2. Polling Frequency Reduced

Changed from 3 seconds to 8 seconds with exponential backoff:
- Reduces database load by ~60%
- Better error handling with retry logic
- Adaptive polling based on connection health

### 3. Error Recovery

- Exponential backoff for failed polls
- Connection retry logic in database client
- Graceful degradation when upstream is unavailable

## Monitoring Commands

### Check nginx status
```bash
# Upstream connections
curl http://localhost/nginx_status

# Error logs
tail -f /var/log/nginx/error.log | grep "upstream"

# Connection refused errors
tail -f /var/log/nginx/error.log | grep "Connection refused"
```

### Monitor database connections
```bash
# If using PostgreSQL directly
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'your_db_name';"
```

### Application health
```bash
# Check if app is responding
curl -I http://127.0.0.1:3000

# Check health endpoint (if added)
curl http://127.0.0.1:3000/health
```

## Deployment Checklist

1. ✅ Update nginx configuration with retry logic
2. ✅ Increase database connection pool (if needed)
3. ✅ Reduce polling frequency (already done)
4. ✅ Add error recovery mechanisms
5. ✅ Monitor error logs for connection refused patterns
6. ✅ Test with stress test script

## Quick Test

After applying changes:
```bash
# Test nginx configuration
nginx -t

# Reload nginx
sudo systemctl reload nginx

# Run stress test
node scripts/message-stress-test.js http://conetlearn.com 100 20 15000 1 1 10 api
```


