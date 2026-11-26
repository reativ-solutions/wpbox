#!/usr/bin/env bash
# wpdev core logic. Runs inside the `setup` container (Linux), so it behaves the
# same on macOS and Windows. The wpdev.sh / wpdev.ps1 wrappers only call into this.
#
#   configure [--yes]   detect the backup, ask for missing/confirm values, write .env + compose.override.yaml
#   install   [--force] extract wp-content and prepare the database (search-replace, admin, plugins)
#   fix-db              database step only (after re-importing the .sql)
#   info                print URLs and credentials
set -euo pipefail

PROJECT=/project
ENV_FILE="$PROJECT/.env"
OVERRIDE="$PROJECT/compose.override.yaml"
BACKUP_DIR="$PROJECT/backup"
WP_ROOT=/var/www/html
WPC="$WP_ROOT/wp-content"

DEFAULT_DISABLE_PLUGINS="wps-hide-login google-site-kit cmp-coming-soon-maintenance coming-soon \
maintenance under-construction-page wordfence better-wp-security all-in-one-wp-security-and-firewall \
really-simple-ssl wp-rocket w3-total-cache wp-super-cache litespeed-cache wp-fastest-cache \
autoptimize jetpack"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!! \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx \033[0m %s\n' "$*" >&2; exit 1; }

# WP-CLI without loading plugins/themes: a broken plugin can't break the setup.
wp() { command wp --allow-root --path="$WP_ROOT" --skip-plugins --skip-themes "$@"; }

# ---------------------------------------------------------------- .env helpers
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' || true
}

env_set() {
  touch "$ENV_FILE"
  local tmp; tmp=$(mktemp)
  if grep -qE "^$1=" "$ENV_FILE"; then
    awk -v k="$1" -v v="$2" 'index($0, k"=")==1 {print k"="v; next} {print}' "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"; printf '%s=%s\n' "$1" "$2" >> "$tmp"
  fi
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}

env_default() { [ -n "$(env_get "$1")" ] || env_set "$1" "$2"; }

# A list value from .env ("none" = empty list; commas allowed as separators).
env_list() { local v; v=$(env_get "$1" | tr ',' ' '); [ "$v" = "none" ] && v=""; echo "$v"; }

# Ask for a value. The current .env value (or the detected default) is the suggestion;
# pressing Enter keeps it. With --yes or without a terminal, the suggestion is used as is.
ASSUME_YES=0
ask() {
  local key=$1 prompt=$2 def=$3 cur ans
  cur=$(env_get "$key"); [ -n "$cur" ] && def=$cur
  if [ -t 0 ] && [ "$ASSUME_YES" = 0 ] && [ "${NONINTERACTIVE:-0}" != 1 ]; then
    read -r -p "$prompt [$def]: " ans || true
    ans=${ans:-$def}
  else
    ans=$def
  fi
  env_set "$key" "$ans"
}

# ---------------------------------------------------------------- backup helpers
newest() { # newest <dir> '<glob>'...   (quoted globs, expanded inside <dir>)
  local d=$1; shift
  (
    cd "$d" || exit 0
    shopt -s nullglob
    # shellcheck disable=SC2206
    local files=($@)
    [ ${#files[@]} -gt 0 ] && ls -t "${files[@]}" | head -n1
  ) || true
}

sql_cat() {
  local f="$BACKUP_DIR/$1"
  case "$f" in *.gz) gunzip -c "$f" ;; *) cat "$f" ;; esac
}

# Value of a wp_options row (e.g. siteurl) from the dump.
sql_option() {
  sql_cat "$1" | grep -m1 -oE "'$2', ?'[^']*'" | sed -E "s/.*'([^']*)'\$/\1/" || true
}

sql_tables() {
  sql_cat "$1" | grep -oE 'CREATE TABLE[^`]*`[^`]+`' | sed -E 's/.*`([^`]+)`/\1/' | sort -u
}

# Table prefix: an *options table that has a matching *posts table.
sql_prefix() {
  local tables t p
  tables=$(sql_tables "$1")
  for t in $(printf '%s\n' "$tables" | grep -E 'options$'); do
    p=${t%options}
    if printf '%s\n' "$tables" | grep -qx "${p}posts"; then echo "$p"; return; fi
  done
}

