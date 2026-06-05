/**
 * 06_Substitute.gs — Absence + Substitute teacher management
 * Smart matching algorithm:
 *   1. ครูว่าง (ไม่มีคาบใน period นั้น)
 *   2. ครูไม่ลาในวันนั้น
 *   3. priority: same subject > same group > nearest level > balanced load
 */

// ── Absence ───────────────────────────────────────────────────
function Absences_list(user, p) {
  p = p || {};
  let all = DB_readAll(SHEETS.ABSENCES);
  const status = String(p.status || '');
  const teacherId = String(p.teacher_id || '');
  const dateFrom = cfg_normDate_(p.date_from);
  const dateTo = cfg_normDate_(p.date_to);
  // RBAC
  if (!hasCap_(user.role, 'absence.view_group') && !hasCap_(user.role, 'absence.manage')) {
    // teacher → only own
    all = all.filter(function (a) { return String(a.teacher_id) === String(user.id); });
  }
  if (status) all = all.filter(function (a) { return a.status === status; });
  if (teacherId) all = all.filter(function (a) { return String(a.teacher_id) === teacherId; });
  if (dateFrom) all = all.filter(function (a) { return cfg_normDate_(a.date) >= dateFrom; });
  if (dateTo) all = all.filter(function (a) { return cfg_normDate_(a.date) <= dateTo; });
  // sort: date desc
  all.sort(function (a, b) {
    const da = cfg_normDate_(a.date), db = cfg_normDate_(b.date);
    return db.localeCompare(da);
  });
  // enrich
  const teachers = DB_index(SHEETS.USERS);
  all.forEach(function (a) {
    const t = teachers[String(a.teacher_id)];
    a._teacher_name = t ? (t.full_name || t.username) : '';
    a._teacher_role = t ? t.role : '';
    a._teacher_subject_group = t ? t.subject_group : '';
  });
  return { items: all, total: all.length };
}

function Absences_create(user, payload) {
  // teacher can create own; admin/academic can create for others
  const targetId = String(payload.teacher_id || user.id);
  if (String(targetId) !== String(user.id)) {
    Auth_requireCap(user, 'absence.manage');
  }
  if (!payload.date) throw new Error('กรุณาระบุวันที่');
  if (!payload.reason) throw new Error('กรุณาระบุสาเหตุ');
  const periods = String(payload.periods || 'all').trim();
  const obj = {
    teacher_id: targetId,
    date: cfg_normDate_(payload.date),
    periods: periods,
    reason: String(payload.reason),
    reason_detail: String(payload.reason_detail || ''),
    status: STATUS.ABSENCE_PENDING,
    note: String(payload.note || ''),
    approved_by: '',
    approved_at: ''
  };
  const c = DB_insert(SHEETS.ABSENCES, obj);
  Audit_log_(user, 'create', 'absence', c.id, obj);
  return c;
}

function Absences_update(user, payload) {
  if (!payload || !payload.id) throw new Error('Missing id');
  const target = DB_findById(SHEETS.ABSENCES, payload.id);
  if (!target) throw new Error('ไม่พบรายการลา');
  if (String(target.teacher_id) !== String(user.id)) {
    Auth_requireCap(user, 'absence.manage');
  }
  if (target.status !== STATUS.ABSENCE_PENDING) {
    throw new Error('รายการนี้ถูกอนุมัติแล้ว ไม่สามารถแก้ไข');
  }
  const patch = {};
  ['date','reason','reason_detail','periods','note'].forEach(function (k) {
    if (payload[k] !== undefined) patch[k] = String(payload[k] || '');
  });
  if (patch.date) patch.date = cfg_normDate_(patch.date);
  const u = DB_update(SHEETS.ABSENCES, payload.id, patch);
  Audit_log_(user, 'update', 'absence', payload.id, patch);
  return u;
}

