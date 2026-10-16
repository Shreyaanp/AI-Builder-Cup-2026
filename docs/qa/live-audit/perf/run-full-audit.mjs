import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = 'docs/qa/live-audit/perf';
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIEWPORT = { width: 360, height: 800 };
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Percentile helpers
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round((sorted[lower] * (1 - weight) + sorted[upper] * weight) * 100) / 100;
}

function stats(arr) {
  return {
    runs: arr,
    min: Math.min(...arr),
    max: Math.max(...arr),
    mean: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100,
    p50: percentile(arr, 50),
    p95: percentile(arr, 95)
  };
}

async function setupThrottling(context, page, isThrottled) {
  if (!isThrottled) return;
  const client = await context.newCDPSession(page);
  // Fast 3G: 1.6 Mbps download, 750 kbps upload, 150ms RTT
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  });
  // 4x CPU slowdown
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

// -------------------------------------------------------------
// 1. PAGE LOAD AUDIT (Cold & Warm)
// -------------------------------------------------------------
async function measurePageLoad(url, isThrottled, isWarm, runIndex, browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();
  await setupThrottling(context, page, isThrottled);

  // Setup performance observer in page
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done');
    window.__vitals = {
      lcp: 0,
      cls: 0,
      longtasks: [],
    };

    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) window.__vitals.lcp = lastEntry.startTime;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__vitals.cls += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {}

    try {
      const longtaskObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          window.__vitals.longtasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      longtaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {}
  });

  if (isWarm) {
    // Prime cache first
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1000);
  }

  // Navigate and measure
  const tStart = performance.now();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000); // allow LCP & late layout shifts to settle

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(p => p.name === 'first-contentful-paint');
    const fcp = fcpEntry ? fcpEntry.startTime : 0;
    const ttfb = nav.responseStart ? (nav.responseStart - nav.requestStart) : 0;

    let tbt = 0;
    for (const lt of window.__vitals.longtasks || []) {
      if (lt.startTime >= fcp) {
        tbt += Math.max(0, lt.duration - 50);
      }
    }

    return {
      ttfb: Math.round(ttfb),
      fcp: Math.round(fcp),
      lcp: Math.round(window.__vitals.lcp || fcp),
      cls: Number((window.__vitals.cls || 0).toFixed(4)),
      tbt: Math.round(tbt),
      loadTime: Math.round(nav.loadEventEnd ? nav.loadEventEnd - nav.startTime : 0),
    };
  });

  const screenshotPath = `${OUT_DIR}/load-${isThrottled ? 'throttled' : 'unthrottled'}-${isWarm ? 'warm' : 'cold'}-run${runIndex}.png`;
  if (runIndex === 1) {
    await page.screenshot({ path: screenshotPath });
  }

  await context.close();
  return metrics;
}

