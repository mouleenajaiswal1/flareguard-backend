const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  // ── Shopify identity ──────────────────────────────
  shopDomain: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  accessToken: {
    type: String,
    required: true,
  },
  shopName:  { type: String, default: '' },
  shopEmail: { type: String, default: '' },
  shopOwner: { type: String, default: '' },
  currency:  { type: String, default: 'USD' },
  timezone:  { type: String, default: 'UTC' },

  // ── Plan ─────────────────────────────────────────
  plan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free',
  },
  planActivatedAt: { type: Date },
  shopifyChargeId: { type: String }, // Shopify recurring charge ID

  // ── Monthly usage counters ────────────────────────
  usage: {
    monthKey:       { type: String, default: '' }, // e.g. "2024-01"
    redirectCount:  { type: Number, default: 0  },
    detectedCount:  { type: Number, default: 0  },
  },

  // ── App settings ─────────────────────────────────
  settings: {
    enabled:          { type: Boolean, default: true  },
    instagram:        { type: Boolean, default: true  },
    facebook:         { type: Boolean, default: true  },
    tiktok:           { type: Boolean, default: true  },
    twitter:          { type: Boolean, default: true  },
    linkedin:         { type: Boolean, default: true  },
    wechat:           { type: Boolean, default: true  },
    others:           { type: Boolean, default: true  },
    preserveUtm:      { type: Boolean, default: true  },
    preserveClickIds: { type: Boolean, default: true  },
    preserveGa4:      { type: Boolean, default: true  },
    iosMethod:        { type: String,  default: 'x-safari' },
    androidMethod:    { type: String,  default: 'intent'   },
    redirectDelayMs:  { type: Number,  default: 0          },
    excludedPaths:    { type: [String], default: []        },
  },

  // ── Email alert config ────────────────────────────
  alerts: {
    email:             { type: String, default: '' },
    ccEmail:           { type: String, default: '' },
    frequency:         { type: String, default: 'realtime', enum: ['realtime','daily','weekly','disabled'] },
    scriptInactive:    { type: Boolean, default: true  },
    limitWarning:      { type: Boolean, default: true  },
    redirectSpike:     { type: Boolean, default: true  },
    newPlatform:       { type: Boolean, default: false },
    weeklyReport:      { type: Boolean, default: true  },
    lastAlertSentAt:   { type: Date },
  },

  // ── White-label branding (Pro only) ──────────────
  branding: {
    logoUrl:       { type: String, default: '' },
    primaryColor:  { type: String, default: '#1d6bf3' },
    headline:      { type: String, default: 'Open in Browser' },
    bodyText:      { type: String, default: 'Tap ··· and choose Open in Browser' },
    buttonLabel:   { type: String, default: 'Got it' },
  },

  // ── Script tag ID (injected into Shopify) ─────────
  scriptTagId: { type: Number, default: null },

  isActive:    { type: Boolean, default: true  },
  installedAt: { type: Date,    default: Date.now },
  uninstalledAt: { type: Date },

}, { timestamps: true });

// ── Helpers ───────────────────────────────────────────
shopSchema.methods.isPro = function () {
  return this.plan === 'pro';
};

shopSchema.methods.isOverLimit = function () {
  if (this.plan === 'pro') return false;
  return this.usage.redirectCount >= parseInt(process.env.FREE_REDIRECT_LIMIT || 500);
};

shopSchema.methods.resetMonthlyUsageIfNeeded = function () {
  const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  if (this.usage.monthKey !== thisMonth) {
    this.usage.monthKey      = thisMonth;
    this.usage.redirectCount = 0;
    this.usage.detectedCount = 0;
  }
};

module.exports = mongoose.model('Shop', shopSchema);
