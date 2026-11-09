# ---- Etapa de build: compila better-sqlite3 si no hay binario precompilado ----
FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --no-audit --no-fund

# ---- Imagen final (sin herramientas de compilación) ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY . .

# La base de datos vive en /app/data (volumen) para no perderla al reconstruir
ENV DB_PATH=/app/data/gym.db
EXPOSE 3000

CMD ["node", "server.js"]
