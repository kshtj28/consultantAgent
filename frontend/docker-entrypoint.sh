#!/bin/sh
set -e

# Auto-add https:// if BACKEND_URL has no protocol
case "$BACKEND_URL" in
  http://*|https://*) ;;
  *) export BACKEND_URL="https://$BACKEND_URL" ;;
esac

echo "[entrypoint] PORT=$PORT BACKEND_URL=$BACKEND_URL"

# Substitute PORT and BACKEND_URL; nginx's own $variables are left untouched
envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

nginx -t

exec nginx -g 'daemon off;'
