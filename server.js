const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ==================== Autenticación ====================
   Cookie firmada (HMAC-SHA256) sin almacén de sesiones en memoria:
   sobrevive a reinicios del contenedor. Secret persistido en meta. */

let authSecret = db.prepare('SELECT value FROM meta WHERE key = ?').get('auth_secret')?.value;
if (!authSecret) {
  authSecret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('auth_secret', authSecret);
}

const AUTH_COOKIE = 'gym_auth';
const SESSION_DAYS = 30;
const COOKIE_BASE = 'HttpOnly; SameSite=Lax; Path=/';

function makeToken(username) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_DAYS * 864e5 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', authSecret).update(payload).digest('base64url');
  if (sig.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.u || data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

function tokenFromReq(req) {
  const raw = req.headers.cookie || '';
  const part = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(AUTH_COOKIE + '='));
  return part ? part.slice(AUTH_COOKIE.length + 1) : null;
}

function setAuthCookie(res, token, maxAge = SESSION_DAYS * 86400) {
  const val = token
    ? `${AUTH_COOKIE}=${token}; ${COOKIE_BASE}; Max-Age=${maxAge}`
    : `${AUTH_COOKIE}=; ${COOKIE_BASE}; Max-Age=0`;
  res.setHeader('Set-Cookie', val);
}

function requireAuth(req, res, next) {
  const data = verifyToken(tokenFromReq(req));
  if (!data) return res.status(401).json({ error: 'No has iniciado sesión.' });
  const user = db.prepare('SELECT id, username, is_admin FROM users WHERE username = ?').get(data.u);
  if (!user) return res.status(401).json({ error: 'Cuenta no encontrada. Inicia sesión de nuevo.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Acceso solo para administradores.' });
  next();
}

/* --- Rutas públicas (no piden sesión) --- */

app.post('/api/login', (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !db.verifyPassword(password, user.pass_hash))
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  setAuthCookie(res, makeToken(user.username));
  res.json({ ok: true, username: user.username, is_admin: !!user.is_admin });
});

app.get('/api/me', (req, res) => {
  const data = verifyToken(tokenFromReq(req));
  if (!data) return res.status(401).json({ error: 'No has iniciado sesión.' });
  const user = db.prepare('SELECT username, is_admin FROM users WHERE username = ?').get(data.u);
  if (!user) return res.status(401).json({ error: 'Cuenta no encontrada. Inicia sesión de nuevo.' });
  res.json({ username: user.username, is_admin: !!user.is_admin });
});

app.post('/api/logout', (req, res) => {
  setAuthCookie(res, null);
  res.json({ ok: true });
});

/* --- Usuarios (panel de administración) --- */

