FROM node:16.14 as builder
LABEL maintainer="Harry Nguyen"

WORKDIR /var/source

COPY ./package*.json ./
RUN npm install

COPY . .

FROM node:16.14-alpine
USER node

WORKDIR /var/source
COPY --from=builder --chown=node:node /var/source ./

EXPOSE 8080
ENTRYPOINT ["npm", "run", "start"]