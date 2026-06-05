/**
 * 09_Seed.gs — Sample data to test system
 */

function Seed_initSystem() {
  // Ensure sheets + schemas
  Object.keys(SHEETS).forEach(function (k) {
    DB_ensureSchema_(SHEETS[k]);
  });
  Settings_ensureDefaults_();

  const usersExist = DB_readAll(SHEETS.USERS);
  if (usersExist.length === 0) Seed_users_();
  const subjExist = DB_readAll(SHEETS.SUBJECTS);
  if (subjExist.length === 0) Seed_subjects_();
  const periodsExist = DB_readAll(SHEETS.PERIODS);
  if (periodsExist.length === 0) Seed_periods_();
  const classesExist = DB_readAll(SHEETS.CLASSES);
  if (classesExist.length === 0) Seed_classes_();
  const roomsExist = DB_readAll(SHEETS.ROOMS);
  if (roomsExist.length === 0) Seed_rooms_();
  const schedExist = DB_readAll(SHEETS.SCHEDULE);
  if (schedExist.length === 0) Seed_schedule_();

  return { ok: true };
}

function Seed_users_() {
  const password = APP.DEFAULT_PASSWORD;
  const users = [
    { username: 'admin',     full_name: 'นายผู้ดูแล ระบบ',     role: 'admin',    email: 'admin@school.ac.th',    subject_group: 'tech',    avatar_url: '' },
    { username: 'academic',  full_name: 'นางวิชาการ ใจดี',     role: 'academic', email: 'academic@school.ac.th', subject_group: 'thai',    avatar_url: '' },
    { username: 'head_math', full_name: 'นายหัวหน้า คณิตศาสตร์', role: 'head',     email: 'head_math@school.ac.th', subject_group: 'math',    avatar_url: '' },
    { username: 'head_sci',  full_name: 'นางหัวหน้า วิทย์',    role: 'head',     email: 'head_sci@school.ac.th',  subject_group: 'science', avatar_url: '' },
    { username: 'teacher1',  full_name: 'นางสาวอรุณ สวยงาม',   role: 'teacher',  email: 't1@school.ac.th',       subject_group: 'thai',    avatar_url: '' },
    { username: 'teacher2',  full_name: 'นายธนา สุขใจ',       role: 'teacher',  email: 't2@school.ac.th',       subject_group: 'math',    avatar_url: '' },
    { username: 'teacher3',  full_name: 'นางกมล ขยัน',         role: 'teacher',  email: 't3@school.ac.th',       subject_group: 'science', avatar_url: '' },
    { username: 'teacher4',  full_name: 'นายปกรณ์ มั่นคง',    role: 'teacher',  email: 't4@school.ac.th',       subject_group: 'social',  avatar_url: '' },
    { username: 'teacher5',  full_name: 'นางสาวพิมพ์ สวยงาม',  role: 'teacher',  email: 't5@school.ac.th',       subject_group: 'foreign', avatar_url: '' },
    { username: 'teacher6',  full_name: 'นายเอกชัย ดีงาม',    role: 'teacher',  email: 't6@school.ac.th',       subject_group: 'health',  avatar_url: '' },
    { username: 'teacher7',  full_name: 'นางสาวสุดา ใจกว้าง',  role: 'teacher',  email: 't7@school.ac.th',       subject_group: 'art',     avatar_url: '' },
    { username: 'teacher8',  full_name: 'นายภูมิ พัฒนา',       role: 'teacher',  email: 't8@school.ac.th',       subject_group: 'tech',    avatar_url: '' }
  ];
  users.forEach(function (u) {
    const salt = Auth_makeSalt_();
    u.password_hash = Auth_hash_(password, salt);
    u.salt = salt;
    u.active = true;
    u.phone = '';
    u.telegram_chat_id = '';
    DB_insert(SHEETS.USERS, u);
  });
}

