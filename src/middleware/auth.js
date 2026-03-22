const jwt = require('jsonwebtoken');
const Shop = require('../models/Shop');

/**
 * Middleware: verify JWT issued at OAuth callback.
 * Attaches req.shop to every protected route.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const shop    = await Shop.findOne({ shopDomain: decoded.shopDomain, isActive: true });

    if (!shop) {
      return res.status(401).json({ error: 'Shop not found or inactive' });
    }

    req.shop = shop;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired — re-authenticate' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Middleware: verify this request came from Shopify (HMAC).
 * Used on the /auth/callback route.
 */
const verifyShopifyHmac = (req, res, next) => {
  const crypto = require('crypto');
  const { hmac, ...rest } = req.query;
  if (!hmac) return res.status(400).json({ error: 'Missing HMAC' });

  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  if (digest !== hmac) {
    return res.status(401).json({ error: 'HMAC validation failed' });
  }
  next();
};

/**
 * Middleware: pro-only gate.
 * Must come after authMiddleware.
 */
const requirePro = (req, res, next) => {
  if (!req.shop.isPro()) {
    return res.status(403).json({
      error: 'Pro plan required',
      upgradeUrl: `${process.env.SHOPIFY_APP_URL}/billing/upgrade`,
    });
  }
  next();
};

module.exports = { authMiddleware, verifyShopifyHmac, requirePro };
