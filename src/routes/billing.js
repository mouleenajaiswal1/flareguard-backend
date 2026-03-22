const express = require('express');
const axios   = require('axios');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const PRO_PRICE      = '9.00';
const PRO_PLAN_NAME  = 'FlareGuard Pro';
const TRIAL_DAYS     = 7;

// ── GET /billing/upgrade ─────────────────────────────────────
// Create a recurring application charge and redirect merchant to approve it
router.get('/upgrade', async (req, res) => {
  const shop = req.shop;
  if (shop.isPro()) {
    return res.json({ message: 'Already on Pro plan' });
  }

  try {
    const chargeRes = await axios.post(
      `https://${shop.shopDomain}/admin/api/2024-01/recurring_application_charges.json`,
      {
        recurring_application_charge: {
          name:           PRO_PLAN_NAME,
          price:          PRO_PRICE,
          return_url:     `${process.env.SHOPIFY_APP_URL}/billing/confirm`,
          trial_days:     TRIAL_DAYS,
          test:           process.env.NODE_ENV !== 'production',
        },
      },
      { headers: { 'X-Shopify-Access-Token': shop.accessToken } }
    );

    const charge     = chargeRes.data.recurring_application_charge;
    const confirmUrl = charge.confirmation_url;

    // Save charge ID before redirect
    shop.shopifyChargeId = String(charge.id);
    await shop.save();

    // Redirect merchant to Shopify billing page
    res.redirect(confirmUrl);
  } catch (err) {
    console.error('Billing upgrade error:', err.message);
    res.status(500).json({ error: 'Could not create charge', detail: err.message });
  }
});

// ── GET /billing/confirm?charge_id=... ──────────────────────
// Shopify redirects here after merchant approves/declines
router.get('/confirm', async (req, res) => {
  const { charge_id } = req.query;
  const shop = req.shop;

  try {
    const chargeRes = await axios.get(
      `https://${shop.shopDomain}/admin/api/2024-01/recurring_application_charges/${charge_id}.json`,
      { headers: { 'X-Shopify-Access-Token': shop.accessToken } }
    );

    const charge = chargeRes.data.recurring_application_charge;

    if (charge.status === 'accepted') {
      // Activate the charge
      await axios.post(
        `https://${shop.shopDomain}/admin/api/2024-01/recurring_application_charges/${charge_id}/activate.json`,
        { recurring_application_charge: charge },
        { headers: { 'X-Shopify-Access-Token': shop.accessToken } }
      );

      shop.plan             = 'pro';
      shop.planActivatedAt  = new Date();
      shop.shopifyChargeId  = String(charge_id);
      await shop.save();

      console.log(`🎉 ${shop.shopDomain} upgraded to Pro`);

      const emailService = require('../services/emailService');
      await emailService.sendUpgradeConfirmation(shop);

      return res.redirect(
        `https://${shop.shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}?upgraded=true`
      );
    }

    // Declined
    res.redirect(
      `https://${shop.shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}?upgrade=declined`
    );

  } catch (err) {
    console.error('Billing confirm error:', err.message);
    res.status(500).json({ error: 'Billing confirmation failed' });
  }
});

// ── POST /billing/downgrade ──────────────────────────────────
// Cancel Pro plan, revert to Free
router.post('/downgrade', async (req, res) => {
  const shop = req.shop;
  if (!shop.isPro()) return res.json({ message: 'Already on free plan' });

  try {
    if (shop.shopifyChargeId) {
      await axios.delete(
        `https://${shop.shopDomain}/admin/api/2024-01/recurring_application_charges/${shop.shopifyChargeId}.json`,
        { headers: { 'X-Shopify-Access-Token': shop.accessToken } }
      ).catch(() => {}); // ignore if already cancelled
    }

    shop.plan            = 'free';
    shop.shopifyChargeId = null;
    await shop.save();

    res.json({ ok: true, plan: 'free' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /billing/status ──────────────────────────────────────
router.get('/status', (req, res) => {
  const shop = req.shop;
  res.json({
    plan:            shop.plan,
    planActivatedAt: shop.planActivatedAt,
    chargeId:        shop.shopifyChargeId,
    usage:           shop.usage,
    limit:           shop.isPro() ? null : parseInt(process.env.FREE_REDIRECT_LIMIT || 500),
  });
});

module.exports = router;
