/**
 * 00_Config.gs — ค่าคงที่ + Schema + RBAC ทั้งระบบ
 * ระบบจัดตารางเรียน + จัดการครูสอนแทน
 */

const APP = Object.freeze({
  NAME: 'ระบบจัดตารางเรียน',
  TITLE: 'CSS · Class Scheduling System',
  VERSION: '1.0.0',
  TIMEZONE: 'Asia/Bangkok',
  SESSION_HOURS: 8,
  DEV: {
    NAME: 'ครูวิรัตน์  หาดคำ',
    URL: 'https://www.kruwirat.com',
    LOGO: 'https://mts-ssk3.com/uploads/team/team_1771053860_6990232440dc8.png'
  },
  DEFAULT_PASSWORD: '123456',
  SHOW_DEMO_USERS: true
});

const SHEETS = Object.freeze({
  USERS:         'Users',
  SUBJECTS:      'Subjects',
  CLASSES:       'Classes',
  ROOMS:         'Rooms',
  PERIODS:       'Periods',
  SCHEDULE:      'Schedule',
  ABSENCES:      'Absences',
  SUBSTITUTES:   'Substitutes',
  AUDIT:         'AuditLog',
  SETTINGS:      'Settings'
});

const SCHEMAS = Object.freeze({
  Users: ['id','username','password_hash','salt','full_name','email','role','subject_group','phone','avatar_url','active','telegram_chat_id','last_login_at','created_at','updated_at'],
  Subjects: ['id','code','name','subject_group','credits','color','active','created_at','updated_at'],
  Classes: ['id','level','room','homeroom_teacher_id','student_count','active','created_at','updated_at'],
  Rooms: ['id','code','name','building','floor','capacity','type','active','created_at','updated_at'],
  Periods: ['id','no','name','start_time','end_time','is_break','active','created_at','updated_at'],
  Schedule: ['id','term','year','day','period_id','class_id','subject_id','teacher_id','room_id','note','active','created_at','updated_at'],
  Absences: ['id','teacher_id','date','periods','reason','reason_detail','status','approved_by','approved_at','note','created_at','updated_at'],
  Substitutes: ['id','absence_id','schedule_id','date','period_id','class_id','subject_id','original_teacher_id','substitute_teacher_id','room_id','status','note','assigned_by','assigned_at','completed_at','created_at','updated_at'],
  AuditLog: ['id','at','user_id','username','role','action','entity','entity_id','meta','ip'],
  Settings: ['key','value','updated_at']
});

// columns ที่ต้อง force text format กัน Sheets auto-coerce
const TEXT_COLUMNS = Object.freeze([
  'phone','telegram_chat_id','code','color','reason_detail',
  'periods','start_time','end_time','password_hash','salt','avatar_url'
]);

// RBAC roles
const ROLES = Object.freeze({
  ADMIN:    'admin',     // ผู้ดูแลระบบ
  ACADEMIC: 'academic',  // วิชาการ (จัดตาราง, จัดสอนแทน)
  HEAD:     'head',      // หัวหน้ากลุ่มสาระ (อนุมัติลา)
  TEACHER:  'teacher'    // ครู (ดูตาราง + แจ้งลา)
});

const CAPS = Object.freeze({
  admin: [
    'user.manage','subject.manage','class.manage','room.manage','period.manage',
    'schedule.manage','absence.manage','substitute.manage','setting.manage',
    'report.view_all','audit.view'
  ],
  academic: [
    'user.view_all',
    'subject.manage','class.manage','room.manage','period.manage',
    'schedule.manage','absence.manage','substitute.manage',
    'report.view_all'
  ],
  head: [
    'user.view_all','subject.view','class.view','room.view','period.view',
    'schedule.view_all','absence.approve','absence.view_group','substitute.view_all',
    'report.view_all'
  ],
  teacher: [
    'subject.view','class.view','room.view','period.view',
    'schedule.view_own','schedule.view_all',
    'absence.create','absence.view_own',
    'substitute.view_own'
  ]
});

