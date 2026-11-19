FROM ghcr.io/nubjs/nub:0.9.0 AS dependencies
WORKDIR /app
COPY --chown=node:node package.json nub.lock ./
RUN nub ci
COPY --chown=node:node . .

FROM dependencies AS development
EXPOSE 5173
ENTRYPOINT []
CMD ["nub", "run", "dev", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

FROM dependencies AS build
RUN nub run build

FROM nginx:1.28-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
