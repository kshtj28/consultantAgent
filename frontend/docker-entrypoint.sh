#!/bin/sh
set -e

# Auto-add https:// if BACKEND_URL has no protocol (catches the common mistake of
# setting BACKEND_URL=my-backend.up.railway.app without the scheme)
case "$BACKEND_URL" in
  http://*|https://*) ;;
  *) export BACKEND_URL="https://$BACKEND_URL" ;;
esac

echo "[entrypoint] BACKEND_URL=$BACKEND_URL"

# Substitute only BACKEND_URL — port is hardcoded 3000 in the template
envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

# Validate config before handing off
nginx -t

exec nginx -g 'daemon off;'
