package io.pilot.onething;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

/**
 * Local-only MCP-style tool runtime.
 *
 * <p>Tools follow the Model Context Protocol shape: {@link #list()} is a tools/list
 * catalogue and {@link #call(String, JSONObject)} is a tools/call dispatcher. Every
 * tool is a pure local function: no network, no file access, no device permission,
 * no side effects. Arguments are whitelisted and bounded, and results are clipped.
 * Arithmetic is evaluated by a hand-written parser, never by a script engine.</p>
 */
public final class McpTools {
    private McpTools() {}

    private static final int MAX_TEXT = 4096;
    private static final int MAX_OUT = 8000;
    private static final int MAX_CALC = 240;
    private static final int MAX_CALC_NODES = 256;

    /** Lightweight catalogue for the settings UI: id, description, parameter hints. */
    public static JSONArray uiList() {
        JSONArray out = new JSONArray();
        try {
            out.put(ui("now", "当前时间", "取设备当前日期时间，可指定时区。", "timezone:时区ID(可选)"));
            out.put(ui("calculator", "计算器", "安全计算四则运算表达式，不使用脚本引擎。", "expression:表达式"));
            out.put(ui("convert", "单位换算", "长度、重量、温度、数据单位互转。", "value:数值, from:原单位, to:目标单位"));
            out.put(ui("textStats", "文本统计", "统计字符、词、行数与句子数。", "text:文本"));
            out.put(ui("jsonFormat", "JSON 格式化", "校验并美化一段 JSON。", "json:JSON文本, indent:缩进(可选)"));
            out.put(ui("uuid", "随机标识", "生成一个或多个随机 UUID。", "count:数量1-20(可选)"));
        } catch (JSONException ignored) {}
        return out;
    }

    private static JSONObject ui(String id, String name, String desc, String params) throws JSONException {
        return new JSONObject().put("id", id).put("name", name).put("description", desc).put("params", params);
    }

    /** OpenAI function-calling tools array derived from the same catalogue. */
    public static JSONArray functions() {
        JSONArray out = new JSONArray();
        try {
            out.put(fn("now", "Get the current date and time. Useful when the user asks for today's date, the time, or a countdown.",
                    props(p("timezone", "string", "IANA time zone id, e.g. Asia/Shanghai. Omit for device local time.")), null));
            out.put(fn("calculator", "Safely evaluate an arithmetic expression with + - * / parentheses and decimals.",
                    props(p("expression", "string", "The arithmetic expression, e.g. (12+8)*2.5")), req("expression")));
            out.put(fn("convert", "Convert a value between length, weight, temperature or data units.",
                    props(p("value", "number", "Numeric value to convert."),
                          p("from", "string", "Source unit, e.g. km, kg, c, MB."),
                          p("to", "string", "Target unit, e.g. mi, lb, f, GB.")), req("value", "from", "to")));
            out.put(fn("textStats", "Count characters, words, lines and sentences in a piece of text.",
                    props(p("text", "string", "Text to analyze.")), req("text")));
            out.put(fn("jsonFormat", "Validate and pretty-print a JSON document.",
                    props(p("json", "string", "JSON text to format."),
                          p("indent", "integer", "Indent spaces 0-8, default 2.")), req("json")));
            out.put(fn("uuid", "Generate one or more random UUIDs.",
                    props(p("count", "integer", "How many UUIDs, 1-20, default 1.")), null));
        } catch (JSONException ignored) {}
        return out;
    }

    private static JSONObject p(String name, String type, String desc) throws JSONException {
        return new JSONObject().put(name, new JSONObject().put("type", type).put("description", desc));
    }
    private static JSONArray props(JSONObject... items) { JSONArray a = new JSONArray(); for (JSONObject o : items) a.put(o); return a; }
    private static JSONArray req(String... keys) { JSONArray a = new JSONArray(); for (String k : keys) a.put(k); return a; }
    private static JSONObject fn(String name, String desc, JSONArray properties, JSONArray required) throws JSONException {
        JSONObject schema = new JSONObject().put("type", "object").put("properties", properties);
        if (required != null && required.length() > 0) schema.put("required", required);
        return new JSONObject().put("type", "function")
                .put("function", new JSONObject().put("name", name).put("description", desc).put("parameters", schema));
    }

