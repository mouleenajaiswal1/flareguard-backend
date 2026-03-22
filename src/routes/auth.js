const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');
const Shop     = require('../models/Shop');
const { verifyShopifyHmac } = require('../middleware/auth');
const scriptService = require('../services/scriptService');
const emailService  = require('../services/emailService');

const router = express.Router();

// ── Step 1: Merchant clicks "Install" on Shopify App Store ──
// GET /auth/install?shop=mystore.myshopify.com
router.get('/install', verifyShopifyHmac, (req, res) => {
  const { shop } = req.query;
  if (!shop || !shop.endsWith('.myshopify.com')) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  const scopes      = process.env.SHOPIFY_SCOPES;
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/auth/callback`;
  const state       = crypto.randomBytes(16).toString('hex');

  // Store state in a cookie to verify later
  res.cookie('shopify_state', state, { httpOnly: true, secure: true, sameSite: 'lax' });

  const authUrl = `https://${shop}/admin/oauth/authorize` +
    `?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(authUrl);
});

// ── Step 2: Shopify redirects back with code ────────────────
// GET /auth/callback?shop=...&code=...&state=...&hmac=...
router.get('/callback', verifyShopifyHmac, async (req, res) => {
  const { shop, code, state } = req.query;
  const cookieState = req.cookies?.shopify_state;

  // Validate state
  if (!cookieState || cookieState !== state) {
    return res.status(403).json({ error: 'State mismatch — possible CSRF' });
  }

  try {
    // Exchange code for permanent access token
    const tokenRes = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id:     process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }
    );
    const accessToken = tokenRes.data.access_token;

    // Fetch shop details from Shopify API
    const shopRes = await axios.get(
      `https://${shop}/admin/api/2024-01/shop.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    const shopData = shopRes.data.shop;

    // Upsert shop in MongoDB
    const dbShop = await Shop.findOneAndUpdate(
      { shopDomain: shop },
      {
        shopDomain:  shop,
        accessToken,
        shopName:    shopData.name,
        shopEmail:   shopData.email,
        shopOwner:   shopData.shop_owner,
        currency:    shopData.currency,
        timezone:    shopData.iana_timezone,
        isActive:    true,
        uninstalledAt: null,
        $setOnInsert: { installedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    // Inject script tag into Shopify theme
    await scriptService.injectScriptTag(dbShop);

    // Welcome email
    await emailService.sendWelcome(dbShop);

    // Issue JWT for dashboard
    const token = jwt.sign(
      { shopDomain: shop },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Redirect merchant to the embedded app dashboard
    res.redirect(
      `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?token=${token}`
    );

  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.status(500).json({ error: 'OAuth failed', detail: err.message });
  }
});

// ── Shopify Webhook: app/uninstalled ────────────────────────
// POST /auth/uninstall
router.post('/uninstall', async (req, res) => {
  // Verify webhook HMAC
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const rawBody    = req.rawBody; // requires express raw body middleware
  const digest     = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  if (digest !== hmacHeader) {
    return res.status(401).json({ error: 'Webhook HMAC invalid' });
  }

  const { domain } = req.body;
  await Shop.findOneAndUpdate(
    { shopDomain: domain },
    { isActive: false, uninstalledAt: new Date(), accessToken: '' }
  );

  console.log(`🗑 Shop uninstalled: ${domain}`);
  res.status(200).send('ok');
});

// ── Token refresh — get a new JWT ───────────────────────────
// POST /auth/token  { shopDomain }
router.post('/token', async (req, res) => {
  const { shopDomain } = req.body;
  const shop = await Shop.findOne({ shopDomain, isActive: true });
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const token = jwt.sign(
    { shopDomain },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.json({ token });
});

module.exports = router;
