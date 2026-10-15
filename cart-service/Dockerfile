FROM node:22-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8005
CMD ["node", "cartService.js"]
