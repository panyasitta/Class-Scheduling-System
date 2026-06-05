/**
 * 11_AutoSchedule.gs — AI-powered schedule generator
 *
 * Algorithm: Greedy CSP with weighted heuristics
 *   1. Build task list (class × subject × hours_needed)
 *   2. Sort by difficulty (fewest available teachers first)
 *   3. For each task, find best slot:
 *      - No teacher conflict (in same period)
 *      - No class conflict
 *      - No room conflict
 *      - Weighted score:
 *        + Avoid same subject 2× same day (-30 per repeat)
 *        + Prefer morning periods (+5 if no <= 4)
 *        + Teacher load balance (-0.5 per existing load)
 *        + Earlier days slight preference (-0.5 × day)
 *        + Avoid back-to-back same subject (-15)
 *   4. Bulk-insert all created records (1 round-trip)
 */

function AutoSchedule_defaults(user, p) {
  Auth_requireCap(user, 'schedule.manage');
  // Build smart-default matrix: hours per (class × subject)
  // Default: max(1, round(credits)) periods/week per subject for every class
  const subjects = DB_readAll(SHEETS.SUBJECTS).filter(function (s) { return _yes_(s.active); });
  const classes = DB_readAll(SHEETS.CLASSES).filter(function (c) { return _yes_(c.active); });
  const matrix = {};
  classes.forEach(function (c) {
    matrix[c.id] = {};
    subjects.forEach(function (s) {
      matrix[c.id][s.id] = Math.max(1, Math.round(Number(s.credits || 1)));
    });
  });
  // Hint: total periods per class per week
  const totalPerClass = {};
  Object.keys(matrix).forEach(function (cid) {
    totalPerClass[cid] = Object.values(matrix[cid]).reduce(function (a, b) { return a + Number(b); }, 0);
  });
  // Exclude break periods (lunch, etc.) — only teaching periods count toward max slots
  const periodsCount = DB_readAll(SHEETS.PERIODS).filter(function (p) {
    return _yes_(p.active) && !_yes_(p.is_break);
  }).length;
  const maxSlots = periodsCount * 5;  // 5 days × teaching periods
  return {
    matrix: matrix,
    classes: classes,
    subjects: subjects,
    total_per_class: totalPerClass,
    max_slots_per_class: maxSlots
  };
}

