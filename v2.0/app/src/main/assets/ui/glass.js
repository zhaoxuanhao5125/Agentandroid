/* Optical dock: a dielectric glass surface. The document is transmitted by
   CSS backdrop-filter; this pass adds only the reflected radiance and a small
   chromatic dispersion at grazing angles (Apple Liquid Glass style), plus a
   subtle four-direction elastic deformation. No texture, clock or idle loop. */
(function () {
  'use strict';

  /* ---- Android 10 / old-WebView capability probe --------------------------
     Android 10 ships Chromium 74 WebView (upgradeable, but not guaranteed).
     Two things differ from a modern desktop Chromium and used to break here:
       1) backdrop-filter: url(#svgFilter) — parsed but NOT rendered. When it
          shared one declaration with saturate(), the whole value was dropped.
          CSS now gates that enhancement on the .glass-bdurl class below.
       2) WebGL — frequently unavailable or lost in WebView. The software
          optics path is the guaranteed baseline, so keep it always ready.
     Probe once, tag <html>, and let CSS pick the right tier. All detection is
     wrapped so a hostile/odd WebView can never abort the script. */
  var rootEl = document.documentElement;
  var ua = '';
  try { ua = navigator.userAgent || ''; } catch (_) {}
  var chromeVer = /Chrome\/(\d+)/.exec(ua);           // Chromium/WebView major
  var mv = chromeVer ? parseInt(chromeVer[1], 10) : 0;
  var isWebView = /; wv\)/.test(ua) || /Android\b/.test(ua);
  /* REAL REFRACTION (v1.8): the actual Liquid-Glass effect is a backdrop
     DISPLACEMENT — feDisplacementMap bends the content BEHIND the bar. That is
     backdrop-filter:url(#glass-refract). It works on every Chromium that can
     render SVG-filter backdrops (Chrome/WebView >= ~76). Android 10 ships an
     UPDATABLE WebView; in practice it is a modern Chromium, so treating every
     Android UA as "legacy" disabled the one thing that produces visible
     refraction. Only genuinely old engines (<76) lack url() backdrops. CSS
     keeps saturate() on its own declaration, so a failed url() rule falls back
     safely instead of killing the glass. */
  var legacy = (mv > 0 && mv < 76);                      // no url() backdrop support
  var legacyWV = isWebView && mv > 0 && mv < 76;
  /* THE REAL ANDROID BUG: WebGL in a WebView can create a context and compile
     shaders yet composite NOTHING to screen (premultiplied/low-power layer
     path). The old code saw program != null and never called software(), so on
     a real phone the whole refraction layer was silently blank — "flat glass".
     Every verified refraction we have came from the 2D software path, so force
     it on any Android/WebView engine. Desktop Chromium keeps WebGL as a bonus. */
  var forceSoftware = isWebView || legacy;
  try {
    rootEl.classList.add('glass-probed');
    if (legacy) rootEl.classList.add('glass-legacy-webview');
    if (forceSoftware) rootEl.classList.add('glass-software-optics');
  } catch (_) {}
  var bdUrl = false, bdAny = false;
  try {
    var probe = document.createElement('div');
    var supports = function (prop, val) {
      if (!window.CSS || !CSS.supports) return false;
      return CSS.supports(prop, val) || CSS.supports('-webkit-' + prop, val);
    };
    bdAny = supports('backdrop-filter', 'blur(1px)');
    // CSS.supports reports syntax, not rendering. Only trust url() on a
    // non-legacy engine; on Android 10 stock WebView it silently fails.
    bdUrl = bdAny && !legacy && supports('backdrop-filter', 'url("#glass-refract")');
    if (bdUrl) rootEl.classList.add('glass-bdurl');
    if (!bdAny) rootEl.classList.add('glass-no-bd');
  } catch (_) {
    // If probing throws, assume the safe baseline (no url enhancement, keep
    // the plain saturate()/gradient tiers). Never tag glass-bdurl.
  }

  /* ---- Cross-engine refraction mirror (v2.0) ---------------------------
     WebView 87 cannot render backdrop-filter:url(#svg). Mirror the LIVE page
     content that sits behind the dock into a clip and displace it with
     filter:url(), which works on every engine (Chrome 19+). The mirror is
     kept opaque by CSS so it replaces rather than doubles that content.
     Sync covers scroll, resize, navigation and any DOM/content change. */
  (function () {
    var mirror = document.getElementById('refract-mirror');
    var shell = document.querySelector('.shell');
    if (!mirror || !shell) return;
    var pending = false, lastHtml = '';
    function sync() {
      try {
        var sr = shell.getBoundingClientRect();
        var nr = mirror.parentNode.getBoundingClientRect();
        mirror.style.transform = 'translate3d(' + (sr.left - nr.left) + 'px,' + (sr.top - nr.top) + 'px,0)';
      } catch (_) {}
    }
    function cloneShell() {
      try {
        lastHtml = shell.innerHTML;
        mirror.innerHTML = lastHtml;
        // Neutralise interactivity and duplicate ids in the mirror copy.
        var nodes = mirror.querySelectorAll('[id],[data-page]');
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].removeAttribute('id');
          nodes[i].removeAttribute('data-page');
        }
        mirror.setAttribute('inert', '');
      } catch (_) {}
      sync();
    }
    function schedule() {
      if (pending) return; pending = true;
      requestAnimationFrame(function () { pending = false; sync(); });
    }
    function changed() {
      try { if (shell.innerHTML !== lastHtml) cloneShell(); else schedule(); }
      catch (_) { schedule(); }
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', cloneShell, { passive: true });
    window.addEventListener('pilot-visibility', changed);
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(changed);
      mo.observe(shell, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    cloneShell();
    setTimeout(cloneShell, 300);
    setTimeout(cloneShell, 1200);
  })();

  var dock = document.querySelector('nav.tabbar > .nav-inner');
  if (!dock) return;
  var canvas = dock.querySelector('#dock-optics'), lens = dock.querySelector('#dock-lens');
  var buttons = dock.querySelectorAll('button[data-page]'), nav = dock.parentNode;
  if (!canvas || !lens || !buttons.length) return;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var gl, program, sizeLoc, lightLoc, attempted = false, lost = false;
  var width = 0, height = 0, dpr = 0, active = -1, slot = 0;
  var x = 0, dest = 0, vx = 0, squash = 0, vs = 0, pressed = false;
  var lx = -.28, ly = -.42, tx = lx, ty = ly, drift = 0;
  /* Deformation-driven light flow: stretching the glass slides the specular
     field against the pull, then a damped spring returns it. Kept separate
     from pointer aim so it also works for touch drags without hover. */
  var flowX = 0, flowY = 0, fx = 0, fy = 0;
  var raf = 0, last = 0, painted = 0, intersecting = true, stale = true;
  var lastScroll = window.pageYOffset, lastTransform = '', forcePaint = true;
  /* Four-direction elastic drag. Displacement saturates non-linearly
     (rubber band) and a spring returns it with a gentle overshoot. */
  var MAX_DRAG = 40, THRESHOLD = 6;
  var dragId = null, dragStartX = 0, dragStartY = 0;
  var dragX = 0, dragY = 0, tgtX = 0, tgtY = 0, vX = 0, vY = 0;
  var dragging = false, suppressClick = false;
  var lastDockTransform = '';
  /* Knob (selected slider) drag: grab the lens itself to slide it along the
     dock, clamped inside the capsule; release snaps to the nearest tab. The
     knob has its own under-damped scale spring — it swells while held and
     bounces back with a soft overshoot. Distinct from the capsule drag above. */
  var KNOB_MAX = 1.34;
  var knobId = null, knobStartX = 0, knobStartLensX = 0, knobDrag = false;
  var kScale = 1, kScaleT = 1, kv = 0;
  var knStretch = 0, knStretchT = 0, ksv = 0;   // force-driven directional stretch
  var programmaticNav = false;
  function reduced() { return motion.matches || document.documentElement.classList.contains('reduce'); }
  function visible() { return intersecting && !document.hidden && !nav.hasAttribute('inert'); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smoothstep(a, b, v) { var t=clamp((v-a)/(b-a),0,1); return t*t*(3-2*t); }
  function mix(a, b, t) { return a+(b-a)*t; }
  function rubber(v) { return MAX_DRAG * (1 - Math.exp(-Math.abs(v) / MAX_DRAG)) * (v < 0 ? -1 : 1); }

  var vertex = 'attribute vec2 a; varying vec2 uv; void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  /* Real clear glass: a Fresnel surface with a ~4% normal-incidence reflectance.
     The face centre reflects almost nothing (the document shows through), while
     grazing angles and light sources produce crisp specular highlights and a
     thin chromatic rim. No opaque body tint — that was fogging the content. */
  var fragment = [
    'precision mediump float;',
    'uniform vec2 size,light; varying vec2 uv;',
    'float panel(vec3 ray, vec3 aim, vec2 halfSize){',
    ' vec3 n=normalize(aim); vec3 u=normalize(cross(vec3(0.,1.,0.),n));',
    ' vec3 v=cross(n,u); float k=dot(ray,n);',
    ' vec2 hit=abs(vec2(dot(ray,u),dot(ray,v)))/max(.05,k);',
    ' vec2 e=1.-smoothstep(halfSize*.55,halfSize+vec2(.05),hit);',
    ' return e.x*e.y*smoothstep(.03,.20,k); }',
    'void main(){',
    ' vec2 p=(uv-.5)*size; float radius=size.y*.5;',
    ' vec2 q=p-vec2(clamp(p.x,-size.x*.5+radius,size.x*.5-radius),0.);',
    ' float r=length(q), depth=radius-r;',
    ' if(depth<-.5) discard;',
    /* Whole-face convex lens: the centre keeps a slight tilt so it catches a
       moving sheen, instead of being a dead flat hole. Mirrored by software(). */
    ' float u=clamp(depth/radius,0.,1.);',
    ' float dome=smoothstep(0.,.55,u)*.22;',
    ' float bevel=1.-smoothstep(0.,radius*.30,max(depth,0.));',
    ' vec2 nd=q/max(r,.01)*(bevel+dome*vec2(1.,.5));',
    ' vec3 N=normalize(vec3(nd,sqrt(max(.0001,1.-dot(nd,nd)))));',
    ' float nz=clamp(N.z,0.,1.);',
    /* Pure neutral glass: identical R=G=B Fresnel, no cool tint, no dispersion. */
    ' float F=.050+.90*pow(1.-nz,4.3);',
    /* Four棚灯 emitters return a moving reflection on the curved face. */
    ' vec3 R=reflect(vec3(0.,0.,-1.),N);',
    ' float sky=smoothstep(-.20,.85,R.y);',
    ' float key=panel(R,vec3(-.42+light.x*.55,.88-light.y*.34,.24),vec2(1.35,.11));',
    ' float strip=panel(R,vec3(.70+light.x*.40,-.74+light.y*.20,-.16),vec2(.85,.06));',
    ' float rim=panel(R,vec3(-.94,-.06+light.y*.24,-.20),vec2(.12,.52));',
    ' float glint=panel(R,vec3(.14+light.x*.70,.66-light.y*.44,.36),vec2(.09,.028));',
    /* Stable base sheen across the whole face + a moving highlight that tracks
       the light — gives the CENTRE a living glass refraction on any backdrop. */
    ' float nx2=p.x/size.x, ny2=q.y/max(r,1.);',
    ' float base=exp(-pow(nx2/.55,2.))*exp(-pow((-q.y/size.y)/.95,2.));',
    ' float sweep=.55*light.x;',
    ' float move=exp(-pow((nx2-sweep)/.17,2.))*exp(-pow((-q.y/size.y)/.8,2.));',
    ' float sheen=base*.30+move*.50;',
    /* Soft refraction features: bright lip, inner dark line, lower caustic. */
    ' float lip=smoothstep(-.6,.6,depth)*(1.-smoothstep(.6,3.2,depth));',
    ' float darkln=smoothstep(2.8,4.2,depth)*(1.-smoothstep(4.2,7.6,depth));',
    ' float down=smoothstep(.25,.85,-ny2);',
    ' float caust=down*smoothstep(0,2.4,depth)*(1.-smoothstep(2.4,7.0,depth));',
    /* Scalar environment: purely neutral white light. Real refraction is done
       by backdrop-filter:url(#glass-refract) on the DOM behind the bar; this
       layer adds only a neutral specular sheen + a crisp edge, fully colourless
       (R=G=B). Kept faint over the flat centre so the refracted content shows
       through, but strong enough at the rim/light spots to read as glass. */
    ' float env=.06+sky*.10;',
    ' env+=(key*2.2+strip*1.4+rim*1.1+glint*2.6+lip*1.3+caust*1.5+sheen*1.1);',
    ' env*=(1.-darkln*.42);',
    ' float edge=bevel*bevel*smoothstep(-.4,1.5,depth);',
    ' env+=edge*1.1;',
    ' float spec=1.-exp(-env*F);',
    ' float c=clamp(spec,0.,1.);',
    /* Alpha tracks brightness directly: centre is naturally dark (near F0),
       rim/light spots are bright. No separate coverage gate — the capsule mask
       is already handled by the shader discard and the CSS border-radius. */
    ' float alpha=clamp(c*.92,0.,.92);',
    ' gl_FragColor=vec4(vec3(c),alpha); }'
  ].join('\n');
  function setup() {
    attempted = true;
    // Android / WebView: WebGL's compositing is unreliable here and the 2D path
    // is the one proven to paint every refraction feature. Skip GL entirely.
    if (forceSoftware) { program = null; return; }
    function compile(type, source) {
      var s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    }
    try {
      gl = canvas.getContext('webgl', {alpha:true, antialias:false, depth:false, stencil:false, premultipliedAlpha:false, preserveDrawingBuffer:true, powerPreference:'low-power'});
      if (!gl) return;
      var v = compile(gl.VERTEX_SHADER, vertex), f = compile(gl.FRAGMENT_SHADER, fragment);
      if (!v || !f) return;
      var p = gl.createProgram(); gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
      gl.deleteShader(v); gl.deleteShader(f);
      if (!gl.getProgramParameter(p,gl.LINK_STATUS)) { gl.deleteProgram(p); return; }
      program = p; gl.useProgram(p);
      sizeLoc = gl.getUniformLocation(p,'size'); lightLoc = gl.getUniformLocation(p,'light');
      var a = gl.getAttribLocation(p,'a'); gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    } catch (_) { program = null; }
  }
  /* Software path mirrors the shader: Fresnel ~4% at the flat face, a crisp
     rounded bevel, four emitters and per-channel dispersion. No body tint. */
  var ctx, image, rays, indices, sw=0, sh=0;
  function software() {
    if (!ctx) {
      try { ctx=canvas.getContext('2d'); } catch (_) { return; }
      if (!ctx) return;
    }
    /* Use the canvas' real backing-store size (set by measure() with DPR).
       Previously this used the CSS size and re-assigned canvas.width, which
       fought measure()'s DPR-scaled value and cleared the canvas every other
       frame — leaving the optics layer blank on the real phone. */
    var w=canvas.width, h=canvas.height, radius=h*.5;
    if (sw!==w || sh!==h || !image) {
      sw=w; sh=h;
      image=ctx.createImageData(w,h); var ray=[], index=[];
      for (var j=0;j<h;j++) for (var i=0;i<w;i++) {
        var px=i+.5-w*.5, py=radius-j-.5;
        var dx=px-clamp(px,-w*.5+radius,w*.5-radius), r=Math.sqrt(dx*dx+py*py), inv=1/Math.max(r,.01);
        var depth=radius-r;
        if (depth<-1 || depth>radius*1.02) continue;
        // Whole-face convex lens (mirrors the GLSL): centre keeps a slight tilt.
        var u=clamp(depth/radius,0,1);
        var dome=smoothstep(0,.55,u)*.22;
        var bevel=1-smoothstep(0,radius*.30,Math.max(depth,0));
        var ndx=(dx*inv)*(bevel+dome), ndy=(py*inv)*(bevel+dome*.5);
        var nn=Math.sqrt(Math.max(.0001,1-ndx*ndx-ndy*ndy));
        var nl=Math.sqrt(ndx*ndx+ndy*ndy+nn*nn);
        var nx=ndx/nl, ny=ndy/nl, nz=nn/nl;
        var cov=smoothstep(-.45,.30,depth);
        var edge=bevel*bevel*smoothstep(-.4,1.5,depth);
        var nx2=px/w, nyh=py/h;   // normalized position for sheen falloff
        // 12 floats: nx,ny,nz,nzClamped,cov,edge,sky,depth,qxn,qyn,nx2,nyh
        ray.push(nx,ny,nz,clamp(nz,0,1),cov,edge,smoothstep(-.20,.85,ny),depth,dx*inv,py*inv,nx2,nyh);
        index.push((j*w+i)*4);
      }
      rays=new Float32Array(ray); indices=new Uint32Array(index);
    }
    function lamp(x,y,z) { var k=1/Math.sqrt(x*x+y*y+z*z); return [x*k,y*k,z*k]; }
    function soft(a,rx,ry,rz,cut,gain){ return clamp((rx*a[0]+ry*a[1]+rz*a[2]-cut)*gain,0,1); }
    var alx=lx+fx, dy=ly+drift+fy;
    var a=lamp(-.42+alx*.55,.88-dy*.34,.24), b=lamp(.70+alx*.40,-.74+dy*.20,-.16);
    var c=lamp(-.94,-.06+dy*.24,-.20), g=lamp(.14+alx*.70,.66-dy*.44,.36);
    var data=image.data;
    for (var n=0,t=0;n<indices.length;n++,t+=12) {
      var rx=rays[t], ry=rays[t+1], rz=rays[t+2], nz=rays[t+3];
      var key=soft(a,rx,ry,rz,.44,3.0), strip=soft(b,rx,ry,rz,.55,3.2);
      var rim=soft(c,rx,ry,rz,.60,2.6), glint=soft(g,rx,ry,rz,.82,6.5);
      var sky=rays[t+6], depth=rays[t+7], qxn=rays[t+8], qyn=rays[t+9];
      var nx2=rays[t+10], nyh=rays[t+11], edge=rays[t+5], cov=rays[t+4];
      // Stable base sheen over the whole face + a highlight tracking the light.
      var base=Math.exp(-Math.pow(nx2/.55,2))*Math.exp(-Math.pow(nyh/.95,2));
      var sweep=.55*alx;
      var move=Math.exp(-Math.pow((nx2-sweep)/.17,2))*Math.exp(-Math.pow(nyh/.8,2));
      var sheen=base*.30+move*.50;
      var lip=smoothstep(-.6,.6,depth)*(1-smoothstep(.6,3.2,depth));
      var darkln=smoothstep(2.8,4.2,depth)*(1-smoothstep(4.2,7.6,depth));
      var down=smoothstep(.25,.85,-qyn);
      var caust=down*smoothstep(0,2.4,depth)*(1-smoothstep(2.4,7.0,depth));
      /* Purely neutral (R=G=B), deliberately faint specular sheen. Real
         backdrop refraction lives in CSS; this only adds a whisper of glass
         highlight so nothing here tints or veils the refracted content. */
      var env=.06+sky*.10+(key*2.2+strip*1.4+rim*1.1+glint*2.6+lip*1.3+caust*1.5+sheen*1.1);
      env*=(1-darkln*.42);
      env+=edge*1.1;
      var one=1-nz;
      var F=.050+.90*Math.pow(one,4.3);
      /* Do NOT name this `c` or `g`: those are lamp vectors a/b/c/g above;
         shadowing them made soft() read undefined components -> NaN, which
         blanked the whole layer from the second pixel on. Alpha tracks
         brightness directly (centre dark, rim bright) with no coverage gate —
         CSS border-radius already clips the capsule. */
      var lum=clamp(1-Math.exp(-env*F),0,1);
      var alpha=clamp(lum*.92,0,.92);
      var off=indices[n];
      data[off  ]=Math.round(255*lum);
      data[off+1]=Math.round(255*lum);
      data[off+2]=Math.round(255*lum);
      data[off+3]=Math.round(255*alpha);
    }
    ctx.putImageData(image,0,0);
  }
  function optics() {
    if (lost) return;
    if (!attempted) setup();
    if (width < 1 || height < 1) return;
    if (!program) { software(); return; }
    gl.viewport(0,0,canvas.width,canvas.height); gl.uniform2f(sizeLoc,width,height);
    gl.uniform2f(lightLoc,lx+fx,ly+drift+fy); gl.drawArrays(gl.TRIANGLES,0,3);
  }
  function select(snap) {
    var i, next = -1;
    for (i=0;i<buttons.length;i++) if (buttons[i].getAttribute('aria-current') === 'page') { next=i; break; }
    lens.style.opacity = next < 0 ? '0' : '1';
    if (next >= 0) {
      dest = buttons[next].offsetLeft; slot = buttons[next].offsetWidth;
      lens.style.width = slot+'px';
      if (snap || active < 0 || reduced()) { x=dest; vx=0; }
    }
    active = next; dock.classList.add('has-lens');
  }
  function measure() {
    // offsetWidth/Height ignore the live drag transform, so optics never feed
    // their own scale back into the canvas or lens geometry.
    var w=dock.offsetWidth, h=dock.offsetHeight; width=w; height=h;
    if (!width || !height) { stale=true; return; }
    dpr=Math.min(1.75,window.devicePixelRatio || 1);
    var cw=Math.round(width*dpr), ch=Math.round(height*dpr);
    if (cw!==canvas.width || ch!==canvas.height) { canvas.width=cw; canvas.height=ch; }
    select(true); stale=false; forcePaint=true;
  }
  function transform() {
    // Knob feedback composes three layers: grow (kScale), force-driven
    // directional stretch (knStretch — pull it like jelly), and tap squash.
    var swell=kScale-1;
    var kx=(1+swell+knStretch-squash*.03);
    var ky=(1+swell*.55-knStretch*.65-squash*.06);
    var style='translate3d('+x.toFixed(2)+'px,0,0) scale('+kx.toFixed(4)+','+ky.toFixed(4)+')';
    if (style!==lastTransform) { lens.style.transform=style; lastTransform=style; }
  }
  function applyDock() {
    /* Four-direction deformation, deliberately subtle. Magnitude grows
       non-linearly (quadratic) so small movements barely deform the glass,
       and the capsule elongates along the drag axis while the cross axis
       compresses slightly — a meniscus, not a rubber rectangle. */
    if (reduced()) {
      if (lastDockTransform!=='none') { dock.style.transform=''; lastDockTransform='none'; }
      return;
    }
    var ux=clamp(dragX/MAX_DRAG,-1,1), uy=clamp(dragY/MAX_DRAG,-1,1);
    var mx=ux*ux, my=uy*uy;                 // non-linear magnitude
    var sx=1+mx*.055-my*.020;               // horizontal stretch, max ~5.5%
    var sy=1+my*.10-mx*.035;                // vertical stretch, max ~10%
    var tx=ux*3.4, ty=uy*2.2;               // restrained displacement (px)
    var skew=(-ux*1.1+uy*.55).toFixed(2);   // sub-degree shear
    var s='translate3d('+tx.toFixed(2)+'px,'+ty.toFixed(2)+'px,0) scale('+sx.toFixed(4)+','+sy.toFixed(4)+') skew('+skew+'deg)';
    if (s!==lastDockTransform) { dock.style.transform=s; lastDockTransform=s; }
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf=0; last=0; }
  function schedule() { if (!raf && visible()) raf=requestAnimationFrame(frame); }
  function frame(now) {
    raf=0;
    if (!visible()) { last=0; return; }
    if (stale) measure();
    if (stale) { last=0; return; }
    var less=reduced(), dt=clamp(last?(now-last)/1000:.016,.001,.032); last=now;
    var pressTarget=pressed && active>=0 ? 1 : 0;
    var oldX=lx+fx, oldY=ly+drift+fy;
    if (less) {
      x=dest; vx=vs=squash=drift=0; lx=tx=-.28; ly=ty=-.42;
      dragX=dragY=tgtX=tgtY=vX=vY=0; flowX=flowY=fx=fy=0;
      kScale=kScaleT=1; kv=0; knStretch=knStretchT=ksv=0;
    } else {
      // Semi-implicit substeps keep the springs stable on 30Hz devices.
      var step=dt/3;
      for (var i=0;i<3;i++) {
        vx+=((dest-x)*430-vx*34)*step; x+=vx*step;
        vs+=((pressTarget-squash)*550-vs*32)*step; squash+=vs*step;
        // Under-damped: a single soft overshoot settles back to rest.
        vX+=((tgtX-dragX)*430-vX*26)*step; dragX+=vX*step;
        vY+=((tgtY-dragY)*470-vY*27)*step; dragY+=vY*step;
        // Knob springs: low damping (zeta ~ .28) gives a lively multi-cycle
        // Q-bounce — the release visibly overshoots then wobbles back.
        kv+=((kScaleT-kScale)*470-kv*14)*step; kScale+=kv*step;
        ksv+=((knStretchT-knStretch)*520-ksv*16)*step; knStretch+=ksv*step;
      }
      var easing=1-Math.exp(-16*dt); lx+=(tx-lx)*easing; ly+=(ty-ly)*easing; drift*=Math.exp(-6*dt);
      /* Pulling the meniscus drags its internal reflection the other way;
         a slower first-order lag than the dock spring makes it feel viscous. */
      flowX=-clamp(dragX/MAX_DRAG,-1,1)*.42;
      flowY=-clamp(dragY/MAX_DRAG,-1,1)*.34;
      var fe=1-Math.exp(-13*dt); fx+=(flowX-fx)*fe; fy+=(flowY-fy)*fe;
    }
    var sliding=Math.abs(dest-x)>.025 || Math.abs(vx)>.14;
    var pressing=!less && (Math.abs(pressTarget-squash)>.002 || Math.abs(vs)>.02);
    var springing=!less && (Math.abs(tgtX-dragX)>.05 || Math.abs(vX)>.05 || Math.abs(tgtY-dragY)>.05 || Math.abs(vY)>.05);
    var knobSpring=!less && (Math.abs(kScaleT-kScale)>.0015 || Math.abs(kv)>.01 || Math.abs(knStretchT-knStretch)>.0015 || Math.abs(ksv)>.01);
    var flowing=!less && (Math.abs(flowX-fx)>.002 || Math.abs(flowY-fy)>.002);
    var lighting=Math.abs(lx-tx)+Math.abs(ly-ty)+Math.abs(drift)>.002;
    if (!sliding) { x=dest; vx=0; }
    if (!pressing) { squash=less ? 0 : pressTarget; vs=0; }
    if (!springing) { dragX=tgtX; dragY=tgtY; vX=vY=0; }
    if (!knobSpring) { kScale=kScaleT; kv=0; knStretch=knStretchT; ksv=0; }
    if (!flowing) { fx=flowX; fy=flowY; }
    if (!lighting) { lx=tx; ly=ty; drift=0; }
    transform(); applyDock();
    if (oldX!==lx+fx || oldY!==ly+drift+fy) forcePaint=true;
    if (forcePaint && (now-painted>=30 || !(lighting||flowing))) { optics(); painted=now; forcePaint=false; }
    if (sliding || pressing || lighting || springing || knobSpring || flowing || forcePaint) schedule(); else last=0;
  }
  function refresh() {
    if (!visible()) { stop(); pressed=false; endKnob(null); endDrag(null); return; }
    stale=true; schedule();
  }
  function aim(e) {
    if (reduced() || !visible()) return;
    var rect=dock.getBoundingClientRect();
    tx=clamp(2*(e.clientX-rect.left)/rect.width-1,-1,1);
    ty=clamp(2*(e.clientY-rect.top)/rect.height-1,-1,1); schedule();
  }
  function home() { tx=-.28; ty=-.42; schedule(); }
  function endDrag(id) {
    if (dragId===null || (id!==null && id!==dragId)) return;
    if (dragging) { suppressClick=true; tgtX=0; tgtY=0; }
    dragId=null; dragging=false; dock.classList.remove('dragging');
    if (reduced()) { dragX=dragY=tgtX=tgtY=vX=vY=0; flowX=flowY=fx=fy=0; applyDock(); }
    schedule();
  }
  function endKnob(id) {
    if (knobId===null || (id!==null && id!==knobId)) return;
    if (knobDrag) {
      // Snap to the tab whose slot centre is nearest the released knob.
      var centre=x+lens.offsetWidth*.5, best=active, bestD=Infinity, i;
      for (i=0;i<buttons.length;i++) {
        var c=buttons[i].offsetLeft+buttons[i].offsetWidth*.5, d=Math.abs(centre-c);
        if (d<bestD) { bestD=d; best=i; }
      }
      if (best>=0 && best!==active) {
        // Reuse the existing navigation path; aria-current change re-selects
        // the knob and springs dest to the correct slot automatically. Mark
        // this so the capture-phase guard lets it through while still blocking
        // the real click the browser synthesizes at pointerup.
        programmaticNav=true;
        buttons[best].click();
      } else if (active>=0) {
        dest=buttons[active].offsetLeft;   // no change: spring back to slot
      }
      dock.classList.remove('knob-dragging');
    }
    knobId=null; knobDrag=false; kScaleT=1; knStretchT=0;   // release -> Q-bounce back
  }
  function release(e) {
    endKnob(e.pointerId);
    endDrag(e.pointerId);
    if (!pressed) return;
    pressed=false;
    if (e.pointerType!=='mouse') home();
    schedule();
  }
  function knobMove(e) {
    if (knobId===null || e.pointerId!==knobId) return;
    var dx=e.clientX-knobStartX;
    if (!knobDrag) {
      // Below the threshold, leave the click untouched (it selects this tab).
      if (Math.abs(dx)<THRESHOLD) return;
      knobDrag=true; suppressClick=true; dock.classList.add('knob-dragging');
    }
    // Force-driven deformation: the further/faster you pull, the bigger and
    // more elongated the jelly knob gets (non-linear saturation). Both springs
    // are under-damped, so on release it bounces back with a visible wobble.
    var force=clamp(Math.abs(dx)/88,0,1);
    kScaleT=1+(KNOB_MAX-1)*(.38+.62*force);
    knStretchT=force*force*.17;
    // Clamp inside the capsule, reserving room for the max swell so the rounded
    // rim is never sliced flat by overflow:hidden.
    var pad=Math.max(9,lens.offsetWidth*(KNOB_MAX-1)*.5+3);
    var lo=Math.min(pad,knobStartLensX), hi=Math.max(dock.offsetWidth-lens.offsetWidth-pad,knobStartLensX);
    var nx=clamp(knobStartLensX+dx,lo,hi);
    x=nx; dest=nx; vx=0; schedule();
  }
  function dragMove(e) {
    if (knobId!==null) { knobMove(e); return; }
    if (dragId===null || e.pointerId!==dragId) return;
    var dx=e.clientX-dragStartX, dy=e.clientY-dragStartY;
    if (!dragging) {
      // Below the threshold this is a tap: never preventDefault or suppress
      // the click that pilot.js uses to switch tabs.
      if (Math.abs(dx)<THRESHOLD && Math.abs(dy)<THRESHOLD) return;
      dragging=true; suppressClick=true; dock.classList.add('dragging');
    }
    // Both axes participate; vertical travel is naturally more limited.
    tgtX=rubber(dx); tgtY=rubber(dy*.85); schedule();
  }
  // Observe the existing navigation state. Deliberately never synthesize a
  // click, handle routing, intercept gestures, or take pointer capture.
  new MutationObserver(function () { if (!visible()) { stale=true; return; } select(false); schedule(); })
    .observe(dock,{subtree:true,attributes:true,attributeFilter:['aria-current']});
  new MutationObserver(refresh).observe(nav,{attributes:true,attributeFilter:['inert']});
  new MutationObserver(function () { schedule(); }).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  dock.addEventListener('pointerdown',function (e) {
    suppressClick=false;
    dock.classList.add('pointer-focus'); pressed=true;
    if (visible() && e.button===0 && dragId===null && knobId===null) {
      // Hit-test against the lens's REAL on-screen rect (including any live
      // scale/stretch transform), so grabbing the knob while it is enlarged
      // still grabs the knob — never falls through to the capsule stretch.
      var lr=lens.getBoundingClientRect();
      if (active>=0 && e.clientX>=lr.left-3 && e.clientX<=lr.right+3 &&
          e.clientY>=lr.top-3 && e.clientY<=lr.bottom+3) {
        knobId=e.pointerId; knobStartX=e.clientX; knobStartLensX=x;
      } else {
        dragId=e.pointerId; dragStartX=e.clientX; dragStartY=e.clientY;
      }
    }
    aim(e); schedule();
  },{passive:true});
  dock.addEventListener('pointermove',aim,{passive:true});
  dock.addEventListener('pointerleave',home,{passive:true});
  // A capture-phase click guard cancels only the click synthesized at the end
  // of a real drag. Plain taps reach the buttons untouched.
  dock.addEventListener('click',function (e) {
    if (programmaticNav) { programmaticNav=false; return; }  // knob snap: allow
    if (!suppressClick) return;
    suppressClick=false; e.preventDefault(); e.stopPropagation();
  },true);
  window.addEventListener('pointermove',dragMove,{passive:true});
  window.addEventListener('pointerup',release,{passive:true});
  window.addEventListener('pointercancel',release,{passive:true});
  window.addEventListener('blur',function () { pressed=false; home(); endKnob(null); endDrag(null); });
  document.addEventListener('keydown',function () { dock.classList.remove('pointer-focus'); });
  window.addEventListener('scroll',function () {
    var at=window.pageYOffset, delta=at-lastScroll; lastScroll=at;
    if (!delta || reduced() || !visible()) return;
    drift=clamp(drift+delta*.017,-1,1); forcePaint=true; schedule();
  },{passive:true});
  if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) {
    intersecting=entries[0].isIntersecting; refresh();
  }).observe(dock);
  if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(dock);
  window.addEventListener('resize',refresh,{passive:true}); document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pagehide',stop); window.addEventListener('pageshow',refresh);
  if (motion.addListener) motion.addListener(function () { schedule(); });
  canvas.addEventListener('webglcontextlost',function (e) { e.preventDefault(); lost=true; program=null; });
  canvas.addEventListener('webglcontextrestored',function () { lost=attempted=false; stale=true; forcePaint=true; schedule(); });
  refresh();
}());
