/**
 * 08_Settings.gs — Key-value settings (force text col)
 */

function Settings_forceTextValueColumn_(sh) {
  try {
    sh.getRange(2, 2, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
  } catch (e) {}
}

function Settings_map_() {
  const sh = DB_ensureSchema_(SHEETS.SETTINGS);
  Settings_forceTextValueColumn_(sh);
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  const rows = sh.getRange(2, 1, last - 1, 3).getValues();
  rows.forEach(function (r) {
    const k = String(r[0] || '').trim();
    if (!k) return;
    out[k] = r[1] === '' || r[1] === null ? '' : String(r[1]);
  });
  return out;
}

const SETTINGS_DEFAULTS = Object.freeze({
  org_name: 'ทุ่งเสลี่ยมชนูปถัมภ์',
  org_subname: 'สังกัดสำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน',
  current_term: '1',
  current_year: String(new Date().getFullYear() + 543),
  tg_enabled: 'no',
  tg_token: '',
  tg_admin_chat_ids: ''
});

function Settings_ensureDefaults_() {
  const sh = DB_ensureSchema_(SHEETS.SETTINGS);
  Settings_forceTextValueColumn_(sh);
  const map = Settings_map_();
  const now = cfg_now_();
  const rows = [];
  Object.keys(SETTINGS_DEFAULTS).forEach(function (k) {
    if (map[k] === undefined) rows.push([k, SETTINGS_DEFAULTS[k], now]);
  });
  if (rows.length > 0) {
    const startRow = sh.getLastRow() + 1;
    const range = sh.getRange(startRow, 1, rows.length, 3);
    range.setNumberFormat('@');
    range.setValues(rows);
  }
}

const SETTINGS_SENSITIVE_KEYS = Object.freeze(['tg_token','tg_admin_chat_ids']);

function Settings_get(user) {
  const all = Settings_map_();
  if (hasCap_(user.role, 'setting.manage')) return all;
  // strip sensitive
  const filtered = {};
  Object.keys(all).forEach(function (k) {
    if (SETTINGS_SENSITIVE_KEYS.indexOf(k) < 0) filtered[k] = all[k];
  });
  return filtered;
}

function Settings_update(user, payload) {
  Auth_requireCap(user, 'setting.manage');
  const updates = (payload && payload.updates) || {};
  const sh = DB_ensureSchema_(SHEETS.SETTINGS);
  Settings_forceTextValueColumn_(sh);
  const now = cfg_now_();
  const map = Settings_map_();
  Object.keys(updates).forEach(function (k) {
    const v = String(updates[k] === null || updates[k] === undefined ? '' : updates[k]);
    if (map[k] !== undefined) {
      // find row
      const last = sh.getLastRow();
      const keyCol = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < keyCol.length; i++) {
        if (String(keyCol[i][0]) === k) {
          const range = sh.getRange(i + 2, 1, 1, 3);
          range.setNumberFormat('@');
          range.setValues([[k, v, now]]);
          break;
        }
      }
    } else {
      const newRow = sh.getLastRow() + 1;
      const range = sh.getRange(newRow, 1, 1, 3);
      range.setNumberFormat('@');
      range.setValues([[k, v, now]]);
    }
  });
  Audit_log_(user, 'update', 'settings', '', { keys: Object.keys(updates) });
  return Settings_get(user);
}
