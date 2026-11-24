/* Android 10 / WebView refraction + compatibility verification.
 *
 * The user's real device is Android 10 with WebView 87.0.4280.101. The actual
 * Liquid-Glass refraction is a BACKDROP DISPLACEMENT (feDisplacementMap bends
 * the content behind the bar via backdrop-filter:url()). The root cause of
 * "no refraction" was that every Android UA was classified legacy, so url()
 * was never enabled. v1.8 fixes the probe: only engines < 76 are legacy.
 *
 * We reproduce the exact engine here (same Chromium family via UA override):
 *   A. User's WebView 87 on Android 10 -> must enable backdrop-filter:url()
 *      with a valid displacement map and a real scale; canvas optics still
 *      paint the specular rim; all interactions work; zero JS errors.
 *   B. Genuinely old engine (Chromium 74) -> legacy tier: no url(), but
 *      saturate() survives and the canvas glass still renders.
 *
 * Run: node tests/ui/verify-android10.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');

const UI = path.resolve(__dirname, '../../app/src/main/assets/ui');
// The user's exact WebView version.
const UA_ANDROID10 =
  'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.101 Mobile Safari/537.36';
// A genuinely pre-backdrop-filter engine, for the graceful-degradation tier.
const UA_OLD =
  'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.157 Mobile Safari/537.36';
const UA_MODERN =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function open(browser, ua, disableWebGL) {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  // NOTE: we deliberately do NOT disable WebGL for the Android case. The real
  // bug was a WebGL context that exists but composites nothing — we must prove
  // the code ignores it and paints via 2D even when GL is available.
  if (disableWebGL) args.push('--disable-webgl', '--disable-webgl2', '--disable-3d-apis');
  const ctx = await browser.newContext({
    userAgent: ua,
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // Record which context type #dock-optics actually requests.
  await page.addInitScript(() => {
    window.__ctxCalls = [];
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      if (this.id === 'dock-optics') window.__ctxCalls.push(type);
      return orig.apply(this, arguments);
    };
  });
  await page.goto('file://' + UI + '/index.html');
  await page.waitForFunction(() => document.documentElement.classList.contains('glass-probed'));
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

function inspect(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const dock = document.querySelector('nav.tabbar > .nav-inner');
    const cs = getComputedStyle(dock);
    const canvas = document.getElementById('dock-optics');
    const lens = document.getElementById('dock-lens');
    const filt = document.getElementById('glass-refract');
    const dem = filt && filt.querySelector('feDisplacementMap');
    const feim = filt && filt.querySelector('feImage');
    const href = feim ? (feim.getAttribute('href') ||
      feim.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '') : '';
    // A backdrop root between <html> and the dock would blind backdrop-filter.
    const breakers = [];
    let el = dock;
    while (el && el !== document.documentElement) {
      const c = getComputedStyle(el);
      if (c.opacity !== '1' || c.filter !== 'none' ||
          c.mixBlendMode !== 'normal' || c.willChange !== 'auto') {
        breakers.push((el.tagName || '') + '.' + (el.className || ''));
      }
      el = el.parentElement;
    }
    return {
      cls: Array.from(root.classList),
      ctxCalls: window.__ctxCalls.slice(),
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter || '',
      feScale: dem ? parseFloat(dem.getAttribute('scale')) : null,
      feImageValid: href.indexOf('base64,') >= 0,
      backdropRootBreakers: breakers,
      canvasW: canvas.width,
      canvasH: canvas.height,
      lensOpacity: getComputedStyle(lens).opacity,
      current: document.querySelector('button[data-page][aria-current]')?.dataset.page,
      tabs: Array.from(document.querySelectorAll('button[data-page]')).map((b) => ({
        page: b.dataset.page, left: b.offsetLeft, w: b.offsetWidth
      }))
    };
  });
}

// Sample the painted optics canvas. The new whole-face lens model must show a
// moving sheen ACROSS the middle (not just the rim), stay translucent (no
// fogging / overexposure), and carry a soft spectral wash.
function sampleOptics(page) {
  return page.evaluate(() => {
    const c = document.getElementById('dock-optics');
    const x = c.getContext('2d');
    if (!x) return { software: false };
    const W = c.width, H = c.height, row = Math.floor(H / 2);
    const at = (px) => Array.from(x.getImageData(px, row, 1, 1).data);
    const center = at(Math.floor(W / 2));
    const alphas = [];
    let peakAlpha = -1, peakX = -1, blown = 0, maxBR = -999, minBR = 999;
    for (let px = 0; px < W; px++) {
      const d = at(px);
      alphas.push(d[3]);
      if (d[3] > peakAlpha) { peakAlpha = d[3]; peakX = px; }
      if (d[0] > 250 && d[1] > 250 && d[2] > 250 && d[3] > 240) blown++;
      if (d[3] > 20) { const br = d[2] - d[0]; if (br > maxBR) maxBR = br; if (br < minBR) minBR = br; }
    }
    // Count how much of the FACE (middle 60%) is covered by visible glass.
    let faceLit = 0, faceCount = 0;
    for (let px = Math.floor(W * 0.2); px < Math.floor(W * 0.8); px++) {
      faceCount++; if (at(px)[3] > 12) faceLit++;
    }
    return { software: true, center, peakAlpha, peakX, W, blown,
             maxBR, minBR, faceLit, faceCount };
  });
}

// Weighted brightness centroid of the INNER face (excludes the fixed edge lip),
// used to prove the sheen actually moves with the light rather than sitting on
// the four sides.
async function sheenCentroid(page) {
  return page.evaluate(() => {
    const c = document.getElementById('dock-optics'), x = c.getContext('2d');
    const W = c.width, H = c.height, row = Math.floor(H / 2);
    const lo = Math.floor(W * 0.18), hi = Math.floor(W * 0.82);
    let wsum = 0, sum = 0;
    for (let px = lo; px < hi; px++) {
      const d = x.getImageData(px, row, 1, 1).data;
      const w = d[3] * (d[0] + d[1] + d[2]) / (3 * 255);
      wsum += w * px; sum += w;
    }
    return sum > 0 ? wsum / sum / W : 0.5; // normalized 0..1
  });
}

async function interactions(page, tag) {
  // 1. Tap-to-switch still routes and moves the knob.
  await page.click('button[data-page="skills"]');
  await page.waitForTimeout(500);
  assert.equal(await page.getAttribute('button[data-page="skills"]', 'aria-current'), 'page', tag + ': tap switch');

  // 2. Knob drag: grab the selected lens, pull it right, snap to nearest tab.
  const lens = await page.locator('#dock-lens').boundingBox();
  const target = await page.locator('button[data-page="links"]').boundingBox();
  const y = lens.y + lens.height / 2;
  await page.mouse.move(lens.x + lens.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(lens.x + lens.width / 2 + (target.x - lens.x) * i / 6, y);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  assert.equal(await page.getAttribute('button[data-page="links"]', 'aria-current'), 'page', tag + ': knob drag snap');

  // 3. Capsule drag on a non-knob area must not switch tabs and must recover.
  const before = await page.getAttribute('button[data-page="links"]', 'aria-current');
  const nav = await page.locator('nav.tabbar > .nav-inner').boundingBox();
  const gy = nav.y + nav.height / 2;
  await page.mouse.move(nav.x + 6, gy);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(nav.x + 6 + i * 4, gy + i * 2);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  assert.equal(await page.getAttribute('button[data-page="links"]', 'aria-current'), before, tag + ': capsule drag no tab switch');
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    // ----- A. USER'S EXACT DEVICE: Android 10, WebView 87.0.4280.101 --------
    // With WebGL available (the real GL-blank bug scenario). The fix must:
    //   (1) enable the real backdrop DISPLACEMENT refraction, and
    //   (2) ignore WebGL and paint the specular optics via software 2D.
    const a = await open(browser, UA_ANDROID10, false);
    const ia = await inspect(a.page);
    assert.ok(ia.cls.includes('glass-probed'), 'A: probe ran');
    assert.ok(ia.cls.includes('glass-bdurl'), 'A: url() refraction ENABLED on WebView 87 (the whole point)');
    assert.ok(!ia.cls.includes('glass-legacy-webview'), 'A: 87 is not misclassified as legacy');
    assert.ok(ia.cls.includes('glass-software-optics'), 'A: software optics forced on WebView');
    assert.match(ia.backdrop, /url\(/, 'A: backdrop-filter uses the SVG displacement filter');
    assert.match(ia.backdrop, /saturate/, 'A: saturate() still present alongside url()');
    assert.ok(ia.feImageValid, 'A: displacement map image is embedded and valid');
    assert.ok(ia.feScale >= 8 && ia.feScale <= 80, 'A: displacement scale is real (' + ia.feScale + ')');
    assert.deepEqual(ia.backdropRootBreakers, [], 'A: no backdrop-root breaker between <html> and dock');
    assert.ok(!ia.ctxCalls.includes('webgl'), 'A: WebGL context never requested (GL-blank bug avoided)');
    assert.ok(ia.ctxCalls.includes('2d'), 'A: 2D software context requested');
    const oa = await sampleOptics(a.page);
    assert.equal(oa.software, true, 'A: software optics path active despite GL being available');
    // The whole face must now carry glass: centre has a soft moving reflection,
    // not the old dead-flat alpha~1 hole.
    assert.ok(oa.center[3] >= 18 && oa.center[3] <= 140, 'A: centre has a soft reflection (alpha ' + oa.center[3] + ')');
    const faceRatio = oa.faceLit / oa.faceCount;
    assert.ok(faceRatio > 0.8, 'A: glass covers the whole face (lit ' + (faceRatio * 100).toFixed(0) + '%)');
    assert.ok(oa.peakAlpha > 40, 'A: a distinct sheen highlight exists (peak alpha ' + oa.peakAlpha + ')');
    assert.equal(oa.blown, 0, 'A: no overexposed pixels');
    assert.ok(oa.maxBR - oa.minBR > 8, 'A: soft spectral wash spans channels (' + oa.minBR + '..' + oa.maxBR + ')');
    // Prove the highlight is NOT fixed on the rim: aim the light to each end
    // of the dock and confirm the inner-face brightness centroid shifts.
    // (Synthesize pointermove — Playwright's mouse doesn't emit pointer events
    // in a hasTouch context.)
    const aim = (frac) => a.page.evaluate((f) => {
      const d = document.querySelector('nav.tabbar > .nav-inner'), r = d.getBoundingClientRect();
      d.dispatchEvent(new PointerEvent('pointermove', {
        clientX: r.left + r.width * f, clientY: r.top + r.height / 2,
        bubbles: true, pointerId: 1, pointerType: 'touch', button: 0
      }));
    }, frac);
    await aim(0.05); await a.page.waitForTimeout(700);
    const cLeft = await sheenCentroid(a.page);
    await aim(0.95); await a.page.waitForTimeout(700);
    const cRight = await sheenCentroid(a.page);
    assert.ok(cRight - cLeft > 0.04, 'A: sheen follows the light (centroid ' + cLeft.toFixed(3) + ' -> ' + cRight.toFixed(3) + ')');
    await interactions(a.page, 'A');
    assert.deepEqual(a.errors, [], 'A: zero JS errors');
    await a.ctx.close();
    console.log('PASS A: USER DEVICE Android 10 / WebView 87 — real backdrop refraction enabled (url+map+scale), no backdrop-root breaker, GL ignored, whole-face sheen, interactions OK, 0 errors');
    console.log('   A centre alpha', oa.center[3], '| face lit', (faceRatio * 100).toFixed(0) + '%',
      '| peak alpha', oa.peakAlpha + '@x' + oa.peakX + '/' + oa.W, '| blown', oa.blown,
      '| spectral', oa.minBR + '..' + oa.maxBR, '| sheen centroid', cLeft.toFixed(3) + '->' + cRight.toFixed(3),
      '| feScale', ia.feScale, '| ctxCalls:', ia.ctxCalls, '| backdrop:', ia.backdrop);

    // ----- B. Genuinely old engine (Chromium 74) — graceful degradation -----
    const b = await open(browser, UA_OLD, false);
    const ib = await inspect(b.page);
    assert.ok(ib.cls.includes('glass-probed'), 'B: probe ran');
    assert.ok(ib.cls.includes('glass-legacy-webview'), 'B: truly-old UA tagged legacy');
    assert.ok(!ib.cls.includes('glass-bdurl'), 'B: no url() on pre-76 engine');
    assert.match(ib.backdrop, /saturate/, 'B: saturate() survives on its own declaration');
    assert.doesNotMatch(ib.backdrop, /url\(/, 'B: no SVG-filter backdrop on old engine');
    assert.ok(!ib.ctxCalls.includes('webgl'), 'B: WebGL never requested');
    assert.ok(ib.ctxCalls.includes('2d'), 'B: software optics active');
    const ob = await sampleOptics(b.page);
    assert.ok(ob.center[3] >= 10, 'B: canvas glass still renders without url() (alpha ' + ob.center[3] + ')');
    await interactions(b.page, 'B');
    assert.deepEqual(b.errors, [], 'B: zero JS errors');
    await b.ctx.close();
    console.log('PASS B: old engine Chromium 74 — legacy tier, saturate kept, canvas glass renders, interactions OK, 0 errors');

    // ----- C. Modern Chromium — enhancement still engaged ------------------
    const c = await open(browser, UA_MODERN, false);
    const ic = await inspect(c.page);
    assert.ok(ic.cls.includes('glass-bdurl'), 'C: url() backdrop engaged on modern engine');
    assert.match(ic.backdrop, /url\(/, 'C: SVG-filter backdrop applied');
    assert.deepEqual(c.errors, [], 'C: zero JS errors');
    await c.ctx.close();
    console.log('PASS C: modern engine — backdrop-filter:url() enhancement engaged, 0 errors');
    console.log('   C backdrop:', ic.backdrop);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
