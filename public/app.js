'use strict';

/* ==================== Utilidades ==================== */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  tab: 'train',
  catalog: [],            // todos los ejercicios
  workouts: [],           // plantillas (con exercises[] y last_weight)
  draft: null,            // sesión en curso (pestaña Entrenar)
  wEditor: null,          // plantilla en edición (pestaña Entrenamientos)
  historyExercise: null,  // ejercicio seleccionado en Historial
  historyView: 'list',    // 'list' | 'detail'
  sessionDetailId: null,
  username: null,         // usuario logueado
  isAdmin: false,
  anim: {},               // slug -> 'gif' | 'mp4' (animaciones disponibles)
};

let historyChart = null;

/* ==================== Tema oscuro / claro ==================== */

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('gym-theme', t); } catch (e) { /* modo privado */ }
  const btn = $('#theme-btn');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  // El gráfico de Historial usa colores del tema: re-renderizar si está visible
  if (state.tab === 'history' && state.historyView !== 'detail' && historyChart) renderHistory();
}

// Colores del gráfico según el tema activo
function chartColors() {
  const light = currentTheme() === 'light';
  return {
    grid: light ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)',
    gridSoft: light ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.04)',
    tick: light ? '#5f6b7a' : '#98a2b3',
    legend: light ? '#1c2430' : '#cfd6e0',
  };
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/login')) showLogin();
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data;
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

