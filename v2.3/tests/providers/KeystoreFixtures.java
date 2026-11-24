package io.pilot.onething;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import org.json.JSONObject;
import java.security.KeyStore;
import javax.crypto.SecretKey;

/** Isolated test APK instrumentation. No INTERNET permission, no UI, and no access to the real app's UID. */
public final class KeystoreFixtures extends Instrumentation {
    private int checks;
    private void check(boolean ok) { if (!ok) throw new AssertionError("check " + (checks+1)); checks++; }
    @Override public void onCreate(Bundle ignored) { super.onCreate(ignored); start(); }
    @Override public void onStart() {
        Bundle out=new Bundle(); int result=Activity.RESULT_CANCELED;
        try {
            Context c=getTargetContext(); SharedPreferences prefs=c.getSharedPreferences("native-services-v1",Context.MODE_PRIVATE);
            String a="fixture-not-a-real-key-1",b="fixture-not-a-real-key-2",other="fixture-search-only";
            Backend.save(c,new JSONObject().put("modelProvider","custom").put("modelEndpoint","https://a.example/v1").put("model","fixture").put("modelKey",a)
                    .put("searchProvider","custom").put("searchEndpoint","https://a.example/search").put("searchKey",other));
            JSONObject s=Backend.state(c); String stored=prefs.getAll().toString();
            check(!stored.contains(a) && !stored.contains(other)); check(!s.toString().contains(a)&&!s.toString().contains(other));
            check(s.getJSONObject("settings").getBoolean("hasModelKey")&&s.getJSONObject("settings").getBoolean("hasSearchKey"));
            KeyStore ks=KeyStore.getInstance("AndroidKeyStore"); ks.load(null); SecretKey k=(SecretKey)ks.getKey("io.pilot.onething.services.aes.v1",null);
            check(k!=null && k.getEncoded()==null);
            String box=prefs.getString("m.custom.key",null);check(Backend.unseal(k,"m.custom.","https://a.example",box).equals(a));
            try { Backend.unseal(k,"m.custom.","https://b.example",box); throw new AssertionError("origin mismatch accepted"); } catch (Exception expected){checks++;}
            try { Backend.unseal(k,"s.custom.","https://a.example",box); throw new AssertionError("profile mismatch accepted"); } catch (Exception expected){checks++;}
            Backend.save(c,new JSONObject().put("modelEndpoint","https://A.example:443/other"));check(prefs.getString("m.custom.key","").equals(box));
            Backend.save(c,new JSONObject().put("modelKey",b));String replacement=prefs.getString("m.custom.key",null);
            check(!box.equals(replacement)&&Backend.unseal(k,"m.custom.","https://a.example",replacement).equals(b));
            Backend.save(c,new JSONObject().put("modelEndpoint","https://b.example/v1"));check(!prefs.contains("m.custom.key")&&prefs.contains("s.custom.key"));
            Backend.save(c,new JSONObject().put("clearSearchKey",true)); check(!prefs.contains("s.custom.key"));
            out.putString("stream","\nPASSED: AndroidKeyStore, " + checks + " checks.\n"); result=Activity.RESULT_OK;
        } catch(Throwable e) { out.putString("stream","\nFAILED after " + checks + " checks: " + e.getClass().getSimpleName() + "\n"); }
        finish(result,out);
    }
}
