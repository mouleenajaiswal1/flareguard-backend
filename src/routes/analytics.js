const express          = require('express');
const RedirectEvent    = require('../models/RedirectEvent');
const { authMiddleware } = require('../middleware/auth');
const dayjs            = require('dayjs');

const router = express.Router();
router.use(authMiddleware);

// ── GET /analytics/summary ──────────────────────────────────
// Stat cards: total redirects, detected, rate, usage
router.get('/summary', async (req, res) => {
  const shop = req.shop;
  const { days = 7 } = req.query;
  const since = dayjs().subtract(parseInt(days), 'day').toDate();
  const prev  = dayjs().subtract(parseInt(days) * 2, 'day').toDate();

  try {
    const [current, previous, total] = await Promise.all([
      RedirectEvent.countDocuments({ shopDomain: shop.shopDomain, occurredAt: { $gte: since } }),
      RedirectEvent.countDocuments({ shopDomain: shop.shopDomain, occurredAt: { $gte: prev, $lt: since } }),
      RedirectEvent.countDocuments({ shopDomain: shop.shopDomain }),
    ]);

    const successCount = await RedirectEvent.countDocuments({
      shopDomain: shop.shopDomain,
      occurredAt: { $gte: since },
      status: { $in: ['success', 'overlay'] },
    });

    const pctChange = previous === 0 ? 100
      : Math.round(((current - previous) / previous) * 100);

    res.json({
      period:        parseInt(days),
      redirects:     current,
      redirectsPct:  pctChange,
      successRate:   current === 0 ? 0 : Math.round((successCount / current) * 100),
      totalAllTime:  total,
      monthlyUsage: {
        used:  shop.usage.redirectCount,
        limit: shop.isPro() ? null : parseInt(process.env.FREE_REDIRECT_LIMIT || 500),
        plan:  shop.plan,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /analytics/daily ────────────────────────────────────
// Bar chart data: redirects per day for last N days
router.get('/daily', async (req, res) => {
  const shop  = req.shop;
  const days  = Math.min(parseInt(req.query.days || 7), shop.isPro() ? 90 : 7);
  const since = dayjs().subtract(days, 'day').startOf('day').toDate();

  try {
    const agg = await RedirectEvent.aggregate([
      {
        $match: {
          shopDomain: shop.shopDomain,
          occurredAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            date:   { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Build a date-keyed map
    const map = {};
    for (let i = 0; i < days; i++) {
      const d = dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD');
      map[d] = { date: d, redirected: 0, failed: 0, overlay: 0 };
    }
    agg.forEach(({ _id, count }) => {
      if (map[_id.date]) {
        if (_id.status === 'success')  map[_id.date].redirected += count;
        if (_id.status === 'failed')   map[_id.date].failed     += count;
        if (_id.status === 'overlay')  map[_id.date].overlay    += count;
      }
    });

    res.json({ days: Object.values(map) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /analytics/platforms ────────────────────────────────
// Platform breakdown pie/bar
router.get('/platforms', async (req, res) => {
  const shop  = req.shop;
  const since = dayjs().subtract(30, 'day').toDate();

  try {
    const agg = await RedirectEvent.aggregate([
      { $match: { shopDomain: shop.shopDomain, occurredAt: { $gte: since } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s, r) => s + r.count, 0);
    const platforms = agg.map(r => ({
      platform: r._id,
      count:    r.count,
      pct:      total === 0 ? 0 : Math.round((r.count / total) * 100),
    }));

    res.json({ platforms, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /analytics/os ───────────────────────────────────────
// iOS vs Android vs Desktop split
router.get('/os', async (req, res) => {
  const shop  = req.shop;
  const since = dayjs().subtract(30, 'day').toDate();

  try {
    const agg = await RedirectEvent.aggregate([
      { $match: { shopDomain: shop.shopDomain, occurredAt: { $gte: since } } },
      { $group: { _id: '$os', count: { $sum: 1 } } },
    ]);
    const total = agg.reduce((s, r) => s + r.count, 0);
    const result = agg.map(r => ({
      os:    r._id,
      count: r.count,
      pct:   total === 0 ? 0 : Math.round((r.count / total) * 100),
    }));
    res.json({ os: result, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
