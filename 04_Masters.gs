/**
 * 04_Masters.gs — Master data: Subjects, Classes, Rooms, Periods
 */

// ── Subjects ──────────────────────────────────────────────────
function Subjects_list(user) {
  return DB_readAll(SHEETS.SUBJECTS).filter(function (s) { return _yes_(s.active); });
}
function Subjects_create(user, p) {
  Auth_requireCap(user, 'subject.manage');
  if (!p || !p.code || !p.name) throw new Error('กรุณาระบุรหัสและชื่อวิชา');
  const obj = {
    code: String(p.code).trim(),
    name: String(p.name).trim(),
    subject_group: String(p.subject_group || ''),
    credits: Number(p.credits || 0),
    color: String(p.color || ''),
    active: true
  };
  const c = DB_insert(SHEETS.SUBJECTS, obj);
  Audit_log_(user, 'create', 'subject', c.id, obj);
  return c;
}
function Subjects_update(user, p) {
  Auth_requireCap(user, 'subject.manage');
  const patch = {};
  ['code','name','subject_group','color'].forEach(function (k) {
    if (p[k] !== undefined) patch[k] = String(p[k] || '');
  });
  if (p.credits !== undefined) patch.credits = Number(p.credits || 0);
  if (p.active !== undefined) patch.active = _yes_(p.active);
  const u = DB_update(SHEETS.SUBJECTS, p.id, patch);
  Audit_log_(user, 'update', 'subject', p.id, patch);
  return u;
}
function Subjects_delete(user, id) {
  Auth_requireCap(user, 'subject.manage');
  DB_update(SHEETS.SUBJECTS, id, { active: false });
  Audit_log_(user, 'delete', 'subject', id);
  return { ok: true };
}

// ── Classes ───────────────────────────────────────────────────
function Classes_list(user) {
  return DB_readAll(SHEETS.CLASSES).filter(function (c) { return _yes_(c.active); });
}
function Classes_create(user, p) {
  Auth_requireCap(user, 'class.manage');
  if (!p || !p.level) throw new Error('กรุณาระบุระดับชั้น');
  const obj = {
    level: String(p.level).trim(),
    room: String(p.room || ''),
    homeroom_teacher_id: String(p.homeroom_teacher_id || ''),
    student_count: Number(p.student_count || 0),
    active: true
  };
  const c = DB_insert(SHEETS.CLASSES, obj);
  Audit_log_(user, 'create', 'class', c.id, obj);
  return c;
}
function Classes_update(user, p) {
  Auth_requireCap(user, 'class.manage');
  const patch = {};
  ['level','room','homeroom_teacher_id'].forEach(function (k) {
    if (p[k] !== undefined) patch[k] = String(p[k] || '');
  });
  if (p.student_count !== undefined) patch.student_count = Number(p.student_count || 0);
  if (p.active !== undefined) patch.active = _yes_(p.active);
  const u = DB_update(SHEETS.CLASSES, p.id, patch);
  Audit_log_(user, 'update', 'class', p.id, patch);
  return u;
}
function Classes_delete(user, id) {
  Auth_requireCap(user, 'class.manage');
  DB_update(SHEETS.CLASSES, id, { active: false });
  return { ok: true };
}

// ── Rooms ─────────────────────────────────────────────────────
function Rooms_list(user) {
  return DB_readAll(SHEETS.ROOMS).filter(function (r) { return _yes_(r.active); });
}
function Rooms_create(user, p) {
  Auth_requireCap(user, 'room.manage');
  if (!p || !p.code || !p.name) throw new Error('กรุณาระบุรหัสและชื่อห้อง');
  const obj = {
    code: String(p.code).trim(),
    name: String(p.name).trim(),
    building: String(p.building || ''),
    floor: String(p.floor || ''),
    capacity: Number(p.capacity || 0),
    type: String(p.type || 'general'),
    active: true
  };
  const c = DB_insert(SHEETS.ROOMS, obj);
  Audit_log_(user, 'create', 'room', c.id, obj);
  return c;
}
function Rooms_update(user, p) {
  Auth_requireCap(user, 'room.manage');
  const patch = {};
  ['code','name','building','floor','type'].forEach(function (k) {
    if (p[k] !== undefined) patch[k] = String(p[k] || '');
  });
  if (p.capacity !== undefined) patch.capacity = Number(p.capacity || 0);
  if (p.active !== undefined) patch.active = _yes_(p.active);
  const u = DB_update(SHEETS.ROOMS, p.id, patch);
  Audit_log_(user, 'update', 'room', p.id, patch);
  return u;
}
function Rooms_delete(user, id) {
  Auth_requireCap(user, 'room.manage');
  DB_update(SHEETS.ROOMS, id, { active: false });
  return { ok: true };
}

