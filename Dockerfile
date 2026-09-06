FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install full deps (including dev deps -- we need tsx and prisma CLI at
# runtime for the ingest sidecar and migrations, so this isn't a slim
# multi-stage production image; fine for a demo/self-hosted deploy).
COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