function Absences_approve(user, p) {
  Auth_requireCap(user, 'absence.approve');
  const id = p && p.id;
  if (!id) throw new Error('Missing id');
  const target = DB_findById(SHEETS.ABSENCES, id);
  if (!target) throw new Error('ไม่พบรายการลา');
  if (target.status !== STATUS.ABSENCE_PENDING) throw new Error('รายการนี้ถูกดำเนินการแล้ว');
  const newStatus = p.action === 'reject' ? STATUS.ABSENCE_REJECTED : STATUS.ABSENCE_APPROVED;
  const patch = {
    status: newStatus,
    approved_by: user.id,
    approved_at: cfg_now_(),
    note: target.note + (p.note ? ('\n[' + (newStatus === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ') + '] ' + p.note) : '')
  };
  DB_update(SHEETS.ABSENCES, id, patch);
  Audit_log_(user, newStatus === 'approved' ? 'approve' : 'reject', 'absence', id);
  return { ok: true };
}

function Absences_delete(user, id) {
  const target = DB_findById(SHEETS.ABSENCES, id);
  if (!target) throw new Error('ไม่พบรายการ');
  if (String(target.teacher_id) !== String(user.id)) {
    Auth_requireCap(user, 'absence.manage');
  }
  // also cancel pending substitutions
  const subs = DB_readAll(SHEETS.SUBSTITUTES).filter(function (s) {
    return String(s.absence_id) === String(id) && s.status === STATUS.SUB_ASSIGNED;
  });
  subs.forEach(function (s) {
    DB_update(SHEETS.SUBSTITUTES, s.id, { status: STATUS.SUB_CANCELLED });
  });
  DB_hardDelete(SHEETS.ABSENCES, id);
  Audit_log_(user, 'delete', 'absence', id);
  return { ok: true };
}

// ── Get affected schedule entries from absence ────────────────
function _periodsArr_(periodsStr) {
  if (!periodsStr || periodsStr === 'all') return null;  // null = all
  return String(periodsStr).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function Absences_affectedSchedule(user, p) {
  // p: { absence_id }  or  { date, teacher_id, periods }
  let teacherId, dateStr, periodIds;
  if (p.absence_id) {
    const a = DB_findById(SHEETS.ABSENCES, p.absence_id);
    if (!a) throw new Error('ไม่พบรายการลา');
    teacherId = a.teacher_id;
    dateStr = cfg_normDate_(a.date);
    periodIds = _periodsArr_(a.periods);
  } else {
    teacherId = p.teacher_id;
    dateStr = cfg_normDate_(p.date);
    periodIds = _periodsArr_(p.periods || 'all');
  }
  // determine day of week
  const d = new Date(dateStr + 'T00:00:00+07:00');
  const dayOfWeek = d.getDay();  // 0=Sun ... 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) return { items: [], date: dateStr, day: dayOfWeek };
  const dayId = dayOfWeek;  // 1=Mon ... 5=Fri (matches our DAYS)
  // current term/year — get from settings or default
  const all = DB_readAll(SHEETS.SCHEDULE).filter(function (s) {
    if (!_yes_(s.active)) return false;
    if (String(s.teacher_id) !== String(teacherId)) return false;
    if (Number(s.day) !== dayId) return false;
    if (periodIds && periodIds.indexOf(String(s.period_id)) < 0) return false;
    return true;
  });
  return { items: all, date: dateStr, day: dayId };
}

// ── Smart match candidates ────────────────────────────────────
function Substitute_candidates(user, p) {
  // p: { schedule_id, date }
  const sched = DB_findById(SHEETS.SCHEDULE, p.schedule_id);
  if (!sched) throw new Error('ไม่พบคาบเรียน');
  const dateStr = cfg_normDate_(p.date);
  const d = new Date(dateStr + 'T00:00:00+07:00');
  const dayId = d.getDay();
  if (dayId === 0 || dayId === 6) throw new Error('วันที่เลือกเป็นวันหยุด');
  // ครูที่ active (teacher / head / academic)
  const allUsers = DB_readAll(SHEETS.USERS).filter(function (u) {
    return _yes_(u.active) && (u.role === ROLES.TEACHER || u.role === ROLES.HEAD || u.role === ROLES.ACADEMIC)
        && String(u.id) !== String(sched.teacher_id);
  });
  // คาบที่ครูแต่ละคนสอนในวันนี้ + period นี้
  const allSched = DB_readAll(SHEETS.SCHEDULE).filter(function (s) {
    return _yes_(s.active) && Number(s.day) === dayId && String(s.period_id) === String(sched.period_id);
  });
  const busyMap = {};
  allSched.forEach(function (s) { busyMap[String(s.teacher_id)] = s; });
  // ครูที่ลาในวันนี้
  const absences = DB_readAll(SHEETS.ABSENCES).filter(function (a) {
    return cfg_normDate_(a.date) === dateStr && a.status !== STATUS.ABSENCE_REJECTED;
  });
  const absentMap = {};
  absences.forEach(function (a) {
    const periods = _periodsArr_(a.periods);
    if (!periods || periods.indexOf(String(sched.period_id)) >= 0) {
      absentMap[String(a.teacher_id)] = true;
    }
  });
  // ครูที่ถูกมอบหมายสอนแทนแล้วใน period นี้
  const assignedToday = DB_readAll(SHEETS.SUBSTITUTES).filter(function (s) {
    return cfg_normDate_(s.date) === dateStr && String(s.period_id) === String(sched.period_id)
        && (s.status === STATUS.SUB_ASSIGNED || s.status === STATUS.SUB_COMPLETED);
  });
  const assignedMap = {};
  assignedToday.forEach(function (s) { assignedMap[String(s.substitute_teacher_id)] = s; });
  // นับโหลดสอนแทนของแต่ละครูในเดือนนี้ (สำหรับ balance)
  const monthStart = dateStr.substring(0, 7);
  const monthSubs = DB_readAll(SHEETS.SUBSTITUTES).filter(function (s) {
    return cfg_normDate_(s.date).indexOf(monthStart) === 0
        && (s.status === STATUS.SUB_ASSIGNED || s.status === STATUS.SUB_COMPLETED);
  });
  const loadMap = {};
  monthSubs.forEach(function (s) {
    const tid = String(s.substitute_teacher_id);
    loadMap[tid] = (loadMap[tid] || 0) + 1;
  });
  // get original subject + class
  const subj = DB_findById(SHEETS.SUBJECTS, sched.subject_id);
  const cls = DB_findById(SHEETS.CLASSES, sched.class_id);
  const originalTeacher = DB_findById(SHEETS.USERS, sched.teacher_id);
  // build candidates with score
  const candidates = [];
  allUsers.forEach(function (u) {
    const tid = String(u.id);
    let available = true;
    let reason = '';
    if (busyMap[tid]) { available = false; reason = 'ติดสอน'; }
    else if (absentMap[tid]) { available = false; reason = 'ลา'; }
    else if (assignedMap[tid]) { available = false; reason = 'ถูกมอบหมายแล้ว'; }
    let score = 0;
    let matchTags = [];
    // same subject group
    if (subj && u.subject_group && subj.subject_group && u.subject_group === subj.subject_group) {
      score += 50;
      matchTags.push('กลุ่มสาระเดียวกัน');
    }
    // same as original teacher's group
    if (originalTeacher && u.subject_group && originalTeacher.subject_group && u.subject_group === originalTeacher.subject_group) {
      score += 20;
      matchTags.push('กลุ่มสาระตรงกับครูเจ้าของ');
    }
    // load balance: less load = higher score
    const load = loadMap[tid] || 0;
    score += Math.max(0, 30 - load * 3);
    candidates.push({
      teacher_id: u.id,
      full_name: u.full_name || u.username,
      username: u.username,
      role: u.role,
      subject_group: u.subject_group,
      avatar_url: u.avatar_url,
      available: available,
      reason: reason,
      score: score,
      load_this_month: load,
      match_tags: matchTags
    });
  });
  // sort: available first, then by score desc, then by load asc
  candidates.sort(function (a, b) {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.load_this_month - b.load_this_month;
  });
  return {
    schedule: sched,
    subject: subj,
    class: cls,
    original_teacher: originalTeacher ? Auth_publicUser_(originalTeacher) : null,
    candidates: candidates,
    date: dateStr,
    day: dayId
  };
}

// ── Substitute CRUD ───────────────────────────────────────────
function Substitutes_list(user, p) {
  p = p || {};
  let all = DB_readAll(SHEETS.SUBSTITUTES);
  const status = String(p.status || '');
  const dateFrom = cfg_normDate_(p.date_from);
  const dateTo = cfg_normDate_(p.date_to);
  const subTeacher = String(p.substitute_teacher_id || '');
  // RBAC
  if (!hasCap_(user.role, 'substitute.view_all') && !hasCap_(user.role, 'substitute.manage')) {
    all = all.filter(function (s) {
      return String(s.substitute_teacher_id) === String(user.id) || String(s.original_teacher_id) === String(user.id);
    });
  }
  if (status) all = all.filter(function (s) { return s.status === status; });
  if (dateFrom) all = all.filter(function (s) { return cfg_normDate_(s.date) >= dateFrom; });
  if (dateTo) all = all.filter(function (s) { return cfg_normDate_(s.date) <= dateTo; });
  if (subTeacher) all = all.filter(function (s) { return String(s.substitute_teacher_id) === subTeacher; });
  // sort
  all.sort(function (a, b) {
    const da = cfg_normDate_(a.date), db = cfg_normDate_(b.date);
    if (da !== db) return db.localeCompare(da);
    return Number(a.period_id) - Number(b.period_id);
  });
  // enrich
  const teachers = DB_index(SHEETS.USERS);
  const subjects = DB_index(SHEETS.SUBJECTS);
  const classes = DB_index(SHEETS.CLASSES);
  const rooms = DB_index(SHEETS.ROOMS);
  const periods = DB_index(SHEETS.PERIODS);
  all.forEach(function (s) {
    const ot = teachers[String(s.original_teacher_id)];
    const st = teachers[String(s.substitute_teacher_id)];
    const sj = subjects[String(s.subject_id)];
    const cl = classes[String(s.class_id)];
    const rm = rooms[String(s.room_id)];
    const pr = periods[String(s.period_id)];
    s._original_teacher_name = ot ? (ot.full_name || ot.username) : '';
    s._substitute_teacher_name = st ? (st.full_name || st.username) : '';
    s._substitute_avatar = st ? st.avatar_url : '';
    s._subject_name = sj ? sj.name : '';
    s._subject_code = sj ? sj.code : '';
    s._subject_color = sj ? sj.color : '';
    s._class_level = cl ? cl.level : '';
    s._room_code = rm ? rm.code : '';
    s._period_no = pr ? pr.no : '';
    s._period_name = pr ? pr.name : '';
    s._period_time = pr ? (pr.start_time + '-' + pr.end_time) : '';
  });
  return { items: all, total: all.length };
}

function Substitutes_assign(user, p) {
  Auth_requireCap(user, 'substitute.manage');
  // p: { absence_id, schedule_id, substitute_teacher_id, date, room_id?, note? }
  if (!p.schedule_id || !p.substitute_teacher_id || !p.date) throw new Error('กรอกข้อมูลให้ครบ');
  const sched = DB_findById(SHEETS.SCHEDULE, p.schedule_id);
  if (!sched) throw new Error('ไม่พบคาบเรียน');
  // check duplicate
  const dateStr = cfg_normDate_(p.date);
  const dup = DB_readAll(SHEETS.SUBSTITUTES).filter(function (s) {
    return cfg_normDate_(s.date) === dateStr
        && String(s.schedule_id) === String(p.schedule_id)
        && (s.status === STATUS.SUB_ASSIGNED || s.status === STATUS.SUB_COMPLETED);
  });
  if (dup.length > 0) throw new Error('คาบนี้มีการมอบหมายแล้ว');
  const obj = {
    absence_id: String(p.absence_id || ''),
    schedule_id: String(p.schedule_id),
    date: dateStr,
    period_id: String(sched.period_id),
    class_id: String(sched.class_id),
    subject_id: String(sched.subject_id),
    original_teacher_id: String(sched.teacher_id),
    substitute_teacher_id: String(p.substitute_teacher_id),
    room_id: String(p.room_id || sched.room_id || ''),
    status: STATUS.SUB_ASSIGNED,
    note: String(p.note || ''),
    assigned_by: user.id,
    assigned_at: cfg_now_(),
    completed_at: ''
  };
  const c = DB_insert(SHEETS.SUBSTITUTES, obj);
  Audit_log_(user, 'assign', 'substitute', c.id, obj);
  // notify
  try { Notify_substitute_(c); } catch (e) {}
  return c;
}

function Substitutes_autoAssign(user, p) {
  // p: { absence_id }  → auto-assign best candidate for each affected schedule
  Auth_requireCap(user, 'substitute.manage');
  if (!p.absence_id) throw new Error('Missing absence_id');
  const aff = Absences_affectedSchedule(user, { absence_id: p.absence_id });
  const results = [];
  aff.items.forEach(function (sched) {
    try {
      const c = Substitute_candidates(user, { schedule_id: sched.id, date: aff.date });
      const best = c.candidates.filter(function (cd) { return cd.available; })[0];
      if (best) {
        const r = Substitutes_assign(user, {
          absence_id: p.absence_id,
          schedule_id: sched.id,
          substitute_teacher_id: best.teacher_id,
          date: aff.date,
          note: 'จัดอัตโนมัติ'
        });
        results.push({ schedule_id: sched.id, ok: true, substitute: r });
      } else {
        results.push({ schedule_id: sched.id, ok: false, error: 'ไม่พบครูว่าง' });
      }
    } catch (e) {
      results.push({ schedule_id: sched.id, ok: false, error: String(e.message || e) });
    }
  });
  return { results: results, total: results.length, assigned: results.filter(function (r) { return r.ok; }).length };
}

function Substitutes_complete(user, id) {
  const target = DB_findById(SHEETS.SUBSTITUTES, id);
  if (!target) throw new Error('ไม่พบรายการ');
  if (String(target.substitute_teacher_id) !== String(user.id) && !hasCap_(user.role, 'substitute.manage')) {
    throw new Error('ไม่มีสิทธิ์');
  }
  DB_update(SHEETS.SUBSTITUTES, id, {
    status: STATUS.SUB_COMPLETED,
    completed_at: cfg_now_()
  });
  Audit_log_(user, 'complete', 'substitute', id);
  return { ok: true };
}

function Substitutes_cancel(user, id) {
  Auth_requireCap(user, 'substitute.manage');
  DB_update(SHEETS.SUBSTITUTES, id, { status: STATUS.SUB_CANCELLED });
  Audit_log_(user, 'cancel', 'substitute', id);
  return { ok: true };
}

function Substitutes_delete(user, id) {
  Auth_requireCap(user, 'substitute.manage');
  DB_hardDelete(SHEETS.SUBSTITUTES, id);
  Audit_log_(user, 'delete', 'substitute', id);
  return { ok: true };
}

// ── Notification (best-effort, swallowed) ─────────────────────
function Notify_substitute_(sub) {
  try {
    const tch = DB_findById(SHEETS.USERS, sub.substitute_teacher_id);
    if (!tch || !tch.telegram_chat_id) return;
    const cfg = Settings_map_();
    if (!cfg.tg_token || cfg.tg_enabled !== 'yes') return;
    const subj = DB_findById(SHEETS.SUBJECTS, sub.subject_id);
    const cls = DB_findById(SHEETS.CLASSES, sub.class_id);
    const pr = DB_findById(SHEETS.PERIODS, sub.period_id);
    const text = '<b>📋 คุณได้รับมอบหมายสอนแทน</b>\n'
      + '━━━━━━━━━━━━━━━━━\n'
      + 'วันที่: ' + sub.date + '\n'
      + 'คาบที่: ' + (pr ? pr.no : '') + ' (' + (pr ? pr.start_time + '-' + pr.end_time : '') + ')\n'
      + 'ชั้น: ' + (cls ? cls.level : '') + '\n'
      + 'วิชา: ' + (subj ? (subj.code + ' ' + subj.name) : '') + '\n'
      + (sub.note ? ('หมายเหตุ: ' + sub.note + '\n') : '')
      + '━━━━━━━━━━━━━━━━━\n'
      + '🌐 ' + APP.NAME;
    UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.tg_token + '/sendMessage', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ chat_id: String(tch.telegram_chat_id), text: text, parse_mode: 'HTML' }),
      muteHttpExceptions: true
    });
  } catch (e) {}
}
