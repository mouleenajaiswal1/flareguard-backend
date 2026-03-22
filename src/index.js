require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const compression  = require('compression');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const connectDB    = require('../config/db');

// ── Routes ────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const eventsRoutes    = require('./routes/events');
const analyticsRoutes = require('./routes/analytics');
const shopRoutes      = require('./routes/shop');
const billingRoutes   = require('./routes/billing');
const scriptService   = require('./services/scriptService');
const Shop            = require('./models/Shop');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Connect DB ────────────────────────────────────────────────
connectDB();

// ── Raw body needed for Shopify HMAC webhook verification ─────
app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => { req.rawBody = data; next(); });
});

// ── Core middleware ───────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS — allow Shopify admin embedding ──────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Allow Shopify admin, your app domain, and localhost in dev
    const allowed = [
      'https://admin.shopify.com',
      process.env.SHOPIFY_APP_URL,
      'http://localhost:3000',
      'http://localhost:3001',
    ];
    if (!origin || allowed.some(o => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(null, true); // loosen in prod if needed
    }
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 120,               // 120 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,               // higher limit for event tracking endpoint
  message: { error: 'Too many requests' },
});

app.use('/api/', apiLimiter);
app.use('/events/track', trackLimiter);

// ── Routes ────────────────────────────────────────────────────
app.use('/auth',      authRoutes);
app.use('/events',    eventsRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/shop',      shopRoutes);
app.use('/billing',   billingRoutes);

// ── Dynamic script serving ─────────────────────────────────────
// GET /script/:shopDomain.js
// Served to the Shopify storefront via Script Tag.
// Must be fast — set a long cache TTL but bust on settings change.
app.get('/script/:shopDomain.js', async (req, res) => {
  const { shopDomain } = req.params;
  try {
    const shop = await Shop.findOne({ shopDomain, isActive: true });
    if (!shop) {
      return res.status(404).send('/* FlareGuard: shop not found */');
    }
    const js = scriptService.generateScript(shop);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.send(js);
  } catch (err) {
    res.status(500).send(`/* FlareGuard error: ${err.message} */`);
  }
});

// ── Health check (for Render) ─────────────────────────────────
// ── Root route — redirect to frontend ────────────────────────
app.get('/', (req, res) => {
  const { shop, host } = req.query
  if (shop) {
    return res.redirect(
      `https://flareguard-frontend.onrender.com?shop=${shop}&host=${host || ''}`
    )
  }
  res.redirect('https://flareguard-frontend.onrender.com')
});
// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────────┐
  │  🔥 FlareGuard Backend                      │
  │     Port     : ${PORT}                          │
  │     Env      : ${(process.env.NODE_ENV || 'development').padEnd(12)}               │
  │     Health   : http://localhost:${PORT}/health  │
  └─────────────────────────────────────────────┘
  `);
});

module.exports = app;
