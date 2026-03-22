const axios = require('axios');
const Shop  = require('../models/Shop');

/**
 * Generates the full FlareGuard client-side script
 * with settings and branding baked in.
 */
function generateScript(shop) {
  const s  = shop.settings;
  const b  = shop.branding;
  const isPro = shop.isPro();

  const platforms = JSON.stringify({
    instagram: s.instagram,
    facebook:  s.facebook,
    tiktok:    s.tiktok,
    twitter:   s.twitter,
    linkedin:  s.linkedin,
    wechat:    s.wechat,
    others:    s.others,
  });

  const branding = isPro ? JSON.stringify({
    primaryColor: b.primaryColor,
    headline:     b.headline,
    bodyText:     b.bodyText,
    buttonLabel:  b.buttonLabel,
    logoUrl:      b.logoUrl,
  }) : JSON.stringify({
    primaryColor: '#1d6bf3',
    headline:     'Open in Browser',
    bodyText:     'Tap ··· and choose Open in Browser',
    buttonLabel:  'Got it',
    logoUrl:      '',
  });

  return `
/* FlareGuard v2 — auto-generated for ${shop.shopDomain} */
(function(){
  'use strict';
  if(new URLSearchParams(location.search).get('fg_r')) return;

  var UA = navigator.userAgent||'';
  var CFG = {
    enabled:   ${s.enabled},
    platforms: ${platforms},
    iosMethod: '${s.iosMethod}',
    andMethod:  '${s.androidMethod}',
    delay:     ${s.redirectDelayMs || 0},
    preserveUtm:      ${s.preserveUtm},
    preserveClickIds: ${s.preserveClickIds},
    preserveGa4:      ${s.preserveGa4},
    excluded:  ${JSON.stringify(s.excludedPaths || [])},
    trackUrl:  '${process.env.SHOPIFY_APP_URL}/events/track',
    shopDomain:'${shop.shopDomain}',
    branding:  ${branding},
  };

  if(!CFG.enabled) return;
  if(CFG.excluded.some(function(p){return location.pathname.startsWith(p);})) return;

  var SIGS = {
    instagram: /FBAN|FBAV|Instagram/i,
    facebook:  /FBAN|FB_IAB|FBIOS|FBSS|FB4A/i,
    tiktok:    /musical_ly|TikTok/i,
    twitter:   /Twitter for/i,
    linkedin:  /LinkedInApp/i,
    wechat:    /MicroMessenger/i,
    line:      /Line\\//i,
    snapchat:  /Snapchat/i,
    telegram:  /Telegram/i,
    pinterest: /Pinterest/i,
    reddit:    /Reddit/i,
    gmail:     /GSA\\/|Google-InApp/i,
  };

  var isIOS = /iPhone|iPad|iPod/i.test(UA);
  var isAnd = /Android/i.test(UA);
  var platform = null;

  for(var k in SIGS){
    var enabled = CFG.platforms[k] !== undefined ? CFG.platforms[k] : CFG.platforms.others;
    if(enabled && SIGS[k].test(UA)){ platform = k; break; }
  }
  if(!platform) return;

  var os = isIOS ? 'ios' : isAnd ? 'android' : 'desktop';
  var p  = new URLSearchParams(location.search);
  var tracking = {};
  if(CFG.preserveUtm){
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref']
      .forEach(function(k){ if(p.get(k)) tracking[k]=p.get(k); });
  }
  if(CFG.preserveClickIds){
    ['fbclid','ttclid','gclid'].forEach(function(k){ if(p.get(k)) tracking[k]=p.get(k); });
  }
  if(CFG.preserveGa4 && p.get('_ga')) tracking['_ga'] = p.get('_ga');
  for(var k in tracking) p.set(k, tracking[k]);
  p.set('fg_r','1');
  var dest = location.pathname + '?' + p.toString();
  var destFull = location.origin + dest;

  function track(method, status){
    try{
      navigator.sendBeacon(CFG.trackUrl, JSON.stringify({
        shopDomain: CFG.shopDomain,
        platform: platform, os: os, method: method, status: status,
        url: location.pathname,
        userAgent: UA.slice(0,400),
        hasUtm:    !!tracking.utm_source,
        hasFbclid: !!tracking.fbclid,
        hasTtclid: !!tracking.ttclid,
        hasGclid:  !!tracking.gclid,
        hasGa:     !!tracking._ga,
      }));
    }catch(e){}
  }

  function doRedirect(){
    if(platform === 'wechat'){
      track('overlay','overlay');
      showWeChatOverlay();
      return;
    }
    if(isIOS && CFG.iosMethod === 'x-safari'){
      track('x-safari','success');
      location.href = 'x-safari-https://' + destFull.replace(/^https?:\\/\\//,'');
      setTimeout(function(){ location.href = destFull; }, 1000);
    } else if(isAnd && CFG.andMethod === 'intent'){
      track('intent','success');
      location.href = 'intent://' + destFull.replace(/^https?:\\/\//,'')
        + '#Intent;scheme=https;package=com.android.chrome;end';
      setTimeout(function(){ location.href = destFull; }, 1200);
    } else {
      track('location','success');
      location.href = destFull;
    }
  }

  function showWeChatOverlay(){
    try{ navigator.clipboard.writeText(destFull); }catch(e){}
    var br = CFG.branding;
    var el = document.createElement('div');
    el.id = 'fg-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.93);'
      +'display:flex;flex-direction:column;align-items:center;justify-content:center;'
      +'padding:32px;text-align:center;font-family:sans-serif';
    el.innerHTML = (br.logoUrl ? '<img src="'+br.logoUrl+'" style="height:40px;margin-bottom:16px"/>' : '<div style="font-size:48px;margin-bottom:16px">↗️</div>')
      +'<h2 style="color:#fff;font-size:20px;margin-bottom:12px">'+br.headline+'</h2>'
      +'<p style="color:#999;font-size:14px;max-width:270px;line-height:1.65">'+br.bodyText+'</p>'
      +'<p style="color:'+br.primaryColor+';font-size:12px;margin-top:12px">🔗 Link copied</p>'
      +'<button onclick="document.getElementById(\'fg-overlay\').remove()" '
      +'style="margin-top:24px;padding:12px 28px;background:'+br.primaryColor+';color:#fff;'
      +'border:none;border-radius:10px;font-size:14px;cursor:pointer">'+br.buttonLabel+'</button>';
    document.body && document.body.appendChild(el);
  }

  if(CFG.delay > 0){
    setTimeout(doRedirect, CFG.delay);
  } else {
    doRedirect();
  }

  /* ── Post-redirect tracking restoration ── */
  if(new URLSearchParams(location.search).get('fg_r')){
    var rp = new URLSearchParams(location.search);
    if(rp.get('_ga') && window.gtag){
      try{ gtag('set',{client_id: rp.get('_ga').replace(/^GA\\d+\\.\\d+\\./,'')}); }catch(e){}
    }
    if(rp.get('fbclid') && window.fbq){
      try{ fbq('track','PageView',{},{eventID:'fg_'+Date.now()}); }catch(e){}
    }
    if(rp.get('ttclid') && window.ttq){
      try{ ttq.track('Browse'); }catch(e){}
    }
    rp.delete('fg_r');
    history.replaceState({}, '', location.pathname + (rp.toString() ? '?'+rp.toString() : ''));
  }
})();
`.trim();
}