function Seed_subjects_() {
  const subs = [
    { code: 'ท21101', name: 'ภาษาไทย',           subject_group: 'thai',     credits: 1.5, color: '#ef4444' },
    { code: 'ค21101', name: 'คณิตศาสตร์พื้นฐาน',   subject_group: 'math',     credits: 1.5, color: '#3b82f6' },
    { code: 'ค21201', name: 'คณิตศาสตร์เพิ่มเติม',  subject_group: 'math',     credits: 1.0, color: '#1d4ed8' },
    { code: 'ว21101', name: 'วิทยาศาสตร์',        subject_group: 'science',  credits: 1.5, color: '#10b981' },
    { code: 'ว21102', name: 'การออกแบบเทคโนโลยี',  subject_group: 'tech',     credits: 1.0, color: '#6366f1' },
    { code: 'ส21101', name: 'สังคมศึกษา',         subject_group: 'social',   credits: 1.5, color: '#f59e0b' },
    { code: 'ส21102', name: 'ประวัติศาสตร์',       subject_group: 'social',   credits: 0.5, color: '#d97706' },
    { code: 'อ21101', name: 'ภาษาอังกฤษ',         subject_group: 'foreign',  credits: 1.5, color: '#8b5cf6' },
    { code: 'พ21101', name: 'สุขศึกษา',           subject_group: 'health',   credits: 0.5, color: '#ec4899' },
    { code: 'พ21102', name: 'พลศึกษา',            subject_group: 'health',   credits: 0.5, color: '#db2777' },
    { code: 'ศ21101', name: 'ศิลปะ',              subject_group: 'art',      credits: 1.0, color: '#f97316' },
    { code: 'ง21101', name: 'การงานอาชีพ',        subject_group: 'work',     credits: 1.0, color: '#06b6d4' }
  ];
  subs.forEach(function (s) { s.active = true; DB_insert(SHEETS.SUBJECTS, s); });
}

function Seed_periods_() {
  const ps = [
    { no: 1, name: 'คาบ 1',     start_time: '08:30', end_time: '09:20', is_break: 'no'  },
    { no: 2, name: 'คาบ 2',     start_time: '09:20', end_time: '10:10', is_break: 'no'  },
    { no: 3, name: 'คาบ 3',     start_time: '10:30', end_time: '11:20', is_break: 'no'  },
    { no: 4, name: 'คาบ 4',     start_time: '11:20', end_time: '12:10', is_break: 'no'  },
    { no: 5, name: 'พักเที่ยง',  start_time: '12:10', end_time: '13:00', is_break: 'yes' },
    { no: 6, name: 'คาบ 5',     start_time: '13:00', end_time: '13:50', is_break: 'no'  },
    { no: 7, name: 'คาบ 6',     start_time: '13:50', end_time: '14:40', is_break: 'no'  },
    { no: 8, name: 'คาบ 7',     start_time: '14:40', end_time: '15:30', is_break: 'no'  },
    { no: 9, name: 'คาบ 8',     start_time: '15:30', end_time: '16:20', is_break: 'no'  }
  ];
  ps.forEach(function (p) { p.active = true; DB_insert(SHEETS.PERIODS, p); });
}

function Seed_classes_() {
  const cs = [
    { level: 'ม.1/1', room: '101', student_count: 35 },
    { level: 'ม.1/2', room: '102', student_count: 36 },
    { level: 'ม.2/1', room: '201', student_count: 34 },
    { level: 'ม.2/2', room: '202', student_count: 35 },
    { level: 'ม.3/1', room: '301', student_count: 33 },
    { level: 'ม.3/2', room: '302', student_count: 34 }
  ];
  cs.forEach(function (c) { c.active = true; DB_insert(SHEETS.CLASSES, c); });
}

function Seed_rooms_() {
  const rs = [
    { code: '101', name: 'ห้องเรียน 101', building: 'อาคาร 1', floor: '1', capacity: 40, type: 'general' },
    { code: '102', name: 'ห้องเรียน 102', building: 'อาคาร 1', floor: '1', capacity: 40, type: 'general' },
    { code: '201', name: 'ห้องเรียน 201', building: 'อาคาร 1', floor: '2', capacity: 40, type: 'general' },
    { code: '202', name: 'ห้องเรียน 202', building: 'อาคาร 1', floor: '2', capacity: 40, type: 'general' },
    { code: '301', name: 'ห้องเรียน 301', building: 'อาคาร 1', floor: '3', capacity: 40, type: 'general' },
    { code: '302', name: 'ห้องเรียน 302', building: 'อาคาร 1', floor: '3', capacity: 40, type: 'general' },
    { code: 'LAB1', name: 'ห้องปฏิบัติการวิทย์', building: 'อาคาร 2', floor: '1', capacity: 36, type: 'lab' },
    { code: 'COM1', name: 'ห้องคอมพิวเตอร์', building: 'อาคาร 2', floor: '2', capacity: 40, type: 'computer' },
    { code: 'GYM',  name: 'โรงยิม', building: 'อาคารกีฬา', floor: '1', capacity: 200, type: 'sport' }
  ];
  rs.forEach(function (r) { r.active = true; DB_insert(SHEETS.ROOMS, r); });
}

