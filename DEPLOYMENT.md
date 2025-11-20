# Deployment Notes

## Important: WebSocket Support Required

This application uses Socket.io for real-time multiplayer functionality, which requires **persistent WebSocket connections**. 

**Vercel's serverless functions do NOT support persistent WebSocket connections**, so this app will not work properly on Vercel.

## Recommended Deployment Platforms

For this app to work correctly, deploy it on a platform that supports persistent connections:

1. **Railway** (https://railway.app) - Easy deployment, supports WebSockets
2. **Render** (https://render.com) - Free tier available, supports WebSockets
3. **Fly.io** (https://fly.io) - Good for Node.js apps with WebSockets
4. **DigitalOcean App Platform** - Supports WebSockets
5. **Heroku** - Classic platform, supports WebSockets (paid)

## Quick Deploy to Railway

1. Sign up at https://railway.app
2. Create a new project
3. Connect your GitHub repository
4. Railway will auto-detect Node.js and deploy
5. Your app will be live with WebSocket support!

## Local Development

```bash
npm install
npm start
```

The server will run on http://localhost:3000

