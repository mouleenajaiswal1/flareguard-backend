# 🔥 FlareGuard Backend

**Node.js + Express + MongoDB backend for the FlareGuard Shopify App.**

Handles Shopify OAuth, dynamic script serving, redirect event tracking,
analytics aggregation, email alerts, and Shopify billing.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Shopify Storefront                                         │
│  ↳ <script src="https://your-app.onrender.com/script/      │
│              mystore.myshopify.com.js">                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ navigator.sendBeacon (event tracking)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  FlareGuard Backend  (Render)                               │
│                                                             │
│  POST /events/track        ← hot path, rate-limited         │
│  GET  /script/:domain.js   ← dynamic JS generation          │
│  GET  /auth/install        ← Shopify OAuth step 1           │
│  GET  /auth/callback       ← Shopify OAuth step 2           │
│  GET  /analytics/*         ← dashboard data (JWT auth)      │
│  PUT  /settings            ← toggle platforms (JWT auth)    │
│  PUT  /alerts              ← configure email alerts         │
│  GET  /billing/upgrade     ← Shopify recurring charge       │
└──────────────────────┬──────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
         MongoDB Atlas      Nodemailer
         (shops,events)     (Gmail SMTP)
```

---

## Folder Structure

```
flareguard-backend/
├── config/
│   └── db.js                  MongoDB connection
├── src/
│   ├── index.js               Express app entry point
│   ├── models/
│   │   ├── Shop.js            Store settings, plan, usage
│   │   └── RedirectEvent.js   Each in-app detection log
│   ├── routes/
│   │   ├── auth.js            Shopify OAuth + webhooks
│   │   ├── events.js          /events/track + log listing
│   │   ├── analytics.js       Dashboard charts + stats
│   │   ├── shop.js            Settings, alerts, branding
│   │   └── billing.js         Shopify recurring charges
│   ├── middleware/
│   │   └── auth.js            JWT + HMAC + Pro guard
│   └── services/
│       ├── scriptService.js   Dynamic JS generation + inject
│       └── emailService.js    All email templates
├── render.yaml                One-click Render deploy
└── .env.example               All required env vars
```

---

## Setup

### 1. Create Shopify App
1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Create App → Custom App
3. Set **App URL**: `https://your-app.onrender.com`
4. Set **Redirect URL**: `https://your-app.onrender.com/auth/callback`
5. Copy API Key + Secret

### 2. MongoDB Atlas
1. Create free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create database user
3. Whitelist all IPs (`0.0.0.0/0`) for Render
4. Copy connection string

### 3. Local Development
```bash
git clone <your-repo>
cd flareguard-backend
npm install
cp .env.example .env
# Fill in your .env values
npm run dev
```

### 4. Deploy to Render
```bash
# Option A: Push render.yaml to GitHub → connect in Render dashboard
# Option B: Manual
1. New Web Service → connect GitHub repo
2. Build: npm install
3. Start: npm start
4. Add all env vars from .env.example
```

---

## API Reference

### Public Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/auth/install?shop=` | Start OAuth |
| GET | `/auth/callback` | OAuth callback |
| POST | `/auth/uninstall` | Shopify webhook |
| POST | `/events/track` | Log redirect event (from script) |
| GET | `/script/:shopDomain.js` | Serve dynamic script |

### Protected (JWT Bearer Token)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/shop` | Shop info + usage |
| GET | `/settings` | Load settings |
| PUT | `/settings` | Save settings |
| GET | `/alerts` | Load alert config |
| PUT | `/alerts` | Save alert config |
| POST | `/alerts/test` | Send test email |
| GET | `/analytics/summary` | Stat card data |
| GET | `/analytics/daily` | Bar chart data |
| GET | `/analytics/platforms` | Platform breakdown |
| GET | `/analytics/os` | iOS vs Android |
| GET | `/events` | Detection log |
| GET | `/events/export` | CSV export (Pro) |
| GET | `/billing/upgrade` | Start Pro upgrade |
| GET | `/billing/confirm` | Confirm charge |
| POST | `/billing/downgrade` | Cancel Pro |
| GET | `/branding` | Load branding (Pro) |
| PUT | `/branding` | Save branding (Pro) |

---

## Freemium Logic

| Feature | Free | Pro ($9/mo) |
|---------|------|-------------|
| Redirects/month | 500 | Unlimited |
| Analytics history | 7 days | 90 days |
| Log events | 50 shown | Full history |
| CSV export | ✗ | ✓ |
| White-label | ✗ | ✓ |
| Custom UA rules | ✗ | ✓ |
| Support | Community | Priority |

---

## Email Alerts Sent
- ✅ Welcome (on install)
- ⚠️ Free limit 80% warning
- 📈 Redirect spike (3× previous hour)
- 📊 Weekly performance digest
- 🎉 Pro upgrade confirmation
- 🔧 Test email (manual trigger)
