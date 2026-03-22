const nodemailer = require('nodemailer');
const dayjs      = require('dayjs');
const RedirectEvent = require('../models/RedirectEvent');

// ── Transporter ───────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f3f3f3;font-family:'DM Sans',Arial,sans-serif}
  .wrap{max-width:540px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:#0f0e0b;padding:24px 28px;display:flex;align-items:center;gap:10px}
  .logo{background:linear-gradient(135deg,#ff6b2b,#f59e0b);width:32px;height:32px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:16px}
  .logo-text{color:#fff;font-size:17px;font-weight:700}
  .body{padding:28px}
  h2{font-size:20px;font-weight:700;margin:0 0 8px;color:#1a1a1a}
  p{font-size:14px;color:#4a4a4a;line-height:1.65;margin:0 0 14px}
  .stat-row{display:flex;gap:12px;margin:16px 0}
  .stat{flex:1;background:#f8f8f8;border-radius:9px;padding:14px;text-align:center}
  .stat-val{font-size:22px;font-weight:800;color:#1a1a1a}
  .stat-label{font-size:11px;color:#8a8a8a;margin-top:2px}
  .btn{display:inline-block;background:#1d6bf3;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-top:4px}
  .footer{padding:16px 28px;background:#f8f8f8;border-top:1px solid #e3e3e3;font-size:11px;color:#8a8a8a;text-align:center}
  .alert-box{background:#fffbeb;border:1px solid rgba(217,119,6,.2);border-radius:8px;padding:14px;margin:14px 0;font-size:13px;color:#92400e}
  .success-box{background:#edfaf4;border:1px solid rgba(26,156,91,.2);border-radius:8px;padding:14px;margin:14px 0;font-size:13px;color:#145c38}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">🔥</div>
    <div class="logo-text">FlareGuard</div>
  </div>
  <div class="body">${content}</div>
  <div class="footer">FlareGuard · You're receiving this because you installed FlareGuard on your Shopify store.<br/>
  <a href="${process.env.SHOPIFY_APP_URL}/alerts/unsubscribe" style="color:#1d6bf3">Manage alerts</a></div>
</div>
</body>
</html>`;
}

async function send(to, cc, subject, html) {
  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'FlareGuard <noreply@flareguard.app>',
    to,
    cc:      cc || undefined,
    subject,
    html,
  });
}

// ── Welcome email ─────────────────────────────────────────────
async function sendWelcome(shop) {
  if (!shop.shopEmail) return;
  const html = baseTemplate(`
    <h2>Welcome to FlareGuard! 🔥</h2>
    <p>FlareGuard is now installed on <strong>${shop.shopDomain}</strong>. Your store will now automatically redirect Instagram, Facebook, TikTok, and other in-app browser visitors to Safari or Chrome.</p>
    <div class="success-box">✅ Script injected — redirects are live right now.</div>
    <p>You're on the <strong>Free plan</strong> with 500 redirects/month. Upgrade to Pro for unlimited redirects, white-label branding, and full analytics history.</p>
    <a href="https://${shop.shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}" class="btn">Open FlareGuard Dashboard →</a>
  `);
  await send(shop.shopEmail, null, '🔥 FlareGuard is live on your store!', html);
}

// ── Test alert ────────────────────────────────────────────────
async function sendTestAlert(shop) {
  const html = baseTemplate(`
    <h2>Test Alert ✅</h2>
    <p>This is a test notification from FlareGuard. Your email alerts are configured correctly for <strong>${shop.shopDomain}</strong>.</p>
    <p>You'll receive real alerts based on your configured triggers.</p>
  `);
  await send(shop.alerts.email, shop.alerts.ccEmail, '✅ FlareGuard — Test Alert', html);
}

// ── Limit warning ─────────────────────────────────────────────
async function sendLimitWarning(shop) {
  if (!shop.alerts.email || !shop.alerts.limitWarning) return;
  const used  = shop.usage.redirectCount;
  const limit = parseInt(process.env.FREE_REDIRECT_LIMIT || 500);
  const pct   = Math.round((used / limit) * 100);
  const html  = baseTemplate(`
    <h2>⚠️ You've used ${pct}% of your monthly redirects</h2>
    <p>Your store <strong>${shop.shopDomain}</strong> has used <strong>${used} of ${limit}</strong> free redirects this month.</p>
    <div class="alert-box">⚠ Once you hit 500, new in-app visitors won't be redirected until next month — unless you upgrade.</div>
    <p>Upgrade to Pro for <strong>unlimited redirects</strong>, starting at $9/month.</p>
    <a href="${process.env.SHOPIFY_APP_URL}/billing/upgrade" class="btn">Upgrade to Pro — $9/mo →</a>
  `);
  await send(shop.alerts.email, shop.alerts.ccEmail, `⚠️ FlareGuard — ${pct}% of monthly limit used`, html);
  shop.alerts.lastAlertSentAt = new Date();
  await shop.save();
}

// ── Spike alert ───────────────────────────────────────────────
async function sendSpikeAlert(shop, currentCount, prevCount) {
  if (!shop.alerts.email || !shop.alerts.redirectSpike) return;
  const html = baseTemplate(`
    <h2>📈 Redirect spike detected</h2>
    <p>FlareGuard detected an unusual spike in in-app browser redirects on <strong>${shop.shopDomain}</strong>.</p>
    <div class="stat-row">
      <div class="stat"><div class="stat-val">${prevCount}</div><div class="stat-label">Last hour</div></div>
      <div class="stat"><div class="stat-val">${currentCount}</div><div class="stat-label">This hour</div></div>
    </div>
    <p>This usually means a high-traffic ad campaign is running. Check your FlareGuard dashboard for details.</p>
    <a href="https://${shop.shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}" class="btn">View Dashboard →</a>
  `);
  await send(shop.alerts.email, shop.alerts.ccEmail, '📈 FlareGuard — Redirect spike detected', html);
}

// ── Weekly report ─────────────────────────────────────────────
async function sendWeeklyReport(shop) {
  if (!shop.alerts.email || !shop.alerts.weeklyReport) return;
  const since = dayjs().subtract(7, 'day').toDate();

  const [total, byPlatform] = await Promise.all([
    RedirectEvent.countDocuments({ shopDomain: shop.shopDomain, occurredAt: { $gte: since } }),
    RedirectEvent.aggregate([
      { $match: { shopDomain: shop.shopDomain, occurredAt: { $gte: since } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]),
  ]);

  const topPlatforms = byPlatform
    .map(p => `<li>${p._id}: <strong>${p.count}</strong> redirects</li>`)
    .join('');

  const html = baseTemplate(`
    <h2>📊 Your weekly FlareGuard report</h2>
    <p>Here's what happened on <strong>${shop.shopDomain}</strong> this week:</p>
    <div class="stat-row">
      <div class="stat"><div class="stat-val">${total}</div><div class="stat-label">Total Redirects</div></div>
      <div class="stat"><div class="stat-val">${shop.plan === 'pro' ? '∞' : shop.usage.redirectCount+'/500'}</div><div class="stat-label">Monthly Usage</div></div>
    </div>
    <p><strong>Top platforms this week:</strong></p>
    <ul style="font-size:14px;color:#4a4a4a;line-height:2">${topPlatforms || '<li>No data yet</li>'}</ul>
    <a href="https://${shop.shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}" class="btn">Full Analytics →</a>
  `);
  await send(shop.alerts.email, shop.alerts.ccEmail,
    `📊 FlareGuard Weekly Report — ${total} redirects`, html);
}

// ── Upgrade confirmation ──────────────────────────────────────
async function sendUpgradeConfirmation(shop) {
  if (!shop.shopEmail) return;
  const html = baseTemplate(`
    <h2>You're on Pro! 🎉</h2>
    <div class="success-box">✅ FlareGuard Pro is now active on ${shop.shopDomain}</div>
    <p>You now have access to:</p>
    <ul style="font-size:14px;color:#4a4a4a;line-height:2">
      <li>✅ Unlimited redirects</li>
      <li>✅ White-label branding</li>
      <li>✅ 90-day analytics history</li>
      <li>✅ Full detection log export</li>
      <li>✅ Priority support</li>
    </ul>
    <a href="https://${shop.shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}" class="btn">Open Dashboard →</a>
  `);
  await send(shop.shopEmail, null, '🎉 Welcome to FlareGuard Pro!', html);
}

// ── Async alert checker (called after each event) ────────────
async function checkAlertsAsync(shop, event) {
  // Check free limit threshold (80%)
  if (!shop.isPro() && shop.alerts.limitWarning) {
    const limit = parseInt(process.env.FREE_REDIRECT_LIMIT || 500);
    const used  = shop.usage.redirectCount;
    const pct   = used / limit;
    const lastSent = shop.alerts.lastAlertSentAt;
    const oneDayAgo = Date.now() - 86400000;

    if (pct >= 0.8 && (!lastSent || lastSent.getTime() < oneDayAgo)) {
      await sendLimitWarning(shop);
    }
  }
}

module.exports = {
  sendWelcome,
  sendTestAlert,
  sendLimitWarning,
  sendSpikeAlert,
  sendWeeklyReport,
  sendUpgradeConfirmation,
  checkAlertsAsync,
};