function AutoSchedule_generate(user, p) {
  Auth_requireCap(user, 'schedule.manage');
  if (!p || !p.matrix) throw new Error('กรุณาส่งตารางการจัดสอน');
  const term = String(p.term || '1');
  const year = String(p.year || (new Date().getFullYear() + 543));
  const lockExisting = !!p.lock_existing;
  const matrix = p.matrix;
  const startTime = Date.now();

  // ── Load context (single read each) ──
  // CRITICAL: Filter out break periods (lunch) — algorithm never assigns classes during breaks
  const periods = DB_readAll(SHEETS.PERIODS)
    .filter(function (p) { return _yes_(p.active) && !_yes_(p.is_break); })
    .sort(function (a, b) { return Number(a.no) - Number(b.no); });
  const teachers = DB_readAll(SHEETS.USERS).filter(function (u) {
    return _yes_(u.active) && (u.role === ROLES.TEACHER || u.role === ROLES.HEAD || u.role === ROLES.ACADEMIC);
  });
  const subjects = DB_readAll(SHEETS.SUBJECTS).filter(function (s) { return _yes_(s.active); });
  const rooms = DB_readAll(SHEETS.ROOMS).filter(function (r) { return _yes_(r.active); });
  const classes = DB_readAll(SHEETS.CLASSES).filter(function (c) { return _yes_(c.active); });

  if (!periods.length) throw new Error('ยังไม่มีคาบเรียน (ไม่นับคาบพัก) — กรุณาเพิ่มที่หน้า "คาบเรียน"');
  if (!teachers.length) throw new Error('ยังไม่มีครู');
  if (!subjects.length) throw new Error('ยังไม่มีวิชา');
  if (!classes.length) throw new Error('ยังไม่มีชั้นเรียน');

  // ── Existing schedule (term/year) ──
  const sh = DB_ensureSchema_(SHEETS.SCHEDULE);
  let existing = DB_readAll(SHEETS.SCHEDULE).filter(function (s) {
    return _yes_(s.active) && String(s.term) === term && String(s.year) === year;
  });
  let clearedCount = 0;
  if (!lockExisting && existing.length) {
    // Bulk soft-delete: set active='no' for those rows
    existing.forEach(function (e) {
      sh.getRange(e.__row, SCHEMAS.Schedule.indexOf('active') + 1).setValue('no');
    });
    clearedCount = existing.length;
    existing = [];
  }

  // ── Index lookups ──
  const subjectIdx = {};
  subjects.forEach(function (s) { subjectIdx[s.id] = s; });
  const teacherIdx = {};
  teachers.forEach(function (t) { teacherIdx[t.id] = t; });

  // teachers grouped by subject_group
  const teachersByGroup = {};
  teachers.forEach(function (t) {
    const g = t.subject_group || 'other';
    if (!teachersByGroup[g]) teachersByGroup[g] = [];
    teachersByGroup[g].push(t);
  });

  // homeroom map: class.room (string code) → matching room.id
  const classRoomMap = {};
  classes.forEach(function (c) {
    const room = rooms.filter(function (r) { return r.code === c.room; })[0];
    if (room) classRoomMap[c.id] = room.id;
  });

  // ── Slot tracking maps (key: id|day|period_id) ──
  const teacherBusy = {}, classBusy = {}, roomBusy = {};
  existing.forEach(function (s) {
    teacherBusy[s.teacher_id + '|' + s.day + '|' + s.period_id] = true;
    classBusy[s.class_id + '|' + s.day + '|' + s.period_id] = true;
    if (s.room_id) roomBusy[s.room_id + '|' + s.day + '|' + s.period_id] = true;
  });

  // Teacher load tracker
  const teacherLoad = {};
  existing.forEach(function (s) {
    teacherLoad[s.teacher_id] = (teacherLoad[s.teacher_id] || 0) + 1;
  });

  // ── Build task list ──
  const tasks = [];
  Object.keys(matrix).forEach(function (cid) {
    Object.keys(matrix[cid]).forEach(function (sid) {
      const hours = Math.max(0, Math.floor(Number(matrix[cid][sid] || 0)));
      for (let i = 0; i < hours; i++) {
        tasks.push({ class_id: cid, subject_id: sid });
      }
    });
  });

  // ── Sort tasks by difficulty (least available teachers first) ──
  tasks.forEach(function (t) {
    const subj = subjectIdx[t.subject_id];
    const candTeachers = (subj && teachersByGroup[subj.subject_group]) || teachers;
    t._difficulty = -candTeachers.length;
  });
  tasks.sort(function (a, b) { return a._difficulty - b._difficulty; });

  // ── Per-class daily-subject counter (for spread heuristic) ──
  const classDaySubject = {};  // class_id|day|subject_id → count
  existing.forEach(function (s) {
    const k = s.class_id + '|' + s.day + '|' + s.subject_id;
    classDaySubject[k] = (classDaySubject[k] || 0) + 1;
  });
  // last-period-by-class-day for back-to-back detection
  const classLastSub = {};  // class_id|day → { period_no: subject_id }
  existing.forEach(function (s) {
    const k = s.class_id + '|' + s.day;
    if (!classLastSub[k]) classLastSub[k] = {};
    const pr = periods.filter(function (p) { return p.id === s.period_id; })[0];
    if (pr) classLastSub[k][pr.no] = s.subject_id;
  });

  const dayIds = [1, 2, 3, 4, 5];
  const created = [];
  const failed = [];
  const log = [];

  // ── Algorithm ──
  function findBestSlot(task) {
    const subj = subjectIdx[task.subject_id];
    if (!subj) return null;
    const candidateTeachers = (teachersByGroup[subj.subject_group] || teachers).slice();
    if (!candidateTeachers.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (let di = 0; di < dayIds.length; di++) {
      const day = dayIds[di];
      for (let pi = 0; pi < periods.length; pi++) {
        const pr = periods[pi];
        // Skip if class already has a class in this period
        if (classBusy[task.class_id + '|' + day + '|' + pr.id]) continue;
        // Find available teachers
        const avail = [];
        for (let ti = 0; ti < candidateTeachers.length; ti++) {
          const t = candidateTeachers[ti];
          if (!teacherBusy[t.id + '|' + day + '|' + pr.id]) avail.push(t);
        }
        if (!avail.length) continue;
        // pick lowest-load teacher
        avail.sort(function (a, b) { return (teacherLoad[a.id] || 0) - (teacherLoad[b.id] || 0); });
        const teacher = avail[0];

        // ── Score this slot ──
        let score = 0;
        // (1) Spread: penalize same subject same day for class
        const dsKey = task.class_id + '|' + day + '|' + task.subject_id;
        const sameDayCount = classDaySubject[dsKey] || 0;
        score -= sameDayCount * 30;
        // (2) Morning preference (no <= 4)
        if (Number(pr.no) <= 4) score += 5;
        else score -= 2;
        // (3) Teacher load balance (lower = better)
        score -= (teacherLoad[teacher.id] || 0) * 0.5;
        // (4) Slight preference for earlier day (more likely to fit hard subjects)
        score -= day * 0.3;
        // (5) Back-to-back same subject penalty
        const lastKey = task.class_id + '|' + day;
        const lastMap = classLastSub[lastKey] || {};
        if (lastMap[Number(pr.no) - 1] === task.subject_id || lastMap[Number(pr.no) + 1] === task.subject_id) {
          score -= 15;
        }
        // (6) Random tie-breaker (small)
        score += Math.random() * 0.5;

        if (score > bestScore) {
          bestScore = score;
          best = { day: day, period_id: pr.id, period_no: Number(pr.no), teacher_id: teacher.id, score: score };
        }
      }
    }
    return best;
  }

  function pickRoom(classId, day, periodId) {
    // Prefer homeroom if available
    const homeroomId = classRoomMap[classId];
    if (homeroomId && !roomBusy[homeroomId + '|' + day + '|' + periodId]) return homeroomId;
    // Else any available
    for (let i = 0; i < rooms.length; i++) {
      const rid = rooms[i].id;
      if (!roomBusy[rid + '|' + day + '|' + periodId]) return rid;
    }
    return '';
  }

  // ── Process all tasks ──
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const slot = findBestSlot(task);
    if (!slot) {
      failed.push({
        class_id: task.class_id,
        subject_id: task.subject_id,
        reason: 'ไม่พบช่วงเวลาว่างหรือครูที่เหมาะสม'
      });
      continue;
    }
    const roomId = pickRoom(task.class_id, slot.day, slot.period_id);
    const obj = {
      term: term, year: year,
      day: slot.day, period_id: slot.period_id,
      class_id: task.class_id, subject_id: task.subject_id,
      teacher_id: slot.teacher_id, room_id: roomId,
      note: 'auto', active: true
    };
    created.push(obj);
    // Mark busy
    teacherBusy[slot.teacher_id + '|' + slot.day + '|' + slot.period_id] = true;
    classBusy[task.class_id + '|' + slot.day + '|' + slot.period_id] = true;
    if (roomId) roomBusy[roomId + '|' + slot.day + '|' + slot.period_id] = true;
    teacherLoad[slot.teacher_id] = (teacherLoad[slot.teacher_id] || 0) + 1;
    const dsKey = task.class_id + '|' + slot.day + '|' + task.subject_id;
    classDaySubject[dsKey] = (classDaySubject[dsKey] || 0) + 1;
    const lastKey = task.class_id + '|' + slot.day;
    if (!classLastSub[lastKey]) classLastSub[lastKey] = {};
    classLastSub[lastKey][slot.period_no] = task.subject_id;
  }

  // ── Bulk insert (single round-trip) ──
  if (created.length) DB_bulkInsert(SHEETS.SCHEDULE, created);

  // Build statistics
  const classFilledCount = {};
  created.forEach(function (c) {
    classFilledCount[c.class_id] = (classFilledCount[c.class_id] || 0) + 1;
  });

  // Failed grouped by class+subject
  const failGrouped = {};
  failed.forEach(function (f) {
    const k = f.class_id + '|' + f.subject_id;
    failGrouped[k] = (failGrouped[k] || 0) + 1;
  });
  const failedSummary = Object.keys(failGrouped).map(function (k) {
    const parts = k.split('|');
    const cls = classes.filter(function (c) { return String(c.id) === parts[0]; })[0];
    const subj = subjectIdx[parts[1]];
    return {
      class_level: cls ? cls.level : '?',
      subject_code: subj ? subj.code : '?',
      subject_name: subj ? subj.name : '',
      missing: failGrouped[k]
    };
  });

  Audit_log_(user, 'auto_generate', 'schedule', '', {
    term: term, year: year,
    cleared: clearedCount,
    created: created.length,
    failed: failed.length,
    duration_ms: Date.now() - startTime
  });

  return {
    ok: true,
    term: term, year: year,
    cleared: clearedCount,
    requested: tasks.length,
    created: created.length,
    failed: failed.length,
    failed_summary: failedSummary,
    teacher_load: teacherLoad,
    class_filled: classFilledCount,
    duration_ms: Date.now() - startTime,
    success_rate: tasks.length ? Math.round(created.length / tasks.length * 100) : 0
  };
}
