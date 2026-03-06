FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/mcp-streamable-http.js src/
EXPOSE 3000
CMD ["node", "src/mcp-streamable-http.js"]
