# Railway Deployment Guide - Yjs WebSocket Server

Complete step-by-step guide to deploy the Yjs WebSocket server on Railway.

## Prerequisites

- A Railway account (sign up at https://railway.app)
- A GitHub account (if deploying from GitHub)
- Your Supabase project URL and Service Role Key

## Step 1: Prepare Your Repository

### Option A: Deploy from GitHub (Recommended)

1. **Push your code to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Add Yjs WebSocket server"
   git push origin main
   ```

### Option B: Deploy from Local Directory

You can also deploy directly from your local `yjs-websocket-server` directory.

## Step 2: Create Railway Project

1. **Go to Railway Dashboard**: https://railway.app/dashboard
2. **Click "New Project"** button
3. **Choose deployment method**:
   - **From GitHub repo**: Select your repository
   - **Empty Project**: We'll add the service manually

## Step 3: Deploy the Service

### If deploying from GitHub:

1. **Select your repository** from the list
2. **Railway will detect** it's a Node.js project
3. **Set Root Directory**:
   - Click on the service
   - Go to **Settings** tab
   - Under **Root Directory**, set it to: `yjs-websocket-server`
   - Click **Save**

### If deploying Empty Project:

1. **Click "Add Service"**
2. **Select "GitHub Repo"**
3. **Choose your repository**
4. **Set Root Directory** to `yjs-websocket-server`

## Step 4: Configure Environment Variables

1. **Go to your service** in Railway dashboard
2. **Click on "Variables" tab**
3. **Add the following environment variables**:

   ```
   PORT=1234
   HOST=0.0.0.0
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

   **How to get Supabase credentials:**
   - Go to your Supabase project dashboard
   - Go to **Settings** → **API**
   - Copy **Project URL** → Use as `SUPABASE_URL`
   - Copy **service_role** key (under Service Role keys) → Use as `SUPABASE_SERVICE_ROLE_KEY`
   - ⚠️ **Important**: Never expose the service_role key publicly!

4. **Click "Add"** for each variable
5. Railway will automatically redeploy when you add variables

## Step 5: Configure Build Settings

1. **Go to "Settings" tab** in your Railway service
2. **Build Command**: Leave empty (Railway auto-detects)
3. **Start Command**: Should be `node server.js` (Railway should auto-detect)
4. **If not auto-detected**, set:
   - **Start Command**: `node server.js`
   - **Build Command**: (leave empty)

## Step 6: Deploy and Get URL

1. **Railway will automatically start deploying** when you:
   - Push code to GitHub (if connected)
   - Add environment variables
   - Make changes to settings

2. **Wait for deployment** to complete (check "Deployments" tab)

3. **Get your WebSocket URL**:
   - Go to **Settings** tab
   - Under **Domains** section, Railway provides a default domain
   - Your WebSocket URL will be: `wss://your-service-name.up.railway.app`
   - Or if you have a custom domain: `wss://your-custom-domain.com`

4. **Note the URL** - you'll need it for your frontend configuration

## Step 7: Test the Deployment

### Test WebSocket Connection:

You can test using a simple HTML file or browser console:

```javascript
// In browser console
const ws = new WebSocket('wss://your-service-name.up.railway.app?room=test-room&userId=test-user');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (event) => console.log('Message:', event.data);
ws.onerror = (error) => console.error('Error:', error);
ws.onclose = () => console.log('Disconnected');
```

### Check Logs:

1. **Go to "Deployments" tab**
2. **Click on the latest deployment**
3. **View logs** to see if server started correctly
4. **Look for**: `[Yjs Server] Listening on ws://0.0.0.0:1234`

## Step 8: Configure Frontend

Update your frontend to use the Railway WebSocket URL:

### Option A: Environment Variable (Recommended)

1. **Create/update `.env` file** in your frontend root:
   ```env
   VITE_YJS_WS_URL=wss://your-service-name.up.railway.app
   ```

2. **Or set in Railway** (if frontend is also on Railway):
   - Add environment variable: `VITE_YJS_WS_URL=wss://your-service-name.up.railway.app`

### Option B: Hardcode (for testing)

In your code:
```typescript
const YJS_WS_URL = 'wss://your-service-name.up.railway.app';
```

## Step 9: Set Up Custom Domain (Optional)

1. **Go to Settings** → **Domains**
2. **Click "Generate Domain"** or **"Custom Domain"**
3. **For Custom Domain**:
   - Add your domain (e.g., `yjs.yourdomain.com`)
   - Railway will provide DNS records to add
   - Add CNAME record pointing to Railway
   - Wait for DNS propagation

## Step 10: Monitor and Maintain

### View Logs:
- **Real-time logs**: Go to service → **Deployments** → Click latest deployment → **View Logs**
- **Check for errors**: Look for `[Yjs Server] Error` messages

### Monitor Usage:
- Railway dashboard shows **CPU**, **Memory**, and **Network** usage
- **Free tier** includes: $5 credit/month

### Restart Service:
- If needed, go to **Settings** → **Restart**

## Troubleshooting

### Issue: Server not starting

**Check logs** for errors:
- Missing environment variables
- Port conflicts
- Supabase connection issues

**Solution:**
- Verify all environment variables are set correctly
- Check Supabase URL and Service Role Key
- Ensure PORT is set (Railway sets this automatically, but you can override)

### Issue: WebSocket connection fails

**Possible causes:**
- Wrong URL format (should be `wss://` not `ws://` for Railway)
- CORS issues
- Firewall blocking WebSocket

**Solution:**
- Use `wss://` (secure WebSocket) for Railway
- Check Railway logs for connection attempts
- Verify the service is running (check deployment status)

### Issue: Changes not syncing

**Check:**
- WebSocket connection status in frontend
- Server logs for incoming connections
- Supabase database for tracked actions

**Solution:**
- Verify WebSocket URL is correct
- Check browser console for connection errors
- Verify Supabase credentials are correct

### Issue: High costs

**Monitor:**
- Railway dashboard shows usage
- Free tier: $5/month credit
- Consider upgrading if needed

**Optimize:**
- Use Redis for document persistence (reduces database calls)
- Implement connection pooling
- Add rate limiting

## Advanced Configuration

### Add Redis (for production scaling):

1. **Add Redis service** in Railway:
   - Click "Add Service" → "Database" → "Add Redis"

2. **Update environment variables**:
   ```
   REDIS_URL=redis://default:password@redis.railway.internal:6379
   ```

3. **Update server.js** to use Redis (see server.js comments)

### Add Health Check Endpoint:

Railway automatically monitors your service, but you can add a health endpoint:

```javascript
// Add to server.js
import { createServer } from 'http';

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
  }
});

httpServer.listen(process.env.PORT || 1234);
```

## Cost Estimation

**Railway Free Tier:**
- $5 credit/month
- Sufficient for development/testing
- ~500 hours of runtime

**Paid Plans:**
- Start at $5/month for more resources
- Scales automatically based on usage

## Security Considerations

1. **Never commit** `.env` files or service role keys
2. **Use Railway's environment variables** for secrets
3. **Enable authentication** on WebSocket connections (add JWT verification)
4. **Add rate limiting** to prevent abuse
5. **Monitor logs** for suspicious activity

## Next Steps

After successful deployment:

1. ✅ Test WebSocket connection
2. ✅ Update frontend with Railway URL
3. ✅ Test collaborative editing with multiple users
4. ✅ Monitor logs for any issues
5. ✅ Set up custom domain (optional)
6. ✅ Configure monitoring/alerts (optional)

## Support

If you encounter issues:
1. Check Railway logs
2. Check browser console
3. Verify environment variables
4. Review server.js for errors
5. Check Railway status page: https://status.railway.app

---

**Your WebSocket URL format:**
```
wss://your-service-name.up.railway.app
```

**Example room connection:**
```
wss://your-service-name.up.railway.app?room=project-abc123&userId=user-xyz789
```
