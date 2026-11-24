package io.pilot.onething;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.SystemClock;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Four narrow edge windows and a compact confirmation panel. No transparent fullscreen layer and no touch/gesture forwarding. */
final class PilotOverlay {
    private final Context c;
    private final WindowManager wm;
    private final View[] windows = new View[5];
    private final LinearLayout panel;
    private final TextView caption;
    private final Button next;
    private final Runnable approve;
    private boolean enabled;

    PilotOverlay(Context context, Runnable approve, Runnable stop) {
        c = context; this.approve = approve; wm = c.getSystemService(WindowManager.class);
        panel = new LinearLayout(c);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(8),dp(4),dp(8),dp(4));
        panel.setBackground(bg(0xff102532, 0xff527e83));
        caption = new TextView(c); caption.setTextColor(0xffddf5ef); caption.setTextSize(12);
        caption.setSingleLine(true); caption.setEllipsize(TextUtils.TruncateAt.END);
        caption.setMaxWidth(dp(238)); panel.addView(caption);
        LinearLayout row = new LinearLayout(c); panel.addView(row);
        next = button("下一步", 0xff194c46); Button abort = button("停止", 0xff57353e);
        row.addView(next, new LinearLayout.LayoutParams(dp(100),dp(48)));
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(dp(72),dp(48)); ap.leftMargin=dp(6); row.addView(abort,ap);
        abort.setOnClickListener(v -> stop.run());
        // Confirmation has no performClick/action-click handler; only a complete, unobscured
        // single-finger tap can advance. The STOP control remains accessibility/keyboard usable.
        next.setClickable(false); next.setFocusable(false); next.setLongClickable(false);
        next.setFilterTouchesWhenObscured(true); next.setOnTouchListener(new Tap());
        set("等待目标应用", false);
    }
    private final class Tap implements View.OnTouchListener {
        float x,y; long start; boolean down;
        @Override public boolean onTouch(View v, MotionEvent e) {
            int action=e.getActionMasked();
            boolean valid=enabled && v.isShown() && e.isFromSource(InputDevice.SOURCE_TOUCHSCREEN)
                && e.getToolType(0)==MotionEvent.TOOL_TYPE_FINGER && e.getPointerCount()==1
                && (e.getFlags() & (MotionEvent.FLAG_WINDOW_IS_OBSCURED | MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED))==0;
            if(action==MotionEvent.ACTION_DOWN) {
                down=valid; start=e.getDownTime(); x=e.getX(); y=e.getY(); v.setPressed(down);
            } else {
                int slop=ViewConfiguration.get(c).getScaledTouchSlop();
                down &= valid && start==e.getDownTime() && e.getEventTime()-start<=1000
                    && Math.abs(x-e.getX())<=slop && Math.abs(y-e.getY())<=slop
                    && e.getX()>=0 && e.getY()>=0 && e.getX()<v.getWidth() && e.getY()<v.getHeight();
                if(action==MotionEvent.ACTION_UP) {
                    boolean fire=down; down=false; v.setPressed(false);
                    if(fire) { enabled=false; approve.run(); }
                } else if(action!=MotionEvent.ACTION_MOVE || !down) { down=false; v.setPressed(false); }
            }
            return true;
        }
    }
    void show() {
        int flags=WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            | WindowManager.LayoutParams.FLAG_SECURE;
        try {
            for(int i=0;i<4;i++) {
                boolean horizontal=i>=2; Edge edge=new Edge(c,i); edge.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
                WindowManager.LayoutParams p=params(horizontal?-1:dp(7),horizontal?dp(7):-1,flags|WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
                p.gravity=horizontal?((i==2?Gravity.TOP:Gravity.BOTTOM)|Gravity.LEFT):(Gravity.TOP|(i==0?Gravity.LEFT:Gravity.RIGHT));
                // Corner overlap combines two .45 windows to .6975, below the default .8 system ceiling.
                p.alpha=.45f; p.setTitle("Pilot edge"); wm.addView(edge,p); windows[i]=edge;
            }
            WindowManager.LayoutParams p=params(-2,-2,flags); p.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL; p.y=dp(8);
            p.setTitle("Pilot · 本地任务控制"); wm.addView(panel,p); windows[4]=panel;
        } catch(RuntimeException e) { close(); throw e; }
    }
    private WindowManager.LayoutParams params(int w,int h,int flags) {
        return new WindowManager.LayoutParams(w,h,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,flags,PixelFormat.TRANSLUCENT);
    }
    boolean shown() { return panel.isAttachedToWindow() && panel.isShown() && panel.getWindowVisibility()==View.VISIBLE; }
    void set(String message, boolean allowNext) {
        caption.setText("PILOT  ·  "+message); enabled=allowNext; next.setEnabled(allowNext); next.setAlpha(allowNext?1:.48f);
    }
    void close() {
        enabled=false;
        for(int i=windows.length-1;i>=0;i--) if(windows[i]!=null) {
            try { wm.removeViewImmediate(windows[i]); } catch(RuntimeException ignored) { } finally { windows[i]=null; }
        }
    }
    private int dp(float n) { return Math.round(n*c.getResources().getDisplayMetrics().density); }
    private GradientDrawable bg(int fill,int border) {
        GradientDrawable d=new GradientDrawable(); d.setColor(fill); d.setCornerRadius(dp(10));d.setStroke(dp(1),border);return d;
    }
    private Button button(String name,int fill) {
        Button b=new Button(c); b.setText(name); b.setTextSize(14); b.setAllCaps(false); b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        b.setTextColor(Color.WHITE); b.setPadding(0,0,0,0); b.setMinWidth(0); b.setMinHeight(0); b.setBackground(bg(fill,0xff617779)); return b;
    }
    private static final class Edge extends View {
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG); final int side; final boolean horizontal;
        final android.graphics.Matrix matrix=new android.graphics.Matrix(); final android.graphics.Path wave=new android.graphics.Path(); Shader shader;
        Edge(Context c,int side) {super(c);this.side=side;horizontal=side>=2;}
        @Override protected void onSizeChanged(int w,int h,int ow,int oh) {
            float span=Math.max(1,(horizontal?w:h)*.68f);shader=new LinearGradient(0,0,horizontal?span:0,horizontal?0:span,new int[]{0xff6dffdd,0xff599cff,0xffbc76ff,0xffff98cc,0xff6dffdd},null,Shader.TileMode.REPEAT);paint.setShader(shader);
        }
        @Override protected void onDraw(Canvas c) {
            if(shader==null)return;float len=horizontal?getWidth():getHeight(), thick=horizontal?getHeight():getWidth();if(len<1||thick<1)return;
            boolean motion=android.animation.ValueAnimator.areAnimatorsEnabled();float t=motion?(SystemClock.uptimeMillis()%4200)/4200f:0;float slide=len*.68f*t*(side%2==0?1:-1);
            matrix.setTranslate(horizontal?slide:0,horizontal?0:slide);shader.setLocalMatrix(matrix);paint.setStyle(Paint.Style.STROKE);
            for(int layer=0;layer<2;layer++){paint.setStrokeWidth(thick*(layer==0?.58f:.21f));paint.setAlpha(layer==0?110:255);wave.reset();
                for(int i=0;i<=60;i++){float at=i*len/60f;float f=i/60f;float x=thick*(.34f+.16f*(float)Math.sin(12.57*(f-t)+side)+.08f*(float)Math.sin(18.85*f+6.28*t));if(side==1||side==3)x=thick-x;float px=horizontal?at:x,py=horizontal?x:at;if(i==0)wave.moveTo(px,py);else wave.lineTo(px,py);}c.drawPath(wave,paint);
            }if(motion)postInvalidateDelayed(50);
        }
    }
}