// -------------------------------------------------------------
// 2. CUSTOMER ASK AUDIT ("filter coffee near me")
// -------------------------------------------------------------
async function measureCustomerAsk(isThrottled, runIndex, browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();
  await setupThrottling(context, page, isThrottled);

  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done');
    // Ensure we track CLS specifically during ask
    window.__askCLS = 0;
    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__askCLS += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });

  await page.goto('https://chalkboard.shreyaan.work/explore/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  const composer = page.getByRole('textbox', { name: 'Ask about anything nearby' });
  await composer.fill('filter coffee near me');

  const beforeAskCLS = await page.evaluate(() => window.__askCLS || 0);

  // Setup DOM observer for first text and complete answer
  await page.evaluate(() => {
    window.__askTimings = {
      tSend: 0,
      tFirstWord: 0,
      tComplete: 0,
      hasSpinnerWithoutWords: false,
      frozenUI: false,
    };
  });

  console.log(`[Ask ${isThrottled ? 'Throttled' : 'Unthrottled'} Run ${runIndex}] Sending query...`);
  const tSend = performance.now();

  const sendBtn = page.getByRole('button', { name: 'Send', exact: true });
  if (await sendBtn.isVisible()) {
    await sendBtn.click();
  } else {
    await composer.press('Enter');
  }

  // Check for thinking state / spinner
  let thinkingAppeared = false;
  let firstWordTime = 0;
  let completeTime = 0;
  let spinnerWithoutWords = false;

  // Poll with high resolution
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const busy = document.querySelector('[aria-busy="true"]');
      const text = document.body.innerText;
      const cards = document.querySelectorAll('a[href*="/explore/s/"]');
      const turnAlert = document.querySelector('[role="alert"]');
      const typing = document.querySelector('.c-typing');
      const rise = document.querySelector('.c-rise');
      const firstWordVisible = !!document.querySelector('.c-receive') ||
                                (document.querySelector('article') && text.includes('filter coffee near me') && !busy);

      return {
        hasBusy: !!busy,
        hasTyping: !!typing,
        hasRise: !!rise,
        riseText: rise ? rise.innerText : '',
        cardsCount: cards.length,
        hasAlert: !!turnAlert,
        alertText: turnAlert ? turnAlert.innerText : '',
        bodyTextSnippet: text.slice(0, 400),
      };
    });

    const elapsed = performance.now() - tSend;

    if (state.hasBusy && !thinkingAppeared) {
      thinkingAppeared = true;
      if (state.hasTyping && !state.hasRise) {
        spinnerWithoutWords = true;
      }
    }

    // First visible text answer (either summary text or cards or alert)
    if (!firstWordTime && (!state.hasBusy && (state.cardsCount > 0 || state.hasAlert || state.bodyTextSnippet.includes('filter coffee')))) {
      firstWordTime = elapsed;
    }

    // Complete answer (cards rendered or completion message)
    if (firstWordTime && (state.cardsCount > 0 || state.hasAlert)) {
      completeTime = elapsed;
      break;
    }

    await page.waitForTimeout(50);
  }

  if (!firstWordTime) firstWordTime = completeTime || (performance.now() - tSend);
  if (!completeTime) completeTime = performance.now() - tSend;

  const afterAskCLS = await page.evaluate(() => window.__askCLS || 0);
  const askLayoutShift = Math.max(0, afterAskCLS - beforeAskCLS);

  if (runIndex === 1) {
    await page.screenshot({ path: `${OUT_DIR}/ask-${isThrottled ? 'throttled' : 'unthrottled'}.png` });
  }

  await context.close();

  return {
    firstWordMs: Math.round(firstWordTime),
    completeMs: Math.round(completeTime),
    cls: Number(askLayoutShift.toFixed(4)),
    spinnerWithoutWords,
  };
}

// -------------------------------------------------------------
// 3. TAP RESPONSIVENESS AUDIT (Tabs, Shop card, Rescue)
// -------------------------------------------------------------
async function measureTapResponsiveness(isThrottled, runIndex, browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();
  await setupThrottling(context, page, isThrottled);

  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done');
  });

  await page.goto('https://chalkboard.shreyaan.work/explore/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  // 1. Measure tap on Rescue tab
  const rescueTab = page.locator('a[href="/explore/rescue"]');
  await rescueTab.waitFor({ state: 'visible', timeout: 10000 });

  const tRescueStart = performance.now();
  await rescueTab.click();
  // Wait for visual feedback: rescue screen content or active tab change
  await page.waitForFunction(() => {
    const active = document.querySelector('a[href="/explore/rescue"][aria-current="page"]');
    return !!active;
  }, { timeout: 10000 });
  const tRescueFeedback = performance.now() - tRescueStart;

  await page.waitForTimeout(500);

  // 2. Measure tap on Ask tab (back to home)
  const askTab = page.locator('a[href="/explore/"]');
  const tAskStart = performance.now();
  await askTab.click();
  await page.waitForFunction(() => {
    const active = document.querySelector('a[href="/explore/"][aria-current="page"]');
    return !!active;
  }, { timeout: 10000 });
  const tAskFeedback = performance.now() - tAskStart;

  await page.waitForTimeout(500);

  // 3. Measure tap on Shop Card
  // Click Today's 7 or search chip to get shop cards
  const chip = page.getByRole('button', { name: 'Coffee near me' });
  if (await chip.isVisible()) {
    await chip.click();
    await page.waitForSelector('a[href*="/explore/s/"]', { timeout: 15000 });
  }

  const shopCard = page.locator('a[href*="/explore/s/"]').first();
  await shopCard.waitFor({ state: 'visible', timeout: 10000 });

  const tCardStart = performance.now();
  await shopCard.click();
  // Wait for visual transition: URL changes to /explore/s/... or shop screen renders
  await page.waitForFunction(() => {
    return window.location.pathname.includes('/explore/s/');
  }, { timeout: 10000 });
  const tCardFeedback = performance.now() - tCardStart;

  if (runIndex === 1) {
    await page.screenshot({ path: `${OUT_DIR}/tap-${isThrottled ? 'throttled' : 'unthrottled'}.png` });
  }

  await context.close();

  return {
    rescueTabMs: Math.round(tRescueFeedback),
    askTabMs: Math.round(tAskFeedback),
    shopCardMs: Math.round(tCardFeedback),
  };
}

