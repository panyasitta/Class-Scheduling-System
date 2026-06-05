/**
 * 10_Menu.gs — Sheet menu + helpers
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏫 ระบบจัดตารางเรียน')
    .addItem('🔧 ติดตั้ง/รีเซ็ต Schema', 'menu_initSystem')
    .addItem('🌱 สร้างข้อมูลตัวอย่าง', 'menu_seedAll')
    .addSeparator()
    .addItem('🍱 เพิ่มคาบพักเที่ยง', 'menu_addLunchBreak')
    .addSeparator()
    .addItem('🔐 ขออนุญาตสิทธิ์ระบบ', 'menu_grantPermissions')
    .addItem('🔍 ตรวจสถานะสิทธิ์', 'menu_authorize')
    .addSeparator()
    .addItem('🌐 เปิด Web App', 'menu_openWebApp')
    .addItem('🔗 คัดลอก URL', 'menu_copyWebUrl')
    .addSeparator()
    .addItem('🗑 ล้างข้อมูลทั้งหมด (อันตราย)', 'menu_resetAll')
    .addToUi();
}

function menu_addLunchBreak() {
  const ui = SpreadsheetApp.getUi();
  // Use a system user context (admin role)
  const sysUser = { id: 'system', username: 'system', role: 'admin' };
  try {
    const r = Periods_addLunchBreak(sysUser, {});
    if (r.ok) {
      ui.alert('🍱 เพิ่มคาบพักเที่ยงสำเร็จ', r.message + '\n\nคุณสามารถปรับเวลา/ชื่อได้ที่หน้า "คาบเรียน" ใน Web App', ui.ButtonSet.OK);
    } else {
      const resp = ui.alert('⚠️ พบคาบพักอยู่แล้ว', r.message + '\n\nต้องการเพิ่มเพิ่มอีกหรือไม่?', ui.ButtonSet.YES_NO);
      if (resp === ui.Button.YES) {
        const r2 = Periods_addLunchBreak(sysUser, { force: true });
        ui.alert('✅', r2.message, ui.ButtonSet.OK);
      }
    }
  } catch (e) {
    ui.alert('❌ ผิดพลาด', String(e.message || e), ui.ButtonSet.OK);
  }
}

function menu_initSystem() {
  const ui = SpreadsheetApp.getUi();
  Object.keys(SHEETS).forEach(function (k) {
    DB_ensureSchema_(SHEETS[k]);
  });
  Settings_ensureDefaults_();
  ui.alert('✅ ติดตั้ง Schema เรียบร้อย', 'สร้าง Sheet และ Header ครบทุกตารางแล้ว', ui.ButtonSet.OK);
}

function menu_seedAll() {
  const ui = SpreadsheetApp.getUi();
  const r = Seed_initSystem();
  ui.alert('🌱 สร้างข้อมูลตัวอย่างเรียบร้อย',
    'รหัสผ่านเริ่มต้น: ' + APP.DEFAULT_PASSWORD + '\n' +
    'บัญชีทดลอง: admin / academic / head_math / head_sci / teacher1-8\n' +
    '\nคลิก "🌐 เปิด Web App" เพื่อทดสอบ',
    ui.ButtonSet.OK);
}

function menu_grantPermissions() {
  // ไม่มี try/catch — ต้องการให้ Apps Script trigger consent dialog
  SpreadsheetApp.getActive().getName();
  DriveApp.getRootFolder().getName();
  Session.getActiveUser().getEmail();
  ScriptApp.getService().getUrl();
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  SpreadsheetApp.getUi().alert('✅ พร้อมใช้งาน',
    'ระบบได้รับสิทธิ์ครบทุกตัว — ใช้งาน Telegram และฟีเจอร์เต็มได้แล้ว',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function menu_authorize() {
  const ui = SpreadsheetApp.getUi();
  const results = [];
  function probe(label, fn) {
    try { fn(); results.push('✓ ' + label); } catch (e) { results.push('✗ ' + label + ': ' + (e.message || e)); }
  }
  probe('Spreadsheet', function () { SpreadsheetApp.getActive().getName(); });
  probe('Drive', function () { DriveApp.getRootFolder().getName(); });
  probe('User Info', function () { Session.getActiveUser().getEmail(); });
  probe('Script App', function () { ScriptApp.getService().getUrl(); });
  probe('External Request', function () {
    UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  });
  ui.alert('สถานะสิทธิ์ระบบ', results.join('\n') + '\n\nหากมี ✗ → กดเมนู "🔐 ขออนุญาตสิทธิ์ระบบ"', ui.ButtonSet.OK);
}

function menu_openWebApp() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    SpreadsheetApp.getUi().alert('⚠️ ยังไม่ได้ Deploy',
      'ไปที่ Deploy → New deployment → Web app → Execute as: User deploying the app, Anyone',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  const html = '<html><body style="font-family:sans-serif;padding:20px;text-align:center">' +
    '<p>กำลังเปิด Web App...</p>' +
    '<p><a href="' + url + '" target="_blank" style="background:#6366f1;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">เปิดในแท็บใหม่</a></p>' +
    '<scr' + 'ipt>setTimeout(function(){window.open("' + url + '","_blank");google.script.host.close();},500);</scr' + 'ipt>' +
    '</body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(160), 'เปิด Web App');
}

function menu_copyWebUrl() {
  const url = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert('⚠️ ยังไม่ได้ Deploy', 'กรุณา Deploy เป็น Web App ก่อน', ui.ButtonSet.OK);
    return;
  }
  ui.alert('🔗 URL ของ Web App', url, ui.ButtonSet.OK);
}

function menu_resetAll() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert('⚠️ ยืนยันการล้างข้อมูล',
    'การกระทำนี้จะลบข้อมูลทุกอย่าง (Users, Schedule, Absences, Substitutes, Settings) แล้วสร้างตัวอย่างใหม่\nไม่สามารถยกเลิกได้\n\nต้องการดำเนินการต่อหรือไม่?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;
  Seed_resetAll();
  ui.alert('🌱 ล้าง + สร้างข้อมูลใหม่เรียบร้อย', 'รหัสผ่านเริ่มต้น: ' + APP.DEFAULT_PASSWORD, ui.ButtonSet.OK);
}
