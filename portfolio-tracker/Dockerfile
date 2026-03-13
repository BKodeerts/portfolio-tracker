FROM node:lts-alpine3.23 AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM node:lts-alpine3.23
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/run.sh /run.sh
RUN chmod +x /run.sh && mkdir -p cache
EXPOSE 3069
CMD ["/run.sh"]
