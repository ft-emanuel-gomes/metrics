FROM node:20-slim

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm config set strict-ssl false && npm install --legacy-peer-deps

COPY . .

ENV NODE_TLS_REJECT_UNAUTHORIZED=0
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