/**
 * Inject (or update) the Script Tag in Shopify.
 * The script tag points to our /script/:shopDomain endpoint
 * which serves the dynamically-generated JS.
 */
async function injectScriptTag(shop) {
  const scriptSrc = `${process.env.SHOPIFY_APP_URL}/script/${shop.shopDomain}.js`;
  const headers   = { 'X-Shopify-Access-Token': shop.accessToken, 'Content-Type': 'application/json' };

  try {
    // Delete old script tag if exists
    if (shop.scriptTagId) {
      await axios.delete(
        `https://${shop.shopDomain}/admin/api/2024-01/script_tags/${shop.scriptTagId}.json`,
        { headers }
      ).catch(() => {});
    }

    // Create new script tag
    const res = await axios.post(
      `https://${shop.shopDomain}/admin/api/2024-01/script_tags.json`,
      {
        script_tag: {
          event: 'onload',
          src:   scriptSrc,
          display_scope: 'online_store',
        },
      },
      { headers }
    );

    shop.scriptTagId = res.data.script_tag.id;
    await shop.save();
    console.log(`✅ Script tag injected for ${shop.shopDomain}`);
  } catch (err) {
    console.error(`❌ Script inject failed for ${shop.shopDomain}:`, err.message);
    throw err;
  }
}

module.exports = { generateScript, injectScriptTag };
