# Original studio ray tracer for the Pilot optical flight mark (no external imagery).
import math,sys,os
import numpy as np
from numba import njit,prange
from PIL import Image
from math import sin,cos,sqrt,exp,pi
J=lambda f:njit(cache=True,fastmath=True)(f)
@J
def tri(x,y,sc):
    # equilateral triangle, radius sc, one apex up
    # exact signed distance from Inigo Quilez's equilateral folding identity
    r=sc*.8660254
    x=abs(x)-r;y=y+r/1.7320508
    if x+1.7320508*y>0: x,y=(x-1.7320508*y)*.5,(-1.7320508*x-y)*.5
    x-=min(0.,max(-2.*r,x));return -sqrt(x*x+y*y)*(1 if y>=0 else -1)
@J
def solid(x,y,z):
    outer=tri(x,y,1.16)-.141
    inner=-tri(x,y,.46)+.097
    d=max(outer,inner);h=abs(z)-.084+.045*(x*x+y*y)
    return sqrt(max(d,0)**2+max(h,0)**2)+min(max(d,h),0.)-.060
@J
def sdf(p):
    x,y,z=p
    a=solid(x,y,z-.20)
    # Second, air-spaced optic underneath the first
    c=.99875026;s=-.04997917
    b=solid(c*x-s*y,s*x+c*y,z+.203)
    return min(a,b)
@J
def normal(p):
    n=np.zeros(3); h=.0004
    for i in range(3):
        a=p.copy();b=p.copy();a[i]+=h;b[i]-=h;n[i]=sdf(a)-sdf(b)
    return n/max(1e-9,np.linalg.norm(n))
@J
def march(p,d,sg,maxd):
    t=.0012
    for i in range(104):
        h=sdf(p+t*d)*sg
        if h<.00033:return t
        t+=max(h*.88,.00016)
        if t>maxd:break
    return -1.
@J
def env(d):
    x,y,z=d
    # Long softbox / low key flags and a curved rear studio sweep.
    base=np.array([.019,.036,.038]);
    g=exp(-((y-.22+.34*x)/.45)**2)*(.48+.52*z*z)
    base+=g*np.array([.14,.24,.19]);
    top=exp(-((y-.70+.18*x)/.23)**4)*(.56+.44*z*z)
    base+=top*np.array([1.50,1.65,1.34]);
    soft=exp(-((x+.58-.21*y)/.32)**4)*(.32+.68*y*y)
    base+=soft*np.array([1.11,1.42,1.41]);
    light=exp(-((y+.40-.42*x)/.075)**2)*(.2+.8*(z*.5+.5));base+=light*np.array([2.35,2.45,2.05]);
    strip=exp(-((x-.54-.38*y)/.070)**2);base+=strip*np.array([2.9,3.1,2.61]);
    floor=exp(-((y+.73+.16*x)/.22)**2);base+=floor*np.array([.10,.36,.53]);
    return base
@J
def studio(mat,d,p):
    v=mat@(d+.60*p);return env(v/max(.01,np.linalg.norm(v)))
@J
def trace(o,d,mat):
    t=march(o,d,1.,7.)
    if t<0: return np.zeros(4)
    p=o+d*t;n=normal(p);co=max(0.,-np.dot(n,d));r=d+2*co*n
    fres=.06+.94*(1.-co)**5
    color=studio(mat,r,p)*fres
    eta=1/1.49;d=eta*d+(eta*co-sqrt(max(0.,1-eta*eta*(1-co*co))))*n
    gain=np.ones(3)*(1.-fres);inside=True
    for bounce in range(7):
        t=march(p,d,-1. if inside else 1.,6.)
        if t<0:
            color+=gain*studio(mat,d,p);break
        if inside:gain*=np.exp(-t*np.array([2.25,.53,.74]));color+=.08*gain*(1.-exp(-t*3.4))*np.array([.29,.8,.72]);
        p=p+d*t;n=normal(p)*(-1. if inside else 1.)
        co=max(0.,min(1.,-np.dot(n,d)));eta=1.49 if inside else 1/1.49
        k=1-eta*eta*(1-co*co);r=d+2*co*n
        if k<=0:d=r;continue
        fr=.045+.955*(1.-co)**5;color+=gain*studio(mat,r,p)*fr*(.57 if inside else 1);gain*=1-fr
        d=eta*d+(eta*co-sqrt(k))*n;inside=not inside
    else:color+=gain*studio(mat,d,p)*.76
    # Soft photographic shoulder and display gamma.
    mapped=1-np.exp(-color*1.53);rgb=np.maximum(0.,mapped)**(1/2.22)
    return np.array([rgb[0],rgb[1],rgb[2],1.])
@njit(parallel=True,cache=True,fastmath=True)
def render(w,h,mat):
    arr=np.zeros((h,w,4),np.uint8); inv=mat.T.copy()
    for j in prange(h):
        for i in range(w):
            u=(i+.5-w/2)/h*2.8;v=-(j+.5-h/2)/h*2.8-.036
            o=inv@np.array([u,v,4.0]);d=inv@np.array([0.,0.,-1.]);c=trace(o,d,mat);arr[j,i]=np.minimum(255.,c*255.)
    return arr

def Rx(a):return np.array([[1.,0,0],[0,cos(a),-sin(a)],[0,sin(a),cos(a)]])
def Ry(a):return np.array([[cos(a),0,sin(a)],[0,1.,0],[-sin(a),0,cos(a)]])
def Rz(a):return np.array([[cos(a),-sin(a),0],[sin(a),cos(a),0],[0,0,1.]])
def make(w,h,angle):
    return Image.fromarray(render(w,h,Rz(-.49)@Ry(-.57+angle)@Rx(-.50-angle*.34)@Rz(.07)))
if __name__=='__main__':
    dst=sys.argv[1];mode=sys.argv[2];os.makedirs(dst,exist_ok=True)
    if mode=='poster':make(700,660,0.).resize((455,429),Image.Resampling.LANCZOS).save(dst+'/optic.webp',quality=94,method=6)
    if mode=='frames':
        # Coordinate-contiguous angle sweep; two adjacent frames can be alpha-composited.
        atlas=Image.new('RGBA',(320*5,302*3));
        for i in range(15):
            f=make(408,385,(i-7)*.026).resize((320,302),Image.Resampling.LANCZOS);atlas.paste(f,(i%5*320,i//5*302))
        atlas.save(dst+'/optic-motion.webp',quality=90,method=5)
