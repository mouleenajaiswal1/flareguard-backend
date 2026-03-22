const mongoose = require('mongoose');

const redirectEventSchema = new mongoose.Schema({
  // ── Which shop ────────────────────────────────────
  shopDomain: {
    type: String,
    required: true,
    index: true,
  },

  // ── Detection result ──────────────────────────────
  platform: {
    type: String,
    required: true,
    enum: ['instagram','facebook','tiktok','twitter','linkedin',
           'wechat','line','snapchat','telegram','pinterest','reddit','gmail','unknown'],
  },
  os: {
    type: String,
    enum: ['ios','android','desktop','unknown'],
    default: 'unknown',
  },
  method: {
    type: String,
    enum: ['x-safari','intent','overlay','location','unknown'],
    default: 'unknown',
  },
  status: {
    type: String,
    enum: ['success','failed','overlay'],
    default: 'success',
  },

  // ── Request context ───────────────────────────────
  url:       { type: String, default: '' },   // page URL (path only)
  userAgent: { type: String, default: '' },   // raw UA (truncated)
  ip:        { type: String, default: '' },   // hashed IP for privacy

  // ── Tracking params present ───────────────────────
  hasUtm:    { type: Boolean, default: false },
  hasFbclid: { type: Boolean, default: false },
  hasTtclid: { type: Boolean, default: false },
  hasGclid:  { type: Boolean, default: false },
  hasGa:     { type: Boolean, default: false },

  occurredAt: { type: Date, default: Date.now, index: true },

}, {
  timestamps: false,
  // TTL: auto-delete events older than 90 days (Pro keeps 90, free keeps 30)
});

// Compound index for fast shop+time queries
redirectEventSchema.index({ shopDomain: 1, occurredAt: -1 });
redirectEventSchema.index({ shopDomain: 1, platform: 1, occurredAt: -1 });

module.exports = mongoose.model('RedirectEvent', redirectEventSchema);
