/**
 * 03_Users.gs — User CRUD
 */

function Users_list(user, p) {
  Auth_requireCap(user, 'user.view_all');
  const all = DB_readAll(SHEETS.USERS).filter(function (u) { return _yes_(u.active); });
  const q = String((p && p.q) || '').trim().toLowerCase();
  const role = String((p && p.role) || '').trim();
  let items = all;
  if (q) items = items.filter(function (u) {
    return (u.username || '').toLowerCase().indexOf(q) >= 0
        || (u.full_name || '').toLowerCase().indexOf(q) >= 0
        || (u.email || '').toLowerCase().indexOf(q) >= 0;
  });
  if (role) items = items.filter(function (u) { return u.role === role; });
  items = items.map(Auth_publicUser_);
  return { items: items, total: items.length };
}

function Users_get(user, id) {
  if (String(id) !== String(user.id)) Auth_requireCap(user, 'user.view_all');
  const u = DB_findById(SHEETS.USERS, id);
  if (!u) throw new Error('ไม่พบผู้ใช้');
  return Auth_publicUser_(u);
}

function Users_create(user, payload) {
  Auth_requireCap(user, 'user.manage');
  const username = String((payload && payload.username) || '').trim().toLowerCase();
  const password = String((payload && payload.password) || APP.DEFAULT_PASSWORD);
  if (!username) throw new Error('กรุณาระบุ username');
  // check duplicate
  const existing = DB_readAll(SHEETS.USERS);
  for (let i = 0; i < existing.length; i++) {
    if (String(existing[i].username || '').toLowerCase() === username) {
      throw new Error('username นี้ถูกใช้แล้ว');
    }
  }
  const salt = Auth_makeSalt_();
  const hash = Auth_hash_(password, salt);
  const obj = {
    username: username,
    password_hash: hash,
    salt: salt,
    full_name: String(payload.full_name || ''),
    email: String(payload.email || ''),
    role: String(payload.role || ROLES.TEACHER),
    subject_group: String(payload.subject_group || ''),
    phone: String(payload.phone || ''),
    avatar_url: String(payload.avatar_url || ''),
    telegram_chat_id: String(payload.telegram_chat_id || ''),
    active: true
  };
  const created = DB_insert(SHEETS.USERS, obj);
  Audit_log_(user, 'create', 'user', created.id, { username: created.username, role: created.role });
  return Auth_publicUser_(created);
}

function Users_update(user, payload) {
  const id = (payload && payload.id) || '';
  if (!id) throw new Error('Missing id');
  if (String(id) !== String(user.id)) Auth_requireCap(user, 'user.manage');
  const target = DB_findById(SHEETS.USERS, id);
  if (!target) throw new Error('ไม่พบผู้ใช้');
  const patch = {};
  ['full_name','email','phone','avatar_url','telegram_chat_id','subject_group'].forEach(function (k) {
    if (payload[k] !== undefined) patch[k] = String(payload[k] || '');
  });
  // role/active เปลี่ยนได้เฉพาะ admin
  if (hasCap_(user.role, 'user.manage')) {
    if (payload.role !== undefined) patch.role = String(payload.role);
    if (payload.active !== undefined) patch.active = _yes_(payload.active);
  }
  // reset password (admin)
  if (payload.reset_password && hasCap_(user.role, 'user.manage')) {
    const salt = Auth_makeSalt_();
    patch.salt = salt;
    patch.password_hash = Auth_hash_(APP.DEFAULT_PASSWORD, salt);
  }
  const updated = DB_update(SHEETS.USERS, id, patch);
  Audit_log_(user, 'update', 'user', id, patch);
  return Auth_publicUser_(updated);
}

function Users_delete(user, id) {
  Auth_requireCap(user, 'user.manage');
  if (String(id) === String(user.id)) throw new Error('ไม่สามารถลบบัญชีของตัวเอง');
  DB_update(SHEETS.USERS, id, { active: false });
  Audit_log_(user, 'delete', 'user', id);
  return { ok: true };
}
