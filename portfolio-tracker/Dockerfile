FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .
COPY public/ public/
COPY run.sh /run.sh
RUN chmod +x /run.sh && mkdir -p cache
EXPOSE 3069
CMD ["/run.sh"]
