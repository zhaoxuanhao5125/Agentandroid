package qa.pilot.reader;

import android.app.Activity;
import android.os.Bundle;
import android.widget.*;
import android.util.Log;

/** Harmless, offline native target with independently observable action effects. */
public class Reader extends Activity {
    public void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout root=new LinearLayout(this); root.setOrientation(1);
        TextView status=new TextView(this); status.setText("Reading overview"); root.addView(status);
        Button details=new Button(this); details.setText("Details"); details.setAllCaps(false); root.addView(details);
        details.setOnClickListener(v->{status.setText("Showing reading details"); Log.i("ShelfFixture","details selected");});
        ScrollView scroll=new ScrollView(this); LinearLayout list=new LinearLayout(this); list.setOrientation(1);
        for(int i=1;i<=64;i++){TextView t=new TextView(this); t.setText("Chapter "+i); t.setTextSize(20);t.setPadding(12,12,12,12); list.addView(t);}
        scroll.addView(list); root.addView(scroll); setContentView(root);
        scroll.setOnScrollChangeListener((v,x,y,ox,oy)->{if(oy==0 && y>0) Log.i("ShelfFixture","scrolled forward from top");});
    }
}
