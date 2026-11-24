/* Two optical samples of the same local scene: transmission and a neutral,
   Fresnel-weighted return from just outside the rim. No backdrop API or GL. */
(function () {
  'use strict';
  var source = document.querySelector('.shell');
  var dock = document.querySelector('.tabbar > .nav-inner');
  var sample = document.getElementById('refract-canvas');
  var host = document.getElementById('refract-mirror');
  if (!source || !dock || !sample || !host || !host.attachShadow || !window.DOMMatrix) return;
  var svg = document.getElementById('glass-refract');
  var trans = document.getElementById('glass-transmission');
  var reflected = document.getElementById('glass-reflection');
  var bend = document.getElementById('glass-bend');
  var returnRay = document.getElementById('glass-return');
  var shadow = host.attachShadow({mode:'closed'});
  var scene = document.createElement('div');
  var pad = 64, w=0, h=0, key='', mapsOk=false, cssOk=false, dirty=true, raf=0;
  var copied=null, lastMatrix='', lastBackground='', lastSize='', reduce=matchMedia('(prefers-reduced-motion: reduce)');
  var highContrast=matchMedia('(forced-colors: active)');
  var amplitude=60, previousBend=60, previousReturn=112, phase='', serial=0;
  scene.style.cssText='position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;user-select:none;';
  var sheet=document.createElement('link');
  sheet.rel='stylesheet'; sheet.href='ui.css';
  sheet.onload=function(){cssOk=true; request();};
  shadow.appendChild(sheet); shadow.appendChild(scene);
  var texture=document.createElement('canvas');
  var tex=texture.getContext('2d',{alpha:false});
  if (!tex) return;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function smooth(a,b,v){var t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);}
  function level(v){return Math.round(255*clamp(.5+v,0,1));}
  function region(node,x,y,w,h){node.setAttribute('x',x);node.setAttribute('y',y);node.setAttribute('width',w);node.setAttribute('height',h);}
  function setHref(node,url){node.setAttribute('href',url);node.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',url);}
  function makeMaps() {
    var width=dock.offsetWidth, height=dock.offsetHeight;
    if (width<1 || height<1 || width+'x'+height===key) return;
    key=width+'x'+height; w=width; h=height;
    mapsOk=false; dock.classList.remove('optical-scene');
    var version=++serial;
    var tw=width*2, th=height*2;
    texture.width=tw; texture.height=th;
    var a=tex.createImageData(tw,th), b=tex.createImageData(tw,th), d=a.data, f=b.data, r=height/2;
    for(var yy=0,i=0;yy<th;yy++) for(var xx=0;xx<tw;xx++,i+=4){
      var x=(xx+.5)/2-width/2, y=(yy+.5)/2-r;
      var q=x-clamp(x,-width/2+r,width/2-r), len=Math.sqrt(q*q+y*y);
      var nx=q/Math.max(len,.01), ny=y/Math.max(len,.01), dep=r-len;
      // Smooth capsule bevel: bright rim, wide light bending shoulder and flat clear core.
      var bevel=1-smooth(0,r*.73,Math.max(0,dep));
      var shoulder=1-smooth(0,r,Math.max(0,dep));
      var deflection=.324*bevel+.061*shoulder;
      var edgeMask=smooth(-2,.7,dep);
      var fresnel=(.015+.38*Math.pow(bevel,2.25))*edgeMask;
      d[i]=level(-nx*deflection); d[i+1]=level(-ny*deflection);
      d[i+2]=Math.round(255*fresnel); d[i+3]=255;
      // Return ray samples nearby page content outside the edge; the rising
      // Fresnel weight makes it visible at grazing angles, not over the core.
      var reach=(.17+.24*smooth(0,12,dep))*edgeMask;
      f[i]=level(nx*reach); f[i+1]=level(ny*reach); f[i+2]=0; f[i+3]=255;
    }
    tex.putImageData(a,0,0); var t=texture.toDataURL();
    tex.putImageData(b,0,0); var rmap=texture.toDataURL();
    var loaded=0;
    [t,rmap].forEach(function(url){
      var img=new Image();
      img.onload=function(){
        if(version!==serial || ++loaded!==2)return;
        region(svg,0,0,w+2*pad,h+2*pad);
        region(trans,pad,pad,w,h); region(reflected,pad,pad,w,h);
        setHref(trans,t); setHref(reflected,rmap);
        mapsOk=true; request();
      };
      img.src=url;
    });
  }
  function copyForm(a,b){
    var aa=a.querySelectorAll('input,textarea,select,details'), bb=b.querySelectorAll('input,textarea,select,details');
    for(var i=0;i<aa.length;i++){
      var el=aa[i], clone=bb[i]; if(!clone)continue;
      if(el.tagName==='DETAILS'){clone.open=el.open;continue;}
      if(el.type==='file'||el.type==='password')continue;
      if(el.tagName==='SELECT')clone.selectedIndex=el.selectedIndex;
      else {if(clone.value!==el.value)clone.value=el.value;clone.checked=el.checked;}
      clone.scrollTop=el.scrollTop;clone.scrollLeft=el.scrollLeft;
    }
  }
  function rebuild(){
    var next=source.cloneNode(true);
    Array.prototype.forEach.call(next.querySelectorAll('button,input,textarea,select,summary,a,[tabindex],[contenteditable]'),function(el){
      el.tabIndex=-1; el.removeAttribute('autofocus'); el.removeAttribute('contenteditable'); el.removeAttribute('href');
    });
    Array.prototype.forEach.call(next.querySelectorAll('.screen-enter'),function(el){el.classList.remove('screen-enter');});
    copyForm(source,next);
    scene.textContent=''; scene.appendChild(next); copied=next; dirty=false;
  }
  function sync() {
    raf=0;
    if(document.hidden || dock.parentNode.hasAttribute('inert') || highContrast.matches) {dock.classList.remove('optical-scene');return;}
    makeMaps();
    if(!mapsOk || !cssOk)return;
    var viewport=document.documentElement;
    var bounds=dock.getBoundingClientRect();
    var style=getComputedStyle(dock), m=new DOMMatrix(style.transform==='none'?'matrix(1,0,0,1,0,0)':style.transform);
    var minX=Math.min(0,m.a*w)+Math.min(0,m.c*h), minY=Math.min(0,m.b*w)+Math.min(0,m.d*h);
    // Cancel dock elastic motion in the sampled source coordinates. The mask
    // moves but underlying content never moves with the glass as a sticker.
    m.e=bounds.left-minX+window.pageXOffset; m.f=bounds.top-minY+window.pageYOffset;
    var inv=m.inverse();
    var optical=[inv.a,inv.b,inv.c,inv.d,pad+inv.e,pad+inv.f].map(function(v){return v.toFixed(4);}).join(',');
    if(lastMatrix!==optical){scene.style.transform='matrix('+optical+')'; lastMatrix=optical;}
    var vh=Math.max(viewport.clientHeight,document.body.offsetHeight), vw=viewport.clientWidth;
    var size=vw+'x'+vh;
    if(lastSize!==size){scene.style.width=vw+'px';scene.style.height=vh+'px';lastSize=size;}
    if(dirty || !copied)rebuild(); else copyForm(source,copied);
    var background=getComputedStyle(document.body).background;
    if(background!==lastBackground && background){scene.style.background=background;lastBackground=background;}
    var optic=source.querySelector('#optic-canvas'), mirrorOptic=copied.querySelector('#optic-canvas');
    var hero=source.querySelector('#optic-object');
    if(optic && mirrorOptic && hero && optic.width && optic.height){
      var hr=hero.getBoundingClientRect();
      if(hr.height && hr.bottom>bounds.top-pad && hr.top<bounds.bottom+pad){
        var c=mirrorOptic.getContext('2d'); c.clearRect(0,0,mirrorOptic.width,mirrorOptic.height);c.drawImage(optic,0,0);
        var twin=copied.querySelector('#optic-object');twin.style.transform=hero.style.transform;
      }
    }
    dock.classList.add('optical-scene');
  }
  function request(){if(!raf && !document.hidden)raf=requestAnimationFrame(sync);}
  function changed(){dirty=true;request();}
  if(window.MutationObserver){
    new MutationObserver(function(records){
      for(var i=0;i<records.length;i++){
        var r=records[i];
        if(r.target.id==='optic-object' && r.type==='attributes'){request(); continue;}
        changed();return;
      }
    }).observe(source,{subtree:true,childList:true,characterData:true,attributes:true});
    new MutationObserver(request).observe(dock.parentNode,{attributes:true,attributeFilter:['inert']});
  }
  if(window.ResizeObserver)new ResizeObserver(request).observe(dock);
  ['scroll','resize','pilot-visibility','pageshow'].forEach(function(type){window.addEventListener(type,request,{passive:true});});
  ['input','change','scroll','visibilitychange'].forEach(function(type){document.addEventListener(type,request,true);});
  if(window.visualViewport)visualViewport.addEventListener('resize',request);
  if(highContrast.addListener)highContrast.addListener(request);
  window.PilotGlass={frame:function(state){
    var moving=!reduce.matches&&!document.documentElement.classList.contains('reduce');
    // Modulate the two ray paths independently as the glass thickens and settles.
    // Stronger base bend for a clearly visible lens, still clamped so the
    // rounded rim never tears. Interacting (pull/knob/scroll) thickens it.
    var next=moving?60+state.pull*20+state.knob*32+state.speed*8+state.scroll*10:60;
    var back=moving?104+state.pull*27+state.knob*34+state.scroll*10:104;
    amplitude=Math.round(clamp(next,50,92)*4)/4;
    if(previousBend!==amplitude){bend.setAttribute('scale',amplitude);previousBend=amplitude;}
    back=Math.round(clamp(back,94,148));
    if(previousReturn!==back){returnRay.setAttribute('scale',back);previousReturn=back;}
    if(state.geometry!==phase){phase=state.geometry;request();}
  }};
  request();
}());
