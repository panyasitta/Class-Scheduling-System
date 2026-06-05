/**
 * 02_Auth.gs — SHA-256 + salt · Token-based session
 */

function Auth_hash_(password, salt) {
  const raw = String(password) + ':' + String(salt);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function Auth_makeSalt_() {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + ':' + Date.now(),
    Utilities.Charset.UTF_8
  )).replace(/=+$/, '').substring(0, 16);
}

function Auth_genToken_() {
  const raw = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function Auth_login(payload) {
  const username = String((payload && payload.username) || '').trim().toLowerCase();
  const password = String((payload && payload.password) || '');
  if (!username || !password) throw new Error('กรุณากรอก username และ password');
  const users = DB_readAll(SHEETS.USERS);
  let user = null;
  for (let i = 0; i < users.length; i++) {
    if (String(users[i].username || '').toLowerCase() === username) { user = users[i]; break; }
  }
  if (!user) throw new Error('ไม่พบผู้ใช้นี้');
  if (!_yes_(user.active)) throw new Error('บัญชีนี้ถูกปิดใช้งาน');
  const expected = Auth_hash_(password, user.salt);
  if (expected !== user.password_hash) throw new Error('รหัสผ่านไม่ถูกต้อง');
  // issue token
  const token = Auth_genToken_();
  const cache = CacheService.getScriptCache();
  cache.put('tok:' + token, JSON.stringify({
    user_id: user.id,
    username: user.username,
    role: user.role,
    expires_at: Date.now() + APP.SESSION_HOURS * 3600 * 1000
  }), APP.SESSION_HOURS * 3600);
  // update last_login
  try { DB_update(SHEETS.USERS, user.id, { last_login_at: cfg_now_() }); } catch (e) {}
  Audit_log_(user, 'login', 'user', user.id, { username: user.username });
  return {
    token: token,
    user: Auth_publicUser_(user),
    caps: CAPS[user.role] || []
  };
}

function Auth_publicUser_(u) {
  return {
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    subject_group: u.subject_group,
    phone: u.phone,
    avatar_url: u.avatar_url,
    telegram_chat_id: u.telegram_chat_id
  };
}

function Auth_verify_(token) {
  if (!token) throw new Error('ไม่ได้เข้าสู่ระบบ');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('tok:' + token);
  if (!raw) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const sess = JSON.parse(raw);
  if (sess.expires_at < Date.now()) throw new Error('เซสชันหมดอายุ');
  const user = DB_findById(SHEETS.USERS, sess.user_id);
  if (!user) throw new Error('ผู้ใช้ไม่พบ');
  if (!_yes_(user.active)) throw new Error('บัญชีถูกปิดใช้งาน');
  return user;
}

function Auth_logout(token) {
  if (token) {
    const cache = CacheService.getScriptCache();
    cache.remove('tok:' + token);
  }
  return { ok: true };
}

function Auth_requireCap(user, cap) {
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ');
  if (!hasCap_(user.role, cap)) throw new Error('คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้ (' + cap + ')');
}

function Auth_changePassword(user, payload) {
  const oldPass = String((payload && payload.old_password) || '');
  const newPass = String((payload && payload.new_password) || '');
  if (!newPass || newPass.length < 6) throw new Error('รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัวอักษร');
  const u = DB_findById(SHEETS.USERS, user.id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (Auth_hash_(oldPass, u.salt) !== u.password_hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  const salt = Auth_makeSalt_();
  const hash = Auth_hash_(newPass, salt);
  DB_update(SHEETS.USERS, u.id, { password_hash: hash, salt: salt });
  Audit_log_(user, 'change_password', 'user', u.id);
  return { ok: true };
}

function Auth_updateProfile(user, payload) {
  const patch = {};
  ['full_name','email','phone','telegram_chat_id','avatar_url'].forEach(function (k) {
    if (payload && payload[k] !== undefined) patch[k] = String(payload[k] || '');
  });
  if (Object.keys(patch).length === 0) return Auth_publicUser_(user);
  const updated = DB_update(SHEETS.USERS, user.id, patch);
  Audit_log_(user, 'update_profile', 'user', user.id, patch);
  return Auth_publicUser_(updated);
}
