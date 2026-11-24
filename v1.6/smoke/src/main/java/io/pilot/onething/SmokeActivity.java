package io.pilot.onething;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

public final class SmokeActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        TextView label = new TextView(this);
        label.setText(R.string.smoke_label);
        setContentView(label);
    }
}