// -------------------------------------------------------------
// 4. BUNDLE & ASSET AUDIT
// -------------------------------------------------------------
async function auditBundle(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();

  const resources = [];

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    const contentEncoding = headers['content-encoding'] || 'none';
    const cacheControl = headers['cache-control'] || 'none';
    const contentLength = parseInt(headers['content-length'] || '0', 10);

    let bodyLength = 0;
    try {
      const buffer = await response.body();
      bodyLength = buffer.length;
    } catch {}

    resources.push({
      url,
      status,
      contentType,
      contentEncoding,
      cacheControl,
      contentLength,
      bodyLength: bodyLength || contentLength,
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.customer.journey', 'done');
  });

  await page.goto('https://chalkboard.shreyaan.work/explore/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  await context.close();

  // Classify resources
  let jsBytes = 0;
  let cssBytes = 0;
  let fontBytes = 0;
  let imageBytes = 0;
  let htmlBytes = 0;
  let apiBytes = 0;
  let otherBytes = 0;

  const files = [];

  for (const r of resources) {
    const u = new URL(r.url);
    const size = r.bodyLength;
    const isChalkboard = u.hostname.includes('chalkboard.shreyaan.work');

    let type = 'other';
    if (r.contentType.includes('javascript') || u.pathname.endsWith('.js')) {
      type = 'js';
      jsBytes += size;
    } else if (r.contentType.includes('css') || u.pathname.endsWith('.css')) {
      type = 'css';
      cssBytes += size;
    } else if (r.contentType.includes('font') || u.pathname.endsWith('.woff2') || u.pathname.endsWith('.woff')) {
      type = 'font';
      fontBytes += size;
    } else if (r.contentType.includes('image') || r.contentType.includes('svg') || u.pathname.endsWith('.svg') || u.pathname.endsWith('.png') || u.pathname.endsWith('.webp')) {
      type = 'image';
      imageBytes += size;
    } else if (r.contentType.includes('html')) {
      type = 'html';
      htmlBytes += size;
    } else if (r.contentType.includes('json') || u.pathname.startsWith('/api/')) {
      type = 'api';
      apiBytes += size;
    } else {
      otherBytes += size;
    }

    files.push({
      url: r.url,
      pathname: u.pathname,
      hostname: u.hostname,
      type,
      size,
      contentEncoding: r.contentEncoding,
      cacheControl: r.cacheControl,
      isChalkboard,
    });
  }

  // Sort files by size
  files.sort((a, b) => b.size - a.size);

  return {
    totalResources: resources.length,
    totalBytes: jsBytes + cssBytes + fontBytes + imageBytes + htmlBytes + apiBytes + otherBytes,
    breakdown: {
      jsBytes,
      cssBytes,
      fontBytes,
      imageBytes,
      htmlBytes,
      apiBytes,
      otherBytes,
    },
    topFiles: files.slice(0, 15),
    compressionAudit: {
      compressedCount: files.filter(f => f.contentEncoding !== 'none').length,
      uncompressedCount: files.filter(f => f.contentEncoding === 'none').length,
      chalkboardAssetsUncompressed: files.filter(f => f.isChalkboard && f.contentEncoding === 'none' && (f.type === 'js' || f.type === 'css')).map(f => ({ path: f.pathname, size: f.size })),
    },
    cachingAudit: {
      immutableCount: files.filter(f => f.cacheControl.includes('immutable')).length,
      noStoreCount: files.filter(f => f.cacheControl.includes('no-store') || f.cacheControl.includes('no-cache')).length,
      htmlCacheControl: files.find(f => f.type === 'html')?.cacheControl || 'none',
      jsCssCacheControlSummary: [...new Set(files.filter(f => f.isChalkboard && (f.type === 'js' || f.type === 'css')).map(f => f.cacheControl))],
    }
  };
}

// -------------------------------------------------------------
// 5. PUBLIC API HEALTH CHECK
// -------------------------------------------------------------
async function auditApiHealth(isThrottled, browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await setupThrottling(context, page, isThrottled);

  const runs = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const resp = await page.request.get('https://business.chalkboard.shreyaan.work/api/v1/health');
    const duration = Math.round(performance.now() - t0);
    runs.push(duration);
  }

  await context.close();
  return stats(runs);
}

