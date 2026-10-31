FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM alpine:3.24
RUN apk upgrade --no-cache \
 && apk add --no-cache nginx nginx-mod-http-brotli \
 && rm -f /etc/nginx/http.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /srv/ui
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