function Seed_schedule_() {
  const subjects = DB_readAll(SHEETS.SUBJECTS);
  const classes = DB_readAll(SHEETS.CLASSES);
  const rooms = DB_readAll(SHEETS.ROOMS);
  // Filter out break periods (no class scheduling on lunch break, etc.)
  const periods = DB_readAll(SHEETS.PERIODS)
    .filter(function (p) { return _yes_(p.active) && !_yes_(p.is_break); })
    .sort(function (a, b) { return Number(a.no) - Number(b.no); });
  const teachers = DB_readAll(SHEETS.USERS).filter(function (u) {
    return _yes_(u.active) && (u.role === 'teacher' || u.role === 'head');
  });
  if (!subjects.length || !classes.length || !periods.length || !teachers.length) return;
  // build map: subject_group → teacher_ids
  const teachByGroup = {};
  teachers.forEach(function (t) {
    const g = t.subject_group || 'other';
    if (!teachByGroup[g]) teachByGroup[g] = [];
    teachByGroup[g].push(t);
  });
  // build map: subject_group → subjects
  const subjByGroup = {};
  subjects.forEach(function (s) {
    const g = s.subject_group || 'other';
    if (!subjByGroup[g]) subjByGroup[g] = [];
    subjByGroup[g].push(s);
  });
  const settings = Settings_map_();
  const term = settings.current_term || '1';
  const year = settings.current_year || String(new Date().getFullYear() + 543);
  const rows = [];
  const teacherSlots = {};  // teacher_id|day|period → bool
  const classSlots = {};    // class_id|day|period → bool
  const roomSlots = {};     // room_id|day|period → bool
  // for each class × day × period, randomly pick a subject + teacher
  classes.forEach(function (cls) {
    [1,2,3,4,5].forEach(function (day) {
      periods.forEach(function (pr, prIdx) {
        // optional: skip last period sometimes for variety (early dismissal)
        if (prIdx === periods.length - 1 && Math.random() < 0.4) return;
        const cKey = cls.id + '|' + day + '|' + pr.id;
        if (classSlots[cKey]) return;
        // pick a random subject
        const sub = subjects[Math.floor(Math.random() * subjects.length)];
        const teachersForSub = teachByGroup[sub.subject_group] || teachers;
        // find available teacher
        let chosenT = null;
        for (let attempt = 0; attempt < teachersForSub.length; attempt++) {
          const t = teachersForSub[(attempt + Math.floor(Math.random() * teachersForSub.length)) % teachersForSub.length];
          const tKey = t.id + '|' + day + '|' + pr.id;
          if (!teacherSlots[tKey]) { chosenT = t; break; }
        }
        if (!chosenT) return;
        // pick room (homeroom of class first)
        let room = rooms.filter(function (r) { return r.code === cls.room; })[0];
        if (!room) {
          for (let i = 0; i < rooms.length; i++) {
            const rKey = rooms[i].id + '|' + day + '|' + pr.id;
            if (!roomSlots[rKey]) { room = rooms[i]; break; }
          }
        }
        if (!room) return;
        teacherSlots[chosenT.id + '|' + day + '|' + pr.id] = true;
        classSlots[cKey] = true;
        roomSlots[room.id + '|' + day + '|' + pr.id] = true;
        rows.push({
          term: term, year: year,
          day: day, period_id: pr.id,
          class_id: cls.id, subject_id: sub.id,
          teacher_id: chosenT.id, room_id: room.id,
          note: '', active: true
        });
      });
    });
  });
  DB_bulkInsert(SHEETS.SCHEDULE, rows);
}

// ── Reset (for dev) ────────────────────────────────────────────
function Seed_resetAll() {
  const ss = DB_ss_();
  Object.keys(SHEETS).forEach(function (k) {
    const sh = ss.getSheetByName(SHEETS[k]);
    if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  });
  Seed_initSystem();
  return { ok: true };
}
