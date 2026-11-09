# 💪 Gym Log

App web para apuntar entrenamientos de gimnasio: por cada ejercicio se registran
**peso, series y repeticiones**, con **historial por ejercicio y gráficos de
progreso**, y **plantillas de entrenamiento** desde las que lanzar cada sesión.

## Arrancar (Docker)

Requisitos: Docker Desktop en marcha.

```bash
docker compose up -d --build
```

Abre **http://localhost:3000** en el navegador (también desde el móvil, si estás en la misma red: `http://<ip-del-equipo>:3000`).

Detener / eliminar:

```bash
docker compose down
```

### Datos

La base de datos es un fichero SQLite en **`./data/gym.db`** (volumen montado):
se conserva al reconstruir o eliminar el contenedor. Para empezar de cero,
borra el contenido de `data/` y vuelve a `docker compose up -d`.

## Acceso (login)

La app pide **usuario y contraseña** antes de mostrar nada (la cookie de
sesión dura 30 días). En el primer arranque se crea la cuenta por defecto:

- **Usuario:** `admin` · **Contraseña:** `gym1234`

Cambia tu contraseña con un clic en tu nombre (arriba a la derecha).
El panel **Usuarios** (solo lo ven los administradores) permite crear y
borrar cuentas y resetear contraseñas. Cada usuario tiene sus propias
plantillas, sesiones e historial y sus ejercicios personalizados; el
catálogo predefinido es compartido por todos.

## Sin Docker (opcional)

Con Node.js 20+ instalado:

```bash
npm install
npm start
```

La BD se crea en `./gym.db`.

## Pestañas

| Pestaña | Qué hace |
|---|---|
| **Entrenar** | Eliges una plantilla (o "Sesión libre") y apuntas series, peso y reps de cada ejercicio. Los pesos se prellenan con tu último registro. El borrador sobrevive a un refresco de la página. |
| **Entrenamientos** | Crea y edita plantillas: añadir/quitar ejercicios, series y reps objetivo, reordenar, renombrar, eliminar. |
| **Ejercicios** | Catálogo (predefinido + personalizados) agrupado por grupo muscular, con imagen de cada ejercicio (clic para ampliarla). |
| **Historial** | Todas las sesiones (clic para ver detalle o borrar) y, por ejercicio, tabla de registros + gráfico de peso máximo y volumen. |
| **Usuarios** | Solo admin: crear/borrar cuentas, cambiar contraseñas. |

### Imágenes de los ejercicios

Las fotos de los ejercicios se sirven desde `public/images/` (una por ejercicio,
~480 px). Se descargaron de **Wikimedia Commons** (licencias CC) con los scripts
de `scripts/` (`fetch-images*.mjs`); si falta alguna, el campo `image` del
ejercicio se puede vaciar y la app la oculta.

## Archivos

```
server.js        API Express (rutas /api/...)
db.js            Esquema SQLite + siembra del catálogo
data/exercises.js  Catálogo inicial de ejercicios
public/          Frontend (HTML + JS vanilla + Chart.js por CDN)
```
