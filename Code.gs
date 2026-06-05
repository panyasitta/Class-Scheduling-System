/**
 * Code.gs — doGet entry + Universal API endpoint
 */

function doGet(e) {
  // ensure schemas on first deploy
  try {
    Object.keys(SHEETS).forEach(function (k) { DB_ensureSchema_(SHEETS[k]); });
    Settings_ensureDefaults_();
  } catch (err) {}
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ── Boot payload (without auth) ───────────────────────────────
function getBoot() {
  return {
    app: {
      name: APP.NAME,
      title: APP.TITLE,
      version: APP.VERSION,
      timezone: APP.TIMEZONE
    },
    dev: APP.DEV,
    show_demo: APP.SHOW_DEMO_USERS && DB_readAll(SHEETS.USERS).length > 0,
    has_users: DB_readAll(SHEETS.USERS).length > 0,
    role_labels: ROLE_LABELS,
    subject_groups: SUBJECT_GROUPS,
    days: DAYS,
    absence_reasons: ABSENCE_REASONS
  };
}

// ── Universal API endpoint ────────────────────────────────────
const ROUTES = {
  // public (no token required)
  'app.boot':          { auth: false, fn: function (u, p) { return getBoot(); } },
  'auth.login':        { auth: false, fn: function (u, p) { return Auth_login(p); } },
  // authenticated
  'auth.logout':       { auth: true,  fn: function (u, p) { return Auth_logout(p && p.token); } },
  'auth.me':           { auth: true,  fn: function (u, p) { return { user: Auth_publicUser_(u), caps: CAPS[u.role] || [] }; } },
  'auth.changePassword': { auth: true, fn: function (u, p) { return Auth_changePassword(u, p); } },
  'auth.updateProfile':  { auth: true, fn: function (u, p) { return Auth_updateProfile(u, p); } },

  'user.list':         { auth: true, fn: Users_list },
  'user.get':          { auth: true, fn: function (u, p) { return Users_get(u, p && p.id); } },
  'user.create':       { auth: true, fn: Users_create },
  'user.update':       { auth: true, fn: Users_update },
  'user.delete':       { auth: true, fn: function (u, p) { return Users_delete(u, p && p.id); } },

  'subject.list':      { auth: true, fn: Subjects_list },
  'subject.create':    { auth: true, fn: Subjects_create },
  'subject.update':    { auth: true, fn: Subjects_update },
  'subject.delete':    { auth: true, fn: function (u, p) { return Subjects_delete(u, p && p.id); } },

  'class.list':        { auth: true, fn: Classes_list },
  'class.create':      { auth: true, fn: Classes_create },
  'class.update':      { auth: true, fn: Classes_update },
  'class.delete':      { auth: true, fn: function (u, p) { return Classes_delete(u, p && p.id); } },

  'room.list':         { auth: true, fn: Rooms_list },
  'room.create':       { auth: true, fn: Rooms_create },
  'room.update':       { auth: true, fn: Rooms_update },
  'room.delete':       { auth: true, fn: function (u, p) { return Rooms_delete(u, p && p.id); } },

  'period.list':       { auth: true, fn: Periods_list },
  'period.create':     { auth: true, fn: Periods_create },
  'period.update':     { auth: true, fn: Periods_update },
  'period.delete':     { auth: true, fn: function (u, p) { return Periods_delete(u, p && p.id); } },
  'period.addLunchBreak': { auth: true, fn: Periods_addLunchBreak },

  'master.bundle':     { auth: true, fn: Masters_bundle },

  'schedule.grid':     { auth: true, fn: Schedule_grid },
  'schedule.list':     { auth: true, fn: Schedule_listAll },
  'schedule.checkConflict': { auth: true, fn: Schedule_checkConflict },
  'schedule.create':   { auth: true, fn: Schedule_create },
  'schedule.update':   { auth: true, fn: Schedule_update },
  'schedule.delete':   { auth: true, fn: function (u, p) { return Schedule_delete(u, p && p.id); } },
  'schedule.bulkClear': { auth: true, fn: Schedule_bulkClear },

  'absence.list':      { auth: true, fn: Absences_list },
  'absence.create':    { auth: true, fn: Absences_create },
  'absence.update':    { auth: true, fn: Absences_update },
  'absence.approve':   { auth: true, fn: Absences_approve },
  'absence.delete':    { auth: true, fn: function (u, p) { return Absences_delete(u, p && p.id); } },
  'absence.affectedSchedule': { auth: true, fn: Absences_affectedSchedule },

  'substitute.list':       { auth: true, fn: Substitutes_list },
  'substitute.candidates': { auth: true, fn: Substitute_candidates },
  'substitute.assign':     { auth: true, fn: Substitutes_assign },
  'substitute.autoAssign': { auth: true, fn: Substitutes_autoAssign },
  'substitute.complete':   { auth: true, fn: function (u, p) { return Substitutes_complete(u, p && p.id); } },
  'substitute.cancel':     { auth: true, fn: function (u, p) { return Substitutes_cancel(u, p && p.id); } },
  'substitute.delete':     { auth: true, fn: function (u, p) { return Substitutes_delete(u, p && p.id); } },

  'dashboard.stats':   { auth: true, fn: Dashboard_stats },
  'report.teacher':    { auth: true, fn: Reports_teacher },
  'audit.list':        { auth: true, fn: Audit_list },

  'setting.get':       { auth: true, fn: function (u, p) { return Settings_get(u); } },
  'setting.update':    { auth: true, fn: Settings_update },

  'system.seed':       { auth: true, fn: function (u, p) { Auth_requireCap(u, 'user.manage'); return Seed_initSystem(); } },

  'autoSchedule.defaults': { auth: true, fn: AutoSchedule_defaults },
  'autoSchedule.generate': { auth: true, fn: AutoSchedule_generate }
};

function api(action, payload, token) {
  try {
    const route = ROUTES[action];
    if (!route) throw new Error('Unknown action: ' + action);
    let user = null;
    if (route.auth) user = Auth_verify_(token);
    const data = route.fn(user, payload || {});
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
