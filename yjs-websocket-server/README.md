# Yjs WebSocket Server

WebSocket server for Yjs collaborative editing, designed to run on Railway.

## Features

- Real-time collaborative editing using Yjs CRDT
- Room-based document isolation
- Automatic document management
- Graceful shutdown handling

## Railway Deployment

### Option 1: Deploy via Railway CLI

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Initialize Railway project:
   ```bash
   cd yjs-websocket-server
   railway init
   ```

4. Deploy:
   ```bash
   railway up
   ```

### Option 2: Deploy via Railway Dashboard

1. Go to [Railway Dashboard](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo" (if connected) or "Empty Project"
4. If empty project:
   - Click "Add Service" → "GitHub Repo"
   - Select your repository
   - Set root directory to `yjs-websocket-server`
5. Railway will auto-detect Node.js and deploy
6. The service will be available at: `wss://your-service-name.up.railway.app`

### Environment Variables

Railway will automatically set `PORT`. Set these for Co-net Learn persistence:

- `PORT` - Port to listen on (default: 1234, Railway sets this automatically)
- `HOST` - Host to bind to (default: 0.0.0.0)
- `SUPABASE_URL` - Same project URL as Co-net Learn
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side only)
- `YJS_NOTES_TABLE` - optional, defaults to `ConetCollaborativeNotes`

Apply `supabase/conet-collaborative-notes.sql` in the Co-net Supabase project before relying on persistence.

### Getting the WebSocket URL

After deployment, Railway will provide a public URL. Use it as:

```
wss://your-service-name.up.railway.app
```

Or if Railway provides a custom domain:
```
wss://your-custom-domain.com
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start server:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

3. Server runs on `ws://localhost:1234`

## Usage

Connect to a room using:

```
ws://localhost:1234?room=collab-notebook-{noteId}
```

The room name is used to isolate documents. Each room maintains its own Yjs document.

## Architecture

- Each room (identified by `?room=` query param) gets its own Y.Doc
- Documents are stored in memory (consider Redis for production scaling)
- Multiple clients can connect to the same room for real-time collaboration

## Production Considerations

For production, consider:

1. **Persistence**: Add Redis or database persistence for documents
2. **Authentication**: Add auth middleware to verify user tokens
3. **Rate Limiting**: Add rate limiting to prevent abuse
4. **Monitoring**: Add logging and monitoring (e.g., Sentry)
5. **Scaling**: Use Redis pub/sub for multi-instance scaling

## Example with Redis (Optional)

To add Redis persistence, install `ioredis` and modify `server.js`:

```javascript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Load document from Redis on room creation
// Save document updates to Redis
```