# Path inside the zip up to the wp-content contents (e.g. "wp-content/", "public_html/wp-content/" or "").
zip_base() { # shortest prefix before a themes/ or plugins/ segment
  awk -F/ '
    { p=""; for (i=1; i<NF; i++) { if ($i=="themes" || $i=="plugins") { if (!found || length(p) < length(best)) { best=p; found=1 } break } p=p $i "/" } }
    END { if (found) print best }' "$1"
}

# Folders under themes|plugins in the zip listing.
zip_dirs() { # zip_dirs <listing> <base> <themes|plugins>
  awk -v p="$2$3/" 'index($0,p)==1 { r=substr($0,length(p)+1); i=index(r,"/"); if (i>1) print substr(r,1,i-1) }' "$1" | sort -u
}

# Heuristic: no readme.txt at the root => not from wordpress.org => your own code.
zip_custom() { # zip_custom <listing> <base> <themes|plugins>
  local d out=""
  for d in $(zip_dirs "$1" "$2" "$3"); do
    grep -qix "$2$3/$d/readme.txt" "$1" || out="$out $d"
  done
  echo "${out# }"
}

zip_listing() { unzip -Z1 "$BACKUP_DIR/$1"; }

load_env() {
  SITE_URL=$(env_get SITE_URL); PROD_URL=$(env_get PROD_URL)
  BACKUP_ZIP=$(env_get BACKUP_ZIP); BACKUP_SQL=$(env_get BACKUP_SQL)
  SRC_THEMES=$(env_list SRC_THEMES); SRC_PLUGINS=$(env_list SRC_PLUGINS)
  DEV_DISABLE_PLUGINS=$(env_list DEV_DISABLE_PLUGINS)
  ADMIN_USER=$(env_get ADMIN_USER); ADMIN_PASSWORD=$(env_get ADMIN_PASSWORD); ADMIN_EMAIL=$(env_get ADMIN_EMAIL)
  [ -n "$SITE_URL" ] || die "SITE_URL is not set. Run 'init' first."
}

in_list() { case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }

