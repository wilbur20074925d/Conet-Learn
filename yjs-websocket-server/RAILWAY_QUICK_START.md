# Railway Quick Start - 5 Minute Deployment

## 🚀 Quick Deployment Steps

### Step 1: Prepare Supabase Credentials (2 minutes)

1. Go to your Supabase project: https://app.supabase.com
2. Click on your project
3. Go to **Settings** → **API**
4. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **service_role** key (under "Service Role" section - keep this secret!)

### Step 2: Deploy on Railway (3 minutes)

#### Option A: From GitHub (Recommended)

1. **Go to Railway**: https://railway.app
   - Sign up/login with GitHub

2. **Create New Project**:
   - Click **"New Project"**
   - Select **"Deploy from GitHub repo"**
   - Choose your repository

3. **Configure Service**:
   - Railway auto-detects Node.js ✅
   - Click on the service
   - Go to **Settings** tab
   - Set **Root Directory** to: `yjs-websocket-server`
   - Click **Save**

4. **Add Environment Variables**:
   - Go to **Variables** tab
   - Click **"New Variable"**
   - Add these 4 variables:

   ```
   Name: SUPABASE_URL
   Value: https://your-project.supabase.co
   ```

   ```
   Name: SUPABASE_SERVICE_ROLE_KEY
   Value: your_service_role_key_here
   ```

   ```
   Name: PORT
   Value: (leave empty - Railway sets this automatically)
   ```

   ```
   Name: HOST
   Value: 0.0.0.0
   ```

5. **Get Your WebSocket URL**:
   - Go to **Settings** → **Domains**
   - Copy the domain (e.g., `tdgsystem-production.up.railway.app`)
   - Your WebSocket URL is: `wss://tdgsystem-production.up.railway.app`

#### Option B: Using Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Navigate to server directory
cd yjs-websocket-server

# Initialize Railway project
railway init

# Add environment variables
railway variables set SUPABASE_URL=https://your-project.supabase.co
railway variables set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
railway variables set HOST=0.0.0.0

# Deploy
railway up
```

### Step 3: Verify Deployment

1. **Check Logs**:
   - Go to **Deployments** tab
   - Click latest deployment
   - Look for: `[Yjs Server] Listening on ws://0.0.0.0:XXXX`
   - Should see: `[Yjs Server] Supabase connected for persistence`

2. **Test Connection** (in browser console):
   ```javascript
   const ws = new WebSocket('wss://tdgsystem-production.up.railway.app?room=test&userId=test');
   ws.onopen = () => console.log('✅ Connected!');
   ws.onerror = (e) => console.error('❌ Error:', e);
   ```

### Step 4: Update Frontend

Add to your `.env` file:
```env
VITE_YJS_WS_URL=wss://tdgsystem-production.up.railway.app
```

Or in your code:
```typescript
const YJS_WS_URL = 'wss://tdgsystem-production.up.railway.app';
```

## ✅ Checklist

- [ ] Supabase credentials copied
- [ ] Railway project created
- [ ] Root directory set to `yjs-websocket-server`
- [ ] Environment variables added
- [ ] Deployment successful (check logs)
- [ ] WebSocket URL copied
- [ ] Frontend updated with WebSocket URL
- [ ] Connection test passed

## 🐛 Troubleshooting

**Server not starting?**
- Check logs in Railway dashboard
- Verify environment variables are set correctly
- Ensure Supabase URL and key are correct

**Connection fails?**
- Use `wss://` not `ws://` (Railway uses HTTPS)
- Check Railway logs for errors
- Verify service is running (green status)

**Need help?**
- See full guide: `RAILWAY_DEPLOYMENT.md`
- Check Railway logs
- Verify all environment variables

## 📝 Notes

- Railway automatically sets `PORT` - don't override it
- Use `wss://` (secure WebSocket) for Railway
- Free tier includes $5/month credit
- Service auto-restarts on failure

---

**Your WebSocket URL:**
```
wss://tdgsystem-production.up.railway.app
```

**Example connection:**
```
wss://tdgsystem-production.up.railway.app?room=project-abc123&userId=user-xyz789
```
