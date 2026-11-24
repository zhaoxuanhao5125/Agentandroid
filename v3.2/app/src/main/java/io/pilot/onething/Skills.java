package io.pilot.onething;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Declarative skill format: files contain instructions, never executable code. */
final class Skills {
    static String read(InputStream stream, int max) throws IOException {
        if (stream == null) throw new IOException("无法打开文件");
        try(InputStream in = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) != -1) {
                if (bytes.size() + n > max) throw new IOException("文件过大（上限 " + max / 1024 + " KB）");
                bytes.write(buf, 0, n);
            }
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    /** A single malformed entry must not blank the whole library. */
    private static void appendSafe(JSONArray dest, JSONArray src) {
        for(int i=0;i<src.length();i++) {
            try {
                JSONObject o = src.optJSONObject(i);
                if(o != null && o.has("id") && o.has("name") && o.has("mode") && o.has("prompt")) dest.put(o);
            } catch(Exception ignored) { /* skip one corrupt entry */ }
        }
    }
    static JSONArray all(Context c) throws Exception {
        JSONArray result = new JSONArray();
        try { appendSafe(result, new JSONArray(read(c.getAssets().open("skills.json"),65536))); }
        catch(Exception e) { /* bundled library unreadable: fall through to custom + empty-state UI */ }
        try { appendSafe(result, new JSONArray(c.getSharedPreferences("desk",0).getString("skills","[]"))); }
        catch(Exception e) { /* corrupt custom store: ignore, it can be re-imported */ }
        return result;
    }
    static JSONObject find(Context c, String id) throws Exception {
        JSONArray a = all(c);
        if(a.length()==0) throw new IllegalArgumentException("技能库为空，请检查应用数据或重新导入技能");
        if(id.isEmpty()) return a.getJSONObject(0);
        for(int i=0;i<a.length();i++) if(id.equals(a.getJSONObject(i).optString("id"))) return a.getJSONObject(i);
        throw new IllegalArgumentException("找不到所选技能，请重新选择");
    }
    private static String str(JSONObject o, String k, int max) throws Exception {
        Object v=o.opt(k); if(!(v instanceof String)) throw new IllegalArgumentException("技能缺少文本字段："+k);
        String s=((String)v).trim(); if(s.isEmpty()||s.length()>max)throw new IllegalArgumentException("技能字段长度不合规："+k); return s;
    }
    static JSONArray parseImport(String raw) throws Exception {
        Object decoded=Backend.parse(raw);if(!(decoded instanceof JSONObject))throw new IllegalArgumentException("技能包必须是 JSON 对象");JSONObject file=(JSONObject)decoded; if(!(file.opt("version") instanceof Number)||((Number)file.opt("version")).doubleValue()!=1.0)throw new IllegalArgumentException("仅支持 version: 1 的 JSON 技能包");
        JSONArray a=file.getJSONArray("skills"), out=new JSONArray();
        if(a.length()<1||a.length()>24)throw new IllegalArgumentException("每次可导入 1–24 项技能");
        Set<String> unique=new HashSet<>();
        for(int i=0;i<a.length();i++){
            JSONObject v=a.getJSONObject(i),clean=new JSONObject(); String id=str(v,"id",48);
            if(!id.matches("[a-z0-9][a-z0-9_-]{0,47}")||!unique.add(id)) throw new IllegalArgumentException("技能 ID 无效或重复："+id);
            String mode=v.optString("mode","auto"); if(!Arrays.asList("auto","answer","phone","research").contains(mode))throw new IllegalArgumentException("不支持的技能模式");
            clean.put("id","user."+id).put("name",str(v,"name",40)).put("description",str(v,"description",160)).put("prompt",str(v,"prompt",2400)).put("category","自定义").put("mode",mode); out.put(clean);
        } return out;
    }
    static void accept(Context c, JSONArray a) throws Exception {
        android.content.SharedPreferences p=c.getSharedPreferences("desk",0);
        JSONArray old=new JSONArray(p.getString("skills","[]")); LinkedHashMap<String,JSONObject> m=new LinkedHashMap<>();
        for(JSONArray list:new JSONArray[]{old,a}) for(int i=0;i<list.length();i++){JSONObject o=list.getJSONObject(i);m.put(o.getString("id"),o);}
        if(m.size()>128)throw new IllegalArgumentException("自定义技能上限为 128 个");
        p.edit().putString("skills",new JSONArray(m.values()).toString()).apply();
    }
}
