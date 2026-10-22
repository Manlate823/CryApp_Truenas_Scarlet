FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js setup-owner.js ./
COPY public ./public
USER node
EXPOSE 3000
CMD ["node","server.js"]
