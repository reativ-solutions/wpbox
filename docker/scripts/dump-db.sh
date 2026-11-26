#!/bin/sh
# Runs inside the `database` container: dumps the local database to backup/dumps/local-<date>.sql
set -eu
mkdir -p /backup/dumps
out="/backup/dumps/local-$(date +%Y%m%d-%H%M%S).sql"
mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --default-character-set=utf8mb4 \
  "$MARIADB_DATABASE" > "$out"
echo "==> Database dumped to backup/dumps/$(basename "$out") (with local URLs)"
