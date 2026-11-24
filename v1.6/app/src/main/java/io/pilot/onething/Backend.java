package io.pilot.onething;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.util.Base64;
import android.util.JsonReader;
import android.util.JsonToken;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLException;

/** Native-only provider integration. No WebView, background sync, analytics, or fallback provider. */
public final class Backend {
    private Backend() {}
    private static final String ALIAS = "io.pilot.onething.services.aes.v1";
    private static final String[][] MODELS = {
        {"deepseek", "DeepSeek", "https://api.deepseek.com/chat/completions", "deepseek-flash"},
        {"qwen", "通义千问 · 阿里云百炼（北京）", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "qwen-plus"},
        {"siliconflow", "硅基流动 · SiliconFlow", "https://api.siliconflow.cn/v1/chat/completions", "Qwen/Qwen2.5-7B-Instruct"},
        {"openrouter", "OpenRouter", "https://openrouter.ai/api/v1/chat/completions", "openai/gpt-4o-mini"},
        {"openai", "OpenAI", "https://api.openai.com/v1/chat/completions", "gpt-4o-mini"},
        {"gemini", "Google Gemini（兼容接口）", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "gemini-2.5-flash"},
        {"custom", "自定义 · OpenAI 兼容", "", ""}
    };
    private static final String[][] SEARCH = {
        {"bing", "Bing · 系统浏览器（免密钥）", "https://www.bing.com/search"},
        {"tavily", "Tavily", "https://api.tavily.com/search"},
        {"brave", "Brave Search", "https://api.search.brave.com/res/v1/web/search"},
        {"serper", "Serper · Google 搜索", "https://google.serper.dev/search"},
        {"bocha", "博查 · Bocha", "https://api.bochaai.com/v1/web-search"},
        {"exa", "Exa", "https://api.exa.ai/search"},
        {"custom", "自定义 · JSON 搜索", ""}
    };
    private static final String[][] FIELDS = {
        {"method", "GET"}, {"queryField", "q"}, {"authHeader", "Authorization"}, {"authPrefix", "Bearer"},
        {"resultsPath", "results"}, {"titleField", "title"}, {"urlField", "url"}, {"snippetField", "snippet"}
    };
    private static final int MAX_RESPONSE = 512 * 1024, MAX_REQUEST = 192 * 1024;
    private static final ThreadPoolExecutor NETWORK = new ThreadPoolExecutor(0, 3, 15, TimeUnit.SECONDS,
            new SynchronousQueue<Runnable>(), r -> { Thread t = new Thread(r, "pilot-service"); t.setDaemon(true); return t; });

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("native-services-v1", Context.MODE_PRIVATE); }
    private static JSONObject config(SharedPreferences p) throws JSONException { return new JSONObject(p.getString("config", "{}")); }
    private static String field(String f) { return "search" + Character.toUpperCase(f.charAt(0)) + f.substring(1); }
    private static String slot(boolean m, String id) { return (m ? "m." : "s.") + id + "."; }
    private static String selected(JSONObject cfg, boolean m) { return cfg.optString(m ? "modelProvider" : "searchProvider", m ? "deepseek" : "bing"); }
    private static String[] row(boolean m, String id) throws Exception {
        for (String[] r : m ? MODELS : SEARCH) if (r[0].equals(id)) return r;
        throw problem("未知的服务商，请重新选择。");
    }
    private static JSONObject profile(JSONObject cfg, boolean m, String[] r) throws JSONException {
        String s = slot(m, r[0]);
        JSONObject v = new JSONObject().put("id", r[0]).put("name", r[1]).put("endpoint", cfg.optString(s + "endpoint", r[2]));
        if (m) v.put("model", cfg.optString(s + "model", r[3]));
        if (!m && r[0].equals("custom")) for (String[] f : FIELDS) v.put(f[0], cfg.optString(s + f[0], f[1]));
        return v;
    }
    private static JSONObject globals(JSONObject cfg) throws JSONException {
        return new JSONObject().put("temperature", cfg.optDouble("temperature", 0.7)).put("topP", cfg.optDouble("topP", 1.0))
                .put("maxTokens", cfg.optInt("maxTokens", 1024)).put("systemPrompt", cfg.optString("systemPrompt", ""));
    }
    public static synchronized JSONObject state(Context c) {
        try {
            SharedPreferences p = prefs(c); JSONObject cfg = config(p), settings = globals(cfg), out = new JSONObject();
            for (boolean m : new boolean[]{true, false}) {
                String id = selected(cfg, m); row(m, id); JSONArray list = new JSONArray();
                for (String[] r : m ? MODELS : SEARCH) {
                    JSONObject v = profile(cfg, m, r); boolean has = p.contains(slot(m, r[0]) + "key"); v.put("hasKey", has); list.put(v);
                    if (r[0].equals(id)) {
                        String k = m ? "model" : "search";
                        settings.put(k + "Provider", id).put(k + "Endpoint", v.getString("endpoint")).put(m ? "hasModelKey" : "hasSearchKey", has);
                        if (m) settings.put("model", v.getString("model"));
                    }
                    if (!m && r[0].equals("custom")) for (String[] f : FIELDS) settings.put(field(f[0]), v.getString(f[0]));
                }
                out.put(m ? "modelPresets" : "searchPresets", list);
            }
            return out.put("settings", settings);
        } catch (Exception e) { throw new IllegalStateException("服务设置无法读取，请检查应用存储。"); }
    }

    static final class Visible extends IOException { Visible(String message) { super(message); } }
    private static Visible problem(String s) { return new Visible(s); }
    private static String text(JSONObject o, String name, int max) throws Exception {
        Object v = o.opt(name); if (!(v instanceof String) || ((String)v).length() > max) throw problem("文本设置无效或过长：" + name);
        return ((String)v).trim();
    }
    private static double number(JSONObject o, String k, double lo, double hi) throws Exception {
        double n = o.optDouble(k, Double.NaN);
        if (Double.isNaN(n) || n < lo || n > hi) throw problem("数值超出范围：" + k);
        return n;
    }
    // Build the URL from a parsed, canonical authority. Never trust two URL parsers to agree on an ambiguous authority.
    static String endpoint(String s) throws Visible {
        try {
            URI u = new URI(s); String host = u.getHost(); int port = u.getPort();
            if (s.length() > 2048 || !"https".equalsIgnoreCase(u.getScheme()) || host == null || host.isEmpty()
                    || u.getRawUserInfo() != null || u.getRawFragment() != null || u.getRawQuery() != null || u.getRawAuthority().contains("%")
                    || s.indexOf('\\') >= 0 || port == 0 || port > 65535) throw new IllegalArgumentException();
            host = host.toLowerCase(Locale.ROOT);
            return "https://" + host + (port == -1 || port == 443 ? "" : ":" + port) + (u.getRawPath().isEmpty() ? "/" : u.getRawPath());
        } catch (Exception e) { throw problem("请输入完整的 HTTPS 接口地址，不含用户名、密码、查询参数或片段。"); }
    }
    static String origin(String endpoint) throws Visible {
        String canonical = endpoint(endpoint); return canonical.substring(0, canonical.indexOf('/', 8));
    }
    private static boolean clear(JSONObject in, String k) throws Exception {
        if (!in.has(k)) return false; Object v = in.get(k); if (!(v instanceof Boolean)) throw problem("清除密钥开关无效。"); return (Boolean)v;
    }
    private static String token(String v) throws Visible {
        if (!v.matches("[A-Za-z0-9_-]{1,64}")) throw problem("搜索字段名仅支持字母、数字、下划线和短横线。"); return v;
    }
    private static void customField(String k, String v) throws Visible {
        if (k.equals("method")) { if (!v.equals("GET") && !v.equals("POST")) throw problem("搜索方法仅支持 GET 或 POST。"); }
        else if (k.equals("authHeader")) {
            token(v); String h = v.toLowerCase(Locale.ROOT);
            if (h.startsWith("proxy-") || h.startsWith("sec-") || h.startsWith("content-") || h.startsWith("if-") || h.startsWith("x-forwarded-")
                    || Arrays.asList("host","connection","cookie","cookie2","set-cookie","transfer-encoding","upgrade","te","trailer","expect","forwarded","via","accept","accept-encoding","user-agent","origin","referer","location","range","cache-control").contains(h))
                throw problem("不能将该 HTTP 标头用于鉴权。");
        } else if (k.equals("authPrefix")) { if (!v.isEmpty()) token(v); }
        else if (k.equals("resultsPath")) { if (!v.isEmpty()) for (String part : v.split("\\.", -1)) token(part); }
        else token(v);
    }
    public static synchronized void save(Context c, JSONObject input) throws Exception {
        try {
            if (input == null) throw problem("未提供服务设置。");
            SharedPreferences p = prefs(c); JSONObject cfg = config(p); SharedPreferences.Editor edit = p.edit();
            if (input.has("temperature")) cfg.put("temperature", number(input,"temperature",0,2));
            if (input.has("topP")) { double v = number(input,"topP",0,1); if (v == 0) throw problem("topP 必须大于 0。"); cfg.put("topP",v); }
            if (input.has("maxTokens")) { double v = number(input,"maxTokens",1,32768); if (v != (int)v) throw problem("maxTokens 必须是整数。"); cfg.put("maxTokens",(int)v); }
            if (input.has("systemPrompt")) cfg.put("systemPrompt", text(input,"systemPrompt",8192));
            for (boolean m : new boolean[]{true,false}) {
                String base = m ? "model" : "search", provider = base + "Provider";
                String id = input.has(provider) ? text(input,provider,32) : selected(cfg,m);
                String s = slot(m,id); JSONObject old = profile(cfg,m,row(m,id)); cfg.put(provider,id);
                String before = old.getString("endpoint"), ep = before;
                if (input.has(base + "Endpoint")) {
                    ep = text(input,base + "Endpoint",2048); if (!ep.isEmpty()) ep = endpoint(ep);
                    if (ep.isEmpty() && !id.equals("custom")) throw problem("该服务的接口地址不能为空。");
                    if (!m && id.equals("bing") && !ep.equals(before)) throw problem("Bing 浏览器搜索不支持修改接口。");
                    cfg.put(s + "endpoint",ep);
                }
                if (m && input.has("model")) {
                    String model = text(input,"model",192); if (!model.isEmpty() && !model.matches("[!-~]+")) throw problem("模型 ID 不能含有空格或控制字符。");
                    cfg.put(s + "model", model);
                }
                if (!m && id.equals("custom")) for (String[] f : FIELDS) if (input.has(field(f[0]))) {
                    String v = text(input,field(f[0]),192); if (f[0].equals("method")) v = v.toUpperCase(Locale.ROOT);
                    customField(f[0],v); cfg.put(s + f[0],v);
                }
                String newKey = input.has(base + "Key") ? text(input,base + "Key",4096) : "";
                boolean erase = clear(input, m ? "clearModelKey" : "clearSearchKey");
                if (erase && !newKey.isEmpty()) throw problem("请分别执行替换或清除密钥。");
                boolean changedOrigin = !before.equals(ep) && (before.isEmpty() || ep.isEmpty() || !origin(before).equals(origin(ep)));
                if (erase || changedOrigin) edit.remove(s + "key");
                if (!newKey.isEmpty()) {
                    if (!m && id.equals("bing")) throw problem("Bing 浏览器搜索无需密钥。");
                    if (ep.isEmpty()) throw problem("请先填写 HTTPS 接口地址，再保存密钥。");
                    if (!newKey.matches("[!-~]+")) throw problem("密钥不能含有空格、换行或非 ASCII 字符。");
                    edit.putString(s + "key", seal(master(true),s,origin(ep),newKey));
                }
            }
            if (!edit.putString("config",cfg.toString()).commit()) throw problem("未能写入本机设置，请检查存储空间。");
        } catch (Visible e) { throw e; } catch (Exception e) { throw problem("无法保存服务设置或加密密钥；请检查设备密钥库和存储。"); }
    }
    // Called under class lock. Do not generate a fresh key during decryption after a backup/restore.
    private static SecretKey master(boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey)ks.getKey(ALIAS,null);
        if (!create) throw problem("原设备密钥库不可用，请重新输入 API 密钥。");
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return g.generateKey();
    }
    private static byte[] aad(String slot, String origin) { return ("pilot:v1\n" + slot + "\n" + origin).getBytes(StandardCharsets.UTF_8); }
    static String seal(SecretKey key, String slot, String origin, String value) throws Exception {
        Cipher cp = Cipher.getInstance("AES/GCM/NoPadding"); cp.init(Cipher.ENCRYPT_MODE,key); cp.updateAAD(aad(slot,origin));
        byte[] plain = value.getBytes(StandardCharsets.UTF_8);
        try { return Base64.getEncoder().encodeToString(cp.getIV()) + "." + Base64.getEncoder().encodeToString(cp.doFinal(plain)); }
        finally { Arrays.fill(plain,(byte)0); }
    }
    static String unseal(SecretKey key, String slot, String origin, String box) throws Exception {
        String[] b = box.split("\\.",-1); if (b.length != 2) throw problem("密钥数据无效，请重新输入。");
        Cipher cp = Cipher.getInstance("AES/GCM/NoPadding");
        cp.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Base64.getDecoder().decode(b[0]))); cp.updateAAD(aad(slot,origin));
        byte[] plain = cp.doFinal(Base64.getDecoder().decode(b[1]));
        try { return new String(plain,StandardCharsets.UTF_8); } finally { Arrays.fill(plain,(byte)0); }
    }
    static final class Session {
        final String id, ep, key; final JSONObject profile, globals;
        Session(String id,String ep,String key,JSONObject profile,JSONObject globals) {
            this.id=id; this.ep=ep; this.key=key; this.profile=profile; this.globals=globals;
        }
    }
    private static synchronized Session session(Context c, boolean m) throws Exception {
        try {
            SharedPreferences p = prefs(c); JSONObject cfg = config(p); String id = selected(cfg,m), s = slot(m,id);
            if (!m && id.equals("bing")) throw problem("Bing 使用系统浏览器，不会返回 API 搜索结果。请打开浏览器或选择搜索 API。");
            JSONObject v = profile(cfg,m,row(m,id)); String ep = endpoint(v.getString("endpoint")); String box = p.getString(s + "key",null);
            if (m && v.getString("model").isEmpty()) throw problem("请在设置中填写模型 ID。");
            if (box == null && !id.equals("custom")) throw problem("请先在设置中保存当前服务商的 API 密钥。");
            return new Session(id,ep,box == null ? "" : unseal(master(false),s,origin(ep),box),v,globals(cfg));
        } catch (Visible e) { throw e; } catch (Exception e) { throw problem("服务设置或密钥无法读取，请重新保存设置和密钥。"); }
    }
    static final class Request {
        final String url, header, auth; final JSONObject body; // null body means GET; never logged or serialized to UI.
        Request(String url, JSONObject body, String header, String auth) { this.url=url; this.body=body; this.header=header; this.auth=auth; }
    }
    private static Request request(Session s, String suffix, JSONObject body, String header, String prefix) {
        return new Request(s.ep + suffix,body,header,s.key.isEmpty() ? "" : (prefix.isEmpty() ? s.key : prefix + " " + s.key));
    }
    static Request chatRequest(Session s, String system, String user) throws Exception {
        if (user == null || user.trim().isEmpty() || user.length() > 40000) throw problem("用户消息为空或超过 40000 字符。");
        if (system == null) system = ""; if (system.length() > 20000) throw problem("任务说明超过 20000 字符。");
        String both = (s.globals.getString("systemPrompt") + "\n\n" + system).trim(); JSONArray messages = new JSONArray();
        if (!both.isEmpty()) messages.put(new JSONObject().put("role","system").put("content",both));
        messages.put(new JSONObject().put("role","user").put("content",user));
        JSONObject body = new JSONObject().put("model",s.profile.getString("model")).put("messages",messages).put("stream",false)
                .put("temperature",s.globals.getDouble("temperature")).put("top_p",s.globals.getDouble("topP")).put("max_tokens",s.globals.getInt("maxTokens"));
        if (s.id.equals("deepseek") && (s.profile.getString("model").equals("deepseek-flash") || s.profile.getString("model").startsWith("deepseek-v4")))
            body.put("thinking",new JSONObject().put("type","disabled"));
        return request(s,"",body,"Authorization","Bearer");
    }
    private static String enc(String s) throws Exception { return URLEncoder.encode(s,"UTF-8").replace("+","%20"); }
    static Request searchRequest(Session s, String q) throws Exception {
        if (q == null || (q = q.trim()).isEmpty() || q.length() > 2000) throw problem("查询内容为空或超过 2000 字符。");
        JSONObject b = new JSONObject();
        switch (s.id) {
            case "tavily": return request(s,"",b.put("query",q).put("max_results",5).put("include_raw_content",false),"Authorization","Bearer");
            case "brave": return request(s,"?q=" + enc(q) + "&count=5&text_decorations=false",null,"X-Subscription-Token","");
            case "serper": return request(s,"",b.put("q",q).put("num",5),"X-API-KEY","");
            case "bocha": return request(s,"",b.put("query",q).put("count",5).put("summary",true),"Authorization","Bearer");
            case "exa": return request(s,"",b.put("query",q).put("numResults",5).put("contents",new JSONObject().put("highlights",true)),"x-api-key","");
            case "custom":
                JSONObject v=s.profile; String field=v.getString("queryField"); boolean post=v.getString("method").equals("POST");
                return request(s,post ? "" : "?" + enc(field) + "=" + enc(q),post ? b.put(field,q) : null,v.getString("authHeader"),v.getString("authPrefix"));
            default: throw problem("该搜索方式不支持 API 请求。");
        }
    }
    // Strict streaming parser limits nesting before recursing and bounds the number of created JSON nodes.
    static Object parse(String data) throws Visible {
        try (JsonReader r = new JsonReader(new StringReader(data))) {
            Object value = value(r,0,new int[]{0}); if (r.peek() != JsonToken.END_DOCUMENT) throw new IOException(); return value;
        } catch (Exception e) { throw problem("接口未返回有效 JSON，或响应结构过大。请检查接口地址和格式。"); }
    }
    private static Object value(JsonReader r,int depth,int[] count) throws Exception {
        if (depth > 40 || ++count[0] > 30000) throw new IOException();
        switch (r.peek()) {
            case BEGIN_OBJECT: { JSONObject o=new JSONObject(); r.beginObject(); while (r.hasNext()) o.put(r.nextName(),value(r,depth+1,count)); r.endObject(); return o; }
            case BEGIN_ARRAY: { JSONArray a=new JSONArray(); r.beginArray(); while (r.hasNext()) a.put(value(r,depth+1,count)); r.endArray(); return a; }
            case STRING: return r.nextString(); case BOOLEAN: return r.nextBoolean(); case NUMBER: return r.nextDouble();
            case NULL: r.nextNull(); return JSONObject.NULL; default: throw new IOException();
        }
    }
    static Visible status(int code) {
        String why;
        if (code >= 300 && code < 400) why="已拒绝重定向；请填写最终 HTTPS 接口地址。";
        else if (code==401 || code==403) why="鉴权失败，请检查密钥、地区和访问权限。";
        else if (code==402) why="余额或配额不足。";
        else if (code==429) why="请求频繁或额度不足，请稍后重试。";
        else if (code==404) why="找不到接口或模型，请核对设置。";
        else if (code>=500) why="服务商暂不可用，请稍后重试。";
        else why="服务商拒绝请求，请核对接口、模型和参数。";
        return problem("HTTP " + code + "：" + why);
    }
    static byte[] bounded(InputStream in,int max) throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(); byte[] buf=new byte[8192]; int n;
        while ((n=in.read(buf))!=-1) {
            if (Thread.currentThread().isInterrupted()) throw problem("请求已取消。");
            if (n>max-bytes.size()) throw problem("响应超过大小限制，请减少输出长度或搜索结果数。");
            bytes.write(buf,0,n);
        }
        return bytes.toByteArray();
    }
    private static Object execute(Request req) throws Exception {
        HttpsURLConnection conn=null;
        try {
            conn=(HttpsURLConnection)new URL(req.url).openConnection(); conn.setInstanceFollowRedirects(false); conn.setUseCaches(false);
            conn.setConnectTimeout(9000); conn.setReadTimeout(52000); conn.setAllowUserInteraction(false);
            conn.setRequestProperty("Accept","application/json"); conn.setRequestProperty("User-Agent","Pilot-OneThing/1");
            if (!req.auth.isEmpty()) conn.setRequestProperty(req.header,req.auth);
            if (req.body!=null) {
                byte[] body=req.body.toString().getBytes(StandardCharsets.UTF_8); if (body.length>MAX_REQUEST) throw problem("请求超过大小限制，请缩短内容。");
                conn.setRequestMethod("POST"); conn.setRequestProperty("Content-Type","application/json; charset=utf-8");
                conn.setDoOutput(true); conn.setFixedLengthStreamingMode(body.length); try (OutputStream os=conn.getOutputStream()) { os.write(body); }
            } else conn.setRequestMethod("GET");
            int code=conn.getResponseCode(); if (code<200 || code>=300) throw status(code);
            if (conn.getContentLengthLong()>MAX_RESPONSE) throw problem("响应超过 512 KiB 限制。");
            try (InputStream in=conn.getInputStream()) { return parse(new String(bounded(in,MAX_RESPONSE),StandardCharsets.UTF_8)); }
        } catch (Visible e) { throw e; } catch (SSLException e) { throw problem("HTTPS 证书或 TLS 验证失败，未信任该连接。"); }
        catch (SocketTimeoutException e) { throw problem("连接或读取超时，请稍后重试。"); }
        catch (IOException e) { throw problem("无法连接服务，请检查网络和接口地址。"); }
        finally { if (conn!=null) conn.disconnect(); }
    }
    private static Object exchange(Request req) throws Exception {
        // The caller also has an overall deadline (including DNS, uploads and slow trickle responses).
        Future<Object> future;
        try { future=NETWORK.submit(() -> execute(req)); } catch (RejectedExecutionException e) { throw problem("已有请求正在处理，请稍后重试。"); }
        try { return future.get(65,TimeUnit.SECONDS); }
        catch (InterruptedException e) { future.cancel(true); Thread.currentThread().interrupt(); throw problem("请求已取消。"); }
        catch (TimeoutException e) { future.cancel(true); throw problem("请求超过 65 秒，请稍后重试。"); }
        catch (ExecutionException e) { if (e.getCause() instanceof Visible) throw (Visible)e.getCause(); throw problem("服务调用失败，请检查配置。"); }
    }
    private static String string(JSONObject o,String key) { Object v=o.opt(key); return v instanceof String ? ((String)v).trim() : ""; }
    static String chatResult(Object data) throws Visible {
        try {
            JSONObject pick=((JSONObject)data).getJSONArray("choices").getJSONObject(0), msg=pick.getJSONObject("message"); Object value=msg.opt("content");
            String text=string(msg,"content"); if (value instanceof JSONArray) {
                StringBuilder b=new StringBuilder(); JSONArray parts=(JSONArray)value;
                for (int i=0;i<parts.length();i++) { JSONObject part=parts.optJSONObject(i); if (part!=null && "text".equals(part.optString("type"))) b.append(string(part,"text")).append('\n'); }
                text=b.toString().trim();
            }
            if (text.isEmpty()) text=string(msg,"refusal");
            if (text.isEmpty()) throw problem("模型未返回可显示的文本，请检查模型类型或提高 maxTokens。");
            return clip(text,65536);
        } catch (Visible e) { throw e; } catch (Exception e) { throw problem("模型响应不符合 Chat Completions 格式，请核对接口和模型。"); }
    }
    private static String clip(String s,int max) {
        if (s.length()<=max) return s; int n=max-1; if (Character.isHighSurrogate(s.charAt(n-1))) --n; return s.substring(0,n)+"…";
    }
    private static String line(String s,int max) { return clip(s.replaceAll("[\\p{Cntrl}\\p{Z}\\u202a-\\u202e\\u2066-\\u2069]+"," ").trim(),max); }
    private static String link(String raw) {
        try {
            if (raw.length()>2048 || raw.indexOf('\\')>=0) return ""; URI u=new URI(raw); if (u.getHost()==null || u.getRawUserInfo()!=null || u.getPort()>65535
                    || !("https".equalsIgnoreCase(u.getScheme()) || "http".equalsIgnoreCase(u.getScheme()))) return "";
            return u.toASCIIString();
        } catch (Exception e) { return ""; }
    }
    static String searchResult(Session s,Object data) throws Exception {
        String path="results", title="title",url="url",snippet="content";
        switch (s.id) {
            case "brave": path="web.results"; snippet="description"; break;
            case "serper": path="organic"; url="link"; snippet="snippet"; break;
            case "bocha": path="data.webPages.value"; title="name"; snippet="summary"; break;
            case "exa": snippet="text"; break;
            case "custom": path=s.profile.getString("resultsPath"); title=s.profile.getString("titleField"); url=s.profile.getString("urlField"); snippet=s.profile.getString("snippetField"); break;
            case "tavily": break; default: throw problem("不支持的搜索服务。");
        }
        Object node=data; if (!path.isEmpty()) for (String part:path.split("\\.")) node=node instanceof JSONObject ? ((JSONObject)node).opt(part) : null;
        if (!(node instanceof JSONArray)) throw problem("找不到搜索结果数组，请核对服务商、接口或 resultsPath。");
        JSONArray items=(JSONArray)node; StringBuilder out=new StringBuilder(); int n=0;
        for (int i=0; i<Math.min(items.length(),100) && n<5; i++) {
            JSONObject item=items.optJSONObject(i); if (item==null) continue;
            String u=link(string(item,url)), t=line(string(item,title),160), desc=string(item,snippet);
            if (desc.isEmpty() && s.id.equals("bocha")) desc=string(item,"snippet");
            if (desc.isEmpty() && s.id.equals("exa")) { JSONArray h=item.optJSONArray("highlights"); if (h!=null && h.opt(0) instanceof String) desc=h.getString(0); }
            desc=line(desc,500); if (t.isEmpty() && u.isEmpty() && desc.isEmpty()) continue;
            if (n>0) out.append("\n\n"); out.append(++n).append(". ").append(t.isEmpty() ? "搜索结果" : t);
            if (!desc.isEmpty()) out.append('\n').append(desc); if (!u.isEmpty()) out.append('\n').append(u);
        }
        if (n==0 && items.length()>0) throw problem("搜索结果字段无法识别，请核对标题、链接和摘要字段。");
        return n==0 ? "未找到相关搜索结果。" : out.toString();
    }
    private static String redact(String out,String key) { return key.isEmpty() ? out : out.replace(key,"[密钥已隐藏]"); }
    public static String chat(Context c,String system,String user) throws Exception {
        Session s=session(c,true); return redact(chatResult(exchange(chatRequest(s,system,user))),s.key);
    }
    public static String search(Context c,String query) throws Exception {
        Session s=session(c,false); return redact(searchResult(s,exchange(searchRequest(s,query))),s.key);
    }
}
