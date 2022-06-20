# syntax=docker/dockerfile:1
FROM node:12-alpine
WORKDIR /proxyFiles
COPY . .
RUN npm install
ENV BASE_PORT=8000
ENV TAILSCALE_TOKEN ""
CMD ["node", "proxyCreate.js"]
EXPOSE 8000-8050