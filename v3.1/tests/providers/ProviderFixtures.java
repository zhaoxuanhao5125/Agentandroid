package io.pilot.onething;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.lang.reflect.Proxy;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.cert.Certificate;
import java.util.*;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.net.ssl.HttpsURLConnection;

/** Host test only. The installed URL handler cannot access any network. Not part of the APK. */
public final class ProviderFixtures {
    static int count;
    static void check(boolean ok,String msg) { if (!ok) throw new AssertionError(msg); count++; }
    interface Op { void run() throws Exception; }
    static void rejects(Op op,String msg) throws Exception {
        try { op.run(); } catch (Exception expected) { count++; return; } throw new AssertionError("accepted: " + msg);
    }
    static JSONObject obj(String... pairs) throws Exception {
        JSONObject o=new JSONObject(); for(int i=0;i<pairs.length;i+=2)o.put(pairs[i],pairs[i+1]);return o;
    }
    static JSONObject settings(Context c) throws Exception {return Backend.state(c).getJSONObject("settings");}
    static String customEp="https://fixture.example/v1";
    static Backend.Session ses(String id) throws Exception {
        JSONObject p=obj("method","GET","queryField","words","authHeader","X-Service-Key","authPrefix","","resultsPath","data.items","titleField","t","urlField","u","snippetField","d","model","chosen");
        return new Backend.Session(id,customEp,"fixture-token",p,new JSONObject().put("systemPrompt","configured").put("temperature",0.2).put("topP",0.9).put("maxTokens",256));
    }
    static final class Memory extends ContextWrapper {
        final Map<String,String> map=new HashMap<>();
        Memory() {super(null);}
        @Override public SharedPreferences getSharedPreferences(String name,int mode) {
            return (SharedPreferences)Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{SharedPreferences.class},(p,m,a)->{
                switch(m.getName()) {
                    case "getString": return map.containsKey(a[0])?map.get(a[0]):a[1];
                    case "contains": return map.containsKey(a[0]);
                    case "edit": Map<String,String> stage=new HashMap<>(map);
                        return Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{SharedPreferences.Editor.class},(e,fn,args)->{
                            switch(fn.getName()) {
                                case "putString": stage.put((String)args[0],(String)args[1]);return e;
                                case "remove": stage.remove(args[0]);return e;
                                case "commit": map.clear();map.putAll(stage);return true;
                                default: throw new UnsupportedOperationException(fn.getName());
                            }
                        });
                    default:throw new UnsupportedOperationException(m.getName());
                }
            });
        }
    }
    static void adapters() throws Exception {
        String q="中 &?#/";
        String[][] fixtures={
            {"tavily","Authorization","Bearer fixture-token","query","{\"results\":[{\"title\":\"Doc\",\"url\":\"https://news.example/\",\"content\":\"Detail\"}]}"},
            {"brave","X-Subscription-Token","fixture-token","","{\"web\":{\"results\":[{\"title\":\"Doc\",\"url\":\"https://news.example/\",\"description\":\"Detail\"}]}}"},
            {"serper","X-API-KEY","fixture-token","q","{\"organic\":[{\"title\":\"Doc\",\"link\":\"https://news.example/\",\"snippet\":\"Detail\"}]}"},
            {"bocha","Authorization","Bearer fixture-token","query","{\"data\":{\"webPages\":{\"value\":[{\"name\":\"Doc\",\"url\":\"https://news.example/\",\"snippet\":\"Detail\"}]}}}"},
            {"exa","x-api-key","fixture-token","query","{\"results\":[{\"title\":\"Doc\",\"url\":\"https://news.example/\",\"highlights\":[\"Detail\"]}]}"},
            {"custom","X-Service-Key","fixture-token","","{\"data\":{\"items\":[{\"t\":\"Doc\",\"u\":\"https://news.example/\",\"d\":\"Detail\"}]}}"}
        };
        for(String[] f:fixtures){
            Backend.Session s=ses(f[0]); Backend.Request r=Backend.searchRequest(s,q);
            check(r.header.equals(f[1])&&r.auth.equals(f[2]),"auth: "+f[0]);
            check(!r.url.contains("fixture-token"),"no URL key");
            if(f[3].isEmpty())check(r.body==null && r.url.contains("%E4%B8%AD%20%26%3F%23%2F"),"encoded GET: "+f[0]);
            else check(r.url.equals(customEp)&&r.body.getString(f[3]).equals(q),"POST JSON: "+f[0]);
            check(Backend.searchResult(s,Backend.parse(f[4])).equals("1. Doc\nDetail\nhttps://news.example/"),"results: "+f[0]);
        }
        Backend.Session s=ses("custom"); s.profile.put("method","POST").put("authPrefix","Token").put("resultsPath","");
        Backend.Request r=Backend.searchRequest(s,q); check(r.body.getString("words").equals(q)&&r.auth.equals("Token fixture-token"),"custom POST");
        JSONArray many=new JSONArray();for(int i=0;i<8;i++) many.put(obj("t","Title "+i,"u","javascript:alert(1)"));
        String out=Backend.searchResult(s,many); check(!out.contains("javascript:")&&!out.contains("Title 5")&&out.contains("5. Title 4"),"safe links + cap");
        check(Backend.searchResult(s,new JSONArray()).contains("未找到"),"no hits");
        rejects(()->Backend.searchResult(s,new JSONObject()),"bad schema");
        rejects(()->Backend.searchResult(s,new JSONArray().put(obj("unmapped","value"))),"unmapped fields");
        for(String id:new String[]{"deepseek","qwen","siliconflow","openrouter","openai","gemini","custom"}){
            Backend.Request m=Backend.chatRequest(ses(id),"caller","hello"); JSONArray msgs=m.body.getJSONArray("messages");
            check(m.auth.equals("Bearer fixture-token")&&m.header.equals("Authorization")&&m.url.equals(customEp),"model auth: "+id);
            check(m.body.getString("model").equals("chosen")&&m.body.getDouble("temperature")==0.2&&m.body.getDouble("top_p")==0.9&&m.body.getInt("max_tokens")==256,"parameters: "+id);
            check(msgs.getJSONObject(0).getString("role").equals("system")&&msgs.getJSONObject(0).getString("content").equals("configured\n\ncaller")&&msgs.getJSONObject(1).getString("content").equals("hello"),"messages: "+id);
        }
        check(Backend.chatResult(Backend.parse("{\"choices\":[{\"message\":{\"content\":\" hi \"}}]}" )).equals("hi"),"model result");
        check(Backend.chatResult(Backend.parse("{\"choices\":[{\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"part\"}]}}]}" )).equals("part"),"multipart");
        rejects(()->Backend.chatResult(Backend.parse("{\"choices\":[{\"message\":{\"content\":null}}]}")),"empty answer");
        rejects(()->Backend.chatResult(Backend.parse("{\"error\":\"a private upstream message\"}")),"non-chat schema");
    }
    static void security() throws Exception {
        check(Backend.origin("HTTPS://EXAMPLE.com:443/v1").equals("https://example.com"),"default TLS port");
        check(Backend.origin("https://example.com:8443/v1").endsWith(":8443"),"nondefault port");
        for(String bad:new String[]{"http://a.test", "https://a.test@b.test/v1", "https://a.test/p?k=x", "https://a.test/#x", "https://a.test\\@b.test/", "https://a.test:99999/v1", "https://a.test%2F@b.test/", "https:///v1", "xyz", "https://a.test\nx/"}) rejects(()->Backend.endpoint(bad),bad);
        KeyGenerator g=KeyGenerator.getInstance("AES");g.init(256);SecretKey key=g.generateKey();
        String secret="a-fixture-not-a-real-key", slot="m.custom.",origin="https://a.test";
        String box=Backend.seal(key,slot,origin,secret); check(!box.contains(secret),"ciphertext");check(Backend.unseal(key,slot,origin,box).equals(secret),"round trip");
        check(!box.equals(Backend.seal(key,slot,origin,secret)),"fresh IV");
        rejects(()->Backend.unseal(key,slot,"https://b.test",box),"origin mismatch");
        rejects(()->Backend.unseal(key,"s.custom.",origin,box),"provider mismatch");
        rejects(()->Backend.unseal(key,slot,origin,box.substring(0,box.length()-6)+"AAAAAA"),"tamper");
        rejects(()->Backend.bounded(new ByteArrayInputStream(new byte[9]),8),"response limit");
        check(Backend.bounded(new ByteArrayInputStream(new byte[8]),8).length==8,"response boundary");
        rejects(()->Backend.parse("{\"a\":[]}{\"b\":[]}"),"trailing value"); rejects(()->Backend.parse("<html>"),"not JSON");
        rejects(()->Backend.parse(new String(new char[45]).replace("\0","[")+new String(new char[45]).replace("\0","]")),"nesting");
        check(Backend.status(302).getMessage().contains("重定向"),"redirect error");
    }
    static void testSettings(Memory c) throws Exception {
        JSONObject state=Backend.state(c); check(state.getJSONArray("modelPresets").length()>=7&&state.getJSONArray("searchPresets").length()==7,"catalog sizes");
        check(settings(c).getString("modelProvider").equals("deepseek")&&settings(c).getString("searchProvider").equals("bing"),"defaults");
        rejects(()->Backend.search(c,"a"),"browser-only Bing");rejects(()->Backend.chat(c,"","a"),"missing key");
        Backend.save(c,obj("modelProvider","custom","modelEndpoint","https://a.test/api","model","hello","searchProvider","custom","searchEndpoint",customEp));
        c.map.put("m.custom.key","opaque-box"); c.map.put("s.custom.key","search-box");
        check(settings(c).getBoolean("hasModelKey")&&!Backend.state(c).toString().contains("opaque-box"),"redacted state");
        Backend.save(c,obj("modelEndpoint","https://A.test:443/v2","modelKey","")); check(settings(c).getBoolean("hasModelKey"),"retain same origin");
        Backend.save(c,obj("modelProvider","qwen"));check(settings(c).getString("model").equals("qwen-plus")&&!settings(c).getBoolean("hasModelKey"),"provider isolation");
        Backend.save(c,obj("modelProvider","custom"));check(settings(c).getString("model").equals("hello")&&settings(c).getBoolean("hasModelKey"),"restore profile");
        rejects(()->Backend.save(c,obj("modelEndpoint","https://b.test/","searchAuthHeader","Host")),"protected auth header");
        check(settings(c).getBoolean("hasModelKey")&&settings(c).getString("modelEndpoint").equals("https://a.test/v2"),"atomic validation");
        Backend.save(c,obj("modelEndpoint","https://a.test:444/v1"));check(!settings(c).getBoolean("hasModelKey")&&settings(c).getBoolean("hasSearchKey"),"cross-origin discards only one credential");
        Backend.save(c,new JSONObject().put("clearSearchKey",true));check(!settings(c).getBoolean("hasSearchKey"),"clear key");
        for(String[] p:new String[][]{{"temperature","3"},{"maxTokens","1.5"},{"topP","0"},{"searchMethod","TRACE"},{"searchAuthHeader","X-Key\r\nBad"},{"searchResultsPath","data..items"},{"modelProvider","unknown"}})rejects(()->Backend.save(c,obj(p)),"invalid "+p[0]);
        Backend.save(c,obj("searchMethod","post","searchResultsPath","","searchTitleField","label","modelEndpoint",customEp));
        check(settings(c).getString("searchMethod").equals("POST"),"normalize method");
    }
    static String reply; static int code=200, opened; static Capture last;
    static final class Capture extends HttpsURLConnection {
        final ByteArrayOutputStream body=new ByteArrayOutputStream();
        Capture(URL u){super(u);}
        @Override public int getResponseCode(){return code;}
        @Override public InputStream getInputStream(){return new ByteArrayInputStream(reply.getBytes(StandardCharsets.UTF_8));}
        @Override public InputStream getErrorStream(){throw new AssertionError("upstream error body read");}
        @Override public String getHeaderField(String f){return "Location".equalsIgnoreCase(f)?"https://untrusted.example/redirect":null;}
        @Override public OutputStream getOutputStream(){return body;}
        @Override public void connect(){} @Override public void disconnect(){} @Override public boolean usingProxy(){return false;}
        @Override public String getCipherSuite(){return "fixture";} @Override public Certificate[] getLocalCertificates(){return null;} @Override public Certificate[] getServerCertificates(){return null;}
    }
    static void publicApi(Memory c) throws Exception {
        URL.setURLStreamHandlerFactory(proto->!proto.equals("https")?null:new URLStreamHandler(){protected URLConnection openConnection(URL u){opened++;return last=new Capture(u);}});
        reply="{\"choices\":[{\"message\":{\"content\":\"ready\"}}]}";
        check(Backend.chat(c,"sys","user").equals("ready"),"public chat integration");
        check(last.getRequestMethod().equals("POST")&&last.body.toString("UTF-8").contains("user")&&last.getRequestProperty("Authorization")==null,"wire request");
        check(!last.getInstanceFollowRedirects()&&!last.getUseCaches()&&last.getConnectTimeout()>0&&last.getReadTimeout()>0,"wire controls");
        reply="[{\"label\":\"Doc\",\"url\":\"https://r.example/\",\"snippet\":\"detail\"}]";check(Backend.search(c,"中 &").contains("1. Doc"),"public search integration");
        check(last.body.toString("UTF-8").contains("中 &"),"custom query body");
        for(int status:new int[]{301,302,303,307,308,401,403,429,500}){
            code=status;int prev=opened;try{Backend.chat(c,"","x");throw new AssertionError("status: "+code);}catch(Backend.Visible e){check(e.getMessage().contains("HTTP "+status),"safe HTTP error");}
            check(opened==prev+1&&!last.getInstanceFollowRedirects(),"one request, no follow");
        }
    }
    public static void main(String[] args) throws Exception {
        security();adapters();Memory c=new Memory();testSettings(c);publicApi(c);
        System.out.println("Provider fixtures: "+count+" checks passed. No network or real keys used.");
    }
}
