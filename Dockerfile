FROM node:16-alpine

WORKDIR /app/

COPY package.json yarn.lock /app/
RUN yarn install --prod

COPY dist /app/dist

CMD ["yarn", "serve", "--port", "8080"]