    /** MCP tools/call result: {tool, content:[{type:text,text}], isError}. Never throws for bad args. */
    public static JSONObject call(String name, JSONObject args) {
        JSONObject res = new JSONObject();
        if (name == null) name = "";
        try {
            res.put("tool", name);
            if (args == null) args = new JSONObject();
            String text;
            switch (name) {
                case "now": text = now(args); break;
                case "calculator": text = calculator(args); break;
                case "convert": text = convert(args); break;
                case "textStats": text = textStats(args); break;
                case "jsonFormat": text = jsonFormat(args); break;
                case "uuid": text = uuid(args); break;
                default: return error(res, "未知工具：" + name);
            }
            res.put("content", new JSONArray().put(new JSONObject().put("type", "text").put("text", clip(text))));
            res.put("isError", false);
        } catch (Exception e) {
            return error(res, e.getMessage() == null ? "工具执行失败" : e.getMessage());
        }
        return res;
    }

    private static JSONObject error(JSONObject res, String msg) {
        try {
            res.put("content", new JSONArray().put(new JSONObject().put("type", "text")
                    .put("text", clip(String.valueOf(msg))))).put("isError", true);
        } catch (JSONException ignored) {}
        return res;
    }

    private static String now(JSONObject a) throws Exception {
        String zone = str(a, "timezone", 64);
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss (EEE) z", Locale.CHINA);
        if (zone.isEmpty()) {
            f.setTimeZone(TimeZone.getDefault());
            return f.format(new Date()) + "\n时区：" + TimeZone.getDefault().getID();
        }
        TimeZone tz = TimeZone.getTimeZone(zone);
        String id = tz.getID();
        // getTimeZone() silently returns GMT for unknown ids; reject only when the
        // caller asked for a named/offset zone but got the bare GMT fallback.
        boolean gmtsyntax = zone.toUpperCase(Locale.ROOT).startsWith("GMT") || zone.toUpperCase(Locale.ROOT).equals("UTC");
        if ("GMT".equals(id) && !gmtsyntax && !"UTC".equalsIgnoreCase(zone))
            throw new IllegalArgumentException("无法识别的时区 ID：" + zone);
        f.setTimeZone(tz);
        return f.format(new Date()) + "\n时区：" + id;
    }

    private static String calculator(JSONObject a) throws Exception {
        String expr = str(a, "expression", MAX_CALC);
        if (expr.isEmpty()) throw new IllegalArgumentException("缺少表达式。");
        double v = new Parser(expr).parse();
        if (v == (long) v && Math.abs(v) < 1e15) return String.valueOf((long) v);
        return String.format(Locale.ROOT, "%.10f", v).replaceAll("0+$", "").replaceAll("\\.$", "");
    }

    private static String convert(JSONObject a) throws Exception {
        double value = num(a, "value");
        String from = str(a, "from", 16).toLowerCase(Locale.ROOT);
        String to = str(a, "to", 16).toLowerCase(Locale.ROOT);
        if (from.isEmpty() || to.isEmpty()) throw new IllegalArgumentException("缺少原单位或目标单位。");
        if (from.equals(to)) return fmt(value) + " " + to;
        String[] result = convertValue(value, from, to);
        return fmt(value) + " " + from + " = " + result[0] + " " + result[1];
    }

    private static String textStats(JSONObject a) throws Exception {
        String text = str(a, "text", MAX_TEXT);
        int chars = text.length(), noSpace = text.replaceAll("\\s", "").length();
        int lines = text.isEmpty() ? 0 : text.split("\\r?\\n", -1).length;
        int words = text.isEmpty() ? 0 : text.trim().split("\\s+").length;
        int sentences = text.isEmpty() ? 0 : text.split("[。！？!?；;]+").length;
        return "字符数：" + chars + "\n非空白字符：" + noSpace + "\n行数：" + lines
                + "\n词数(按空白)：" + words + "\n句子数(按。！？!?；;)：" + sentences;
    }

