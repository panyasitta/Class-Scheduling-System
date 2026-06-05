/**
 * 05_Schedule.gs — Schedule CRUD + Conflict detection + Grid build
 */

function _scheduleQuery_(p) {
  p = p || {};
  const term = p.term ? String(p.term) : '';
  const year = p.year ? String(p.year) : '';
  return DB_readAll(SHEETS.SCHEDULE).filter(function (s) {
    if (!_yes_(s.active)) return false;
    if (term && String(s.term) !== term) return false;
    if (year && String(s.year) !== year) return false;
    return true;
  });
}

function Schedule_grid(user, p) {
  // p: { term, year, view: 'class'|'teacher'|'room', target_id }
  p = p || {};
  const view = String(p.view || 'class');
  const targetId = String(p.target_id || '');
  // RBAC: teacher → restrict to own
  if (user.role === ROLES.TEACHER && view === 'teacher' && targetId && String(targetId) !== String(user.id)) {
    // teachers can still view other teachers' schedule (read-only)
  }
  const all = _scheduleQuery_(p);
  let items = all;
  if (targetId) {
    if (view === 'class') items = items.filter(function (s) { return String(s.class_id) === targetId; });
    else if (view === 'teacher') items = items.filter(function (s) { return String(s.teacher_id) === targetId; });
    else if (view === 'room') items = items.filter(function (s) { return String(s.room_id) === targetId; });
  }
  // build grid: day × period
  const periods = Periods_list(user);
  const grid = {};
  DAYS.forEach(function (d) {
    grid[d.id] = {};
    periods.forEach(function (pr) { grid[d.id][pr.id] = []; });
  });
  items.forEach(function (s) {
    const day = Number(s.day);
    const pid = String(s.period_id);
    if (grid[day] && grid[day][pid]) grid[day][pid].push(s);
  });
  return {
    grid: grid,
    items: items,
    periods: periods,
    days: DAYS,
    total: items.length
  };
}

function Schedule_listAll(user, p) {
  return _scheduleQuery_(p);
}

function _detectConflicts_(payload, excludeId) {
  // payload: { term, year, day, period_id, class_id, teacher_id, room_id }
  const all = _scheduleQuery_({ term: payload.term, year: payload.year });
  const day = Number(payload.day);
  const pid = String(payload.period_id);
  const conflicts = [];
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (excludeId && String(s.id) === String(excludeId)) continue;
    if (Number(s.day) !== day) continue;
    if (String(s.period_id) !== pid) continue;
    if (payload.teacher_id && String(s.teacher_id) === String(payload.teacher_id)) {
      conflicts.push({ type: 'teacher', schedule: s });
    }
    if (payload.class_id && String(s.class_id) === String(payload.class_id)) {
      conflicts.push({ type: 'class', schedule: s });
    }
    if (payload.room_id && String(s.room_id) === String(payload.room_id)) {
      conflicts.push({ type: 'room', schedule: s });
    }
  }
  return conflicts;
}

function Schedule_checkConflict(user, payload) {
  Auth_requireCap(user, 'schedule.manage');
  return { conflicts: _detectConflicts_(payload, payload.id) };
}

function Schedule_create(user, payload) {
  Auth_requireCap(user, 'schedule.manage');
  if (!payload || !payload.day || !payload.period_id || !payload.class_id || !payload.subject_id || !payload.teacher_id) {
    throw new Error('กรอกข้อมูลให้ครบถ้วน (วัน/คาบ/ชั้น/วิชา/ครู)');
  }
  // Reject scheduling on break periods (e.g. lunch)
  const period = DB_findById(SHEETS.PERIODS, payload.period_id);
  if (period && _yes_(period.is_break)) {
    throw new Error('ไม่สามารถจัดคาบเรียนในช่วง "' + (period.name || 'พัก') + '" ได้');
  }
  const conflicts = _detectConflicts_(payload, null);
  if (conflicts.length > 0 && !payload.force) {
    return { ok: false, conflicts: conflicts };
  }
  const obj = {
    term: String(payload.term || '1'),
    year: String(payload.year || new Date().getFullYear()),
    day: Number(payload.day),
    period_id: String(payload.period_id),
    class_id: String(payload.class_id),
    subject_id: String(payload.subject_id),
    teacher_id: String(payload.teacher_id),
    room_id: String(payload.room_id || ''),
    note: String(payload.note || ''),
    active: true
  };
  const c = DB_insert(SHEETS.SCHEDULE, obj);
  Audit_log_(user, 'create', 'schedule', c.id, obj);
  return { ok: true, item: c };
}

function Schedule_update(user, payload) {
  Auth_requireCap(user, 'schedule.manage');
  if (!payload || !payload.id) throw new Error('Missing id');
  // Reject moving onto break periods (lunch, etc.)
  if (payload.period_id) {
    const period = DB_findById(SHEETS.PERIODS, payload.period_id);
    if (period && _yes_(period.is_break)) {
      throw new Error('ไม่สามารถย้ายคาบเรียนไปช่วง "' + (period.name || 'พัก') + '" ได้');
    }
  }
  const conflicts = _detectConflicts_(payload, payload.id);
  if (conflicts.length > 0 && !payload.force) {
    return { ok: false, conflicts: conflicts };
  }
  const patch = {};
  ['day','period_id','class_id','subject_id','teacher_id','room_id','note','term','year'].forEach(function (k) {
    if (payload[k] !== undefined) patch[k] = String(payload[k]);
  });
  if (patch.day !== undefined) patch.day = Number(patch.day);
  const u = DB_update(SHEETS.SCHEDULE, payload.id, patch);
  Audit_log_(user, 'update', 'schedule', payload.id, patch);
  return { ok: true, item: u };
}

function Schedule_delete(user, id) {
  Auth_requireCap(user, 'schedule.manage');
  DB_update(SHEETS.SCHEDULE, id, { active: false });
  Audit_log_(user, 'delete', 'schedule', id);
  return { ok: true };
}

function Schedule_bulkClear(user, p) {
  Auth_requireCap(user, 'schedule.manage');
  const all = _scheduleQuery_(p);
  let n = 0;
  all.forEach(function (s) {
    DB_update(SHEETS.SCHEDULE, s.id, { active: false });
    n++;
  });
  Audit_log_(user, 'bulk_clear', 'schedule', '', { term: p.term, year: p.year, count: n });
  return { ok: true, count: n };
}
