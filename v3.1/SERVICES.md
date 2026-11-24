# Native services contract (`io.pilot.onething.Backend`)

Android API 26+ (the app targets a minimum of API 29), framework APIs only. Add `android.permission.INTERNET` to the manifest. Use a worker thread for `save`, `chat` and `search`; disable repeat submissions while a request is in progress. `state` is local-only. No method launches a browser. Treat returned text as untrusted plain text: use `TextView.setText` / DOM `textContent`, not HTML or executable instructions. Opening a search result is a separate user action.

* `public static JSONObject state(Context c)` → `{modelPresets: [...], searchPresets: [...], settings: {...}}`. Every preset has `id`, `name`, `endpoint`, `hasKey`; model presets also have `model`. Endpoint and model reflect saved overrides. Custom search preset also has `method`, `queryField`, `authHeader`, `authPrefix`, `resultsPath`, `titleField`, `urlField`, `snippetField`. No stored plaintext key, encrypted blob or placeholder key is ever returned.
* `public static void save(Context c, JSONObject input) throws Exception` — atomic flat **partial patch**, not `{settings: ...}`. Select a provider by ID; any endpoint/model/key edits apply to the provider selected **in that patch** (or the current selection). Switching providers alone restores that provider's profile. Only submit fields the user changed; do not send another profile's cached endpoint or model. An empty key or an omitted key keeps the existing key; a nonempty key replaces it. `clearModelKey`/`clearSearchKey: true` deletes it (do not combine with a replacement). Changing HTTPS origin discards the old key unless a new one is supplied in the same save. Profile and key deletion also work while offline.
* `public static String chat(Context c, String system, String user) throws Exception` — synchronous, nonstreaming OpenAI-compatible Chat Completions call. Joins the configured `systemPrompt` and per-call `system` in that order, then sends `user`. Returns only assistant text, not the raw response.
* `public static String search(Context c, String query) throws Exception` — synchronous API search. Returns up to five plain-text numbered results (title / short snippet / HTTP(S) URL). For `searchProvider == "bing"`, the UI should open `https://www.bing.com/search?q=` plus the URL-encoded query in the system browser; calling `search` in this mode raises a visible message. No fallback to another provider on failure.

`settings` keys are `modelProvider`, `modelEndpoint`, `model`, `hasModelKey`, `searchProvider`, `searchEndpoint`, `hasSearchKey`, `temperature` (0..2), `maxTokens` (1..32768), `topP` (>0..1), `systemPrompt`, and the eight custom search fields listed above, prefixed `search` and capitalized (e.g. `searchMethod`, `searchResultsPath`). `save` accepts these setting names except the read-only key flags. Write-only input fields are `modelKey`, `searchKey`, `clearModelKey`, `clearSearchKey`. Defaults: `deepseek`, `bing`, temperature 0.7, maxTokens 1024, topP 1, empty system prompt. IDs: `deepseek`, `qwen`, `siliconflow`, `openrouter`, `openai`, `gemini`, `custom` (model); `bing`, `tavily`, `brave`, `serper`, `bocha`, `exa`, `custom` (search). Keys for model/custom and search/custom are separate. Provider model availability and parameter support depend on account/region. Set a full HTTPS operation URL, **not** a base URL. Embedded credentials, fragments and static query strings are rejected. `bing` has no API configuration.

Examples (`save` input):

```json
{"modelProvider":"qwen","model":"qwen-plus","temperature":0.5,"maxTokens":2048,"modelKey":"<new key>"}
```
```json
{"searchProvider":"custom","searchEndpoint":"https://search.example.org/api/search","searchMethod":"POST","searchQueryField":"query","searchAuthHeader":"Authorization","searchAuthPrefix":"Bearer","searchKey":"<new key>","searchResultsPath":"data.items","searchTitleField":"title","searchUrlField":"link","searchSnippetField":"description"}
```
```json
{"modelProvider":"qwen","clearModelKey":true}
```

Custom `GET` appends one encoded query parameter; `POST` sends a JSON object containing that string field. `resultsPath` is a dot-separated object path to an array (`""` for a top-level array); result field names are direct object keys. Defaults: GET, `q`, `Authorization`, `Bearer`, `results`, `title`, `url`, `snippet`. An empty auth prefix sends the raw key. A custom provider may be used without a key. Custom auth is header-only, not placed in URLs. Use public API endpoints you trust: the selected endpoint receives submitted prompts or queries, and its origin receives the explicitly bound key. No automatic redirects, retries, credential sharing across providers, raw upstream error bodies, or request logging.
