FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM alpine:3.24
RUN apk upgrade --no-cache \
 && apk add --no-cache nginx nginx-mod-http-brotli \
 && rm -f /etc/nginx/http.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /srv/ui
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