url_host() { local r=${1#*://}; r=${r%%/*}; echo "${r%%:*}"; }

# ================================================================ configure
cmd_configure() {
  for a in "$@"; do case "$a" in --yes|-y) ASSUME_YES=1 ;; esac; done

  # --- backup files (newest .zip and .sql/.sql.gz in backup/, unless pinned in .env)
  local zip sql
  zip=$(env_get BACKUP_ZIP); sql=$(env_get BACKUP_SQL)
  { [ -n "$zip" ] && [ -f "$BACKUP_DIR/$zip" ]; } || zip=$(newest "$BACKUP_DIR" '*.zip')
  { [ -n "$sql" ] && [ -f "$BACKUP_DIR/$sql" ]; } || sql=$(newest "$BACKUP_DIR" '*.sql' '*.sql.gz')
  [ -n "$zip" ] || die "No wp-content .zip found in backup/"
  [ -n "$sql" ] || die "No .sql (or .sql.gz) found in backup/"
  log "Backup: backup/$zip + backup/$sql"
  env_set BACKUP_ZIP "$zip"; env_set BACKUP_SQL "$sql"

  # --- what the dump tells us
  local prefix prod siteurl
  prefix=$(sql_prefix "$sql")
  [ -n "$prefix" ] || die "Could not detect the table prefix in the .sql (no *options/*posts tables?)"
  if sql_tables "$sql" | grep -qx "${prefix}blogs"; then
    warn "This looks like a multisite install. Multisite is not supported; results may vary."
  fi
  prod=$(sql_option "$sql" home); [ -n "$prod" ] || prod=$(sql_option "$sql" siteurl)
  [ -n "$prod" ] || die "Could not find 'home'/'siteurl' in the .sql"
  prod=${prod%/}
  siteurl=$(sql_option "$sql" siteurl); siteurl=${siteurl%/}
  [ -z "$siteurl" ] || [ "$siteurl" = "$prod" ] || warn "siteurl ($siteurl) differs from home ($prod); using home."
  log "Table prefix: $prefix   Production URL: $prod"
  env_set TABLE_PREFIX "$prefix"
  env_set PROD_URL "$prod"

  # --- what the zip tells us
  local list base themes plugins
  list=$(mktemp)
  zip_listing "$zip" > "$list"
  base=$(zip_base "$list")
  [ -n "$base" ] || grep -qE '^(themes|plugins)/' "$list" || die "The zip doesn't look like a wp-content folder (no themes/ or plugins/)."
  themes=$(zip_custom "$list" "$base" themes)
  plugins=$(zip_custom "$list" "$base" plugins)
  log "Themes in backup:  $(zip_dirs "$list" "$base" themes | tr '\n' ' ')"
  log "Plugins in backup: $(zip_dirs "$list" "$base" plugins | tr '\n' ' ')"
  rm -f "$list"
  [ -n "$themes" ]  || themes=none
  [ -n "$plugins" ] || plugins=none

  # --- questions
  echo
  echo "Press Enter to accept the suggestion in [brackets]. Use 'none' for an empty list."
  ask SITE_URL    "Local site URL" "http://localhost:8090"
  ask SRC_THEMES  "Themes to edit in src/themes (space separated)" "$themes"
  ask SRC_PLUGINS "Plugins to edit in src/plugins (space separated)" "$plugins"
  echo

  local site rest hostport host port
  site=$(env_get SITE_URL); site=${site%/}; env_set SITE_URL "$site"
  case "$site" in http://*|https://*) ;; *) die "SITE_URL must start with http:// (e.g. http://localhost:8090)";; esac
  rest=${site#*://}; hostport=${rest%%/*}
  [ "$rest" = "$hostport" ] || die "SITE_URL can't contain a path (e.g. http://localhost:8090)"
  host=${hostport%%:*}
  if [ "$host" != "$hostport" ]; then port=${hostport##*:}; else port=80; fi
  case "$site" in https://*) warn "This environment doesn't serve HTTPS; http:// is recommended." ;; esac
  env_set WORDPRESS_PORT "$port"

  # --- defaults (edit .env to change)
  env_default MAILPIT_PORT 8025
  env_default DB_NAME wordpress
  env_default DB_USER wordpress
  env_default DB_PASSWORD wordpress
  env_default DB_ROOT_PASSWORD root
  env_default ADMIN_USER admin
  env_default ADMIN_PASSWORD admin
  env_default ADMIN_EMAIL admin@local.test
  env_default DEV_DISABLE_PLUGINS "$DEFAULT_DISABLE_PLUGINS"

  write_override "$host"
  log "Saved configuration to .env and compose.override.yaml"
}

write_override() {
  local host=$1 t p svc mounts="" extra=""
  for t in $(env_list SRC_THEMES); do
    mkdir -p "$PROJECT/src/themes/$t"
    mounts="$mounts      - ./src/themes/$t:/var/www/html/wp-content/themes/$t"$'\n'
  done
  for p in $(env_list SRC_PLUGINS); do
    mkdir -p "$PROJECT/src/plugins/$p"
    mounts="$mounts      - ./src/plugins/$p:/var/www/html/wp-content/plugins/$p"$'\n'
  done
  mkdir -p "$PROJECT/src/uploads"

  case "$host" in
    localhost|127.0.0.1) ;;
    *) extra="    extra_hosts:"$'\n'"      - \"$host:127.0.0.1\""$'\n' ;;
  esac

  {
    echo "# Generated by 'wpdev init' from .env (SRC_THEMES / SRC_PLUGINS / SITE_URL)."
    echo "# Don't edit by hand: run 'wpdev init' again to change it."
    echo "services:"
    for svc in wordpress setup; do
      if [ -z "$mounts" ] && [ -z "$extra" ]; then echo "  $svc: {}"; continue; fi
      echo "  $svc:"
      [ -z "$mounts" ] || { echo "    volumes:"; printf '%s' "$mounts"; }
      printf '%s' "$extra"
    done
  } > "$OVERRIDE"
}

# ================================================================ install
wait_for_core() {
  local _
  for _ in $(seq 1 120); do
    [ -f "$WP_ROOT/wp-includes/version.php" ] && [ -f "$WP_ROOT/wp-config.php" ] && return 0
    sleep 1
  done
  die "WordPress core didn't show up in $WP_ROOT (check 'wpdev logs wordpress')."
}

dir_empty() { [ -z "$(ls -A "$1" 2>/dev/null)" ]; }

# Copy into the Docker volume (replaces the destination).
copy_into() { # copy_into <src> <dest>
  rm -rf "$2"; mkdir -p "$(dirname "$2")"
  cp -a "$1" "$2"
  chown -R www-data:www-data "$2"
}

# Copy into a folder mapped to src/: never overwrites existing work unless --force.
copy_dev() { # copy_dev <src> <dest> <label>
  mkdir -p "$2"
  if dir_empty "$2" || [ "$FORCE" = 1 ]; then
    cp -a "$1/." "$2/"
    log "  $3 -> copied"
  else
    warn "  $3 already has files, left untouched (use --force to overwrite)."
  fi
}

is_dev_dir() { # is_dev_dir <themes|plugins> <name>
  { [ "$1" = themes ] && in_list "$2" "$SRC_THEMES"; } || { [ "$1" = plugins ] && in_list "$2" "$SRC_PLUGINS"; }
}

place_item() { # place_item <kind> <name> <src-dir>
  if is_dev_dir "$1" "$2"; then copy_dev "$3" "$WPC/$1/$2" "src/$1/$2"
  else copy_into "$3" "$WPC/$1/$2"
  fi
}

FORCE=0
cmd_install() {
  for a in "$@"; do case "$a" in --force) FORCE=1 ;; esac; done
  load_env
  wait_for_core

  if [ -f "$WP_ROOT/.wpdev-files" ] && [ "$FORCE" = 0 ]; then
    log "wp-content already extracted (use --force to redo it)."
    fill_missing
  else
    extract_all
    touch "$WP_ROOT/.wpdev-files"
  fi

  cmd_fix_db
}

