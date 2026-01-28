FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

COPY firecrawl.js ./

EXPOSE 3000

ENV PORT=3000
CMD ["bun", "run", "firecrawl.js"]
