# syntax=docker/dockerfile:1
FROM nginx:alpine

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy app source
COPY src/ /usr/share/nginx/html/

# Custom nginx config — needed for:
#   - Correct MIME type for .json (for data chunks)
#   - Service Worker scope (serve from /)
#   - No caching for sw.js and index.html (browser must always re-check)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