    private static String jsonFormat(JSONObject a) throws Exception {
        String raw = str(a, "json", MAX_TEXT);
        if (raw.isEmpty()) throw new IllegalArgumentException("缺少 JSON 文本。");
        int indent = a.has("indent") ? (int) num(a, "indent") : 2;
        if (indent < 0 || indent > 8) throw new IllegalArgumentException("缩进需在 0 到 8 之间。");
        Object parsed;
        String t = raw.trim();
        if (t.startsWith("{")) parsed = new JSONObject(t);
        else if (t.startsWith("[")) parsed = new JSONArray(t);
        else throw new IllegalArgumentException("JSON 需以 { 或 [ 开头。");
        String pretty = indent == 0 ? parsed.toString() : pretty(parsed.toString(), indent);
        return pretty.length() > MAX_OUT ? pretty.substring(0, MAX_OUT) + "…（已截断）" : pretty;
    }

    /** Pretty-print a compact JSON string without relying on org.json.toString(int). */
    private static String pretty(String compact, int indent) {
        StringBuilder out = new StringBuilder();
        int level = 0; boolean inStr = false, esc = false;
        for (int i = 0; i < compact.length(); i++) {
            char c = compact.charAt(i);
            if (inStr) {
                out.append(c);
                if (esc) esc = false;
                else if (c == '\\') esc = true;
                else if (c == '"') inStr = false;
                continue;
            }
            if (c == '"') { inStr = true; out.append(c); }
            else if (c == '{' || c == '[') {
                out.append(c);
                char next = i + 1 < compact.length() ? compact.charAt(i + 1) : 0;
                if (next != '}' && next != ']') { level++; nl(out, level, indent); }
            } else if (c == '}' || c == ']') {
                char last = out.length() > 0 ? out.charAt(out.length() - 1) : 0;
                if (last != '\n' && last != '{' && last != '[') { level = Math.max(0, level - 1); nl(out, level, indent); }
                else if (level > 0) level--;
                out.append(c);
            } else if (c == ',') {
                out.append(c); nl(out, level, indent);
            } else if (c == ':') {
                out.append(": ");
            } else out.append(c);
        }
        return out.toString();
    }
    private static void nl(StringBuilder out, int level, int indent) {
        out.append('\n');
        for (int i = 0; i < level * indent; i++) out.append(' ');
    }

