FROM node:18-buster

ENV LD_LIBRARY_PATH=/usr/local/lib

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

CMD ["npm", "run", "dev"]