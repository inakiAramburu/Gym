const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const CATALOG = require('./data/exercises');

// En Docker: /app/data/gym.db (volumen montado). Fuera de Docker: ./gym.db
const dbPath = process.env.DB_PATH || path.join(__dirname, 'gym.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------- Contraseñas (scrypt, sin dependencias) ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}

// ---------------- Esquema ----------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER,          -- NULL = catálogo compartido; con valor = personalizado del usuario
    image TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name
    ON exercises(lower(name));

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workout_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    target_sets INTEGER NOT NULL DEFAULT 3,
    target_reps INTEGER NOT NULL DEFAULT 10,
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (workout_id, exercise_id)
  );
  CREATE INDEX IF NOT EXISTS idx_we_exercise
    ON workout_exercises(exercise_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_id INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    started_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_started
    ON sessions(started_at);

  CREATE TABLE IF NOT EXISTS session_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL DEFAULT 0,
    weight REAL NOT NULL CHECK (weight > 0),
    reps INTEGER NOT NULL CHECK (reps > 0)
  );
  CREATE INDEX IF NOT EXISTS idx_sets_session
    ON session_sets(session_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise
    ON session_sets(exercise_id);
`);

// ---------------- Migraciones (BD anteriores) ----------------
// Si ya existían workouts/sessions/exercises sin user_id, se añaden y se
// asignan a admin (id 1, que siempre es el primer usuario sembrado).
const wCols = db.prepare('PRAGMA table_info(workouts)').all().map((c) => c.name);
if (!wCols.includes('user_id'))
  db.exec('ALTER TABLE workouts ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1');
const sCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
if (!sCols.includes('user_id'))
  db.exec('ALTER TABLE sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1');
const eCols = db.prepare('PRAGMA table_info(exercises)').all().map((c) => c.name);
if (!eCols.includes('image'))
  db.exec('ALTER TABLE exercises ADD COLUMN image TEXT');
if (!eCols.includes('user_id'))
  db.exec('ALTER TABLE exercises ADD COLUMN user_id INTEGER');
db.exec('UPDATE exercises SET user_id = 1 WHERE user_id IS NULL AND is_custom = 1');
// Índices de user_id: aquí (y no en el bloque de esquema) porque en una BD
// antigua la columna se acaba de añadir con ALTER.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// ---------------- Siembra de usuarios ----------------
const nUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (nUsers === 0) {
  db.prepare('INSERT INTO users (username, pass_hash, is_admin) VALUES (?, ?, 1)')
    .run('admin', hashPassword('gym1234'));
  console.log('Cuenta por defecto creada: usuario «admin» / contraseña «gym1234»');
}

// ---------------- Siembra del catálogo de ejercicios ----------------
// Solo si la tabla está vacía (primera ejecución).
const total = db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n;
if (total === 0) {
  const insert = db.prepare(
    'INSERT INTO exercises (name, muscle_group, is_custom, user_id, image) VALUES (?, ?, 0, NULL, ?)'
  );
  const seedMany = db.transaction((rows) => {
    for (const [group, name, image] of rows) insert.run(name, group, image);
  });
  seedMany(CATALOG);
  console.log(`Catálogo sembrado: ${CATALOG.length} ejercicios`);
} else {
  // Re lleno de imágenes para las filas del catálogo
  const upd = db.prepare('UPDATE exercises SET image = ? WHERE id = ?');
  const rows = db.prepare('SELECT id, name FROM exercises WHERE image IS NULL OR image = \'\'').all();
  const byName = new Map(CATALOG.map(([g, n, img]) => [n.toLowerCase(), img]));
  const backfill = db.transaction(() => {
    for (const r of rows) {
      const img = byName.get(r.name.toLowerCase());
      if (img) upd.run(img, r.id);
    }
  });
  backfill();
}

module.exports = db;
db.hashPassword = hashPassword;
db.verifyPassword = verifyPassword;