    private static String uuid(JSONObject a) throws Exception {
        int count = a.has("count") ? (int) num(a, "count") : 1;
        if (count < 1 || count > 20) throw new IllegalArgumentException("数量需在 1 到 20 之间。");
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < count; i++) { if (i > 0) b.append('\n'); b.append(UUID.randomUUID().toString()); }
        return b.toString();
    }

    // ---- Unit conversion ---------------------------------------------------
    private static final String[] LEN = {"mm", "cm", "m", "km", "in", "ft", "yd", "mi"};
    private static final double[] LEN_K = {0.001, 0.01, 1, 1000, 0.0254, 0.3048, 0.9144, 1609.344};
    private static final String[] WGT = {"mg", "g", "kg", "t", "oz", "lb"};
    private static final double[] WGT_K = {1e-6, 0.001, 1, 1000, 0.028349523125, 0.45359237};
    private static final String[] DAT = {"b", "B", "kb", "mb", "gb", "tb"};
    private static final double[] DAT_K = {0.125, 1, 1024, 1048576, 1073741824, 1099511627776.0};

    private static String[] convertValue(double v, String from, String to) throws Exception {
        if (is(LEN, from) && is(LEN, to)) return pair(v * k(LEN, LEN_K, from) / k(LEN, LEN_K, to), to);
        if (is(WGT, from) && is(WGT, to)) return pair(v * k(WGT, WGT_K, from) / k(WGT, WGT_K, to), to);
        if (is(DAT, from) && is(DAT, to)) return pair(v * k(DAT, DAT_K, from) / k(DAT, DAT_K, to), to);
        if (isTemp(from) && isTemp(to)) return pair(temp(v, from, to), to);
        throw new IllegalArgumentException("不支持的单位组合：" + from + " → " + to);
    }
    private static String[] pair(double v, String unit) {
        if (!Double.isFinite(v)) return new String[]{"结果超出范围", unit};
        return new String[]{fmt(v), unit};
    }
    private static boolean is(String[] a, String u) { for (String x : a) if (x.equals(u)) return true; return false; }
    private static double k(String[] names, double[] ks, String u) { for (int i = 0; i < names.length; i++) if (names[i].equals(u)) return ks[i]; return 1; }
    private static boolean isTemp(String u) { return u.equals("c") || u.equals("f") || u.equals("k"); }
    private static double temp(double v, String from, String to) {
        double celsius = from.equals("c") ? v : from.equals("f") ? (v - 32) * 5 / 9 : v - 273.15;
        if (celsius < -273.15) return Double.NaN;
        return to.equals("c") ? celsius : to.equals("f") ? celsius * 9 / 5 + 32 : celsius + 273.15;
    }
    private static String fmt(double v) {
        if (v == (long) v && Math.abs(v) < 1e15) return String.valueOf((long) v);
        return String.format(Locale.ROOT, "%.6f", v).replaceAll("0+$", "").replaceAll("\\.$", "");
    }

    // ---- Safe arithmetic parser (no eval, no reflection) -------------------
    private static final class Parser {
        private final String s; private int i, nodes;
        Parser(String s) { this.s = s; }
        double parse() throws Exception {
            double v = expr(); skip();
            if (i < s.length()) throw new IllegalArgumentException("表达式含无法识别的内容。");
            if (!Double.isFinite(v)) throw new IllegalArgumentException("结果超出数值范围。");
            return v;
        }
        private void skip() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
        private double expr() throws Exception {
            double v = term();
            while (true) {
                skip(); if (i >= s.length()) break;
                char c = s.charAt(i);
                if (c == '+') { i++; v += term(); }
                else if (c == '-') { i++; v -= term(); }
                else break;
            }
            return v;
        }
        private double term() throws Exception {
            double v = factor();
            while (true) {
                skip(); if (i >= s.length()) break;
                char c = s.charAt(i);
                if (c == '*') { i++; v *= factor(); }
                else if (c == '/') { i++; double d = factor(); if (d == 0) throw new IllegalArgumentException("除数不能为零。"); v /= d; }
                else break;
            }
            return v;
        }
        private double factor() throws Exception {
            skip();
            if (++nodes > MAX_CALC_NODES) throw new IllegalArgumentException("表达式过于复杂。");
            if (i >= s.length()) throw new IllegalArgumentException("表达式不完整。");
            char c = s.charAt(i);
            if (c == '+' || c == '-') { i++; double v = factor(); return c == '-' ? -v : v; }
            if (c == '(') { i++; double v = expr(); skip(); if (i >= s.length() || s.charAt(i) != ')') throw new IllegalArgumentException("括号不匹配。"); i++; return v; }
            if (c == '.' || (c >= '0' && c <= '9')) {
                int start = i; int dots = 0;
                while (i < s.length()) {
                    char x = s.charAt(i);
                    if (x >= '0' && x <= '9') i++;
                    else if (x == '.') { dots++; if (dots > 1) throw new IllegalArgumentException("数字格式错误。"); i++; }
                    else break;
                }
                try { return Double.parseDouble(s.substring(start, i)); }
                catch (Exception e) { throw new IllegalArgumentException("数字格式错误。"); }
            }
            throw new IllegalArgumentException("表达式含不支持的字符：" + c);
        }
    }

    // ---- Arg helpers -------------------------------------------------------
    private static String str(JSONObject a, String k, int max) throws Exception {
        Object v = a.opt(k);
        if (v == null) return "";
        if (!(v instanceof String)) throw new IllegalArgumentException(k + " 需为文本。");
        String s = ((String) v).trim();
        if (s.length() > max) throw new IllegalArgumentException(k + " 过长。");
        return s;
    }
    private static double num(JSONObject a, String k) throws Exception {
        Object v = a.opt(k);
        if (!(v instanceof Number)) throw new IllegalArgumentException(k + " 需为数字。");
        double d = ((Number) v).doubleValue();
        if (!Double.isFinite(d)) throw new IllegalArgumentException(k + " 数值无效。");
        return d;
    }
    private static String clip(String s) {
        if (s == null) s = "";
        return s.length() <= MAX_OUT ? s : s.substring(0, MAX_OUT) + "…（已截断）";
    }
}
