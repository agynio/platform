#!/bin/sh
set -eu

: "${API_UPSTREAM:=http://localhost:3010}"
export API_UPSTREAM

envsubst '$API_UPSTREAM' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
