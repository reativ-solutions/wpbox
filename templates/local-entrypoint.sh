#!/bin/bash
# Make Apache also listen on the public port (e.g. 8090), so WordPress requests to
# itself (http://localhost:8090/wp-cron.php, Site Health) work inside the container.
set -e
if [ -n "${LOCAL_PORT:-}" ] && [ "$LOCAL_PORT" != "80" ] \
   && ! grep -qx "Listen $LOCAL_PORT" /etc/apache2/ports.conf; then
  echo "Listen $LOCAL_PORT" >> /etc/apache2/ports.conf
fi
exec docker-entrypoint.sh "$@"