// ── Periods ───────────────────────────────────────────────────
function Periods_list(user) {
  const all = DB_readAll(SHEETS.PERIODS).filter(function (p) { return _yes_(p.active); });
  // sort by no
  all.sort(function (a, b) { return Number(a.no || 0) - Number(b.no || 0); });
  return all;
}
function Periods_create(user, p) {
  Auth_requireCap(user, 'period.manage');
  if (!p || !p.no) throw new Error('กรุณาระบุลำดับคาบ');
  const obj = {
    no: Number(p.no),
    name: String(p.name || ('คาบ ' + p.no)),
    start_time: String(p.start_time || ''),
    end_time: String(p.end_time || ''),
    is_break: _yes_(p.is_break) ? 'yes' : 'no',
    active: true
  };
  const c = DB_insert(SHEETS.PERIODS, obj);
  Audit_log_(user, 'create', 'period', c.id, obj);
  return c;
}
function Periods_update(user, p) {
  Auth_requireCap(user, 'period.manage');
  const patch = {};
  ['name','start_time','end_time'].forEach(function (k) {
    if (p[k] !== undefined) patch[k] = String(p[k] || '');
  });
  if (p.no !== undefined) patch.no = Number(p.no);
  if (p.is_break !== undefined) patch.is_break = _yes_(p.is_break) ? 'yes' : 'no';
  if (p.active !== undefined) patch.active = _yes_(p.active);
  const u = DB_update(SHEETS.PERIODS, p.id, patch);
  Audit_log_(user, 'update', 'period', p.id, patch);
  return u;
}
function Periods_delete(user, id) {
  Auth_requireCap(user, 'period.manage');
  DB_update(SHEETS.PERIODS, id, { active: false });
  return { ok: true };
}

/**
 * Migration helper: insert lunch break period between morning and afternoon
 * Auto-detects insertion point from existing periods.
 * Returns { ok, message, period? }
 */
function Periods_addLunchBreak(user, payload) {
  Auth_requireCap(user, 'period.manage');
  payload = payload || {};
  const all = DB_readAll(SHEETS.PERIODS).filter(function (p) { return _yes_(p.active); });
  // already has a break?
  const existing = all.filter(function (p) { return _yes_(p.is_break); });
  if (existing.length > 0 && !payload.force) {
    return { ok: false, message: 'มีคาบพักอยู่แล้ว ' + existing.length + ' รายการ', existing: existing };
  }
  // Sort and find midpoint
  all.sort(function (a, b) { return Number(a.no) - Number(b.no); });
  const teachingPeriods = all.filter(function (p) { return !_yes_(p.is_break); });
  if (teachingPeriods.length < 2) {
    return { ok: false, message: 'ต้องมีคาบเรียนอย่างน้อย 2 คาบก่อน' };
  }
  // Default position: midpoint of teaching periods
  const mid = Math.floor(teachingPeriods.length / 2);
  const before = teachingPeriods[mid - 1];   // last morning period
  const after = teachingPeriods[mid];        // first afternoon period
  // Insertion no = halfway between before.no and after.no (use decimal)
  const newNo = (Number(before.no) + Number(after.no)) / 2;
  // Time: between before.end_time and after.start_time
  const startTime = String(payload.start_time || before.end_time || '12:10');
  const endTime = String(payload.end_time || after.start_time || '13:00');
  const obj = {
    no: newNo,
    name: String(payload.name || 'พักเที่ยง'),
    start_time: startTime,
    end_time: endTime,
    is_break: 'yes',
    active: true
  };
  const created = DB_insert(SHEETS.PERIODS, obj);
  Audit_log_(user, 'add_lunch_break', 'period', created.id, obj);
  return { ok: true, message: 'เพิ่มคาบพักเที่ยง (' + startTime + '-' + endTime + ') เรียบร้อย', period: created };
}

// ── Master bundle (single round-trip) ─────────────────────────
function Masters_bundle(user) {
  return {
    subjects: Subjects_list(user),
    classes:  Classes_list(user),
    rooms:    Rooms_list(user),
    periods:  Periods_list(user),
    teachers: DB_readAll(SHEETS.USERS).filter(function (u) {
      return _yes_(u.active) && (u.role === ROLES.TEACHER || u.role === ROLES.HEAD || u.role === ROLES.ACADEMIC);
    }).map(function (u) {
      return {
        id: u.id, username: u.username, full_name: u.full_name,
        role: u.role, subject_group: u.subject_group,
        avatar_url: u.avatar_url, phone: u.phone
      };
    }),
    subject_groups: SUBJECT_GROUPS,
    days: DAYS
  };
}
