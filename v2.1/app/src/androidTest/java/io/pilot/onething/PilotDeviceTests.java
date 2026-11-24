package io.pilot.onething;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.nio.charset.StandardCharsets;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;

/** Framework-only device tests. Run with am instrument -w (see docs/DEVICE-TESTS.md).
 * No Activity, accessibility service, actual provider, DNS lookup or TLS socket is needed.
 * Android starts the target process under instrumentation; the URL factory dies with it.
 */
public final class PilotDeviceTests extends Instrumentation {
    private interface Check { void run() throws Exception; }
    private static final String ID = "PilotDeviceTests";
    private final List<String> names = new ArrayList<>();
    private final List<Check> cases = new ArrayList<>();
    private TestContext ctx;
    private final StringBuilder report = new StringBuilder();
    private int failures;

    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    @Override public void onStart() {
        try {
            Wire.install();  // Fail closed: never run a Backend test without the interceptor.
            add("import_schema_and_namespace", this::importSchema);
            add("import_rejected_inputs_and_limits", this::importLimits);
            add("skills_accept_merge_find_and_capacity", this::skillsStore);
            add("plan_plain_text_fences_and_allowed_actions", this::planAllowed);
            add("plan_rejects_unknown_effects_and_bad_bounds", this::planRejected);
            add("local_action_and_draft_allowlists", this::localPolicy);
            add("default_state_and_preset_ids", this::defaultState);
            add("save_is_partial_atomic_and_local", this::patchValidation);
            add("keystore_origin_and_provider_isolation", this::originIsolation);
            add("chat_request_and_response", this::chat);
            add("search_provider_requests_and_results", this::searchPresets);
            add("custom_search_get_post_and_auth", this::customSearch);
            add("fail_closed_http_json_and_no_fallback", this::serviceFailures);
            for (int i=0; i<cases.size(); i++) {
                ctx = new TestContext(getTargetContext());
                Wire.reset();
                Bundle event = new Bundle();
                event.putString("id", ID); event.putString("class", getClass().getName());
                event.putString("test", names.get(i)); event.putInt("numtests", cases.size());
                event.putInt("current", i+1); sendStatus(1, new Bundle(event));
                Throwable problem = null;
                try { cases.get(i).run(); Wire.assertDone(); }
                catch (Throwable error) { problem = error; }
                finally { try { ctx.clean(); } catch (Throwable error) { if (problem == null) problem = error; } }
                if (problem == null) { report.append("PASS ").append(names.get(i)).append('\n'); sendStatus(0, event); }
                else { failures++; String trace = Log.getStackTraceString(problem); event.putString("stack", trace);
                    report.append("FAIL ").append(names.get(i)).append("\n").append(trace).append('\n'); sendStatus(-2, event); }
            }
        } catch (Throwable error) { failures++; report.append("Runner setup failed: ").append(Log.getStackTraceString(error)); }
        Bundle result = new Bundle();
        result.putString("stream", "\n" + report + (failures == 0 ? "OK (" + cases.size() + " tests)" : "FAILURES: " + failures));
        finish(failures == 0 ? Activity.RESULT_OK : Activity.RESULT_CANCELED, result);
    }
    private void add(String name, Check check) { names.add(name); cases.add(check); }
    private static void ok(boolean value, String why) { if (!value) throw new AssertionError(why); }
    private static void eq(Object expected, Object got, String why) { ok(expected.equals(got), why); }
    private static JSONObject obj(Object... kv) throws Exception {
        JSONObject o = new JSONObject(); for(int i=0;i<kv.length;i+=2) o.put((String)kv[i],kv[i+1]); return o;
    }
    private static JSONArray arr(Object... values) { JSONArray a = new JSONArray(); for (Object x: values) a.put(x); return a; }
    private static void keys(JSONObject o, String... expected) {
        Set<String> actual = new HashSet<>(); Iterator<String> it = o.keys(); while(it.hasNext()) actual.add(it.next());
        eq(new HashSet<>(Arrays.asList(expected)), actual, "Unexpected fields; expected " + Arrays.toString(expected) + ", got " + actual);
    }
    private static String repeat(char c, int n) { char[] a = new char[n]; Arrays.fill(a,c); return new String(a); }
    private static Exception rejected(Check f, String why) throws Exception {
        try { f.run(); } catch (Exception e) { return e; } throw new AssertionError("Accepted: " + why);
    }
    // Fresh disk-backed preference namespace per case. Keep worker/cache behavior and real platform assets.
    private static final class TestContext extends ContextWrapper {
        final String prefix = "pilot_android_test_" + UUID.randomUUID() + "_";
        final Set<String> names = new HashSet<>();
        TestContext(Context base) { super(base); }
        @Override public Context getApplicationContext() { return this; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            names.add(name); return super.getSharedPreferences(prefix+name,mode);
        }
        @Override public void startActivity(android.content.Intent unused) { throw new AssertionError("Unexpected Activity launch"); }
        @Override public void startActivity(android.content.Intent unused, Bundle options) { throw new AssertionError("Unexpected Activity launch"); }
        void clean() { for (String name: names) getBaseContext().deleteSharedPreferences(prefix+name); }
        void noPlaintext(String value) {
            ok(!names.isEmpty(), "Expected disk-backed preferences");
            for (String name: names) ok(!getSharedPreferences(name,MODE_PRIVATE).getAll().toString().contains(value),"Plaintext in preferences");
        }
    }
    private static JSONObject skill(String id) throws Exception {
        return obj("id",id,"name"," Reader ","description"," Notes ","prompt"," Only use supplied text. ");
    }
    private static JSONArray parseSkills(JSONArray a) throws Exception { return Skills.parseImport(obj("version",1,"skills",a).toString()); }
    private void importSchema() throws Exception {
        JSONObject s = skill("reading-1").put("mode","answer").put("category","external").put("script","inert field");
        JSONObject clean = parseSkills(arr(s)).getJSONObject(0);
        keys(clean,"id","name","description","prompt","category","mode"); eq("user.reading-1",clean.getString("id"),"Import namespace");
        eq("自定义",clean.getString("category"),"Category is assigned locally"); eq("Reader",clean.getString("name"),"Trimmed name");
        eq("answer",clean.getString("mode"),"Explicit mode"); eq("auto",parseSkills(arr(skill("default"))).getJSONObject(0).getString("mode"),"Default mode");
    }
    private void importLimits() throws Exception {
        rejected(()->Skills.parseImport(obj("version",1.5,"skills",arr(skill("a"))).toString()),"fractional version"); rejected(()->Skills.parseImport(obj("version","1","skills",arr(skill("a"))).toString()),"version string"); rejected(()->Skills.parseImport("not json"),"invalid pack"); rejected(()->Skills.parseImport(obj("version",2,"skills",arr(skill("a"))).toString()),"version 2");
        rejected(()->parseSkills(arr()),"empty pack"); rejected(()->parseSkills(arr(skill("a"),skill("a"))),"duplicate id");
        for (String id: new String[]{"a.b","UPPER","_first",repeat('a',49)}) rejected(()->parseSkills(arr(skill(id))),"invalid id");
        rejected(()->parseSkills(arr(skill("a").put("mode","run"))),"unsupported mode");
        for (String field: new String[]{"name","description","prompt"}) {
            int max=field.equals("name")?40:field.equals("description")?160:2400;
            parseSkills(arr(skill("a").put(field,repeat('a',max))));
            for (Object v:new Object[]{JSONObject.NULL,7," ",repeat('a',max+1)}) rejected(()->parseSkills(arr(skill("a").put(field,v))),"bad " + field);
        }
        for (int bytes:new int[]{65536,65537}) {
            InputStream input=new ByteArrayInputStream(repeat('s',bytes).getBytes(StandardCharsets.UTF_8));
            if(bytes==65536) eq(bytes,Skills.read(input,65536).length(),"64 KiB file boundary");
            else rejected(()->Skills.read(input,65536),"file over 64 KiB");
        }
        JSONArray a=arr(); for(int i=0;i<24;i++) a.put(skill("s"+i)); eq(24,parseSkills(a).length(),"24-item pack");
        a.put(skill("too-many")); rejected(()->parseSkills(a),"25-item pack");
    }
    private void skillsStore() throws Exception {
        int builtins=Skills.all(ctx).length(); eq(14,builtins,"Bundled catalog size"); eq("copilot",Skills.find(ctx,"").getString("id"),"Default selection");
        Skills.accept(ctx,parseSkills(arr(skill("copilot"))));
        Skills.accept(ctx,parseSkills(arr(skill("copilot").put("name","Revised"))));
        eq(builtins+1,Skills.all(ctx).length(),"Reimport should replace"); eq("Revised",Skills.find(ctx,"user.copilot").getString("name"),"Replacement content");
        eq("copilot",Skills.find(ctx,"copilot").getString("id"),"Built-in retained"); rejected(()->Skills.find(ctx,"missing"),"unknown skill");
        for (int i=0;i<127;) { JSONArray batch=arr(); for(int n=0;n<24&&i<127;n++,i++) batch.put(skill("extra-"+i)); Skills.accept(ctx,parseSkills(batch)); }
        eq(builtins+128,Skills.all(ctx).length(),"128 custom skills allowed"); rejected(()->Skills.accept(ctx,parseSkills(arr(skill("overflow")))),"129 custom skills");
        eq(builtins+128,Skills.all(ctx).length(),"No partial import"); rejected(()->Skills.find(ctx,"user.overflow"),"uncommitted skill");
    }
    private static String plan(JSONArray steps) throws Exception { return obj("answer","Review before continuing.","steps",steps).toString(); }
    private static JSONObject action(String type) throws Exception { return obj("action",type); }
    private void planAllowed() throws Exception {
        eq(0,TaskPlan.parse("Just text").steps.size(),"Plain answer is inert");
        JSONArray steps=arr(action("open"),action("click").put("text","Next"),action("scroll").put("direction","up"),action("scroll").put("direction","down"),action("fill").put("text","Draft only"));
        TaskPlan p=TaskPlan.parse("```json\n" + plan(steps) + "\n```"); eq(5,p.steps.size(),"Parsed action count");
        for(int i=0;i<steps.length();i++) eq(steps.getJSONObject(i).toString(),p.steps.get(i).toString(),"Parsed action schema");
        JSONArray eight=arr(); for(int i=0;i<8;i++) eight.put(action("click").put("text",repeat('c',80))); eq(8,TaskPlan.parse(plan(eight)).steps.size(),"Eight steps allowed");
        eq(1,TaskPlan.parse(plan(arr(action("fill").put("text",repeat('d',400))))).steps.size(),"400-char draft allowed");
        eq(0,TaskPlan.parse(repeat('a',32000)).steps.size(),"32000 character plain response");
    }
    private void planRejected() throws Exception {
        for (String type:new String[]{"tap","intent","shell","launchUrl","send","approve","back","gesture",""})
            rejected(()->TaskPlan.parse(plan(arr(action("open"),action(type)))),"unsupported effect: "+type);
        for (JSONObject step:new JSONObject[]{action("open").put("package","dummy"),action("click").put("text","OK").put("x",0),action("fill").put("text","draft").put("submit",true),action("scroll").put("direction","down").put("url","ignored"),action("scroll").put("direction","left"),action("click").put("text","  "),action("click").put("text",repeat('x',81)),action("fill").put("text",repeat('x',401)),action("fill").put("text",1)})
            rejected(()->TaskPlan.parse(plan(arr(step))),"bad step");
        rejected(()->TaskPlan.parse(plan(arr(action("open"),action("open")))),"open after first step");
        JSONArray nine=arr(); for(int i=0;i<9;i++) nine.put(action("scroll").put("direction","down")); rejected(()->TaskPlan.parse(plan(nine)),"nine steps");
        for(String s:new String[]{"","{",repeat('x',32001),obj("answer",1).toString(),obj("answer"," ","steps",arr()).toString(),obj("answer","ok","steps",obj()).toString()}) rejected(()->TaskPlan.parse(s),"bad plan");
    }
    // These are the local policy predicates, not live AccessibilityNodeInfo/overlay dispatch.
    private void localPolicy() {
        String pkg="org.example.calendar", calc="org.example.calculator", own="io.pilot.onething";
        ok(PilotGuard.packageNameOk(own,pkg,"Calendar"),"Ordinary target allowed");
        for(String blocked:new String[]{own,"com.android.settings","com.android.permissioncontroller","invalid"})
            ok(!PilotGuard.packageNameOk(own,blocked,"Tools"),"Protected target rejected");
        ok(!PilotGuard.packageNameOk(own,pkg,"Bank"),"Sensitive app label rejected");
        for(String text:new String[]{"Today","下个月","Help"}) ok(PilotGuard.clickAllowed(pkg,text),"Known navigation label");
        for(String text:new String[]{"Send","Submit","Allow","Unknown label","1"}) ok(!PilotGuard.clickAllowed(pkg,text),"Only navigation or calculator labels");
        for(String text:new String[]{"4","+","="}) ok(PilotGuard.clickAllowed(calc,text),"Calculator labels only in calculator target");
        ok(PilotGuard.draftAllowed("Meeting notes"),"Benign draft allowed");
        for(String text:new String[]{"https://source.invalid/","",repeat('a',401),"Password"}) ok(!PilotGuard.draftAllowed(text),"Unsafe draft refused");
        ok(PilotGuard.textFieldOk(android.text.InputType.TYPE_CLASS_TEXT),"Ordinary text field allowed");
        for(int type:new int[]{0,android.text.InputType.TYPE_CLASS_PHONE,android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD})
            ok(!PilotGuard.textFieldOk(type),"Restricted input type blocked");
    }
    private JSONObject settings() throws Exception { return Backend.state(ctx).getJSONObject("settings"); }
    private void save(Object... kv) throws Exception { Backend.save(ctx,obj(kv)); }
    private static final String E1="https://model-a.invalid/v1/chat", E2="https://model-b.invalid/v1/chat", SE="https://search-fixture.invalid/results";
    private static final String K1="fixture-model-first", K2="fixture-model-second", SK="fixture-search-only";
    private static String response(Object text) throws Exception { return obj("choices",arr(obj("message",obj("role","assistant","content",text)))).toString(); }
    private static String results() throws Exception { return obj("results",arr(obj("title","One","url","https://source.invalid/one","snippet","Fixture"))).toString(); }
    private static void checkStateShape(JSONObject state) throws Exception {
        keys(state,"modelPresets","searchPresets","settings");
        keys(state.getJSONObject("settings"),"modelProvider","modelEndpoint","model","hasModelKey","searchProvider","searchEndpoint","hasSearchKey","temperature","topP","maxTokens","systemPrompt","searchMethod","searchQueryField","searchAuthHeader","searchAuthPrefix","searchResultsPath","searchTitleField","searchUrlField","searchSnippetField");
        for(String group:new String[]{"modelPresets","searchPresets"}) {
            JSONArray list=state.getJSONArray(group); for(int i=0;i<list.length();i++) { JSONObject p=list.getJSONObject(i);
                if (group.startsWith("model")) keys(p,"id","name","endpoint","hasKey","model");
                else if ("custom".equals(p.getString("id"))) keys(p,"id","name","endpoint","hasKey","method","queryField","authHeader","authPrefix","resultsPath","titleField","urlField","snippetField");
                else keys(p,"id","name","endpoint","hasKey");
            }
        }
    }
    private void defaultState() throws Exception {
        JSONObject state=Backend.state(ctx); checkStateShape(state); JSONObject s=settings();
        eq("deepseek",s.getString("modelProvider"),"Default model provider"); eq("bing",s.getString("searchProvider"),"Default search provider");
        eq(false,s.getBoolean("hasModelKey"),"Blank initial model profile"); eq(false,s.getBoolean("hasSearchKey"),"Blank initial search profile");
        eq(0.7,s.getDouble("temperature"),"Default temperature"); eq(1.0,s.getDouble("topP"),"Default topP"); eq(1024,s.getInt("maxTokens"),"Default maxTokens"); eq("",s.getString("systemPrompt"),"Default prompt");
        String[][] ids={{"deepseek","qwen","siliconflow","openrouter","openai","gemini","custom"},{"bing","tavily","brave","serper","bocha","exa","custom"}};
        for(int n=0;n<2;n++){JSONArray list=state.getJSONArray(n==0?"modelPresets":"searchPresets"); Set<String> found=new HashSet<>();
            eq(ids[n].length,list.length(),"Preset count"); for(int i=0;i<list.length();i++){JSONObject p=list.getJSONObject(i); found.add(p.getString("id")); eq(false,p.getBoolean("hasKey"),"Fresh profile");}
            eq(new HashSet<>(Arrays.asList(ids[n])),found,"Preset IDs"); }
    }
    private void patchValidation() throws Exception {
        save("modelProvider","qwen","model","fixture-model","temperature",0,"topP",0.25,"maxTokens",1,"systemPrompt","Keep");
        save("temperature",2,"maxTokens",32768); JSONObject baseline=settings();
        eq("Keep",baseline.getString("systemPrompt"),"Omitted text retained"); eq(0.25,baseline.getDouble("topP"),"Omitted number retained"); eq("fixture-model",baseline.getString("model"),"Provider setting retained");
        for(JSONObject invalid:new JSONObject[]{obj("modelProvider","missing"),obj("searchProvider","missing"),obj("temperature",2.1),obj("temperature",-1),obj("maxTokens",32769),obj("maxTokens",0),obj("maxTokens",1.5),obj("topP",0),obj("topP",1.1),obj("searchProvider","bing","searchKey",SK),obj("modelKey",K1,"clearModelKey",true),obj("searchProvider","custom","searchMethod","DELETE"),obj("searchProvider","custom","searchAuthHeader","Host")}) {
            invalid.put("systemPrompt","must not commit"); rejected(()->Backend.save(ctx,invalid),"invalid patch"); eq(baseline.toString(),settings().toString(),"Atomic rejection");
        }
        for(String bad:new String[]{"http://model.invalid/path","https://model.invalid/path?q=x","https://model.invalid/path#id","https://user@model.invalid/path"}) {
            rejected(()->save("modelEndpoint",bad,"temperature",0.5),"invalid HTTPS endpoint"); eq(baseline.toString(),settings().toString(),"Invalid endpoint changed settings"); }
    }
    private void originIsolation() throws Exception {
        save("modelProvider","custom","modelEndpoint",E1,"model","test-model","modelKey",K1,"searchProvider","custom","searchEndpoint",SE,"searchKey",SK);
        JSONObject st=Backend.state(ctx); checkStateShape(st); ok(!st.toString().contains(K1)&&!st.toString().contains(SK),"Key leaked in state"); ctx.noPlaintext(K1); ctx.noPlaintext(SK);
        java.security.KeyStore ks=java.security.KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        java.security.Key master=ks.getKey("io.pilot.onething.services.aes.v1",null);
        ok(master!=null && "AES".equals(master.getAlgorithm()) && master.getEncoded()==null,"Expected a non-exportable AndroidKeyStore AES key");
        String path=E1.replace("v1/chat","v2/chat"); save("modelEndpoint",path.replace("model-a.invalid","MODEL-A.INVALID:443"),"modelKey","");
        eq(true,settings().getBoolean("hasModelKey"),"Same origin must retain key"); Fake same=Wire.next(path,200,response("ok"));
        Backend.chat(ctx,"","hi"); same.auth("Authorization","Bearer "+K1);
        save("modelProvider","qwen"); eq(false,settings().getBoolean("hasModelKey"),"Other provider cannot inherit key");
        rejected(()->Backend.chat(ctx,"","hi"),"missing qwen key"); save("modelProvider","custom");
        eq(path,settings().getString("modelEndpoint"),"Custom endpoint restored"); eq(true,settings().getBoolean("hasModelKey"),"Custom key restored");
        save("modelEndpoint",E2); eq(false,settings().getBoolean("hasModelKey"),"Host rotation must drop key");
        Fake rotated=Wire.next(E2,200,response("ok")); Backend.chat(ctx,"","hi"); rotated.noHeader("Authorization");
        save("modelEndpoint",E1,"modelKey",K2); Fake replaced=Wire.next(E1,200,response("ok")); Backend.chat(ctx,"","hi"); replaced.auth("Authorization","Bearer "+K2);
        save("modelEndpoint",E1.replace(".invalid/",".invalid:8443/")); eq(false,settings().getBoolean("hasModelKey"),"Port rotation drops key");
        Fake search=Wire.next(SE+"?q=q",200,results()); Backend.search(ctx,"q"); search.auth("Authorization","Bearer "+SK);
        save("searchEndpoint",SE.replace("search-fixture","other-search")); eq(false,settings().getBoolean("hasSearchKey"),"Search rotation drops key");
        save("modelKey",K1,"searchKey",SK); save("clearModelKey",true,"clearSearchKey",true);
        eq(false,settings().getBoolean("hasModelKey"),"Explicitly cleared model"); eq(false,settings().getBoolean("hasSearchKey"),"Explicitly cleared search");
    }
    private void chat() throws Exception {
        save("modelProvider","custom","modelEndpoint",E1,"model","fixture-chat","modelKey",K1,"systemPrompt","General","maxTokens",42,"topP",0.75,"temperature",0.25);
        Fake f=Wire.next(E1,200,response(arr(obj("type","text","text","Part A"),obj("type","other","text","Not displayed"),obj("type","text","text","Part B"))));
        eq("Part A\nPart B",Backend.chat(ctx,"Task-specific","Question?"),"Only assistant text parts displayed");
        eq("POST",f.getRequestMethod(),"Chat POST"); f.auth("Authorization","Bearer "+K1); JSONObject b=f.json();
        keys(b,"stream","model","messages","max_tokens","top_p","temperature"); eq(false,b.getBoolean("stream"),"Not streaming");
        eq("fixture-chat",b.getString("model"),"Configured model"); eq(42,b.getInt("max_tokens"),"Token limit"); eq(0.75,b.getDouble("top_p"),"top_p"); eq(0.25,b.getDouble("temperature"),"Temperature");
        JSONArray messages=b.getJSONArray("messages"); eq(2,messages.length(),"Messages count"); eq("system",messages.getJSONObject(0).getString("role"),"System role first");
        eq("General\n\nTask-specific",messages.getJSONObject(0).getString("content"),"Composed system instructions"); eq("user",messages.getJSONObject(1).getString("role"),"User role"); eq("Question?",messages.getJSONObject(1).getString("content"),"User text");
        ok(!b.toString().contains(K1),"No credential in chat body");
    }
    private void searchPresets() throws Exception {
        for(String provider:new String[]{"tavily","brave","serper","bocha","exa"}) {
            String ep="https://"+provider+".invalid/find"; save("searchProvider",provider,"searchEndpoint",ep,"searchKey",SK);
            boolean brave=provider.equals("brave"),serper=provider.equals("serper"),bocha=provider.equals("bocha"),exa=provider.equals("exa");
            JSONObject item=obj(bocha?"name":"title","Hit",serper?"link":"url","https://source.invalid/page");
            if(exa) item.put("highlights",arr("Evidence")); else item.put(brave?"description":bocha?"summary":serper?"snippet":"content","Evidence");
            JSONArray items=arr(item); JSONObject data=brave?obj("web",obj("results",items)):bocha?obj("data",obj("webPages",obj("value",items))):obj(serper?"organic":"results",items);
            Fake f=Wire.next(brave?ep+"?q=A%20%26%20B&count=5&text_decorations=false":ep,200,data.toString());
            eq("1. Hit\nEvidence\nhttps://source.invalid/page",Backend.search(ctx,"A & B"),provider+" result mapping");
            eq(brave?"GET":"POST",f.getRequestMethod(),provider+" method");
            f.auth(brave?"X-Subscription-Token":serper?"X-API-KEY":exa?"x-api-key":"Authorization",(brave||serper||exa?"":"Bearer ")+SK);
            if(brave) eq(0,f.sent.size(),"GET has no body"); else { JSONObject b=f.json(); eq("A & B",b.getString(serper?"q":"query"),provider+" query mapping"); ok(!b.toString().contains(SK),"Credential in search body"); }
        }
    }
    private void customSearch() throws Exception {
        save("searchProvider","custom","searchEndpoint",SE,"searchKey",SK,"searchQueryField","term","searchAuthHeader","X-Fixture-Key","searchAuthPrefix","", "searchResultsPath","data.items","searchTitleField","label","searchUrlField","href","searchSnippetField","note");
        JSONArray hits=arr(); for(int i=1;i<=6;i++) hits.put(obj("label","Hit-"+i,"href",i==1?"file:///inert":"https://source.invalid/"+i,"note","Note "+i));
        Fake get=Wire.next(SE+"?term=%E4%B8%AD%20%26%20%2B",200,obj("data",obj("items",hits)).toString()); String text=Backend.search(ctx,"中 & +");
        eq("GET",get.getRequestMethod(),"Custom GET"); eq(0,get.sent.size(),"No GET body"); get.auth("X-Fixture-Key",SK);
        eq(5,text.split("\n\n").length,"Five-result limit"); ok(text.startsWith("1. Hit-1\nNote 1\n\n2. Hit-2")&&text.contains("5. Hit-5\nNote 5\nhttps://source.invalid/5")&&!text.contains("file:")&&!text.contains("Hit-6"),"Safe link filtering and exact cap");
        save("searchMethod","POST","searchResultsPath","","searchAuthPrefix","Token");
        Fake post=Wire.next(SE,200,hits.toString()); eq(text,Backend.search(ctx,"中 & +"),"Top-level array response"); post.auth("X-Fixture-Key","Token "+SK);
        eq("POST",post.getRequestMethod(),"Custom POST"); JSONObject b=post.json(); keys(b,"term"); eq("中 & +",b.getString("term"),"UTF-8 JSON body");
    }
    private void serviceFailures() throws Exception {
        rejected(()->Backend.search(ctx,"lookup"),"Bing is browser-only"); rejected(()->Backend.chat(ctx,"","hello"),"missing model key");
        save("modelProvider","custom","modelEndpoint",E1,"model","fixture","modelKey",K1);
        for(int code:new int[]{302,401,429,503}) { Wire.next(E1,code,"upstream-error-"+K1); Exception ex=rejected(()->Backend.chat(ctx,"","hello"),"HTTP "+code);
            ok(ex.getMessage().contains(""+code)&&!ex.getMessage().contains("upstream-error")&&!ex.getMessage().contains(K1),"Redacted HTTP diagnostic"); }
        for(String payload:new String[]{"{bad", "{}", "{\"choices\":[]}", response("ok")+" trailing",repeat('x',512*1024+1)}) {
            Wire.next(E1,200,payload); rejected(()->Backend.chat(ctx,"","hello"),"bad response rejected"); }
        save("searchProvider","custom","searchEndpoint",SE); Wire.next(SE+"?q=q",200,"{\"notResults\":[]}");
        rejected(()->Backend.search(ctx,"q"),"missing result array");
    }
    /** No sockets: scripts are single-use and matched against the entire URL, including query. An unexpected
     * call remains a test failure even when Backend catches an IOException and returns a visible error. */
    private static final class Wire {
        private static Fake pending;
        private static final List<Fake> received=new ArrayList<>();
        private static int unexpected;
        static void install() {
            URL.setURLStreamHandlerFactory(proto -> ("https".equals(proto)||"http".equals(proto)) ? new URLStreamHandler(){
                @Override protected URLConnection openConnection(URL url) throws IOException { return Wire.open(url); }
            } : null);
        }
        static synchronized void reset() { pending=null; received.clear(); unexpected=0; }
        static synchronized Fake next(String url,int code,String payload) throws Exception {
            ok(pending==null,"Previous fixture was not used"); return pending=new Fake(new URL(url),code,payload);
        }
        static synchronized Fake open(URL url) throws IOException {
            if(pending==null || !"https".equals(url.getProtocol()) || !pending.getURL().toExternalForm().equals(url.toExternalForm())) {
                unexpected++; throw new IOException("Unscripted request blocked"); }
            Fake result=pending; pending=null; received.add(result); return result;
        }
        static synchronized void assertDone() {
            eq(0,unexpected,"Unexpected connection/fallback/retry"); ok(pending==null,"Scripted request never made");
            for(Fake f:received) { ok(f.closed,"Connection not disconnected"); ok(!f.getInstanceFollowRedirects(),"Redirects enabled"); }
        }
    }
    private static final class Fake extends HttpsURLConnection {
        final int code; final byte[] payload; final ByteArrayOutputStream sent=new ByteArrayOutputStream(); boolean closed;
        // Some Android URLConnection base implementations do not retain request properties.
        private final java.util.Map<String,String> headers = new java.util.TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        @Override public void setRequestProperty(String name,String value) { headers.put(name,value); }
        @Override public String getRequestProperty(String name) { return headers.get(name); }
        Fake(URL url,int code,String payload) { super(url); this.code=code; this.payload=payload.getBytes(StandardCharsets.UTF_8); }
        @Override public void connect() { }
        @Override public void disconnect() { closed=true; }
        @Override public boolean usingProxy() { return false; }
        @Override public String getCipherSuite() { return "test-only"; }
        @Override public Certificate[] getLocalCertificates() { return null; }
        @Override public Certificate[] getServerCertificates() { return null; }
        @Override public int getResponseCode() { return code; }
        @Override public long getContentLengthLong() { return -1; } // exercise streaming size cap
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(payload); }
        @Override public OutputStream getOutputStream() { return sent; }
        JSONObject json() throws Exception { return new JSONObject(sent.toString("UTF-8")); }
        void auth(String name,String value) { eq(value,getRequestProperty(name),"Missing/wrong fixture auth header"); }
        void noHeader(String name) { ok(getRequestProperty(name)==null,"Unexpected credential header"); }
    }
}
