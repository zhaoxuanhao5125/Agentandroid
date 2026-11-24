package io.pilot.onething;

/** Plain JVM checks (no Android emulator, AndroidX, JUnit or downloaded dependencies). */
public final class PilotGuardTest {
    private static int checks;
    private static void check(boolean matches,String name){++checks;if(!matches)throw new AssertionError(name);}
    public static void main(String[] args){
        String own="io.pilot.onething", calc="com.google.android.calculator";
        for(String pkg:new String[]{calc,"com.android.calculator2","com.sec.android.app.popupcalculator","com.android.deskclock","com.google.android.calendar","org.example.notes"})
            check(PilotGuard.packageNameOk(own,pkg,"Ordinary utility"),"utility: "+pkg);
        for(String pkg:new String[]{own,"org.example.permissioncontroller","com.android.settings","com.android.packageinstaller","com.android.systemui","org.acme.mobilebanking","io.example.authenticator","com.tencent.mm","com.android.vending","com.android.chrome","com.google.android.apps.walletnfcrel","com.android.mms","org.bad\n.name"})
            check(!PilotGuard.packageNameOk(own,pkg,"Notes"),"package: "+pkg);
        for(String label:new String[]{"Acme Wallet","Acme Bank","账户密码管理器","云支付","App Store","Authenticator","A\u202epp"})
            check(!PilotGuard.packageNameOk(own,"org.example.ordinary",label),"launcher label: "+label);
        for(String screen:new String[]{"com.acme.SignInActivity","confirmPassword","btn_send","Card number","输入验证码","验证密碼","Confirm payment","退出帳戶","Allow access","invIte guests","删除","Ａｕｔｈｅｎｔｉｃａｔｅ","P\u200bay"})
            check(PilotGuard.sensitive(screen),"sensitive: "+screen);
        for(String perm:new String[]{"SEND_SMS","CALL_PHONE","WRITE_SECURE_SETTINGS","INSTALL_PACKAGES"})
            check(PilotGuard.sensitivePermission("android.permission."+perm),"sensitive permission");
        for(String perm:new String[]{"INTERNET","VIBRATE","READ_CALENDAR","SET_ALARM"})
            check(!PilotGuard.sensitivePermission("android.permission."+perm),"ordinary permission");
        for(String normal:new String[]{"今天","History","数字 1","12:24","pinwheel","monthly"})
            check(!PilotGuard.sensitive(normal),"ordinary: "+normal);
        check(!PilotGuard.sensitiveControlText(calc,"del","Delete"),"calculator character backspace");
        check(PilotGuard.sensitiveControlText(calc,"del","Delete history"),"history delete");
        check(PilotGuard.sensitiveControlText("org.example.notes","del","Delete"),"other app delete");
        for(String key:new String[]{"7","+","×","=","÷","AC","−"})check(PilotGuard.clickAllowed(calc,key),"calculator: "+key);
        for(String label:new String[]{"Today","日程","Next month","History"})check(PilotGuard.clickAllowed("org.example.notes",label),"navigation: "+label);
        for(String label:new String[]{"7","Send","OK","Continue","Confirm","Transfer","Book","Delete","保存","允许","进入商城","Today\n","\u202eToday"})
            check(!PilotGuard.clickAllowed("org.example.notes",label),"rejected action: "+label);
        for(String draft:new String[]{"Weekend notes","周末去公园，带上水。"})check(PilotGuard.draftAllowed(draft),"ordinary draft");
        for(String draft:new String[]{"1234 5678 9012 3456","https://example.com","tel:111","\nexecute"," ","密碼", "x\u202ey"})
            check(!PilotGuard.draftAllowed(draft),"rejected draft: "+draft);
        for(int field:new int[]{1,0x51,0x20001})check(PilotGuard.textFieldOk(field),"plain field");
        for(int field:new int[]{0,2,3,0x11,0x21,0x41,0x81,0x91,0xe1,0x12})check(!PilotGuard.textFieldOk(field),"blocked field");
        for(int field:new int[]{0x81,0x91,0xe1,0x12,0x10081})check(PilotGuard.passwordType(field),"password");
        check(!PilotGuard.passwordType(1),"non-password");
        System.out.println("PASS: "+checks+" PilotGuard checks");
    }
}
