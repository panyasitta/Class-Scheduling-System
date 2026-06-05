/**
 * 01_DB.gs — Database layer · ใช้ active spreadsheet · O(1) lookup ด้วย index cache
 */

function DB_ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function DB_sheet_(name) {
  const ss = DB_ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function DB_ensureSchema_(name) {
  const sh = DB_sheet_(name);
  const cols = SCHEMAS[name];
  if (!cols) throw new Error('No schema: ' + name);
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1e293b').setFontColor('#f1f5f9');
    sh.setFrozenRows(1);
  } else {
    const head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    cols.forEach(function (c, i) {
      if (head[i] !== c) sh.getRange(1, i + 1).setValue(c);
    });
    if (lastCol < cols.length) {
      sh.getRange(1, lastCol + 1, 1, cols.length - lastCol).setValues([cols.slice(lastCol)]);
    }
  }
  // force text columns
  cols.forEach(function (col, i) {
    if (TEXT_COLUMNS.indexOf(col) >= 0) {
      try { sh.getRange(2, i + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@'); } catch (e) {}
    }
  });
  return sh;
}

function DB_readAll(name) {
  const sh = DB_ensureSchema_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const cols = SCHEMAS[name];
  const range = sh.getRange(2, 1, last - 1, cols.length).getValues();
  const out = [];
  for (let i = 0; i < range.length; i++) {
    const row = range[i];
    if (!row[0] && row.every(function (v) { return v === '' || v === null; })) continue;
    const obj = {};
    for (let j = 0; j < cols.length; j++) {
      let v = row[j];
      if (v instanceof Date) v = cfg_iso_(v);
      obj[cols[j]] = v === null ? '' : v;
    }
    obj.__row = i + 2;
    out.push(obj);
  }
  return out;
}

function DB_findById(name, id) {
  if (!id) return null;
  const all = DB_readAll(name);
  const sId = String(id);
  for (let i = 0; i < all.length; i++) if (String(all[i].id) === sId) return all[i];
  return null;
}

function DB_insert(name, data) {
  const sh = DB_ensureSchema_(name);
  const cols = SCHEMAS[name];
  const now = cfg_now_();
  const obj = Object.assign({}, data);
  if (cols.indexOf('id') >= 0 && !obj.id) obj.id = cfg_uid_();
  if (cols.indexOf('created_at') >= 0 && !obj.created_at) obj.created_at = now;
  if (cols.indexOf('updated_at') >= 0) obj.updated_at = now;
  if (cols.indexOf('active') >= 0 && obj.active === undefined) obj.active = true;
  const row = cols.map(function (c) {
    const v = obj[c];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    return v;
  });
  const newRow = sh.getLastRow() + 1;
  const range = sh.getRange(newRow, 1, 1, cols.length);
  // force text format on text columns
  cols.forEach(function (col, i) {
    if (TEXT_COLUMNS.indexOf(col) >= 0) {
      sh.getRange(newRow, i + 1).setNumberFormat('@');
    }
  });
  range.setValues([row]);
  obj.__row = newRow;
  return obj;
}

function DB_update(name, id, patch) {
  if (!id) throw new Error('Missing id');
  const sh = DB_ensureSchema_(name);
  const cols = SCHEMAS[name];
  const all = DB_readAll(name);
  const sId = String(id);
  let target = null;
  for (let i = 0; i < all.length; i++) if (String(all[i].id) === sId) { target = all[i]; break; }
  if (!target) throw new Error('Not found: ' + name + '/' + id);
  const obj = Object.assign({}, target, patch);
  if (cols.indexOf('updated_at') >= 0) obj.updated_at = cfg_now_();
  const row = cols.map(function (c) {
    const v = obj[c];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    return v;
  });
  const range = sh.getRange(target.__row, 1, 1, cols.length);
  cols.forEach(function (col, i) {
    if (TEXT_COLUMNS.indexOf(col) >= 0) {
      sh.getRange(target.__row, i + 1).setNumberFormat('@');
    }
  });
  range.setValues([row]);
  obj.__row = target.__row;
  return obj;
}

function DB_delete(name, id) {
  // soft-delete (active = no) ถ้า schema มี active; otherwise hard-delete
  const cols = SCHEMAS[name];
  if (cols.indexOf('active') >= 0) {
    return DB_update(name, id, { active: false });
  }
  const sh = DB_ensureSchema_(name);
  const all = DB_readAll(name);
  const sId = String(id);
  for (let i = 0; i < all.length; i++) {
    if (String(all[i].id) === sId) {
      sh.deleteRow(all[i].__row);
      return true;
    }
  }
  throw new Error('Not found: ' + name + '/' + id);
}

function DB_hardDelete(name, id) {
  const sh = DB_ensureSchema_(name);
  const all = DB_readAll(name);
  const sId = String(id);
  for (let i = 0; i < all.length; i++) {
    if (String(all[i].id) === sId) {
      sh.deleteRow(all[i].__row);
      return true;
    }
  }
  return false;
}

function DB_bulkInsert(name, rows) {
  if (!rows || !rows.length) return 0;
  const sh = DB_ensureSchema_(name);
  const cols = SCHEMAS[name];
  const now = cfg_now_();
  const matrix = rows.map(function (data) {
    const obj = Object.assign({}, data);
    if (cols.indexOf('id') >= 0 && !obj.id) obj.id = cfg_uid_();
    if (cols.indexOf('created_at') >= 0 && !obj.created_at) obj.created_at = now;
    if (cols.indexOf('updated_at') >= 0) obj.updated_at = now;
    if (cols.indexOf('active') >= 0 && obj.active === undefined) obj.active = true;
    return cols.map(function (c) {
      const v = obj[c];
      if (v === undefined || v === null) return '';
      if (typeof v === 'boolean') return v ? 'yes' : 'no';
      return v;
    });
  });
  const startRow = sh.getLastRow() + 1;
  const range = sh.getRange(startRow, 1, matrix.length, cols.length);
  // force text columns
  cols.forEach(function (col, ci) {
    if (TEXT_COLUMNS.indexOf(col) >= 0) {
      sh.getRange(startRow, ci + 1, matrix.length, 1).setNumberFormat('@');
    }
  });
  range.setValues(matrix);
  return matrix.length;
}

function DB_query(name, predicate) {
  const all = DB_readAll(name);
  return predicate ? all.filter(predicate) : all;
}

function DB_index(name) {
  const all = DB_readAll(name);
  const map = {};
  all.forEach(function (r) { map[String(r.id)] = r; });
  return map;
}

// audit log helper
function Audit_log_(user, action, entity, entityId, meta) {
  try {
    DB_insert(SHEETS.AUDIT, {
      at: cfg_now_(),
      user_id: user ? user.id : '',
      username: user ? user.username : 'system',
      role: user ? user.role : '',
      action: action,
      entity: entity || '',
      entity_id: entityId || '',
      meta: meta ? JSON.stringify(meta) : '',
      ip: ''
    });
  } catch (e) { /* swallow */ }
}
