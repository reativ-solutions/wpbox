<p align="center">
  <a href="https://reativ.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/reativ-solutions/wpbox/main/.github/assets/reativ-logo-dark.svg">
      <img src="https://raw.githubusercontent.com/reativ-solutions/wpbox/main/.github/assets/reativ-logo-light.svg" alt="Reativ" width="260">
    </picture>
  </a>
</p>

<h1 align="center">📦 wpbox</h1>

<p align="center">
  <strong>From a live WordPress site to a clean local development environment, in one command.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@reativ/wpbox"><img src="https://img.shields.io/npm/v/@reativ/wpbox?color=5206fd" alt="npm version"></a>
  <a href="https://github.com/reativ-solutions/wpbox/actions/workflows/ci.yml"><img src="https://github.com/reativ-solutions/wpbox/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/node/v/@reativ/wpbox" alt="Node.js version">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platforms">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

---

## Why we built it

Many projects reach us as nothing more than a website running somewhere on the internet. There is no repository, no staging server and no local copy: just production, and often a habit of editing it directly.

We don't work like that. Changes are made in a development environment, tracked in version control, reviewed, and only then shipped. Production is the place where work arrives, not where it happens.

**wpbox** is the first step of that workflow. It takes whatever we receive (a backup file, a download link, or FTP access to a live server) and turns it into a local, isolated, reproducible environment. The site's own code goes into `src/`, ready for git. Everything else is rebuilt the same way on every machine, every time.

We use it on our own projects, and now it's yours too.

## ✨ What it does

```text
┌   wpbox  init
│
◇  Where is the backup?
│  📁 Files in import/
│
◆  Backup format: UpdraftPlus
●  Production site https://www.example.com  ·  table prefix wp_
│
◇  Which themes do you want to edit? (mapped to src/themes)
│  example-theme
│
◇  Your site is ready 🎉 ────────────────────────────────────╮
│                                                             │
│  🌐 Site      http://localhost:8090                         │
│  🔑 Admin     http://localhost:8090/wp-admin/  (admin / admin)
│  📬 Emails    http://localhost:8025  (Mailpit)              │
│  🎨 Theme     src/themes/example-theme                      │
│  🔌 Plugin    src/plugins/example-core                      │
│  🖼️  Uploads   src/uploads                                  │
├─────────────────────────────────────────────────────────────╯
```

