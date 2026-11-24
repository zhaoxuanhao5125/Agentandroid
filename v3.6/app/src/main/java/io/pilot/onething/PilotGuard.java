package io.pilot.onething;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Conservative, local policy, not an assertion that arbitrary third-party UI is trustworthy. */
final class PilotGuard {
    private PilotGuard() { }
    private static final Pattern CAMEL = Pattern.compile("(?<=[a-z])(?=[A-Z])");
    private static final Pattern GAP = Pattern.compile("[^\\p{L}\\p{Nd}]+");
    private static final Pattern PKG = Pattern.compile("[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+");
    private static final Pattern INVISIBLE = Pattern.compile("[\\p{Cf}\\p{Cc}\\p{Zl}\\p{Zp}]");
    private static final Pattern PROTECTED = Pattern.compile(
        "settings|systemui|system ui|permissioncontroller|packageinstaller|permissionmanager|devicepolicy|managedprovision|credential|keychain|keystore|security|safetycenter|securefolder|permission|installer|appstore|vending|password|passkey|authenticat|authenticator|bank|wallet|paytm|paypal|alipay|mobilepay|samsungpay|payment|creditcard|crypto|alipass|mobileqq|gmscore|vpnbrowser|microsoft teams|tencent wework|nextcloud|dropbox|onedrive|coinbase|binance|brokerage|finance|financ|trading|fidelity|venmo|cashapp|revolut|chase|klarna|monzo|stripe|1password|bitwarden|lastpass|keepass|dashlane|transact|wechat|whatsapp|telegram|signal messenger|messag|dialer|incallui|contacts|facetime|facebook|instagram|snapchat|twitter|outlook|gmail|email|browser|chrome|firefox|mozilla|brave browser|duckduckgo|opera browser|webview|keyguard|keyboards?|inputmethod|google drive|cloud storage|marketplace|biometric|health|medical|smartthings|smarthome|remotecontrol|quickshare|appmarket|play store|" +
        "\\b(?:auth|otp|mfa|sso|gms|gsf|phone|telecom|sms|mms|mail|nfc|home|launcher[0-9]*|shell|superuser|root|terminal|adb|vpn|pay|mm|mobileqq|qq|teams|slack|discord|skype|tiktok|douyin|icbc|ccb|cmbchina|spdb|pingan|cmb|boc|abchina|zelle|hsbc|usaa|boa|nationwide|cash|amazon|shopping|shop|store|identity|idp)\\b|" +
        "设置|設定|安装|安裝|权限|權限|安全|手机管家|銀行|银行|金融|证券|贷款|钱包|錢包|支付|付款|授权|授權|认证|認證|验证器|密钥|密碼|密码|短信|電話|电话|通讯录|通訊錄|邮件|郵件|浏览器|瀏覽器|微信|钉钉|飞书|淘宝|京东|拼多多|健康");
    private static final Pattern SENSITIVE = Pattern.compile(
        "password|passcode|passkey|verification|authenticat|credential|checkout|payment|biometric|one time (?:password|code)|security code|security center|privacy settings|system settings|card number|bank account|cardholder|sign in|log in|sign up|login|signin|signup|transfer money|wire transfer|credit card|debit card|place order|buy now|checkout|two factor|send money|sign out|permission|install app|delete account|invite guests|recipient|allow access|" +
        "\\b(?:pin|otp|mfa|cvv|cvc|iban|ssn|pay|purchase|send|submit|publish|share|authorize|authorise|consent|approve|grant|unlock|security|transfer|donate|order|subscribe|account|invite|sell|bid|buy|forward message|delete|remove|uninstall|erase|emergency|recipient)\\b|" +
        "密码|密碼|口令|验证码|驗證碼|付款|支付|收款|转账|轉帳|转帐|银行卡|銀行卡|信用卡|余额|餘額|账户|账号|帳戶|帳號|登录|登入|登陆|注册|註冊|人脸识别|指纹|指紋|身份验证|授权|授權|权限|權限|隐私|隱私|安全中心|系统设置|允许访问|下单|下單|购买|購買|发送|發送|收件人|邀请|邀請|提交|发布|發佈|发表|分享|删除|刪除|卸载|紧急呼叫");
    // Never dispatch an arbitrary app-defined affirmative/transaction button, even if its label
    // exactly matches a model step. Digits/operators are accepted only in calculator packages.
    private static final Set<String> NAV = new HashSet<>(Arrays.asList(
        "today","day","week","month","year","agenda","schedule","calendar","clock","alarm","alarms","stopwatch","timer","world clock","home","library","overview","details","history","favorites","favourites","recent","recents","list","grid","view","help","about","zoom in","zoom out","previous month","next month","previous week","next week",
        "今天","今日","日","周","週","月","年","日程","日历","行事曆","时钟","時鐘","闹钟","鬧鐘","秒表","計時器","计时器","世界时钟","世界時鐘","首页","主頁","收藏","历史记录","歷史記錄","最近","列表","网格","概览","详情","帮助","关于","放大","缩小","上个月","下个月","上一周","下一周"));
    private static final Pattern CALC_PKG = Pattern.compile("(?:^|[.])(?:[a-z]*calculator[0-9a-z_]*|calc)(?:$|[.])");
    private static final Pattern CALC = Pattern.compile("(?:[0-9]|00|[+÷×*/−–=.%(),√²^π!±-]|\u232b|\u2212|\u2190|ac|ce|c|del|clear|sin|cos|tan|ln|log|sqrt|清除|退格)");
    private static final Pattern HIGH_RISK_DRAFT = Pattern.compile("(?:https?://|://|www\\.|javascript:|intent:|tel:|mailto:|sms:|otpauth:|-----begin|\\b(?:\\d[ -]?){13,19}\\b)", Pattern.CASE_INSENSITIVE);