// -------------------------------------------------------------
// MAIN AUDIT RUNNER
// -------------------------------------------------------------
async function run() {
  console.log('Starting Live Performance Audit on https://chalkboard.shreyaan.work...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });

  const results = {
    timestamp: new Date().toISOString(),
    targets: {
      customer: 'https://chalkboard.shreyaan.work',
      publicApi: 'https://business.chalkboard.shreyaan.work/api/v1/health',
    },
    lighthouseSkipped: 'Lighthouse CLI not available without installation (npx --no-install lighthouse skipped per brief)',
    customerExplore: {
      unthrottled: {
        cold: [],
        warm: [],
      },
      throttled: {
        cold: [],
        warm: [],
      },
    },
    landingPage: {
      unthrottled: {
        cold: [],
      },
      throttled: {
        cold: [],
      },
    },
    customerAsk: {
      unthrottled: [],
      throttled: [],
    },
    tapResponsiveness: {
      unthrottled: [],
      throttled: [],
    },
    apiHealth: {
      unthrottled: null,
      throttled: null,
    },
    bundleAudit: null,
  };

  // 1. Bundle & Asset audit
  console.log('\n--- 1. Running Bundle & Asset Audit ---');
  results.bundleAudit = await auditBundle(browser);
  console.log(`Bundle audit complete: ${Math.round(results.bundleAudit.totalBytes / 1024)} KB total, ${Math.round(results.bundleAudit.breakdown.jsBytes / 1024)} KB JS`);

  // 2. Customer Explore Page Load (Cold & Warm) - 5 runs unthrottled & 5 runs throttled
  console.log('\n--- 2. Customer Explore Page Load (Unthrottled, 5 runs) ---');
  for (let i = 1; i <= 5; i++) {
    process.stdout.write(` Run ${i} Cold... `);
    const cold = await measurePageLoad('https://chalkboard.shreyaan.work/explore/', false, false, i, browser);
    results.customerExplore.unthrottled.cold.push(cold);
    console.log(`LCP: ${cold.lcp}ms, TTFB: ${cold.ttfb}ms, FCP: ${cold.fcp}ms, TBT: ${cold.tbt}ms, CLS: ${cold.cls}`);

    process.stdout.write(` Run ${i} Warm... `);
    const warm = await measurePageLoad('https://chalkboard.shreyaan.work/explore/', false, true, i, browser);
    results.customerExplore.unthrottled.warm.push(warm);
    console.log(`LCP: ${warm.lcp}ms, TTFB: ${warm.ttfb}ms, FCP: ${warm.fcp}ms, TBT: ${warm.tbt}ms, CLS: ${warm.cls}`);
  }

  console.log('\n--- 3. Customer Explore Page Load (Throttled Fast 3G + 4x CPU, 5 runs) ---');
  for (let i = 1; i <= 5; i++) {
    process.stdout.write(` Run ${i} Cold... `);
    const cold = await measurePageLoad('https://chalkboard.shreyaan.work/explore/', true, false, i, browser);
    results.customerExplore.throttled.cold.push(cold);
    console.log(`LCP: ${cold.lcp}ms, TTFB: ${cold.ttfb}ms, FCP: ${cold.fcp}ms, TBT: ${cold.tbt}ms, CLS: ${cold.cls}`);

    process.stdout.write(` Run ${i} Warm... `);
    const warm = await measurePageLoad('https://chalkboard.shreyaan.work/explore/', true, true, i, browser);
    results.customerExplore.throttled.warm.push(warm);
    console.log(`LCP: ${warm.lcp}ms, TTFB: ${warm.ttfb}ms, FCP: ${warm.fcp}ms, TBT: ${warm.tbt}ms, CLS: ${warm.cls}`);
  }

  // 3. Landing page load (1 cold run unthrottled & throttled for comparison)
  console.log('\n--- 4. Landing Page Load ---');
  const landingColdUnthrottled = await measurePageLoad('https://chalkboard.shreyaan.work/', false, false, 1, browser);
  results.landingPage.unthrottled.cold.push(landingColdUnthrottled);
  console.log(`Landing Cold Unthrottled: LCP ${landingColdUnthrottled.lcp}ms, TTFB ${landingColdUnthrottled.ttfb}ms, FCP ${landingColdUnthrottled.fcp}ms`);

  const landingColdThrottled = await measurePageLoad('https://chalkboard.shreyaan.work/', true, false, 1, browser);
  results.landingPage.throttled.cold.push(landingColdThrottled);
  console.log(`Landing Cold Throttled: LCP ${landingColdThrottled.lcp}ms, TTFB ${landingColdThrottled.ttfb}ms, FCP ${landingColdThrottled.fcp}ms`);

  // 4. Customer Ask ("filter coffee near me") - 5 runs unthrottled & 5 runs throttled
  console.log('\n--- 5. Customer Ask ("filter coffee near me", Unthrottled 5 runs) ---');
  for (let i = 1; i <= 5; i++) {
    const res = await measureCustomerAsk(false, i, browser);
    results.customerAsk.unthrottled.push(res);
    console.log(` Ask Run ${i}: First Word ${res.firstWordMs}ms, Complete ${res.completeMs}ms, CLS ${res.cls}, SpinnerWithoutWords: ${res.spinnerWithoutWords}`);
  }

  console.log('\n--- 6. Customer Ask ("filter coffee near me", Throttled 5 runs) ---');
  for (let i = 1; i <= 5; i++) {
    const res = await measureCustomerAsk(true, i, browser);
    results.customerAsk.throttled.push(res);
    console.log(` Ask Run ${i}: First Word ${res.firstWordMs}ms, Complete ${res.completeMs}ms, CLS ${res.cls}, SpinnerWithoutWords: ${res.spinnerWithoutWords}`);
  }

  // 5. Tap Responsiveness - 5 runs unthrottled & 5 runs throttled
  console.log('\n--- 7. Tap Responsiveness (Unthrottled 5 runs) ---');
  for (let i = 1; i <= 5; i++) {
    const res = await measureTapResponsiveness(false, i, browser);
    results.tapResponsiveness.unthrottled.push(res);
    console.log(` Tap Run ${i}: Rescue ${res.rescueTabMs}ms, AskTab ${res.askTabMs}ms, ShopCard ${res.shopCardMs}ms`);
  }

  console.log('\n--- 8. Tap Responsiveness (Throttled 5 runs) ---');
  for (let i = 1; i <= 5; i++) {
    const res = await measureTapResponsiveness(true, i, browser);
    results.tapResponsiveness.throttled.push(res);
    console.log(` Tap Run ${i}: Rescue ${res.rescueTabMs}ms, AskTab ${res.askTabMs}ms, ShopCard ${res.shopCardMs}ms`);
  }

  // 6. Public API health check
  console.log('\n--- 9. Public API Health Check ---');
  results.apiHealth.unthrottled = await auditApiHealth(false, browser);
  console.log(`API Health Unthrottled: p50 ${results.apiHealth.unthrottled.p50}ms, p95 ${results.apiHealth.unthrottled.p95}ms`);

  results.apiHealth.throttled = await auditApiHealth(true, browser);
  console.log(`API Health Throttled: p50 ${results.apiHealth.throttled.p50}ms, p95 ${results.apiHealth.throttled.p95}ms`);

  // Write full raw results to JSON
  const jsonPath = `${OUT_DIR}/audit-results.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nAudit successfully completed! Results saved to ${jsonPath}`);

  await browser.close();
}

run().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
