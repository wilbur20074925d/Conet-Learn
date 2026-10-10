# Deployment Checklist

## New API Route Deployment

The `/app/api/send-message/route.ts` file needs to be deployed to production.

### Files to Deploy:
- ✅ `app/api/send-message/route.ts` - **NEW FILE** - Must be deployed

### Deployment Steps:

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Deploy to your server:**
   - Copy the entire `app/api/send-message/` directory to production
   - Or deploy via your usual deployment method (git push, CI/CD, etc.)

3. **Restart the Next.js application:**
   ```bash
   # If using PM2:
   pm2 restart your-app-name
   
   # If using systemd:
   sudo systemctl restart your-app-name
   
   # If using Docker:
   docker-compose restart
   ```

4. **Verify the route is available:**
   ```bash
   curl -X POST http://conetlearn.com/api/send-message \
     -H "Content-Type: application/json" \
     -H "Cookie: userId_80=1" \
     -d '{"message":"test","groupId":1}'
   ```
   
   Expected responses:
   - `401 Unauthorized` - Route exists, but needs valid auth (good sign!)
   - `400 Bad Request` - Route exists, but request is invalid (good sign!)
   - `200 OK` - Route works perfectly!
   - `404 Not Found` - Route not deployed yet

### After Deployment:

Run the stress test again:
```bash
node scripts/message-stress-test.js http://conetlearn.com 100 20 15000
```

---

## Other Files Already Deployed (No Changes Needed):

These files were already in your codebase:
- ✅ `lib/logger.ts` - Logging utilities
- ✅ `lib/api-logger.ts` - API logging wrapper
- ✅ `lib/db.ts` - Database connection (already deployed)
- ✅ `middleware.ts` - Request ID middleware
- ✅ `app/api/user-consent/route.ts` - Already exists
- ✅ `app/api/user-consent-status/route.ts` - Already exists

---

## Quick Test Commands:

### Test Local (Before Deployment):
```bash
node scripts/message-stress-test.js http://localhost:3000 100 10 15000
```

### Test Production (After Deployment):
```bash
node scripts/message-stress-test.js http://conetlearn.com 100 10 15000
```

### High Load Test (To Trigger Connection Pool Exhaustion):
```bash
# Local - Very high concurrency
node scripts/message-stress-test.js http://localhost:3000 200 30 15000

# Production - After deployment
node scripts/message-stress-test.js http://conetlearn.com 200 30 15000
```

---

## Troubleshooting:

### If you still get 404 after deployment:
1. Check if the file exists on the server: `ls -la app/api/send-message/route.ts`
2. Check Next.js build output for errors
3. Restart the application
4. Check application logs for route registration

### If you get other errors:
- **401 Unauthorized**: Route works! Just need valid user authentication
- **500 Server Error**: Route works! Check database connection
- **502 Bad Gateway**: Route works! But app might be crashing under load

