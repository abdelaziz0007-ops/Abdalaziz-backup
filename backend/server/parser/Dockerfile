FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server/parser/preview-process.mjs server/parser/tabular-core.mjs server/parser/field-mapping.mjs ./server/parser/
COPY shared/decimal.ts ./shared/
USER 65532:65532
ENTRYPOINT ["node", "--max-old-space-size=384", "/app/server/parser/preview-process.mjs"]
