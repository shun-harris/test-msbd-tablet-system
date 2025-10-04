# Production Deployment Checklist

## Before Deploying:

### 1. Create Environment Variables File
Create `.env` file (don't commit this):
```
STRIPE_SECRET_KEY=your_stripe_secret_key_here
PORT=3000
```

### 2. Update server.js to use environment variables
### 3. Update options.html with production API URL
### 4. Test with Stripe test cards first

## After Deploying:

### 1. Get your production URL from hosting service
### 2. Update API_BASE in options.html
### 3. Update CORS settings if needed
### 4. Test thoroughly with test cards
### 5. Switch to live Stripe keys when ready

## Hosting Service URLs:
- **Railway:** https://your-app.up.railway.app
- **Render:** https://your-app.onrender.com  
- **Heroku:** https://your-app.herokuapp.com

## Testing Flow:
1. Deploy server to hosting service
2. Update frontend with production API URL
3. Test with Stripe test cards
4. Deploy frontend to GitHub Pages
5. Everything works without your laptop!