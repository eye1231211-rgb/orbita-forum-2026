FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/data/orbita.sqlite
COPY --chown=node:node dist-portable/client ./dist-portable/client
COPY --chown=node:node lib ./lib
COPY --chown=node:node public/reu-timetable.json public/reu-groups.json ./public/
COPY --chown=node:node db/demo-data.json ./db/demo-data.json
COPY --chown=node:node drizzle/*.sql ./drizzle/
COPY --chown=node:node scripts/portable-server.mjs scripts/sqlite-adapter.mjs ./scripts/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/portable-server.mjs"]