app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.is_admin, u.created_at,
           (SELECT COUNT(*) FROM workouts w WHERE w.user_id = u.id) AS n_workouts,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS n_sessions
    FROM users u
    ORDER BY u.id`).all();
  res.json(rows);
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const isAdmin = !!(req.body && req.body.is_admin);
  if (!username || !password)
    return res.status(400).json({ error: 'El usuario y la contraseña son obligatorios.' });
  try {
    const info = db.prepare('INSERT INTO users (username, pass_hash, is_admin) VALUES (?, ?, ?)')
      .run(username, db.hashPassword(password), isAdmin ? 1 : 0);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE'))
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre.' });
    throw e;
  }
});

app.put('/api/users/:id/password', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const { password, current } = req.body || {};
  // Cambiar la propia contraseña exige demostrar la actual;
  // un admin que resetea la de otro no.
  if (user.username === req.user.username &&
      !db.verifyPassword(String(current || ''), user.pass_hash))
    return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  if (!String(password || '').length)
    return res.status(400).json({ error: 'Escribe la nueva contraseña.' });
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?')
    .run(db.hashPassword(String(password)), user.id);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (user.username === req.user.username)
    return res.status(400).json({ error: 'No puedes borrar tu propia cuenta.' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM workouts WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM exercises WHERE is_custom = 1 AND user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });
  tx();
  res.json({ ok: true });
});

/* Animaciones (GIF/MP4) disponibles por slug de imagen.
   Se lee una vez al arrancar: los archivos solo cambian en un rebuild. */
const ANIMS = (() => {
  try {
    const out = {};
    for (const f of fs.readdirSync(path.join(__dirname, 'public', 'images'))) {
      const m = /^(.+)\.(gif|mp4|webm)$/.exec(f);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch (e) { return {}; }
})();

app.get('/api/anim', (req, res) => res.json(ANIMS));

/* A partir de aquí todas las rutas exigen sesión válida */
app.use('/api', requireAuth);

/* ==================== Ejercicios ==================== */

app.get('/api/exercises', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const rows = q
    ? db.prepare(`
        SELECT id, name, muscle_group, is_custom, image FROM exercises
        WHERE (is_custom = 0 OR user_id = ?) AND (lower(name) LIKE ? OR lower(muscle_group) LIKE ?)
        ORDER BY muscle_group, name`)
      .all(req.user.id, `%${q}%`, `%${q}%`)
    : db.prepare(`
        SELECT id, name, muscle_group, is_custom, image FROM exercises
        WHERE (is_custom = 0 OR user_id = ?)
        ORDER BY muscle_group, name`).all(req.user.id);
  res.json(rows);
});

app.post('/api/exercises', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const muscle_group = String((req.body && req.body.muscle_group) || '').trim() || 'Otro';
  if (!name) return res.status(400).json({ error: 'El nombre del ejercicio es obligatorio.' });
  try {
    const info = db.prepare(
      'INSERT INTO exercises (name, muscle_group, is_custom, user_id) VALUES (?, ?, 1, ?)')
      .run(name, muscle_group, req.user.id);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE'))
      return res.status(409).json({ error: 'Ya existe un ejercicio con ese nombre.' });
    throw e;
  }
});

app.delete('/api/exercises/:id', (req, res) => {
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Ejercicio no encontrado.' });
  if (!ex.is_custom)
    return res.status(400).json({ error: 'Solo se pueden borrar ejercicios personalizados.' });
  if (ex.user_id !== req.user.id)
    return res.status(403).json({ error: 'No puedes borrar un ejercicio de otro usuario.' });
  const inWorkouts = db.prepare(
    'SELECT COUNT(*) AS n FROM workout_exercises WHERE exercise_id = ?').get(ex.id).n;
  const inHistory = db.prepare(
    'SELECT COUNT(*) AS n FROM session_sets WHERE exercise_id = ?').get(ex.id).n;
  if (inWorkouts || inHistory)
    return res.status(409).json({
      error: 'No se puede borrar: aparece en plantillas o en el historial.',
    });
  db.prepare('DELETE FROM exercises WHERE id = ?').run(ex.id);
  res.json({ ok: true });
});

// Historial por ejercicio → datos del gráfico y "último peso"
app.get('/api/exercises/:id/history', (req, res) => {
  const ex = db.prepare('SELECT id, name, muscle_group FROM exercises WHERE id = ?').get(req.params.id);
  if (!ex) return res.status(404).json({ error: 'Ejercicio no encontrado.' });
  const sessions = db.prepare(`
    SELECT s.id AS session_id,
           s.name AS session_name,
           s.started_at,
           MAX(ss.weight)            AS max_weight,
           COUNT(*)                  AS sets,
           SUM(ss.weight * ss.reps)  AS volume
    FROM session_sets ss
    JOIN sessions s ON s.id = ss.session_id
    WHERE ss.exercise_id = ? AND s.user_id = ?
    GROUP BY s.id
    ORDER BY s.started_at ASC, s.id ASC`).all(ex.id, req.user.id);
  res.json({ exercise: ex, sessions });
});

/* ==================== Plantillas (entrenamientos) ==================== */

function workoutItems(workoutId, userId) {
  return db.prepare(`
    SELECT we.exercise_id, we.target_sets, we.target_reps, we.position,
           e.name, e.muscle_group, e.image,
           (SELECT ss.weight FROM session_sets ss
            JOIN sessions s ON s.id = ss.session_id
            WHERE ss.exercise_id = we.exercise_id AND s.user_id = ?
            ORDER BY s.started_at DESC, s.id DESC, ss.position DESC, ss.id DESC
            LIMIT 1) AS last_weight
    FROM workout_exercises we
    JOIN exercises e ON e.id = we.exercise_id
    WHERE we.workout_id = ?
    ORDER BY we.position, we.id`).all(userId, workoutId);
}

app.get('/api/workouts', (req, res) => {
  const workouts = db.prepare(
    'SELECT id, name, created_at FROM workouts WHERE user_id = ? ORDER BY name')
    .all(req.user.id);
  res.json(workouts.map((w) => ({ ...w, exercises: workoutItems(w.id, req.user.id) })));
});

app.post('/api/workouts', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: 'El nombre de la plantilla es obligatorio.' });
  const info = db.prepare('INSERT INTO workouts (user_id, name) VALUES (?, ?)')
    .run(req.user.id, name);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.put('/api/workouts/:id', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const info = db.prepare('UPDATE workouts SET name = ? WHERE id = ? AND user_id = ?')
    .run(name, req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  res.json({ ok: true });
});

app.delete('/api/workouts/:id', (req, res) => {
  const info = db.prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  res.json({ ok: true });
});

// Reemplaza la lista completa de ejercicios de la plantilla
app.put('/api/workouts/:id/exercises', (req, res) => {
  const items = Array.isArray(req.body && req.body.exercises) ? req.body.exercises : null;
  const workout = db.prepare('SELECT id FROM workouts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!workout) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  const del = db.prepare('DELETE FROM workout_exercises WHERE workout_id = ?');
  const ins = db.prepare(`
    INSERT INTO workout_exercises (workout_id, exercise_id, target_sets, target_reps, position)
    VALUES (?, ?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    del.run(req.params.id);
    items.forEach((it, i) => {
      const eid = Number(it && it.exercise_id);
      if (!Number.isInteger(eid) || eid <= 0) return;
      const ts = Number(it.target_sets) > 0 ? Math.floor(Number(it.target_sets)) : 3;
      const tr = Number(it.target_reps) > 0 ? Math.floor(Number(it.target_reps)) : 10;
      ins.run(req.params.id, eid, ts, tr, Number(it.position) >= 0 ? Number(it.position) : i);
    });
  });
  tx();
  res.json({ ok: true });
});

