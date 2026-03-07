# Dockerfile  ← alias for Dockerfile.dev
# Used by the default `docker compose up` (docker-compose.dev.yml).
# For production use Dockerfile.prod.

# syntax=docker/dockerfile:1
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY nginx.dev.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
