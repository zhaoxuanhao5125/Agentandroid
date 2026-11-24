package qa.pilot.model;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import java.net.*;
import java.io.*;
import javax.net.ssl.HttpsURLConnection;
import java.security.cert.Certificate;
import java.nio.charset.StandardCharsets;
import org.json.*;

/** Only the provider response is synthetic. No access to PilotAccess, the plan dialog, the WebView or tap handlers. */
public class PlanFixture extends Instrumentation {
    static final String ENDPOINT="https://qa-model.invalid/v1/chat/completions";
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    @Override public void onStart(){
        try {
            URL.setURLStreamHandlerFactory(proto->"https".equals(proto)?new URLStreamHandler(){
                @Override protected URLConnection openConnection(URL url)throws IOException{
                    if(!ENDPOINT.equals(url.toString()))throw new IOException("Unexpected URL"); return new Response(url);
                }}:null);
            JSONObject options=new JSONObject().put("modelProvider","custom").put("modelEndpoint",ENDPOINT).put("model","qa-reading");
            // Public settings API, identical configuration patch to the native UI. Never set target, permission or plan.
            Class<?> backend=getTargetContext().getClassLoader().loadClass("io.pilot.onething.Backend");
            backend.getMethod("save",android.content.Context.class,JSONObject.class).invoke(null,getTargetContext(),options);
            Intent i=getTargetContext().getPackageManager().getLaunchIntentForPackage("io.pilot.onething"); startActivitySync(i);
            Log.i("PilotPlanFixture","ready; waiting for operator"); SystemClock.sleep(600000);finish(0,new Bundle());
        } catch(Throwable ex){Log.e("PilotPlanFixture","fixture failed",ex);finish(1,new Bundle());}
    }
    static class Response extends HttpsURLConnection {
        final ByteArrayOutputStream request=new ByteArrayOutputStream(); byte[] answer;
        Response(URL u){super(u);}
        @Override public void connect(){} @Override public void disconnect(){} @Override public boolean usingProxy(){return false;}
        @Override public String getCipherSuite(){return "FIXTURE";} @Override public Certificate[] getLocalCertificates(){return null;} @Override public Certificate[] getServerCertificates(){return null;}
        @Override public OutputStream getOutputStream(){return request;}
        @Override public int getResponseCode()throws IOException{
            try {
                JSONObject body=new JSONObject(request.toString("UTF-8")); if(!"qa-reading".equals(body.getString("model")))throw new IOException("Wrong model");
                JSONArray steps=new JSONArray().put(new JSONObject().put("action","open")).put(new JSONObject().put("action","click").put("text","Details")).put(new JSONObject().put("action","scroll").put("direction","down"));
                String plan=new JSONObject().put("answer","QA: open shelf, select Details, then scroll down.").put("steps",steps).toString();
                answer=new JSONObject().put("choices",new JSONArray().put(new JSONObject().put("message",new JSONObject().put("content",plan)))).toString().getBytes(StandardCharsets.UTF_8);
                Log.i("PilotPlanFixture","returned 3-step reading plan"); return 200;
            } catch(JSONException ex){throw new IOException(ex);}
        }
        @Override public InputStream getInputStream(){return new ByteArrayInputStream(answer);}
        @Override public long getContentLengthLong(){return answer.length;}
    }
}
