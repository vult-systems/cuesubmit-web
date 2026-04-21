# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_FILE_SERVER_IP=localhost
ENV NEXT_PUBLIC_FILE_SERVER_IP=${NEXT_PUBLIC_FILE_SERVER_IP}

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
RUN apk add --no-cache ffmpeg
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Deploy payload — bundled so the publish-to-share API works from production.
# Files are pre-arranged to match the share directory structure.
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/UPDATE.bat              ./deploy-payload/UPDATE.bat
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/DEPLOY-AS-ADMIN.bat     ./deploy-payload/DEPLOY-AS-ADMIN.bat
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/DIAGNOSE.bat            ./deploy-payload/DIAGNOSE.bat
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/LaunchCueNimby.bat      ./deploy-payload/LaunchCueNimby.bat
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/post-update.ps1         ./deploy-payload/post-update.ps1
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/TEST-CUEBOT.py         ./deploy-payload/TEST-CUEBOT.py
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/utils/config/cuenimby.json    ./deploy-payload/source/config/cuenimby.json
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/utils/config/opencue.yaml     ./deploy-payload/source/config/opencue.yaml
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/utils/config/StartCueNimby.vbs ./deploy-payload/source/config/StartCueNimby.vbs
COPY --from=builder /app/opencue/uiw3d_installers/OpenCue_Deploy/utils/config/rqd.conf         ./deploy-payload/source/config/rqd.conf
COPY --from=builder /app/opencue/rqd/rqd/rqnimby.py                                      ./deploy-payload/source/rqd/rqnimby.py
COPY --from=builder /app/opencue/rqd/rqd/rqconstants.py                                  ./deploy-payload/source/rqd/rqconstants.py
COPY --from=builder /app/opencue/cuenimby/cuenimby/activity.py                           ./deploy-payload/source/cuenimby/activity.py
COPY --from=builder /app/opencue/cuenimby/cuenimby/config.py                             ./deploy-payload/source/cuenimby/config.py
COPY --from=builder /app/opencue/cuenimby/cuenimby/monitor.py                            ./deploy-payload/source/cuenimby/monitor.py
COPY --from=builder /app/opencue/cuenimby/cuenimby/notifier.py                           ./deploy-payload/source/cuenimby/notifier.py
COPY --from=builder /app/opencue/cuenimby/cuenimby/tray.py                               ./deploy-payload/source/cuenimby/tray.py
COPY --from=builder /app/opencue/cuenimby/cuenimby/__main__.py                           ./deploy-payload/source/cuenimby/__main__.py

RUN mkdir -p /app/data /app/.next/cache && chown -R nextjs:nodejs /app/data /app/.next/cache

USER nextjs
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