extract_all() {
  local tmp list base src item name d
  tmp=/tmp/wpdev-extract
  rm -rf "$tmp"; mkdir -p "$tmp"
  log "Extracting backup/$BACKUP_ZIP (this can take a few minutes)..."
  unzip -q -o "$BACKUP_DIR/$BACKUP_ZIP" -d "$tmp"
  list=$(mktemp); zip_listing "$BACKUP_ZIP" > "$list"
  base=$(zip_base "$list"); rm -f "$list"
  src="$tmp/$base"
  [ -d "$src/themes" ] || [ -d "$src/plugins" ] || die "The zip doesn't look like a wp-content folder (no themes/ or plugins/)."

  for item in "$src"/* "$src"/.[!.]*; do
    [ -e "$item" ] || continue
    name=$(basename "$item")
    case "$name" in
      themes|plugins)
        for d in "$item"/*; do
          [ -e "$d" ] || continue
          if [ -d "$d" ]; then place_item "$name" "$(basename "$d")" "$d"
          else copy_into "$d" "$WPC/$name/$(basename "$d")"
          fi
        done
        ;;
      uploads)
        copy_dev "$item" "$WPC/uploads" "src/uploads"
        ;;
      upgrade|upgrade-temp-backup|cache|wflogs|debug.log)
        ;; # production leftovers
      advanced-cache.php|object-cache.php|db.php)
        warn "  Skipped drop-in '$name' (depends on production cache/database services)."
        ;;
      *)
        copy_into "$item" "$WPC/$name"
        ;;
    esac
  done
  rm -rf "$tmp"
  log "Files ready."
}

# After the first extraction: fill any theme/plugin/uploads folder that is empty,
# e.g. because the src/ selection changed and a new bind mount points to an empty folder.
fill_missing() {
  local list base kind n tmp
  list=$(mktemp); zip_listing "$BACKUP_ZIP" > "$list"
  base=$(zip_base "$list")
  tmp=/tmp/wpdev-partial
  for kind in themes plugins; do
    for n in $(zip_dirs "$list" "$base" "$kind"); do
      dir_empty "$WPC/$kind/$n" || continue
      rm -rf "$tmp"; mkdir -p "$tmp"
      unzip -q -o "$BACKUP_DIR/$BACKUP_ZIP" "$base$kind/$n/*" -d "$tmp"
      place_item "$kind" "$n" "$tmp/$base$kind/$n"
    done
  done
  if dir_empty "$WPC/uploads" && grep -q "^${base}uploads/." "$list"; then
    rm -rf "$tmp"; mkdir -p "$tmp"
    log "Extracting uploads..."
    unzip -q -o "$BACKUP_DIR/$BACKUP_ZIP" "${base}uploads/*" -d "$tmp"
    copy_dev "$tmp/${base}uploads" "$WPC/uploads" "src/uploads"
  fi
  rm -rf "$tmp" "$list"
}

# ================================================================ fix-db
cmd_fix_db() {
  load_env
  wait_for_core
  wp core is-installed || die "The database doesn't look like WordPress (is the table prefix '$(env_get TABLE_PREFIX)' right?)."

  # Domain swap with WP-CLI: it handles PHP-serialized data (sed/regex on the .sql would corrupt it).
  local prod_host site_host from scheme www
  prod_host=${PROD_URL#*://}; prod_host=${prod_host#www.}; prod_host=${prod_host%/}
  site_host=${SITE_URL#*://}
  log "Replacing $PROD_URL -> $SITE_URL"
  for scheme in https http; do
    for www in "www." ""; do
      from="$scheme://$www$prod_host"
      wp search-replace "$from" "$SITE_URL" --all-tables --report-changed-only --quiet
      # JSON-escaped form (block editor, page builders): https:\/\/example.com
      wp search-replace "${from//\//\\/}" "${SITE_URL//\//\\/}" --all-tables --report-changed-only --quiet
    done
  done
  for www in "www." ""; do # protocol-relative URLs: //example.com
    wp search-replace "//$www$prod_host" "//$site_host" --all-tables --report-changed-only --quiet
  done
  wp option update home "$SITE_URL" --quiet
  wp option update siteurl "$SITE_URL" --quiet

  # Local admin
  if wp user get "$ADMIN_USER" --field=ID >/dev/null 2>&1; then
    wp user update "$ADMIN_USER" --user_pass="$ADMIN_PASSWORD" --role=administrator --skip-email --quiet
  else
    wp user create "$ADMIN_USER" "$ADMIN_EMAIL" --role=administrator --user_pass="$ADMIN_PASSWORD" --quiet
  fi
  log "Local admin: $ADMIN_USER / $ADMIN_PASSWORD"

  # Plugins that get in the way during local development
  local p
  for p in $DEV_DISABLE_PLUGINS; do
    if wp plugin is-active "$p" 2>/dev/null; then
      wp plugin deactivate "$p" --quiet && log "Deactivated locally: $p"
    fi
  done

  wp option update blog_public 0 --quiet         # discourage search engines
  wp option delete rewrite_rules --quiet || true  # regenerated on the next request
  wp transient delete --all --quiet || true
  log "Database ready."
}

# ================================================================ info
cmd_info() {
  load_env
  local login="$SITE_URL/wp-admin/" slug host t p
  slug=$(sql_option "$BACKUP_SQL" whl_page)   # custom login path from WPS Hide Login
  if [ -n "$slug" ] && wp plugin is-active wps-hide-login 2>/dev/null; then
    login="$SITE_URL/$slug/"
  fi
  host=$(url_host "$SITE_URL")
  echo
  echo "  🌐 Site:     $SITE_URL"
  echo "  🔑 Admin:    $login   ($ADMIN_USER / $ADMIN_PASSWORD)"
  echo "  📬 Emails:   http://localhost:$(env_get MAILPIT_PORT)   (Mailpit)"
  for t in $SRC_THEMES;  do echo "  🎨 Theme:    src/themes/$t"; done
  for p in $SRC_PLUGINS; do echo "  🔌 Plugin:   src/plugins/$p"; done
  echo "  🖼️  Uploads:  src/uploads"
  case "$host" in
    localhost|127.0.0.1) ;;
    *) echo
       echo "  Add this line to your hosts file (once):  127.0.0.1 $host"
       echo "    macOS/Linux: sudo sh -c 'echo \"127.0.0.1 $host\" >> /etc/hosts'"
       echo "    Windows:     C:\\Windows\\System32\\drivers\\etc\\hosts (open Notepad as administrator)" ;;
  esac
  echo
}

case "${1:-}" in
  configure) shift; cmd_configure "$@" ;;
  install)   shift; cmd_install "$@" ;;
  fix-db)    shift; cmd_fix_db "$@" ;;
  info)      shift; cmd_info "$@" ;;
  *) die "Usage: setup.sh configure|install|fix-db|info" ;;
esac
