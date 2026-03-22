const express = require('express');
const { authMiddleware, requirePro } = require('../middleware/auth');
const scriptService = require('../services/scriptService');

const router = express.Router();
router.use(authMiddleware);

// ════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════

// GET /settings
router.get('/settings', (req, res) => {
  res.json({ settings: req.shop.settings, plan: req.shop.plan });
});

// PUT /settings
router.put('/settings', async (req, res) => {
  const shop     = req.shop;
  const allowed  = [
    'enabled','instagram','facebook','tiktok','twitter','linkedin',
    'wechat','others','preserveUtm','preserveClickIds','preserveGa4',
    'iosMethod','androidMethod','redirectDelayMs','excludedPaths',
  ];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) shop.settings[k] = req.body[k];
  });

  await shop.save();

  // Regenerate + re-inject the script with new settings
  await scriptService.injectScriptTag(shop);

  res.json({ ok: true, settings: shop.settings });
});

// ════════════════════════════════════════════════════
// ALERTS
// ════════════════════════════════════════════════════

// GET /alerts
router.get('/alerts', (req, res) => {
  res.json({ alerts: req.shop.alerts, plan: req.shop.plan });
});

// PUT /alerts
router.put('/alerts', async (req, res) => {
  const shop    = req.shop;
  const allowed = [
    'email','ccEmail','frequency','scriptInactive','limitWarning',
    'redirectSpike','newPlatform','weeklyReport',
  ];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) shop.alerts[k] = req.body[k];
  });
  await shop.save();
  res.json({ ok: true, alerts: shop.alerts });
});

// POST /alerts/test — send a test email
router.post('/alerts/test', async (req, res) => {
  const emailService = require('../services/emailService');
  const shop = req.shop;
  if (!shop.alerts.email) {
    return res.status(400).json({ error: 'No alert email configured' });
  }
  await emailService.sendTestAlert(shop);
  res.json({ ok: true, sentTo: shop.alerts.email });
});

// ════════════════════════════════════════════════════
// BRANDING  (Pro only)
// ════════════════════════════════════════════════════

// GET /branding
router.get('/branding', requirePro, (req, res) => {
  res.json({ branding: req.shop.branding });
});

// PUT /branding
router.put('/branding', requirePro, async (req, res) => {
  const shop    = req.shop;
  const allowed = ['logoUrl','primaryColor','headline','bodyText','buttonLabel'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) shop.branding[k] = req.body[k];
  });
  await shop.save();
  // Re-inject script with updated branding
  await scriptService.injectScriptTag(shop);
  res.json({ ok: true, branding: shop.branding });
});

// ════════════════════════════════════════════════════
// SHOP INFO
// ════════════════════════════════════════════════════

// GET /shop
router.get('/shop', (req, res) => {
  const shop = req.shop;
  res.json({
    shopDomain:  shop.shopDomain,
    shopName:    shop.shopName,
    shopEmail:   shop.shopEmail,
    plan:        shop.plan,
    usage:       shop.usage,
    installedAt: shop.installedAt,
    isOverLimit: shop.isOverLimit(),
  });
});

module.exports = router;