    private static boolean contains(Pattern pattern, CharSequence raw) {
        if (raw == null) return false;
        String s = Normalizer.normalize(raw, Normalizer.Form.NFKC);
        String rawWords = GAP.matcher(s.toLowerCase(Locale.ROOT)).replaceAll(" ");
        if (pattern.matcher(rawWords).find()) return true;
        String segmented = GAP.matcher(CAMEL.matcher(s).replaceAll(" ").toLowerCase(Locale.ROOT)).replaceAll(" ");
        return !rawWords.equals(segmented) && pattern.matcher(segmented).find();
    }
    static boolean packageNameOk(String own, String pkg, CharSequence label) {
        return pkg != null && pkg.length() <= 240 && PKG.matcher(pkg).matches() && !pkg.equals(own)
            && label != null && label.length() > 0 && label.length() <= 160 && !INVISIBLE.matcher(label).find()
            && !contains(PROTECTED, pkg) && !contains(PROTECTED, label);
    }
    // Additional signals independent of the name/label (an opaque-named dialer is still sensitive).
    static boolean sensitivePermission(String p) {
        if(p==null)return false;
        switch(p){
        case "android.permission.SEND_SMS":case "android.permission.READ_SMS":case "android.permission.RECEIVE_SMS":
        case "android.permission.READ_CALL_LOG":case "android.permission.WRITE_CALL_LOG":case "android.permission.CALL_PHONE":
        case "android.permission.REQUEST_INSTALL_PACKAGES":case "android.permission.INSTALL_PACKAGES":
        case "android.permission.WRITE_SECURE_SETTINGS":case "android.permission.MANAGE_USERS":
        case "android.permission.MANAGE_DEVICE_ADMINS":case "android.permission.MANAGE_CREDENTIALS":
        case "android.permission.ACTIVITY_RECOGNITION":case "android.permission.BODY_SENSORS":return true;
        default:return false;
        }
    }
    static boolean sensitive(CharSequence s) {
        if (s == null) return false;
        // Ordinary multiline accessibility text is fine; direction overrides / invisible markers are not.
        return s.length() > 4096 || FORMAT.matcher(s).find() || contains(SENSITIVE, s);
    }
    private static final Pattern FORMAT = Pattern.compile("[\\p{Cf}]");
    static boolean sensitiveControlText(String pkg,String id,CharSequence label) {
        // A stock calculator's known character-backspace key is not a destructive transaction.
        // No exception for a Delete button elsewhere, a History/Delete page, or a click request.
        boolean stock="com.android.calculator2".equals(pkg)||"com.google.android.calculator".equals(pkg);
        boolean key="del".equals(id)||"op_del".equals(id)||"button_delete".equals(id);
        if (stock && key && label!=null && ("delete".equalsIgnoreCase(label.toString()) || "删除".contentEquals(label))) return false;
        return sensitive(label);
    }
    static boolean clickAllowed(String pkg, String text) {
        if (!plain(text, 80) || sensitive(text)) return false;
        String normal = Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        return NAV.contains(normal) || (CALC_PKG.matcher(pkg.toLowerCase(Locale.ROOT)).find() && CALC.matcher(normal).matches());
    }
    static boolean draftAllowed(String text) {
        return plain(text, 400) && !sensitive(text) && !HIGH_RISK_DRAFT.matcher(text).find();
    }
    private static boolean plain(String s, int limit) {
        return s != null && !s.trim().isEmpty() && s.length() <= limit && !INVISIBLE.matcher(s).find();
    }
    static boolean textFieldOk(int type) {
        // InputType.TYPE_CLASS_TEXT + NORMAL/LONG_MESSAGE. Excludes phone, numeric, email,
        // URI, short-message, person-name, all password variations, and unspecified type (0).
        return (type & 0x0f) == 1 && ((type & 0xff0) == 0 || (type & 0xff0) == 0x50);
    }
    static boolean passwordType(int type) {
        int c = type & 0xf, v = type & 0xff0;
        return c == 1 && (v == 0x80 || v == 0x90 || v == 0xe0) || c == 2 && v == 0x10;
    }
}
