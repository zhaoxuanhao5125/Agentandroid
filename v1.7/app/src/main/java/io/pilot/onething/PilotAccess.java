package io.pilot.onething;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.KeyguardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Local-only, finite, user-paced session. No IPC API, gesture injection, global actions or screen export. */
public final class PilotAccess extends AccessibilityService {
    private static volatile PilotAccess service;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private volatile Session session;
    private static final long LIFE=120_000, WAIT=35_000, LAUNCH=8_000, SETTLE=650;
    private static final int WINDOW=AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
        EVENTS=WINDOW|AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED|AccessibilityEvent.TYPE_VIEW_FOCUSED|AccessibilityEvent.TYPE_VIEW_SCROLLED;
    private static final class Step {
        final String action, value;
        Step(String a,String v){action=a;value=v;}
        String display(){switch(action){case "click":return "点击："+value;case "scroll":return value.equals("up")?"向上翻页":"向下翻页";case "fill":return "填入草稿："+value;default:return "打开所选应用";}}
    }
    private static final class Session {
        final String target; final ComponentName entry; final List<Step> steps; final Consumer<String> status;
        final long start=now(); long last=start, launch, quiet; int index; boolean arrived; PilotOverlay overlay;
        Session(String t,ComponentName e,List<Step> s,Consumer<String> cb){target=t;entry=e;steps=s;status=cb;}
    }
    private static final class Block extends RuntimeException { Block(String message){super(message);} }
    private static Block block(String why){return new Block(why);}
    private static long now(){return SystemClock.elapsedRealtime();}
    public static boolean ready(){return service!=null;}
    public static boolean active(){PilotAccess s=service;return s!=null && s.session!=null;}
    public static void stop(){
        PilotAccess s=service;if(s==null)return; Session current=s.session;
        if(Looper.myLooper()==Looper.getMainLooper())s.finish(current,"任务已停止");
        else s.ui.post(()->s.finish(current,"任务已停止"));
    }
    private static boolean stockUtility(String pkg){
        switch(pkg){
        case "com.android.calculator2":case "com.google.android.calculator":case "com.sec.android.app.popupcalculator":case "com.miui.calculator":
        case "com.android.deskclock":case "com.google.android.deskclock":case "com.sec.android.app.clockpackage":
        case "com.android.calendar":case "com.google.android.calendar":case "com.samsung.android.calendar":return true;
        default:return false;
        }
    }
    public static boolean allowedPackage(Context context,String pkg){return launcher(context,pkg)!=null;}
    private static ComponentName launcher(Context c,String pkg){
        if(c==null||pkg==null||pkg.equals(c.getPackageName()))return null;
        try {
            PackageManager pm=c.getPackageManager(); ApplicationInfo a=pm.getApplicationInfo(pkg,0);
            if(!a.enabled||a.uid<android.os.Process.FIRST_APPLICATION_UID||a.uid==android.os.Process.myUid()
                ||(a.flags&ApplicationInfo.FLAG_SUSPENDED)!=0||!PilotGuard.packageNameOk(c.getPackageName(),pkg,a.loadLabel(pm)))return null;
            String[] perms=pm.getPackageInfo(pkg,PackageManager.GET_PERMISSIONS).requestedPermissions;
            // Stock utilities can request incidental privileged permissions (e.g. a calendar's
            // dial-in shortcut). Exempt only preinstalled exact utility packages from this heuristic.
            boolean stock=(a.flags&(ApplicationInfo.FLAG_SYSTEM|ApplicationInfo.FLAG_UPDATED_SYSTEM_APP))!=0 && stockUtility(pkg);
            if(!stock && perms!=null)for(String perm:perms)if(PilotGuard.sensitivePermission(perm))return null;
            Intent main=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(pkg);
            for(ResolveInfo r:pm.queryIntentActivities(main,0)){
                ActivityInfo i=r.activityInfo;
                if(i!=null && i.enabled && i.exported && pkg.equals(i.packageName) && i.permission==null
                    && PilotGuard.packageNameOk(c.getPackageName(),pkg,r.loadLabel(pm)) && !PilotGuard.sensitive(i.name))
                    return new ComponentName(pkg,i.name);
            }
        }catch(PackageManager.NameNotFoundException|RuntimeException ignored){ }
        return null;
    }
    public static void begin(String targetPkg,List<JSONObject> steps,Consumer<String> status) throws Exception {
        if(Looper.myLooper()!=Looper.getMainLooper())throw block("请在主线程开始任务");
        PilotAccess s=service;if(s==null || !Settings.canDrawOverlays(s))throw block("请先开启辅助操作和悬浮窗权限");
        if(s.session!=null)throw block("请先停止现有任务");
        ComponentName e=launcher(s,targetPkg);if(e==null)throw block("所选应用不受支持");
        if(steps==null||steps.isEmpty()||steps.size()>8)throw block("计划须包含 1 至 8 个步骤");
        ArrayList<Step> safe=new ArrayList<>();
        for(JSONObject j:steps){
            if(j==null||!(j.opt("action") instanceof String))throw block("步骤格式无效");
            String a=(String)j.opt("action"),v="";
            switch(a){
            case "open":if(!safe.isEmpty()||j.length()!=1)throw block("打开应用只能作为第一步");break;
            case "click":case "fill":
                if(j.length()!=2||!(j.opt("text") instanceof String))throw block("步骤文字无效");v=(String)j.opt("text");
                if(a.equals("click")?!PilotGuard.clickAllowed(targetPkg,v):!PilotGuard.draftAllowed(v))
                    throw block("不支持此步骤：仅可点击安全导航或计算键，或填入普通草稿");break;
            case "scroll":if(j.length()!=2||!(j.opt("direction") instanceof String))throw block("翻页格式无效");
                v=(String)j.opt("direction");if(!v.equals("up")&&!v.equals("down"))throw block("翻页方向无效");break;
            default:throw block("不支持此操作");
            }
            safe.add(new Step(a,v));
        }
        Session r=new Session(targetPkg,e,safe,status); s.session=r;
        try {
            s.check(r,false); s.events(EVENTS);
            r.overlay=new PilotOverlay(s,()->s.tap(r),()->s.finish(r,"任务已停止"));r.overlay.show();
            // Any explicit open is a separately tapped step. Otherwise the prior native confirmation
            // authorizes only the prerequisite launcher transition, never the first UI mutation.
            if(!safe.get(0).action.equals("open"))s.launch(r);
            s.ui.postDelayed(s.watch,150);
            s.notify(r,"监督任务已开始；请核对悬浮条中的下一步");
        }catch(RuntimeException ex){s.finish(r,"未启动或已停止");throw ex instanceof Block?ex:block("无法显示控制条或启动应用");}
    }
    private void launch(Session r){
        if(!r.entry.equals(launcher(this,r.target)))throw block("所选应用已变化");
        r.launch=now();
        startActivity(Intent.makeMainActivity(r.entry).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED));
        r.overlay.set("正在打开目标…",false);
    }
    private void events(int types){
        AccessibilityServiceInfo i=getServiceInfo();if(i==null)throw block("辅助服务未连接");
        i.eventTypes=types; i.notificationTimeout=60; setServiceInfo(i);
    }
    @Override protected void onServiceConnected(){super.onServiceConnected();events(0);service=this;}
    @Override public void onInterrupt(){finish(session,"辅助服务中断，已停止");}
    @Override public boolean onUnbind(Intent intent){disconnect();return super.onUnbind(intent);}
    @Override public void onDestroy(){disconnect();super.onDestroy();}
    @Override public void onConfigurationChanged(Configuration c){super.onConfigurationChanged(c);finish(session,"屏幕配置已改变，请重新开始");}
    private void disconnect(){if(service==this)service=null;finish(session,"辅助服务已断开");}
    private void check(Session r,boolean overlay){
        if(this!=service || r!=session)throw block("任务不再有效");
        KeyguardManager k=getSystemService(KeyguardManager.class); PowerManager p=getSystemService(PowerManager.class);
        if(k==null||k.isKeyguardLocked()||k.isDeviceLocked()||p==null||!p.isInteractive())throw block("已锁屏或熄屏，任务停止");
        if(!Settings.canDrawOverlays(this)||(overlay&&!r.overlay.shown()))throw block("控制条不可用，任务停止");
        long t=now();if(t-r.start>=LIFE||t-r.last>=WAIT||(!r.arrived&&r.launch!=0&&t-r.launch>=LAUNCH))throw block("任务已超时");
    }
    private final Runnable watch=new Runnable(){@Override public void run(){
        Session r=session;if(r==null)return;
        inspect(r);if(session==r)ui.postDelayed(this,650);
    }};
    private final Runnable changed=()->{Session r=session;if(r!=null)inspect(r);};
    @Override public void onAccessibilityEvent(AccessibilityEvent e){
        Session r=session;if(r==null||e==null)return; // No event fields or roots are read while idle.
        try {
            if(e.getEventType()==WINDOW){
                String pkg=e.getPackageName()==null?"":e.getPackageName().toString();
                // Ignore state events from our own non-focusable overlay. The active-root check
                // below still rejects our Activity if the user returns to Pilot during execution.
                if(!getPackageName().equals(pkg) && !r.target.equals(pkg))throw block("窗口已切换，任务停止");
                if(r.target.equals(pkg)&&PilotGuard.sensitive(e.getClassName()))throw block("检测到受保护页面，已停止");
            }
            if(!ui.hasCallbacks(changed))ui.postDelayed(changed,100);
        }catch(Block b){finish(r,b.getMessage());}catch(RuntimeException ex){finish(r,"无法核对当前窗口，已停止");}
    }
    private void inspect(Session r){
        try {
            check(r,true); boolean safe=preflight(r);
            if(r.launch!=0 && !safe)return;
            if(r.index==r.steps.size()){if(now()>=r.quiet)finish(r,"计划步骤已执行完毕");return;}
            r.overlay.set((r.index+1)+"/"+r.steps.size()+" · "+r.steps.get(r.index).display(),now()>=r.quiet);
        }catch(Block b){finish(r,b.getMessage());}catch(RuntimeException e){finish(r,"无法核对当前页面，已停止");}
    }
    // Returns false while waiting at our own Activity for the launched target. No other package
    // is a permissible intermediate. A tree is not retained between a preview and a tap.
    private boolean preflight(Session r){
        AccessibilityNodeInfo root=getRootInActiveWindow();
        if(root==null){if(!r.arrived && r.launch!=0)return false;throw block("没有可核对的前台窗口");}
        try{
            String p=str(root.getPackageName());
            if(!r.arrived && getPackageName().equals(p))return false;
            if(r.launch==0 || !r.target.equals(p))throw block("当前窗口不是已选应用，已停止");
            try(Tree tree=new Tree(root,r.target)){tree.scan();}
            r.arrived=true; return true;
        }finally{root.recycle();}
    }
    private void tap(Session r){
        if(session!=r)return;
        try {
            check(r,true); if(now()<r.quiet || r.index>=r.steps.size())throw block("步骤不可用，请重新开始");
            Step step=r.steps.get(r.index);
            if(step.action.equals("open")){
                if(r.launch!=0 || r.arrived || preflight(r))throw block("无法确认启动窗口");
                launch(r);
            }else{
                if(!r.arrived || !r.entry.equals(launcher(this,r.target)))throw block("目标应用不可用");
                act(r,step);
            }
            ++r.index; r.last=now(); r.quiet=r.last+SETTLE;
            r.overlay.set("正在核对页面…",false);
            notify(r,"已执行第 "+r.index+" 步");
        }catch(Block b){finish(r,b.getMessage());}catch(RuntimeException e){finish(r,"无法安全执行此步，已停止");}
    }
    private void act(Session r,Step step){
        AccessibilityNodeInfo root=getRootInActiveWindow();if(root==null)throw block("目标窗口不可用");
        try(Tree tree=new Tree(root,r.target)){
            tree.scan(); AccessibilityNodeInfo node=tree.unique(step); int action=actionId(step);
            // Refresh the target and re-check the foreground identity just before the single call.
            AccessibilityNodeInfo current=getRootInActiveWindow();if(current==null)throw block("前台窗口已改变");
            try{if(!root.equals(current)||!r.target.equals(str(current.getPackageName()))||!node.refresh()
                ||node.getWindowId()!=root.getWindowId()||!tree.matches(node,step))throw block("目标控件已改变");}
            finally{current.recycle();}
            check(r,true); Bundle args=null;
            if(step.action.equals("fill")){args=new Bundle();args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,step.value);}
            if(!node.performAction(action,args))throw block("目标应用未接受操作，已停止");
        }finally{root.recycle();}
    }
    private static int actionId(Step s){switch(s.action){
        case "click":return AccessibilityNodeInfo.ACTION_CLICK;
        case "fill":return AccessibilityNodeInfo.ACTION_SET_TEXT;
        case "scroll":return s.value.equals("up")?AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD:AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
        default:throw block("不支持此操作");}}
    private static String str(CharSequence s){return s==null?"":s.toString();}
    // All node references, including invisible intermediate containers, live only in this local
    // bounded scan. Dense, incomplete, embedded or mixed-package trees are not actionable.
    private static final class Tree implements AutoCloseable {
        final AccessibilityNodeInfo root; final String pkg; final int window; final ArrayList<AccessibilityNodeInfo> nodes=new ArrayList<>();
        Tree(AccessibilityNodeInfo root,String pkg){this.root=root;this.pkg=pkg;this.window=root.getWindowId();nodes.add(root);}
        void scan(){
            int visible=0; long start=now();
            for(int i=0;i<nodes.size();i++){
                AccessibilityNodeInfo n=nodes.get(i);
                if(now()-start>650||n.getWindowId()!=window||!pkg.equals(str(n.getPackageName())))throw block("页面结构无法安全核对");
                if(n.isVisibleToUser()){
                    ++visible; if(risky(n))throw block("检测到受保护页面，已停止");
                }
                int count=n.getChildCount();if(count>300-nodes.size())throw block("页面过大，已停止");
                for(int j=0;j<count;j++){AccessibilityNodeInfo child=n.getChild(j);if(child==null)throw block("页面结构已改变");nodes.add(child);}
            }
            if(visible==0)throw block("无法核对可见页面");
        }
        boolean risky(AccessibilityNodeInfo n){
            String cls=str(n.getClassName());
            // Resource-name heuristics are applied to the ID only, not the package prefix.
            String id=str(n.getViewIdResourceName());int slash=id.lastIndexOf('/');if(slash>=0)id=id.substring(slash+1);
            return (Build.VERSION.SDK_INT>=34 && n.isAccessibilityDataSensitive()) || n.isPassword() || PilotGuard.passwordType(n.getInputType()) || cls.contains("WebView") || cls.contains("SurfaceView")
                || PilotGuard.sensitive(id)||PilotGuard.sensitive(cls)||PilotGuard.sensitiveControlText(pkg,id,n.getContentDescription())
                ||PilotGuard.sensitive(n.getHintText())||PilotGuard.sensitive(n.getPaneTitle())||PilotGuard.sensitiveControlText(pkg,id,n.getText());
        }
        AccessibilityNodeInfo unique(Step s){
            AccessibilityNodeInfo hit=null;
            for(AccessibilityNodeInfo n:nodes)if(matches(n,s)){
                if(hit!=null)throw block("有多个匹配控件，请手动操作");hit=n;
            }
            if(hit==null)throw block("没有唯一、可见且可安全操作的控件");return hit;
        }
        boolean matches(AccessibilityNodeInfo n,Step s){
            if(!pkg.equals(str(n.getPackageName()))||!n.isVisibleToUser()||!n.isEnabled()||n.getWindowId()!=window)return false;
            Rect bounds=new Rect();n.getBoundsInScreen(bounds);if(bounds.isEmpty())return false;
            if((n.getActions()&actionId(s))==0)return false;
            switch(s.action){
            case "click": // Never climb to a different clickable ancestor or invoke an opaque container.
                return n.isClickable()&&!n.isEditable()&&!risky(n)&&s.value.contentEquals(str(n.getText()));
            case "fill":return n.isFocused() && n.isEditable() && "android.widget.EditText".contentEquals(str(n.getClassName()))
                && PilotGuard.textFieldOk(n.getInputType()) && !risky(n);
            case "scroll":return n.isScrollable() && !n.isEditable() && !n.isCheckable()
                && scrollContainer(str(n.getClassName()));
            default:return false;
            }
        }
        private static boolean scrollContainer(String c){return c.endsWith(".ScrollView")||c.endsWith(".ListView")||c.endsWith(".GridView")||c.endsWith(".RecyclerView")||c.endsWith(".NestedScrollView");}
        @Override public void close(){for(int i=1;i<nodes.size();i++)nodes.get(i).recycle();nodes.clear();}
    }
    private void finish(Session r,String message){
        if(r==null||session!=r)return;session=null;ui.removeCallbacks(watch);ui.removeCallbacks(changed);
        if(r.overlay!=null)r.overlay.close();
        try{events(0);}catch(RuntimeException ignored){ }
        notify(r,message);
    }
    private void notify(Session r,String text){if(r.status!=null)try{r.status.accept(text);}catch(RuntimeException ignored){ }}
}