- 🗂️ **Reads the backups you already have.** Plain `wp-content` zip + `.sql`, full-site zips, **UpdraftPlus**, **Duplicator**, **All-in-One WP Migration** (`.wpress`), **cPanel / Plesk** `.tar.gz`, and `.sql.gz`.
- 🌍 **Or fetches them for you.** From a URL (Dropbox and Google Drive share links included), or straight from a live server over **FTP / FTPS / SFTP**, with incremental sync.
- 🔁 **Moves the site to a local domain safely.** WP-CLI `search-replace` handles PHP-serialized data, JSON-escaped URLs and every `http` / `https` / `www` variant. A `sed` on the dump would silently corrupt serialized data.
- 🧑‍💻 **Your code in `src/`, everything else rebuilt.** Custom themes and plugins (the ones not from wordpress.org) are detected and bind-mounted for live editing. WordPress core and third-party plugins live in a Docker volume.
- 🛡️ **Never overwrites your work.** Running `init` or `pull` again keeps your changes in `src/` and only adds new uploads.
- 📬 **Nothing leaves your machine.** Every email WordPress sends is caught by [Mailpit](https://mailpit.axllent.org/). Search engine indexing is turned off.
- 🧹 **Ready to work in.** It creates a local admin and deactivates plugins that get in the way of local work: security, caching, maintenance mode, hidden login URLs, Site Kit, Jetpack…
- 🖥️ **Same result on every OS.** macOS, Windows and Linux. You only need Node.js and Docker, because extraction, the database and WP-CLI all run in containers.

## 🚀 Quick start

**Requirements:** [Node.js](https://nodejs.org/) 20+ and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with Compose v2).

```bash
mkdir my-site && cd my-site
mkdir import                 # drop your backup files here
npx @reativ/wpbox init
```

Open the site with `npx @reativ/wpbox open`.

> 💡 Install it once and use the short command everywhere:
>
> ```bash
> npm install -g @reativ/wpbox
> wpbox init
> ```

## 📥 Where the backup comes from

`wpbox init` asks where the backup is:

| Source | What you need |
|---|---|
| 📁 **Files in `import/`** | Put the backup files in `import/`. The format is detected automatically. |
| 🌍 **URL** | One or more direct download links. Credentials in the URL (`https://user:pass@host/…`) become HTTP basic auth. |
| 📡 **FTP / FTPS** | Host, user and password. wpbox finds the WordPress folder by itself. |
| 🔐 **SFTP** | Host, user and a password or SSH key. |

### Supported backup formats

| Format | Files to put in `import/` |
|---|---|
| Plain | `wp-content.zip` + `database.sql` (or `.sql.gz`) |
| Full site | a zip with `wp-content/` inside, optionally with the `.sql` |
| UpdraftPlus | all `backup_…-plugins.zip`, `-themes.zip`, `-uploads.zip`, `-others.zip`, `-db.gz` files |
| Duplicator | the `…_archive.zip` (the installer isn't needed) |
| All-in-One WP Migration | the `.wpress` file (unencrypted, without compression) |
| cPanel / Plesk / generic | the `.tar.gz`, `.tgz` or `.tar` backup |

If an archive holds more than one database dump, wpbox asks which one belongs to the site.

### Database from a live server

When the files come over FTP/SFTP, the database can come from:

1. **A temporary export script** (works on most hosting). wpbox uploads a one-time PHP file with a random name and token, streams the dump over HTTPS, and deletes the file. Only the tables with the site's prefix are exported.
2. **A direct MySQL connection**, with the credentials read from `wp-config.php`. Most shared hosting blocks this from outside.
3. **A `.sql` file** you put in `import/` yourself.

Files are mirrored to `.wpbox/mirror/`, so `wpbox pull` only downloads what changed since the last run.

## 🗺️ Project layout

```text
my-site/
├── import/              📥 backup files (yours or downloaded)
├── src/
│   ├── themes/<slug>    🎨 your themes: edit here, changes are live
│   ├── plugins/<slug>   🔌 your plugins: edit here, changes are live
│   └── uploads/         🖼️ wp-content/uploads
├── dumps/               💾 database dumps from `wpbox db:dump`
└── .wpbox/              ⚙️ generated: compose.yaml, Dockerfile, config.json, mirror/
```

wpbox adds `.wpbox/`, `import/`, `dumps/` and `src/uploads/` to `.gitignore`, so `git init` gives you a repository with only the code that matters.

## 🧰 Commands

| Command | What it does |
|---|---|
| `wpbox init` | Create the local site from a backup |
| `wpbox pull` | Refresh database and files from the same source as last time. Your code in `src/` is kept |
| `wpbox up` / `wpbox down` | Start / stop the containers (data is kept) |
| `wpbox open` | Open the site (`--admin` for the dashboard, `--mail` for Mailpit) |
| `wpbox info` | Show URLs, credentials and folders |
| `wpbox wp <args>` | Run WP-CLI, e.g. `wpbox wp plugin list` |
| `wpbox shell` | Open a shell in the WordPress container |
| `wpbox logs [service]` | Follow the logs (`wordpress`, `database`, `mailpit`) |
| `wpbox db:dump` | Save the local database to `dumps/` |
| `wpbox db:reimport` | Restore the database from the backup (discards local database changes) |
| `wpbox destroy` | Remove containers and volumes. `src/`, `import/` and `dumps/` stay |

### Options

```bash
wpbox init --yes                  # no questions: detected values and last answers
wpbox init --force                # overwrite src/ with the backup version (careful!)
wpbox init --source sftp          # skip the "where is the backup?" question
wpbox init --url https://example.com/backup.zip https://example.com/db.sql.gz
```

For scripts and CI, passwords can come from `WPBOX_FTP_PASSWORD`, `WPBOX_DB_PASSWORD` and `WPBOX_KEY_PASSPHRASE`.

## ⚙️ Configuration

Answers are saved in `.wpbox/config.json`. Edit it and run `wpbox init --yes` to apply:

| Key | Default | Description |
|---|---|---|
| `local.url` | `http://localhost:8090` | Local URL. If 8090 is taken, the next free port is used |
| `wordpressImage` | `php8.3-apache` | [WordPress image tag](https://hub.docker.com/_/wordpress), e.g. `php8.1-apache` for older sites |
| `devCode.themes` / `devCode.plugins` | auto-detected | Themes and plugins mapped to `src/` |
| `disablePlugins` | security, cache, maintenance… | Plugins deactivated locally, if installed |
| `admin` | `admin` / `admin` | Local admin user (created, or its password reset) |

### Custom local domain

Use a URL such as `http://my-site.localhost:8090`: `*.localhost` domains work in modern browsers without any setup.

For other domains (e.g. `http://my-site.test:8090`), add them to your hosts file once:

- **macOS / Linux:** `sudo sh -c 'echo "127.0.0.1 my-site.test" >> /etc/hosts'`
- **Windows:** add `127.0.0.1 my-site.test` to `C:\Windows\System32\drivers\etc\hosts` (Notepad as administrator)

## 🔍 How it works

1. **Collect.** Archives are read (or downloaded or mirrored) into a clean `wp-content` and a `database.sql`. Caches, backups of backups and production-only drop-ins like `object-cache.php` are left out.
2. **Analyze.** The dump is streamed to find the table prefix, the production URLs and multisite installs.
3. **Run.** `.wpbox/compose.yaml` is generated with WordPress + PHP + WP-CLI, MariaDB and Mailpit.
4. **Import.** The dump goes into MariaDB, with MySQL 8 collations mapped so the import doesn't fail.
5. **Place.** Your code goes to `src/`, uploads to `src/uploads`, everything else into the Docker volume.
6. **Localize.** Production URLs are replaced, the local admin is created, disruptive plugins are deactivated and indexing is turned off.

## ❓ Troubleshooting

<details>
<summary><b>"Docker is not running"</b></summary>

Start Docker Desktop, wait until it's running, and try again.
</details>

<details>
<summary><b>The site needs an older PHP version</b></summary>

Set `"wordpressImage": "php8.1-apache"` (or `php7.4-apache`) in `.wpbox/config.json`, then run `wpbox destroy` and `wpbox init --yes`.
</details>

<details>
<summary><b>I can't log in</b></summary>

Use `admin` / `admin`, or the user in `.wpbox/config.json`. If the site uses a custom login URL plugin that isn't deactivated, `wpbox info` shows the right address. `wpbox wp user list` lists every user.
</details>

<details>
<summary><b>Images are missing</b></summary>

If you skipped uploads when pulling over FTP/SFTP, run `wpbox init` and answer yes to uploads, or copy them into `src/uploads/`.
</details>

<details>
<summary><b>The .wpress file can't be read</b></summary>

Encrypted or compressed `.wpress` archives (premium extension options) aren't supported yet. Export again without them.
</details>

## ⚠️ Limitations

- Multisite installs are detected but not supported yet.
- HTTPS isn't served locally yet.
- Duplicator Pro `.daf` archives aren't supported.

## 🧭 Roadmap

- [ ] HTTPS and port-less local domains (`https://my-site.localhost`) through a shared local proxy
- [ ] `wpbox pull --db-only` / `--files-only`
- [ ] Serve missing uploads from production instead of downloading them
- [ ] Anonymize personal data on import (users, WooCommerce orders) and switch payment gateways to test mode
- [ ] Database snapshots: `wpbox snapshot save` / `restore`
- [ ] Optional Xdebug and Adminer
- [ ] SSH + WP-CLI source (export on the server, faster than FTP)

## 🛠️ Development

wpbox is written in TypeScript and compiled to plain ESM with `tsc`, without a bundler.

```bash
git clone https://github.com/reativ-solutions/wpbox.git && cd wpbox
npm install
npm test          # builds and runs the test suite
npm link          # makes `wpbox` point to your working copy
```

```text
src/
├── cli.ts            command-line interface
├── commands/         init, pull, site and database commands
├── sources/          where backups come from: local files, URL, FTP/SFTP
├── backup/           archive readers (zip, tar, wpress), staging and dump analysis
├── remote/           FTP/SFTP file systems, mirroring, remote database export
├── wordpress/        import, URL replacement, content placement
├── docker/           compose file generation and Docker Compose commands
├── project/          paths, configuration, secrets
├── ui/               prompts and terminal output
└── utils/            small shared helpers
```

Issues and pull requests are welcome.

## 📄 License

The code is released under the [MIT License](LICENSE).

The Reativ name and logo are trademarks of Reativ and are not covered by the MIT License.

<p align="center">
  Made with care by <a href="https://reativ.com">Reativ</a>.
</p>
