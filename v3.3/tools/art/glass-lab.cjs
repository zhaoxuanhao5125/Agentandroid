/* Offline optics lab: render the software refraction model to a PNG so the
 * look can be tuned without rebuilding the app. Mirrors glass.js exactly. */
const { PNG } = require('pngjs');
const fs = require('fs');

const W = 640, H = 112; // 2x a 320x56 capsule for a clear preview
const radius = H / 2;
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function smoothstep(a,b,v){const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);}
function lamp(x,y,z){const k=1/Math.sqrt(x*x+y*y+z*z);return [x*k,y*k,z*k];}
function soft(a,rx,ry,rz,cut,gain){return clamp((rx*a[0]+ry*a[1]+rz*a[2]-cut)*gain,0,1);}

// light in [-1,1]; tune via argv: lx ly
const lx = parseFloat(process.argv[2]||'-0.28');
const ly = parseFloat(process.argv[3]||'-0.42');
const fx=0, fy=0, drift=0;
const alx=lx+fx, dy=ly+drift+fy;

const a=lamp(-.42+alx*.55,.88-dy*.34,.24),
      b=lamp(.70+alx*.40,-.74+dy*.20,-.16),
      c=lamp(-.94,-.06+dy*.24,-.20),
      g=lamp(.14+alx*.70,.66-dy*.44,.36);

const png = new PNG({width:W,height:H});
for (let j=0;j<H;j++) for (let i=0;i<W;i++){
  const px=i+.5-W*.5, py=radius-j-.5;
  const dx=px-clamp(px,-W*.5+radius,W*.5-radius);
  const r=Math.sqrt(dx*dx+py*py), inv=1/Math.max(r,.01);
  const depth=radius-r;
  const off=(j*W+i)*4;
  if (depth<-1 || depth>radius*1.02){png.data[off+3]=0;continue;}

  // ---- SURFACE NORMAL: a gentle convex lens across the WHOLE face ----------
  // Old model curled only the outer 28%, leaving the centre dead flat.
  // New: a shallow dome so the middle keeps a slight tilt and catches light.
  const u = clamp(depth/radius,0,1);            // 0 at rim, 1 at centre
  const dome = smoothstep(0.0,0.55,u)*0.22;     // how much the centre bulges
  const bevel = 1-smoothstep(0,radius*.30,Math.max(depth,0));
  // normal from dome (whole face) + steeper bevel (rim)
  let nx=(dx*inv)*(bevel*1.0 + dome);
  let ny=(py*inv)*(bevel*1.0 + dome*0.55);
  let nz=Math.sqrt(Math.max(.0001,1-nx*nx-ny*ny));
  const nl=Math.sqrt(nx*nx+ny*ny+nz*nz); nx/=nl;ny/=nl;nz/=nl;

  const key=soft(a,nx,ny,nz,.42,3.2);
  const strip=soft(b,nx,ny,nz,.55,3.4);
  const rim=soft(c,nx,ny,nz,.60,2.6);
  const glint=soft(g,nx,ny,nz,.80,7.0);
  const sky=smoothstep(-.20,.85,ny);
  const cov=smoothstep(-.45,.30,depth);

  // ---- REFRACTION FEATURES (softer, broader, follow the light) -------------
  const lip=smoothstep(-.6,.6,depth)*(1-smoothstep(.6,3.4,depth));
  const darkln=smoothstep(2.8,4.2,depth)*(1-smoothstep(4.2,7.6,depth));
  const down=smoothstep(.25,.85,-py*inv);
  const caust=down*smoothstep(0,2.4,depth)*(1-smoothstep(2.4,7.0,depth));
  // A broad internal reflection that sweeps across the FACE with the light.
  // This is what gives the centre a living, moving glass sheen.
  const sweepX = 0.55*alx;   // light-driven horizontal position
  const sheen = Math.exp(-Math.pow((px/W - sweepX)/0.20,2))
              * Math.exp(-Math.pow((py/H)/0.9,2));

  let env=(.05+sky*.10)
        + key*2.6 + strip*1.7 + rim*1.2 + glint*3.0
        + lip*1.5 + caust*1.7
        + sheen*1.15;
  env*=(1-darkln*.45);
  const edge=bevel*bevel*smoothstep(-.4,1.5,depth);
  env+=edge*1.1;

  const one=1-clamp(nz,0,1);
  const fR=.045+.9*Math.pow(one,4.2), fG=.048+.9*Math.pow(one,4.4), fB=.052+.9*Math.pow(one,4.6);
  let gR=1-Math.exp(-env*fR), gG=1-Math.exp(-env*fG), gB=1-Math.exp(-env*fB);

  // ---- DISPERSION: a soft spectral wash that follows the sheen + a gentle
  //      chromatic fringe on the bevel. No hard fixed double-stripe. --------
  const fringe = smoothstep(.15,.75,Math.abs(py*inv)*0.0 + Math.abs(dx*inv))
               * smoothstep(0,1.6,depth)*(1-smoothstep(1.6,5.2,depth));
  // spectral tint drifts with light: cooler on one side, warmer on the other
  const split = clamp(px/W + 0.5 + alx*0.25,0,1);   // 0 left .. 1 right
  const dA = clamp((fringe*0.55 + sheen*0.45)*cov,0,1);
  const oR = 0.10 + split*0.35;   // warmer toward one side
  const oG = 0.55;
  const oB = 0.85 - split*0.30;   // cooler toward the other
  let cr=clamp(gR+oR*dA,0,1), cg=clamp(gG+oG*dA,0,1), cb=clamp(gB+oB*dA,0,1);
  let alpha=clamp(Math.max(cr,cg,cb)*cov*0.85 + dA*0.30, 0, 0.86);

  png.data[off]=Math.round(255*cr);
  png.data[off+1]=Math.round(255*cg);
  png.data[off+2]=Math.round(255*cb);
  png.data[off+3]=Math.round(255*alpha);
}

const out = process.argv[4] || '/tmp/glass-lab.png';
png.pack().pipe(fs.createWriteStream(out)).on('finish',()=>console.log('wrote',out));