const fmtNum = (n) => {
  if (n == null) return '—';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Miniatura del ejercicio (se oculta sola si falta la imagen).
// Si existe animación, se marca con una insignia de vídeo.
function exImage(ex, cls = '') {
  if (!ex || !ex.image) return '';
  const clsFinal = 'ex-img ' + cls;
  const anim = state.anim[ex.image];
  const img = `<img class="${clsFinal.trim()}" src="/images/${ex.image}.jpg" alt="${ex.name}" loading="lazy"
    data-src="/images/${ex.image}.jpg" data-name="${ex.name}" data-slug="${ex.image}"
    onclick="openLightbox(this.dataset.src, this.dataset.name, this.dataset.slug)">`;
  return anim
    ? `<span class="ex-media">${img}<span class="anim-badge" title="Con animación">▶</span></span>`
    : img;
}

function openLightbox(src, name, slug) {
  document.querySelectorAll('.lightbox').forEach((n) => n.remove());
  const div = document.createElement('div');
  div.className = 'lightbox';
  const anim = slug ? state.anim[slug] : null;
  let media;
  if (anim === 'gif') {
    media = `<img src="/images/${slug}.gif" alt="${name}">`;
  } else if (anim) {
    media = `<video src="/images/${slug}.${anim}" autoplay loop muted playsinline controls></video>`;
  } else {
    media = `<img src="${src}" alt="${name}">`;
  }
  div.innerHTML = `${media}<div class="lb-name">${name}</div>`;
  const vid = div.querySelector('video');
  if (vid) vid.onclick = (e) => e.stopPropagation();
  div.onclick = () => {
    const v = div.querySelector('video');
    if (v) v.pause();
    div.remove();
  };
  document.body.appendChild(div);
}

function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function muscleGroups() {
  return [...new Set(state.catalog.map((e) => e.muscle_group))].sort((a, b) =>
    a.localeCompare(b, 'es'));
}

function switchTab(tab) {
  state.tab = tab;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('#main section').forEach((s) => { s.hidden = s.id !== 'tab-' + tab; });
  ({ train: renderTrain, workouts: renderWorkouts, exercises: renderExercises, history: renderHistory, users: renderUsers }[tab])();
}

async function loadCatalog() {
  state.catalog = await api('/exercises');
}

/* Selector de ejercicios reutilizable (Entrenar y Entrenamientos) */
function showPicker(host, { exclude = [], onPick }) {
  host.querySelector('.picker')?.remove();
  const div = document.createElement('div');
  div.className = 'card picker';
  div.innerHTML = `
    <input type="search" class="picker-search" placeholder="Buscar ejercicio…" autocomplete="off">
    <div class="picker-list"></div>
    <div class="row"><button class="btn ghost small picker-close">Cancelar</button></div>`;
  const search = div.querySelector('.picker-search');
  const list = div.querySelector('.picker-list');
  const fill = () => {
    const q = search.value.trim().toLowerCase();
    const rows = state.catalog
      .filter((e) => !exclude.includes(e.id) &&
        (!q || e.name.toLowerCase().includes(q) || e.muscle_group.toLowerCase().includes(q)))
      .slice(0, 60);
    list.innerHTML = rows.map((e) => `
      <button class="picker-item" data-id="${e.id}">
        ${exImage(e, 'thumb')}
        <span class="pi-name">${e.name}</span><span>${e.muscle_group}</span>
      </button>`).join('') || '<p class="hint">Sin resultados.</p>';
    list.querySelectorAll('.picker-item').forEach((b) => {
      b.onclick = () => onPick(+b.dataset.id, div);
    });
  };
  search.oninput = fill;
  div.querySelector('.picker-close').onclick = () => div.remove();
  host.appendChild(div);
  fill();
  search.focus();
}

/* ==================== Pestaña: Entrenar ==================== */

// Borrador por usuario (para que no se mezclen si se comparte el navegador)
function draftKey() {
  return 'gym-draft' + (state.username ? `-${state.username}` : '');
}

function persistDraft() {
  if (state.draft) sessionStorage.setItem(draftKey(), JSON.stringify(state.draft));
  else sessionStorage.removeItem(draftKey());
}

// Orden natural para plantillas cuyo nombre empieza por día (Lunes, Martes…)
const WEEK_DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
function weekIdx(name) {
  const low = String(name).toLowerCase();
  const i = WEEK_DAYS.findIndex((d) => low.startsWith(d));
  return i === -1 ? 99 : i;
}

async function renderTrain() {
  const el = $('#tab-train');
  if (state.draft) return renderTrainEditor(el);
  state.workouts = await api('/workouts');
  state.workouts.sort((a, b) => weekIdx(a.name) - weekIdx(b.name) || a.name.localeCompare(b.name, 'es'));
  let html = `
    <h2>Entrenamiento</h2>
    <p class="hint">Elige una plantilla o una sesión libre. Los pesos se prellenan con tu último registro.</p>
    <div class="card-list">`;
  html += state.workouts.map((w) => `
    <button class="card workout-card" data-id="${w.id}">
      <div><strong>${w.name}</strong></div>
      <span>${w.exercises.length} ejercicios</span>
    </button>`).join('') ||
    '<p class="hint">Aún no hay plantillas. Crea una en la pestaña <em>Entrenamientos</em>.</p>';
  html += `</div>
    <button class="btn secondary" id="free-session" style="width:100%">Sesión libre</button>`;
  el.innerHTML = html;
  $$('.workout-card', el).forEach((b) => {
    b.onclick = () => startFromWorkout(+b.dataset.id);
  });
  $('#free-session', el).onclick = () => {
    state.draft = { workout_id: null, name: 'Sesión libre', exercises: [] };
    persistDraft();
    renderTrain();
  };
}

function startFromWorkout(id) {
  const w = state.workouts.find((x) => x.id === id);
  if (!w) return;
  state.draft = {
    workout_id: w.id,
    name: w.name,
    exercises: w.exercises.map((e, i) => ({
      exercise_id: e.exercise_id,
      name: e.name,
      image: e.image,
      position: i,
      sets: Array.from({ length: e.target_sets }, () => ({ weight: e.last_weight || '', reps: e.target_reps })),
    })),
  };
  persistDraft();
  renderTrain();
}

function renderTrainEditor(el) {
  const d = state.draft;
  el.innerHTML = `
    <div class="session-header">
      <div>
        <h2>${d.name}</h2>
        <input type="date" id="session-date" value="${todayLocal()}" title="Fecha de la sesión">
      </div>
      <div class="row">
        <button class="btn ghost" id="discard-draft">Cancelar</button>
        <button class="btn primary" id="save-session">Guardar sesión</button>
      </div>
    </div>
    <div id="train-exercises"></div>
    <button class="btn secondary" id="add-exercise" style="width:100%">+ Añadir ejercicio</button>`;
  const listEl = $('#train-exercises', el);

  const renderList = () => {
    listEl.innerHTML = d.exercises.length
      ? d.exercises.map((ex, i) => `
        <div class="card exercise-block">
          <div class="exercise-head">
            ${exImage(ex, 'big')}
            <strong>${ex.name}</strong>
            <button class="icon-btn" data-act="remove-ex" data-i="${i}" title="Quitar ejercicio">✕</button>
          </div>
          ${ex.sets.map((s, j) => `
            <div class="set-row">
              <span class="set-label">${j + 1}</span>
              <input type="number" min="0" step="0.5" inputmode="decimal" class="num"
                     data-act="weight" data-i="${i}" data-j="${j}"
                     value="${s.weight === '' ? '' : s.weight}" placeholder="0">
              <span class="unit">kg</span>
              <input type="number" min="1" step="1" inputmode="numeric" class="num"
                     data-act="reps" data-i="${i}" data-j="${j}"
                     value="${s.reps}" placeholder="10">
              <span class="unit">reps</span>
              <button class="icon-btn" data-act="remove-set" data-i="${i}" data-j="${j}" title="Quitar serie">✕</button>
            </div>`).join('')}
          <div class="row"><button class="btn small" data-act="add-set" data-i="${i}">+ serie</button></div>
        </div>`).join('')
      : '<p class="hint">Sin ejercicios todavía. Añade uno abajo.</p>';
  };
  renderList();

  // Cambios de peso/reps: guardar sin re-renderizar (conservar el foco)
  el.oninput = (ev) => {
    const inp = ev.target.closest('[data-act="weight"], [data-act="reps"]');
    if (!inp) return;
    const iN = +inp.dataset.i, jN = +inp.dataset.j;
    const key = inp.dataset.act === 'weight' ? 'weight' : 'reps';
    d.exercises[iN].sets[jN][key] = inp.value === '' ? '' : +inp.value;
    persistDraft();
  };

  el.onclick = (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const { act, i, j } = btn.dataset;
    const iN = +i, jN = j === undefined ? undefined : +j;
    if (act === 'add-set') {
      const last = d.exercises[iN].sets[d.exercises[iN].sets.length - 1] || {};
      d.exercises[iN].sets.push({ weight: last.weight || '', reps: 10 });
    } else if (act === 'remove-set') {
      d.exercises[iN].sets.splice(jN, 1);
    } else if (act === 'remove-ex') {
      d.exercises.splice(iN, 1);
    } else {
      return;
    }
    persistDraft();
    renderList();
  };

  $('#add-exercise', el).onclick = () => {
    showPicker(el, {
      exclude: d.exercises.map((e) => e.exercise_id),
      onPick: async (id, div) => {
        const ex = state.catalog.find((x) => x.id === id);
        let last = '';
        try {
          const hist = await api(`/exercises/${id}/history`);
          const s = hist.sessions[hist.sessions.length - 1];
          if (s) last = s.max_weight;
        } catch (e) { /* sin historial: vacío */ }
        d.exercises.push({
          exercise_id: id, name: ex.name, image: ex.image, position: d.exercises.length,
          sets: [{ weight: last, reps: 10 }],
        });
        persistDraft();
        div.remove();
        renderTrain();
      },
    });
  };

  $('#discard-draft', el).onclick = () => {
    if (confirm('¿Descartar la sesión que estás apuntando?')) {
      state.draft = null;
      persistDraft();
      renderTrain();
    }
  };

  $('#save-session', el).onclick = async () => {
    for (const ex of d.exercises) {
      if (!ex.sets.length) { toast(`Añade al menos una serie a «${ex.name}».`, true); return; }
      for (const s of ex.sets) {
        if (!(+s.weight > 0) || !(+s.reps >= 1)) {
          toast(`Revisa peso y repeticiones de «${ex.name}»: hay series incompletas.`, true);
          return;
        }
      }
    }
    const dateVal = $('#session-date', el).value;
    const started_at =
      dateVal && dateVal !== todayLocal()
        ? `${dateVal}T12:00:00`
        : new Date().toISOString();
    try {
      await api('/sessions', {
        method: 'POST',
        body: {
          workout_id: d.workout_id ?? undefined,
          name: d.workout_id ? undefined : d.name,
          started_at,
          exercises: d.exercises.map((e, i) => ({
            exercise_id: e.exercise_id, position: i, sets: e.sets,
          })),
        },
      });
      toast('Sesión guardada ✓');
      state.draft = null;
      persistDraft();
      renderTrain();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

/* ==================== Pestaña: Entrenamientos ==================== */

async function renderWorkouts() {
  const el = $('#tab-workouts');
  state.workouts = await api('/workouts');
  if (state.wEditor) return renderWorkoutEditor(el);

  let html = `
    <h2>Entrenamientos</h2>
    <div class="row">
      <input id="new-w-name" class="text" placeholder="Nombre (p. ej. Pecho y Tríceps)" style="flex:1; min-width:200px">
      <button class="btn primary" id="new-w-btn">Crear</button>
    </div>
    <div class="card-list" style="margin-top:12px">`;
  html += state.workouts.map((w) => `
    <button class="card workout-card" data-id="${w.id}">
      <div><strong>${w.name}</strong></div>
      <span>${w.exercises.length} ejercicios</span>
    </button>`).join('') ||
    '<p class="hint">Sin plantillas todavía.</p>';
  html += '</div>';
  el.innerHTML = html;

  $('#new-w-btn', el).onclick = async () => {
    const name = $('#new-w-name', el).value.trim();
    if (!name) { toast('Ponle un nombre a la plantilla.', true); return; }
    try {
      const { id } = await api('/workouts', { method: 'POST', body: { name } });
      state.wEditor = { id, name, items: [] };
      renderWorkouts();
    } catch (e) { toast(e.message, true); }
  };

  $$('.workout-card', el).forEach((b) => {
    b.onclick = () => {
      const w = state.workouts.find((x) => x.id === +b.dataset.id);
      state.wEditor = {
        id: w.id,
        name: w.name,
        items: w.exercises.map((e) => ({
          exercise_id: e.exercise_id,
          name: e.name,
          image: e.image,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
        })),
      };
      renderWorkouts();
    };
  });
}

function renderWorkoutEditor(el) {
  const w = state.wEditor;
  const rows = w.items.map((it, i) => `
    <div class="card wex-row">
      ${exImage(it, 'thumb')}
      <div class="wex-info"><strong>${it.name}</strong></div>
      <div class="wex-controls">
        <label>series
          <input type="number" min="1" max="20" class="num" data-field="target_sets" data-i="${i}" value="${it.target_sets}">
        </label>
        <label>reps
          <input type="number" min="1" max="100" class="num" data-field="target_reps" data-i="${i}" value="${it.target_reps}">
        </label>
      </div>
      <div class="wex-actions">
        <button class="icon-btn" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
        <button class="icon-btn" data-act="down" data-i="${i}" ${i === w.items.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
        <button class="icon-btn" data-act="remove" data-i="${i}" title="Quitar">✕</button>
      </div>
    </div>`).join('');

  el.innerHTML = `
    <h2>${w.name}</h2>
    <div class="row">
      <input id="w-name" class="text" value="${w.name}" style="flex:1; min-width:200px" placeholder="Nombre">
      <button class="btn" id="w-rename">Renombrar</button>
    </div>
    <h3>Ejercicios de la plantilla</h3>
    <div id="wex-list">${rows || '<p class="hint">Añade ejercicios a la plantilla.</p>'}</div>
    <div class="row">
      <button class="btn secondary" id="w-add">+ Añadir ejercicio</button>
      <button class="btn primary" id="w-save">Guardar cambios</button>
    </div>
    <div class="row" style="margin-top:24px">
      <button class="btn ghost danger" id="w-delete">Eliminar plantilla</button>
      <button class="btn ghost" id="w-back">← Volver</button>
    </div>`;

  const reRender = () => renderWorkoutEditor(el);

  el.oninput = (ev) => {
    const inp = ev.target.closest('[data-field]');
    if (!inp) return;
    const iN = +inp.dataset.i;
    w.items[iN][inp.dataset.field] = +inp.value || 0;
  };

  el.onclick = (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const iN = +btn.dataset.i;
    if (btn.dataset.act === 'remove') w.items.splice(iN, 1);
    if (btn.dataset.act === 'up' && iN > 0) [w.items[iN - 1], w.items[iN]] = [w.items[iN], w.items[iN - 1]];
    if (btn.dataset.act === 'down' && iN < w.items.length - 1) [w.items[iN + 1], w.items[iN]] = [w.items[iN], w.items[iN + 1]];
    reRender();
  };

  $('#w-add', el).onclick = () => {
    showPicker(el, {
      exclude: w.items.map((e) => e.exercise_id),
      onPick: (id, div) => {
        const ex = state.catalog.find((x) => x.id === id);
        w.items.push({ exercise_id: id, name: ex.name, image: ex.image, target_sets: 3, target_reps: 10 });
        div.remove();
        reRender();
      },
    });
  };

  const save = async () => {
    try {
      const name = $('#w-name', el).value.trim() || w.name;
      await api(`/workouts/${w.id}`, { method: 'PUT', body: { name } });
      await api(`/workouts/${w.id}/exercises`, {
        method: 'PUT',
        body: {
          exercises: w.items.map((it, i) => ({
            exercise_id: it.exercise_id,
            target_sets: it.target_sets || 3,
            target_reps: it.target_reps || 10,
            position: i,
          })),
        },
      });
      w.name = name;
      toast('Plantilla guardada ✓');
      renderWorkouts();
    } catch (e) { toast(e.message, true); }
  };

  $('#w-save', el).onclick = save;
  $('#w-rename', el).onclick = save;

  $('#w-delete', el).onclick = async () => {
    if (!confirm(`¿Eliminar la plantilla «${w.name}»? El historial de sesiones se conserva.`)) return;
    try {
      await api(`/workouts/${w.id}`, { method: 'DELETE' });
      state.wEditor = null;
      toast('Plantilla eliminada ✓');
      renderWorkouts();
    } catch (e) { toast(e.message, true); }
  };

  $('#w-back', el).onclick = () => { state.wEditor = null; renderWorkouts(); };
}

/* ==================== Pestaña: Ejercicios ==================== */

async function renderExercises() {
  const el = $('#tab-exercises');
  await loadCatalog();
  const groups = muscleGroups();
  let html = `
    <h2>Ejercicios</h2>
    <div class="card">
      <h3 style="margin-top:0">Nuevo ejercicio</h3>
      <div class="row">
        <input id="ex-name" class="text" placeholder="Nombre del ejercicio" style="flex:1; min-width:180px">
        <select id="ex-group">${groups.map((g) => `<option>${g}</option>`).join('')}<option>Otro</option></select>
        <button class="btn primary" id="ex-add">Añadir</button>
      </div>
    </div>`;
  for (const g of groups) {
    const list = state.catalog.filter((e) => e.muscle_group === g);
    if (!list.length) continue;
    html += `<h3>${g}</h3><div class="card-list">` +
      list.map((e) => `
        <div class="card ex-row">
          ${exImage(e)}
          <span>${e.name}${e.is_custom ? ' <em class="custom">personalizado</em>' : ''}</span>
          ${e.is_custom ? `<button class="icon-btn" data-del="${e.id}" title="Borrar">✕</button>` : ''}
        </div>`).join('') + '</div>';
  }
  el.innerHTML = html;

  $('#ex-add', el).onclick = async () => {
    const name = $('#ex-name', el).value.trim();
    if (!name) { toast('Escribe el nombre del ejercicio.', true); return; }
    try {
      await api('/exercises', { method: 'POST', body: { name, muscle_group: $('#ex-group', el).value } });
      await loadCatalog();
      toast('Ejercicio añadido ✓');
      renderExercises();
    } catch (e) { toast(e.message, true); }
  };

  $$('[data-del]', el).forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Borrar este ejercicio? Solo se puede borrar si no aparece en plantillas ni en el historial.')) return;
      try {
        await api(`/exercises/${b.dataset.del}`, { method: 'DELETE' });
        await loadCatalog();
        toast('Ejercicio borrado ✓');
        renderExercises();
      } catch (e) { toast(e.message, true); }
    };
  });
}

/* ==================== Pestaña: Historial ==================== */

async function renderHistory() {
  const el = $('#tab-history');
  await loadCatalog();
  if (state.historyView === 'detail') return renderSessionDetail(el);

  const selected = state.historyExercise || (state.catalog[0] && state.catalog[0].id) || null;
  el.innerHTML = `
    <h2>Historial</h2>
    <div class="row">
      <select id="hist-exercise" style="flex:1; min-width:200px">
        ${state.catalog.map((e) =>
          `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${e.name}</option>`).join('')}
      </select>
    </div>
    <div class="card chart-wrap" style="margin-top:12px"><canvas id="hist-chart" height="130"></canvas></div>
    <div id="hist-table"></div>
    <h3>Sesiones</h3>
    <div id="session-list" class="card-list"></div>`;

  $('#hist-exercise', el).onchange = (e) => {
    state.historyExercise = +e.target.value;
    renderHistory();
  };

  const [hist, sessions] = await Promise.all([
    api(`/exercises/${selected}/history`),
    api('/sessions'),
  ]);
  renderExerciseHistory(el, hist);

  const listEl = $('#session-list', el);
  listEl.innerHTML = sessions.map((s) => `
    <button class="card session-card" data-id="${s.id}">
      <div><strong>${s.name}</strong><span>${fmtDate(s.started_at)}</span></div>
      <span class="session-meta">${s.exercise_count} ej. · ${fmtNum(Math.round(s.volume))} kg</span>
    </button>`).join('') || '<p class="hint">Sin sesiones guardadas todavía.</p>';
  $$('.session-card', listEl).forEach((b) => {
    b.onclick = () => {
      state.historyView = 'detail';
      state.sessionDetailId = +b.dataset.id;
      renderHistory();
    };
  });
}

function renderExerciseHistory(el, hist) {
  const tbl = $('#hist-table', el);
  const rows = [...hist.sessions].reverse();
  tbl.innerHTML = rows.length ? `
    <table>
      <thead><tr><th>Fecha</th><th>Peso máx.</th><th>Series</th><th>Volumen</th><th>Sesión</th></tr></thead>
      <tbody>${rows.map((s) => `
        <tr>
          <td>${fmtDate(s.started_at)}</td>
          <td>${fmtNum(s.max_weight)} kg</td>
          <td>${s.sets}</td>
          <td>${fmtNum(s.volume)} kg</td>
          <td class="nowrap">${s.session_name}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="hint">Todavía sin registros para este ejercicio.</p>';

  if (historyChart) { historyChart.destroy(); historyChart = null; }
  const data = hist.sessions; // ascendente
  if (!data.length) return;
  if (typeof Chart === 'undefined') return;
  const cc = chartColors();
  historyChart = new Chart($('#hist-chart', el), {
    type: 'line',
    data: {
      labels: data.map((s) => fmtDate(s.started_at)),
      datasets: [
        {
          label: 'Peso máx. (kg)',
          data: data.map((s) => s.max_weight),
          borderColor: '#4f8cff',
          backgroundColor: 'rgba(79,140,255,.15)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'Volumen (kg)',
          data: data.map((s) => s.volume),
          borderColor: '#22c55e',
          borderDash: [5, 4],
          tension: 0.3,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          position: 'left',
          title: { display: true, text: 'kg' },
          grid: { color: cc.grid },
          ticks: { color: cc.tick },
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#22c55e' },
        },
        x: {
          ticks: { color: cc.tick, maxRotation: 45 },
          grid: { color: cc.gridSoft },
        },
      },
      plugins: { legend: { labels: { color: cc.legend } } },
    },
  });
}

async function renderSessionDetail(el) {
  const s = await api(`/sessions/${state.sessionDetailId}`);
  const total = s.exercises.reduce(
    (a, e) => a + e.sets.reduce((x, st) => x + st.weight * st.reps, 0), 0);
  el.innerHTML = `
    <button class="btn ghost" id="back-sessions" style="margin-bottom:10px">← Volver</button>
    <h2>${s.name} <small>${fmtDate(s.started_at)}</small></h2>
    ${s.exercises.map((e) => `
      <div class="card exercise-block">
        <div class="exercise-head">
          <strong>${e.name}</strong>
          <span class="muted">${e.muscle_group}</span>
        </div>
        ${e.sets.map((st, i) => `
          <div class="set-row">
            <span class="set-label">${i + 1}</span>
            <span class="stat">${fmtNum(st.weight)} kg × ${st.reps} reps</span>
          </div>`).join('')}
      </div>`).join('')}
    <p class="hint">Volumen total: <strong>${fmtNum(Math.round(total))} kg</strong></p>
    <button class="btn ghost danger" id="del-session">Eliminar sesión</button>`;
  $('#back-sessions', el).onclick = () => {
    state.historyView = 'list';
    state.sessionDetailId = null;
    renderHistory();
  };
  $('#del-session', el).onclick = async () => {
    if (!confirm('¿Eliminar esta sesión del historial?')) return;
    try {
      await api(`/sessions/${s.id}`, { method: 'DELETE' });
      toast('Sesión eliminada ✓');
      state.historyView = 'list';
      renderHistory();
    } catch (e) { toast(e.message, true); }
  };
}

/* ==================== Pestaña: Usuarios (solo admin) ==================== */

async function renderUsers() {
  const el = $('#tab-users');
  const users = await api('/users');
  el.innerHTML = `
    <h2>Usuarios</h2>
    <div class="card">
      <h3 style="margin-top:0">Nuevo usuario</h3>
      <div class="row">
        <input id="nu-name" class="text" placeholder="Usuario" style="flex:1; min-width:140px">
        <input id="nu-pass" class="text" type="password" placeholder="Contraseña" style="flex:1; min-width:140px">
        <label class="check"><input type="checkbox" id="nu-admin"> Admin</label>
        <button class="btn primary" id="nu-btn">Crear</button>
      </div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Plantillas</th><th>Sesiones</th><th></th></tr></thead>
        <tbody>
        ${users.map((u) => `
          <tr>
            <td>${u.username}${u.username === state.username ? ' <em class="muted">(tú)</em>' : ''}</td>
            <td>${u.is_admin ? '⭐ admin' : '—'}</td>
            <td>${u.n_workouts}</td>
            <td>${u.n_sessions}</td>
            <td class="nowrap">
              <button class="btn small" data-pass="${u.id}">Cambiar pass</button>
              <button class="btn ghost danger small" data-deluser="${u.id}">✕</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  $('#nu-btn', el).onclick = async () => {
    const username = $('#nu-name', el).value.trim();
    const password = $('#nu-pass', el).value;
    if (!username || !password) { toast('Escribe usuario y contraseña.', true); return; }
    try {
      await api('/users', { method: 'POST', body: { username, password, is_admin: $('#nu-admin', el).checked } });
      toast('Usuario creado ✓');
      renderUsers();
    } catch (e) { toast(e.message, true); }
  };

  $$('[data-pass]', el).forEach((b) => {
    b.onclick = async () => {
      const u = users.find((x) => x.id === +b.dataset.pass);
      let current = null;
      if (u.username === state.username) {
        current = prompt(`Cambiar la contraseña de ${u.username}: contraseña actual:`);
        if (current === null) return;
      }
      const next = prompt(`Nueva contraseña para ${u.username}:`);
      if (!next) return;
      try {
        await api(`/users/${u.id}/password`, { method: 'PUT', body: { password: next, current } });
        toast('Contraseña actualizada ✓');
      } catch (e) { toast(e.message, true); }
    };
  });

  $$('[data-deluser]', el).forEach((b) => {
    b.onclick = async () => {
      const u = users.find((x) => x.id === +b.dataset.deluser);
      if (confirm(`¿Borrar a «${u.username}» y todos sus datos (plantillas, sesiones, ejercicios propios)?`)) {
        try {
          await api(`/users/${u.id}`, { method: 'DELETE' });
          toast('Usuario borrado ✓');
          renderUsers();
        } catch (e) { toast(e.message, true); }
      }
    };
  });
}

/* ==================== Acceso (login / logout) ==================== */

function showLogin() {
  $('#app-header').hidden = true;
  $('#main').hidden = true;
  $('#login').hidden = false;
  const u = $('#login-user');
  if (u && !u.value) u.focus();
}

async function initAuth() {
  let me = null;
  try {
    const res = await fetch('/api/me');
    me = res.ok ? await res.json() : null;
  } catch (e) { /* servidor caído: se verá el mensaje al cargar datos */ }
  if (!me) { showLogin(); return; }

  state.username = me.username;
  state.isAdmin = !!me.is_admin;
  $('#login').hidden = true;
  $('#app-header').hidden = false;
  $('#main').hidden = false;
  $('#user-chip').textContent = `👤 ${me.username}${me.is_admin ? ' ⭐' : ''}`;
  $('#tab-users-btn').hidden = !me.is_admin;

  try {
    const raw = sessionStorage.getItem(draftKey());
    if (raw) state.draft = JSON.parse(raw);
  } catch (e) { /* borrador corrupto: ignorar */ }
  try {
    await Promise.all([loadCatalog(), api('/anim').then((a) => { state.anim = a; })]);
  } catch (e) {
    toast('No se pudo conectar con el servidor', true);
  }
  switchTab('train');
}

/* ==================== Inicio ==================== */

document.addEventListener('DOMContentLoaded', () => {
  $$('#tabs button').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });

  const themeBtn = $('#theme-btn');
  themeBtn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
  themeBtn.onclick = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');

  $('#login-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const errEl = $('#login-error');
    errEl.hidden = true;
    try {
      await api('/login', {
        method: 'POST',
        body: { username: $('#login-user').value.trim(), password: $('#login-pass').value },
      });
      $('#login-pass').value = '';
      await initAuth();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.hidden = false;
    }
  };

  $('#logout-btn').onclick = async () => {
    try { await api('/logout', { method: 'POST' }); } catch (e) { /* ya se recarga */ }
    location.reload();
  };

  $('#user-chip').onclick = () => {
    const current = prompt('Contraseña actual:');
    if (current === null) return;
    const next = prompt('Nueva contraseña:');
    if (!next) return;
    api(`/users/${state.username}/password`, { method: 'PUT', body: { current, password: next } })
      .then(() => toast('Contraseña cambiada ✓'))
      .catch((e) => toast(e.message, true));
  };

  initAuth();
});
