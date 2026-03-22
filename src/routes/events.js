const express        = require('express');
const { body, validationResult } = require('express-validator');
const RedirectEvent  = require('../models/RedirectEvent');
const Shop           = require('../models/Shop');
const emailService   = require('../services/emailService');
const analyticsService = require('../services/analyticsService');

const router = express.Router();

// ── POST /events/track ──────────────────────────────────────
// Called by the injected fg-redirect.js script (public, no auth)
// This is the hot path — must be fast.
router.post('/track',
  [
    body('shopDomain').isString().notEmpty(),
    body('platform').isString().notEmpty(),
    body('os').isIn(['ios','android','desktop','unknown']),
    body('method').isIn(['x-safari','intent','overlay','location','unknown']),
    body('status').isIn(['success','failed','overlay']),
    body('url').isString().optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      shopDomain, platform, os, method, status,
      url = '', userAgent = '',
      hasUtm = false, hasFbclid = false,
      hasTtclid = false, hasGclid = false, hasGa = false,
    } = req.body;

    try {
      // Load shop (cached in prod with Redis, here direct DB)
      const shop = await Shop.findOne({ shopDomain, isActive: true });
      if (!shop) return res.status(404).json({ error: 'Shop not found' });

      // Reset monthly counter if new month
      shop.resetMonthlyUsageIfNeeded();

      // Free plan limit check
      if (shop.isOverLimit()) {
        await shop.save();
        return res.status(429).json({
          error: 'Monthly redirect limit reached',
          limit: parseInt(process.env.FREE_REDIRECT_LIMIT || 500),
          upgradeUrl: `${process.env.SHOPIFY_APP_URL}/billing/upgrade`,
        });
      }

      // Increment counters
      shop.usage.detectedCount  += 1;
      if (status === 'success' || status === 'overlay') {
        shop.usage.redirectCount += 1;
      }

      // Save event + shop in parallel
      const ip = req.ip || '';
      const hashedIp = require('crypto')
        .createHash('sha256').update(ip).digest('hex').slice(0, 16);

      const [event] = await Promise.all([
        RedirectEvent.create({
          shopDomain,
          platform: platform.toLowerCase(),
          os, method, status,
          url:       url.slice(0, 300),
          userAgent: userAgent.slice(0, 400),
          ip:        hashedIp,
          hasUtm, hasFbclid, hasTtclid, hasGclid, hasGa,
          occurredAt: new Date(),
        }),
        shop.save(),
      ]);

      // Async: check alert thresholds (don't block response)
      emailService.checkAlertsAsync(shop, event).catch(console.error);

      return res.status(201).json({ ok: true, eventId: event._id });

    } catch (err) {
      console.error('Track error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }
);

// ── GET /events — detection logs for dashboard ──────────────
// Auth required
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
  const { platform, status, limit = 50, page = 1, from, to } = req.query;
  const shop = req.shop;

  const query = { shopDomain: shop.shopDomain };
  if (platform) query.platform = platform;
  if (status)   query.status   = status;

  // Free plan: only last 30 days; Pro: last 90 days
  const maxDays  = shop.isPro() ? 90 : 30;
  const fromDate = from ? new Date(from) : new Date(Date.now() - maxDays * 86400000);
  const toDate   = to   ? new Date(to)   : new Date();
  query.occurredAt = { $gte: fromDate, $lte: toDate };

  // Free plan: cap at 50 events per page
  const pageLimit = shop.isPro() ? Math.min(parseInt(limit), 200) : 50;

  try {
    const [events, total] = await Promise.all([
      RedirectEvent.find(query)
        .sort({ occurredAt: -1 })
        .skip((parseInt(page) - 1) * pageLimit)
        .limit(pageLimit)
        .select('-userAgent -ip'), // don't expose raw UA/IP to client
      RedirectEvent.countDocuments(query),
    ]);

    res.json({
      events,
      pagination: {
        total,
        page:     parseInt(page),
        limit:    pageLimit,
        pages:    Math.ceil(total / pageLimit),
      },
      plan: shop.plan,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /events/export — CSV export (Pro only) ──────────────
const { requirePro } = require('../middleware/auth');

router.get('/export', authMiddleware, requirePro, async (req, res) => {
  const events = await RedirectEvent.find({ shopDomain: req.shop.shopDomain })
    .sort({ occurredAt: -1 })
    .limit(10000)
    .select('platform os method status url occurredAt hasUtm hasFbclid');

  const rows = [
    ['Time','Platform','OS','Method','Status','URL','Has UTM','Has fbclid'],
    ...events.map(e => [
      e.occurredAt.toISOString(),
      e.platform, e.os, e.method, e.status,
      e.url, e.hasUtm, e.hasFbclid,
    ]),
  ];
  const csv = rows.map(r => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="flareguard-logs.csv"');
  res.send(csv);
});

module.exports = router;