/* ==================== Sesiones ==================== */

app.get('/api/sessions', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db.prepare(`
    SELECT s.id, s.name, s.started_at,
           COUNT(DISTINCT ss.exercise_id) AS exercise_count,
           COALESCE(SUM(ss.weight * ss.reps), 0) AS volume
    FROM sessions s
    LEFT JOIN session_sets ss ON ss.session_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT ?`).all(req.user.id, limit);
  res.json(rows);
});

app.get('/api/sessions/:id', (req, res) => {
  const s = db.prepare('SELECT id, name, started_at, workout_id FROM sessions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!s) return res.status(404).json({ error: 'Sesión no encontrada.' });
  const rows = db.prepare(`
    SELECT ss.exercise_id, e.name, e.muscle_group, ss.position, ss.weight, ss.reps
    FROM session_sets ss
    JOIN exercises e ON e.id = ss.exercise_id
    WHERE ss.session_id = ?
    ORDER BY ss.position, ss.id`).all(s.id);
  const exercises = [];
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.exercise_id)) {
      const entry = { exercise_id: r.exercise_id, name: r.name, muscle_group: r.muscle_group, sets: [] };
      map.set(r.exercise_id, entry);
      exercises.push(entry);
    }
    map.get(r.exercise_id).sets.push({ weight: r.weight, reps: r.reps });
  }
  res.json({ ...s, exercises });
});

app.delete('/api/sessions/:id', (req, res) => {
  const info = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Sesión no encontrada.' });
  res.json({ ok: true });
});

// Crea la sesión completa de una vez (transacción)
app.post('/api/sessions', (req, res) => {
  const body = req.body || {};
  const { workout_id, exercises } = body;
  const started_at =
    typeof body.started_at === 'string' && body.started_at
      ? body.started_at
      : new Date().toISOString();

  let workoutName = null;
  if (workout_id !== undefined && workout_id !== null) {
    const w = db.prepare('SELECT name FROM workouts WHERE id = ? AND user_id = ?')
      .get(workout_id, req.user.id);
    if (!w) return res.status(400).json({ error: 'Plantilla no encontrada.' });
    workoutName = w.name;
  }
  const sessionName =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : workoutName || 'Sesión libre';

  if (!Array.isArray(exercises) || exercises.length === 0)
    return res.status(400).json({ error: 'La sesión debe incluir al menos un ejercicio.' });

  const insertSession = db.prepare(
    'INSERT INTO sessions (user_id, workout_id, name, started_at) VALUES (?, ?, ?, ?)');
  const insertSet = db.prepare(
    'INSERT INTO session_sets (session_id, exercise_id, position, weight, reps) VALUES (?, ?, ?, ?, ?)');

  let createdId = null;
  const tx = db.transaction(() => {
    const info = insertSession.run(req.user.id,
      workout_id === undefined ? null : Number(workout_id),
      sessionName, started_at);
    createdId = info.lastInsertRowid;
    exercises.forEach((ex, i) => {
      const eid = Number(ex && ex.exercise_id);
      const pos = Number(ex.position) >= 0 ? Number(ex.position) : i;
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      sets.forEach((st) => {
        const weight = Number(st && st.weight);
        const reps = Number(st && st.reps);
        if (!Number.isInteger(eid) || eid <= 0) return;
        if (!(weight > 0) || !(reps >= 1)) return;
        insertSet.run(createdId, eid, pos, weight, reps);
      });
    });
  });
  try {
    tx();
  } catch (e) {
    if (String(e.message).includes('FOREIGN KEY'))
      return res.status(400).json({ error: 'Hay ejercicios que no existen en el catálogo.' });
    throw e;
  }
  res.status(201).json({ id: Number(createdId) });
});

/* ==================== Error 500 genérico ==================== */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

function listen(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Gym Log escuchando en http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`El puerto ${port} está ocupado, intentando ${port + 1}…`);
      listen(port + 1);
    }
  });
}

listen(Number(process.env.PORT || 3000));
