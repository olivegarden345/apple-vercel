# Deployment Notes

## Current Deployment: Railway

This app is deployed on **Railway** (project: courageious-determination).

## How Railway Deployment Works

Railway automatically deploys when you push to your connected branch (usually `main`):

1. **Push to GitHub**: `git push`
2. **Railway detects the push** and automatically starts a new deployment
3. **Your app updates** on Railway's servers

No manual steps needed! Just push your code.

## To Deploy Updates

Simply push your changes:
```bash
git add .
git commit -m "Your commit message"
git push
```

Railway will automatically:
- Detect the push
- Install dependencies (`npm install`)
- Start your server (`npm start`)
- Deploy the new version

## Check Deployment Status

1. Go to https://railway.app
2. Open your project "courageious-determination"
3. Check the "Deployments" tab to see deployment status
4. View logs if there are any issues

## Important Notes

- **WebSocket Support**: Railway fully supports WebSocket connections (unlike Vercel)
- **Auto-deploy**: Railway watches your GitHub repo and auto-deploys on push
- **Environment Variables**: Set any needed env vars in Railway dashboard
- **Port**: Railway automatically sets `PORT` environment variable - your server.js already uses this

## Disconnect Vercel (if needed)

If Vercel is also connected and deploying:
1. Go to https://vercel.com
2. Go to your project settings
3. Disconnect the GitHub repository
4. Or delete the Vercel project

## Local Development

```bash
npm install
npm start
```

The server will run on http://localhost:3000

