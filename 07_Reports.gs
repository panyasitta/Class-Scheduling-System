/**
 * 07_Reports.gs — Dashboard + Reports
 * Single-scan O(n) for performance at scale
 */

function Dashboard_stats(user, p) {
  p = p || {};
  const range = Number(p.range_days || 30);
  const today = new Date();
  today.setHours(0,0,0,0);
  const fromDate = new Date(today.getTime() - range * 86400000);
  const fromStr = cfg_dateOnly_(fromDate);
  const todayStr = cfg_dateOnly_(today);

  const allSched = DB_readAll(SHEETS.SCHEDULE).filter(function (s) { return _yes_(s.active); });
  const allAbs = DB_readAll(SHEETS.ABSENCES);
  const allSub = DB_readAll(SHEETS.SUBSTITUTES);
  const allUsers = DB_readAll(SHEETS.USERS).filter(function (u) { return _yes_(u.active); });
  const teachers = allUsers.filter(function (u) { return u.role === ROLES.TEACHER || u.role === ROLES.HEAD; });

  // teacher loading
  const teacherLoad = {};
  allSched.forEach(function (s) {
    const tid = String(s.teacher_id);
    teacherLoad[tid] = (teacherLoad[tid] || 0) + 1;
  });

  // absence stats (range)
  const recentAbs = allAbs.filter(function (a) {
    const d = cfg_normDate_(a.date);
    return d >= fromStr && d <= todayStr;
  });
  const absByStatus = { pending: 0, approved: 0, rejected: 0 };
  recentAbs.forEach(function (a) { absByStatus[a.status] = (absByStatus[a.status] || 0) + 1; });

  // substitution stats (range)
  const recentSub = allSub.filter(function (s) {
    const d = cfg_normDate_(s.date);
    return d >= fromStr && d <= todayStr;
  });
  const subByStatus = { assigned: 0, completed: 0, cancelled: 0 };
  recentSub.forEach(function (s) { subByStatus[s.status] = (subByStatus[s.status] || 0) + 1; });

  // today's absences
  const todayAbs = allAbs.filter(function (a) {
    return cfg_normDate_(a.date) === todayStr && a.status !== STATUS.ABSENCE_REJECTED;
  });

  // today's substitutions
  const todaySub = allSub.filter(function (s) {
    return cfg_normDate_(s.date) === todayStr && s.status !== STATUS.SUB_CANCELLED;
  });

  // pending absence count
  const pendingAbs = allAbs.filter(function (a) { return a.status === STATUS.ABSENCE_PENDING; }).length;

  // trend 14 days (substitutions)
  const trendDays = 14;
  const trend = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const ds = cfg_dateOnly_(d);
    const cAbs = allAbs.filter(function (a) { return cfg_normDate_(a.date) === ds && a.status !== STATUS.ABSENCE_REJECTED; }).length;
    const cSub = allSub.filter(function (s) { return cfg_normDate_(s.date) === ds && s.status !== STATUS.SUB_CANCELLED; }).length;
    trend.push({ date: ds, absences: cAbs, substitutes: cSub });
  }

  // top substitute teachers (range)
  const subLoad = {};
  recentSub.forEach(function (s) {
    if (s.status === STATUS.SUB_CANCELLED) return;
    const tid = String(s.substitute_teacher_id);
    subLoad[tid] = (subLoad[tid] || 0) + 1;
  });
  const userIdx = DB_index(SHEETS.USERS);
  const topSubs = Object.keys(subLoad).map(function (tid) {
    const u = userIdx[tid];
    return {
      teacher_id: tid,
      full_name: u ? (u.full_name || u.username) : '(ไม่ทราบ)',
      avatar_url: u ? u.avatar_url : '',
      subject_group: u ? u.subject_group : '',
      count: subLoad[tid]
    };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);

  // top absent teachers
  const absLoad = {};
  recentAbs.forEach(function (a) {
    if (a.status === STATUS.ABSENCE_REJECTED) return;
    const tid = String(a.teacher_id);
    absLoad[tid] = (absLoad[tid] || 0) + 1;
  });
  const topAbs = Object.keys(absLoad).map(function (tid) {
    const u = userIdx[tid];
    return {
      teacher_id: tid,
      full_name: u ? (u.full_name || u.username) : '(ไม่ทราบ)',
      avatar_url: u ? u.avatar_url : '',
      subject_group: u ? u.subject_group : '',
      count: absLoad[tid]
    };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);

  // by subject group
  const subjectIdx = DB_index(SHEETS.SUBJECTS);
  const groupLoad = {};
  allSched.forEach(function (s) {
    const sj = subjectIdx[String(s.subject_id)];
    if (!sj) return;
    const g = sj.subject_group || 'other';
    groupLoad[g] = (groupLoad[g] || 0) + 1;
  });

  // teacher own schedule today
  let mySchedToday = [];
  if (user.role === ROLES.TEACHER || user.role === ROLES.HEAD || user.role === ROLES.ACADEMIC) {
    const dayId = today.getDay();
    if (dayId >= 1 && dayId <= 5) {
      mySchedToday = allSched.filter(function (s) {
        return Number(s.day) === dayId && String(s.teacher_id) === String(user.id);
      });
    }
  }

  return {
    total_schedule: allSched.length,
    total_teachers: teachers.length,
    total_users: allUsers.length,
    today_absences: todayAbs.length,
    today_substitutes: todaySub.length,
    pending_absences: pendingAbs,
    range_days: range,
    abs_by_status: absByStatus,
    sub_by_status: subByStatus,
    trend: trend,
    top_substitutes: topSubs,
    top_absent: topAbs,
    by_subject_group: groupLoad,
    my_schedule_today: mySchedToday,
    today_str: todayStr
  };
}

// ── Teacher report (per-teacher) ──────────────────────────────
function Reports_teacher(user, p) {
  const tid = String((p && p.teacher_id) || user.id);
  if (String(tid) !== String(user.id)) Auth_requireCap(user, 'report.view_all');
  const teacher = DB_findById(SHEETS.USERS, tid);
  if (!teacher) throw new Error('ไม่พบครู');
  const allSched = DB_readAll(SHEETS.SCHEDULE).filter(function (s) {
    return _yes_(s.active) && String(s.teacher_id) === tid;
  });
  const allAbs = DB_readAll(SHEETS.ABSENCES).filter(function (a) {
    return String(a.teacher_id) === tid && a.status !== STATUS.ABSENCE_REJECTED;
  });
  const allSubAsSub = DB_readAll(SHEETS.SUBSTITUTES).filter(function (s) {
    return String(s.substitute_teacher_id) === tid && s.status !== STATUS.SUB_CANCELLED;
  });
  // periods per day (load)
  const dayLoad = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  allSched.forEach(function (s) { dayLoad[Number(s.day)] = (dayLoad[Number(s.day)] || 0) + 1; });
  // by subject
  const subjectIdx = DB_index(SHEETS.SUBJECTS);
  const subjMap = {};
  allSched.forEach(function (s) {
    const sj = subjectIdx[String(s.subject_id)];
    const k = sj ? (sj.code + ' ' + sj.name) : '(ไม่ทราบ)';
    subjMap[k] = (subjMap[k] || 0) + 1;
  });
  return {
    teacher: Auth_publicUser_(teacher),
    total_periods: allSched.length,
    total_absences: allAbs.length,
    total_substitutes_done: allSubAsSub.length,
    day_load: dayLoad,
    by_subject: subjMap,
    schedule: allSched
  };
}

// ── Audit log ─────────────────────────────────────────────────
function Audit_list(user, p) {
  Auth_requireCap(user, 'audit.view');
  p = p || {};
  let all = DB_readAll(SHEETS.AUDIT);
  // sort desc
  all.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  const limit = Number(p.limit || 200);
  return { items: all.slice(0, limit), total: all.length };
}
