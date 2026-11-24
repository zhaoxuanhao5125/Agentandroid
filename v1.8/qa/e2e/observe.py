#!/usr/bin/env python3
"""Capture only a dedicated test AVD's display/window evidence, or tap manually picked pixels.
No coordinate search, autonomous plan execution, target-app clicks or UIAutomator service.
Usage: observe.py DIR show NAME | tap X Y | finger X Y | windows NAME | focus
"""
import os, re, sys, subprocess, time
from pathlib import Path
out=Path(sys.argv[1]).resolve(); out.mkdir(parents=True,exist_ok=True)
adb=os.environ.get('ADB','adb'); serial=os.environ.get('ANDROID_SERIAL',''); avd=os.environ.get('TEST_AVD','')
if not re.fullmatch(r'emulator-\d+',serial) or not avd: sys.exit('Set ANDROID_SERIAL to the scratch emulator and TEST_AVD to its exact AVD name')
def run(*args):return subprocess.check_output([adb,'-s',serial,*map(str,args)],encoding='utf8',errors='replace',timeout=18)
if run('emu','avd','name').splitlines()[0]!=avd:sys.exit('AVD name mismatch')
def focus():
 s=run('shell','dumpsys','window','windows'); return '\n'.join(l.strip() for l in s.splitlines() if 'mCurrentFocus=' in l or 'mFocusedApp=' in l)
cmd=sys.argv[2]; args=sys.argv[3:]
if cmd=='tap':print(run('shell','input','tap',*map(int,args)))
elif cmd=='finger':
 # Emulated touchscreen (finger), not Android UIAutomator ACTION_CLICK. Only issue after visually reviewing the requested control.
 x,y=map(int,args); w,h=map(int,re.findall(r'(\d+)x(\d+)',run('shell','wm','size'))[-1]); assert 0<=x<w and 0<=y<h
 xx=round(x*32767/(w-1)); yy=round(y*32767/(h-1)); print(run('emu','event','mouse',xx,yy,0,1));time.sleep(.1);print(run('emu','event','mouse',xx,yy,0,0))
elif cmd=='focus':print(focus())
else:
 name=args[0]; assert re.fullmatch(r'[\w-]+',name)
 if cmd=='show':
  # Emulator host's ordinary visual screenshot of test content; never install a capture service.
  t=out/(name+'-tmp');t.mkdir(exist_ok=True); print(run('emu','screenrecord','screenshot',t)); p=max(t.glob('*.png'),key=lambda f:f.stat().st_mtime); p.replace(out/(name+'.png')); t.rmdir();print(focus())
 elif cmd=='windows':(out/(name+'.txt')).write_text(run('shell','dumpsys','window','windows'))
 else:sys.exit('unknown operation')
