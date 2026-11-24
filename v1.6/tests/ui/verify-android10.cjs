/* Android 10 / old-WebView compatibility verification.
 *
 * Chromium 144 cannot run the stock Android 10 WebView (Chromium 74) here, so
 * we reproduce the two conditions that actually differ and exercise both:
 *   A. A Chromium 74 / Android 10 WebView UA -> the capability probe must take
 *      the legacy tier: no backdrop-filter:url() enhancement, but saturate()
 *      survives on its own line and the canvas refraction still paints.
 *   B. A modern Chromium UA -> the enhancement path must still engage.
 * WebGL is disabled in A to mirror a WebView with no usable GL context, so the
 * guaranteed software optics path is the one under test.
 *
 * Run: node tests/ui/verify-android10.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');

const UI = path.resolve(__dirname, '../../app/src/main/assets/ui');
const UA_ANDROID10 =
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
    return {
      cls: Array.from(root.classList),
      ctxCalls: window.__ctxCalls.slice(),
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter || '',
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

// Sample the painted optics canvas: the rim must carry colour (refraction/
// dispersion) while the flat centre stays near-transparent.
function sampleOptics(page) {
  return page.evaluate(() => {
    const c = document.getElementById('dock-optics');
    const x = c.getContext('2d');
    if (!x) return { software: false };
    const W = c.width, H = c.height, row = Math.floor(H / 2);
    const at = (px) => Array.from(x.getImageData(px, row, 1, 1).data);
    const center = at(Math.floor(W / 2));
    // Scan the rounded rim on both sides. Dispersion is cyan outside (b-r>0)
    // and magenta inside (b-r<0); sample a strip so we don't depend on landing
    // on one exact pixel.
    function edgeMax(minPx, maxPx) {
      let maxBR = -999, minBR = 999, peak = null;
      for (let px = minPx; px <= maxPx; px++) {
        const d = at(px);
        if (d[3] < 20) continue;
        const br = d[2] - d[0];
        if (br > maxBR) { maxBR = br; peak = d; }
        if (br < minBR) minBR = br;
      }
      return { maxBR, minBR, peak };
    }
    const left = edgeMax(0, 8), right = edgeMax(W - 9, W - 1);
    const painted = left.peak && left.peak[3] > 0;
    return { software: true, center, left, right, painted };
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
    // ----- A. Android 10 stock WebView (Chromium 74) WITH WebGL available ---
    // This is the exact real-phone scenario that used to render flat: GL exists
    // but composites nothing. The fix must ignore it and paint via software 2D.
    const a = await open(browser, UA_ANDROID10, false);
    const ia = await inspect(a.page);
    assert.ok(ia.cls.includes('glass-probed'), 'A: probe ran');
    assert.ok(ia.cls.includes('glass-legacy-webview'), 'A: legacy UA tagged');
    assert.ok(ia.cls.includes('glass-software-optics'), 'A: software optics forced on WebView');
    assert.ok(!ia.cls.includes('glass-bdurl'), 'A: no url() backdrop enhancement on stock WebView');
    assert.match(ia.backdrop, /saturate/, 'A: saturate() survives on its own declaration');
    assert.doesNotMatch(ia.backdrop, /url\(/, 'A: no SVG-filter backdrop on stock WebView');
    assert.ok(!ia.ctxCalls.includes('webgl'), 'A: WebGL context never requested (GL-blank bug avoided)');
    assert.ok(ia.ctxCalls.includes('2d'), 'A: 2D software context requested');
    const oa = await sampleOptics(a.page);
    assert.equal(oa.software, true, 'A: software optics path active despite GL being available');
    assert.ok(oa.painted, 'A: canvas refraction actually painted');
    assert.ok(oa.center[3] <= 6, 'A: centre stays near-transparent (alpha ' + oa.center[3] + ')');
    // Dispersion must be clearly visible: a cyan band (b-r large positive) AND
    // a magenta band (b-r negative) on both rounded ends.
    assert.ok(oa.left.maxBR > 20, 'A: left cyan band visible (max b-r=' + oa.left.maxBR + ')');
    assert.ok(oa.left.minBR < -20, 'A: left magenta band visible (min b-r=' + oa.left.minBR + ')');
    assert.ok(oa.right.maxBR > 20, 'A: right cyan band visible (max b-r=' + oa.right.maxBR + ')');
    assert.ok(oa.right.minBR < -20, 'A: right magenta band visible (min b-r=' + oa.right.minBR + ')');
    await interactions(a.page, 'A');
    assert.deepEqual(a.errors, [], 'A: zero JS errors');
    await a.ctx.close();
    console.log('PASS A: Android 10 WebView 74 WITH WebGL — software optics forced, GL never used, cyan+magenta dispersion clearly visible, interactions OK, 0 errors');
    console.log('   A canvas centre', oa.center, '| left b-r', oa.left.minBR + '..' + oa.left.maxBR,
      '| right b-r', oa.right.minBR + '..' + oa.right.maxBR, '| ctxCalls:', ia.ctxCalls, '| backdrop:', ia.backdrop);

    // ----- B. Modern Chromium UA — enhancement tier still engaged ---------
    const b = await open(browser, UA_MODERN, false);
    const ib = await inspect(b.page);
    assert.ok(ib.cls.includes('glass-bdurl'), 'B: url() backdrop enhancement engaged on modern engine');
    assert.match(ib.backdrop, /url\(/, 'B: SVG-filter backdrop applied');
    assert.deepEqual(b.errors, [], 'B: zero JS errors');
    await b.ctx.close();
    console.log('PASS B: modern engine — backdrop-filter:url() enhancement engaged, 0 errors');
    console.log('   B backdrop:', ib.backdrop);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