function hasCap_(role, cap) {
  const arr = CAPS[role];
  if (!Array.isArray(arr) || !cap) return false;
  if (arr.indexOf(cap) >= 0) return true;
  // restrictive scope ห้าม inherit จาก .manage
  if (/\.(view_own|view_self|edit_own|edit_self)$/.test(cap)) return false;
  const dot = cap.indexOf('.');
  if (dot > 0) {
    const prefix = cap.substring(0, dot);
    if (arr.indexOf(prefix + '.manage') >= 0) return true;
  }
  return false;
}

// constants
const STATUS = Object.freeze({
  ABSENCE_PENDING:  'pending',
  ABSENCE_APPROVED: 'approved',
  ABSENCE_REJECTED: 'rejected',
  SUB_ASSIGNED:     'assigned',
  SUB_COMPLETED:    'completed',
  SUB_CANCELLED:    'cancelled'
});

const DAYS = Object.freeze([
  { id: 1, name_th: 'จันทร์',  name_en: 'Monday',    short: 'จ.' },
  { id: 2, name_th: 'อังคาร', name_en: 'Tuesday',   short: 'อ.' },
  { id: 3, name_th: 'พุธ',    name_en: 'Wednesday', short: 'พ.' },
  { id: 4, name_th: 'พฤหัสบดี', name_en: 'Thursday',  short: 'พฤ.' },
  { id: 5, name_th: 'ศุกร์',  name_en: 'Friday',    short: 'ศ.' }
]);

const ABSENCE_REASONS = Object.freeze([
  { key: 'sick',     label: 'ลาป่วย',         icon: 'bi-heart-pulse',  color: '#ef4444' },
  { key: 'personal', label: 'ลากิจ',          icon: 'bi-house-heart',  color: '#f59e0b' },
  { key: 'official', label: 'ราชการ',         icon: 'bi-briefcase',    color: '#3b82f6' },
  { key: 'training', label: 'อบรม/สัมมนา',     icon: 'bi-mortarboard',  color: '#8b5cf6' },
  { key: 'other',    label: 'อื่นๆ',           icon: 'bi-three-dots',   color: '#64748b' }
]);

const SUBJECT_GROUPS = Object.freeze([
  { key: 'thai',     label: 'ภาษาไทย',          color: '#ef4444' },
  { key: 'math',     label: 'คณิตศาสตร์',       color: '#3b82f6' },
  { key: 'science',  label: 'วิทยาศาสตร์',       color: '#10b981' },
  { key: 'social',   label: 'สังคมศึกษา',       color: '#f59e0b' },
  { key: 'foreign',  label: 'ภาษาต่างประเทศ',    color: '#8b5cf6' },
  { key: 'health',   label: 'สุขศึกษาและพลศึกษา', color: '#ec4899' },
  { key: 'art',      label: 'ศิลปะ',            color: '#f97316' },
  { key: 'work',     label: 'การงานอาชีพ',       color: '#06b6d4' },
  { key: 'tech',     label: 'เทคโนโลยี',         color: '#6366f1' },
  { key: 'other',    label: 'อื่นๆ',             color: '#64748b' }
]);

const ROLE_LABELS = Object.freeze({
  admin:    { label: 'ผู้ดูแลระบบ',         icon: 'bi-shield-check' },
  academic: { label: 'ฝ่ายวิชาการ',          icon: 'bi-clipboard-data' },
  head:     { label: 'หัวหน้ากลุ่มสาระ',     icon: 'bi-people-fill' },
  teacher:  { label: 'ครูผู้สอน',           icon: 'bi-person-workspace' }
});

// helpers
function _yes_(v) {
  if (v === true || v === 1) return true;
  const s = String(v || '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

function cfg_iso_(d) {
  if (!(d instanceof Date)) {
    if (!d) return '';
    try { d = new Date(d); } catch (e) { return ''; }
  }
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, APP.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function cfg_dateOnly_(d) {
  if (!(d instanceof Date)) {
    if (!d) return '';
    try { d = new Date(d); } catch (e) { return ''; }
  }
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd');
}

function cfg_now_() { return cfg_iso_(new Date()); }

function cfg_normDate_(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, APP.TIMEZONE, 'yyyy-MM-dd');
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.substring(0, 10);
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, APP.TIMEZONE, 'yyyy-MM-dd');
  } catch (e) {}
  return s;
}

function cfg_uid_() { return Utilities.getUuid(); }
