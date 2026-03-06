FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/server/mcp-streamable-http.js src/server/
COPY src/tools/ src/tools/
EXPOSE 3000
CMD ["node", "src/server/mcp-streamable-http.js"]