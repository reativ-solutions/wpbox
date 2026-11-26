#!/bin/sh
# Runs inside the `database` container: recreates the database and imports backup/$BACKUP_SQL.
set -eu

[ -n "${BACKUP_SQL:-}" ] || { echo "BACKUP_SQL is not set in .env (run 'init' first)." >&2; exit 1; }
f="/backup/$BACKUP_SQL"
[ -f "$f" ] || { echo "SQL file not found: backup/$BACKUP_SQL" >&2; exit 1; }

root() { mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$@"; }

echo "==> Recreating database '$MARIADB_DATABASE'"
root -e "DROP DATABASE IF EXISTS \`$MARIADB_DATABASE\`;
         CREATE DATABASE \`$MARIADB_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
         GRANT ALL PRIVILEGES ON \`$MARIADB_DATABASE\`.* TO '$MARIADB_USER'@'%';"

echo "==> Importing backup/$BACKUP_SQL"
# Drop CREATE DATABASE / USE statements so the dump always lands in the local database.
case "$f" in
  *.gz) gunzip -c "$f" ;;
  *)    cat "$f" ;;
esac | sed -E '/^(CREATE DATABASE|USE) /d' | root "$MARIADB_DATABASE"

echo "==> Import done"
