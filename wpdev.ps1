# wpdev — local WordPress environment from a backup in backup\ (Windows / PowerShell).
# The real logic lives in docker/scripts/setup.sh (runs inside Docker); this only orchestrates.
# Usage: .\wpdev.cmd <command>   (or: powershell -ExecutionPolicy Bypass -File .\wpdev.ps1 <command>)
param(
  [Parameter(Position = 0)][string]$Command = "help",
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = "Stop"
if (-not $Rest) { $Rest = @() }
Set-Location $PSScriptRoot

function Dc {
  & docker compose @args
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($args -join ' ') failed (exit code $LASTEXITCODE)" }
}

function Need-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw "Docker is not running. Start Docker Desktop and try again." }
}

function Tty-Flag {
  if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { return @("-T") } else { return @() }
}

function Site-Url {
  if (-not (Test-Path .env)) { return "" }
  $line = Get-Content .env | Where-Object { $_ -match '^SITE_URL=' } | Select-Object -Last 1
  if ($line) { return ($line -replace '^SITE_URL=', '').Trim('"') } else { return "" }
}

function Usage {
@"
Usage: .\wpdev.cmd <command> [options]

  init [--yes] [--force]  Build the environment from backup\ (zip + sql)
  up                      Start the containers
  down                    Stop the containers (data is kept)
  open                    Open the site in your browser
  info                    Show URLs and credentials
  logs [service]          Follow logs (e.g. logs wordpress)
  wp <args>               Run WP-CLI (e.g. .\wpdev.cmd wp plugin list)
  shell                   Open a shell in the WordPress container
  db-reimport             Re-import the .sql (discards database changes)
  db-dump                 Dump the local database to backup\dumps\
  destroy                 Remove containers and volumes (src\ and backup\ are kept)

  --yes    don't ask questions, use the values from .env / detected defaults
  --force  re-extract the zip and overwrite src\ (careful with your changes!)
"@ | Write-Host
}

try {
  switch ($Command) {
    "init" {
      Need-Docker
      $cfg = @(); $inst = @()
      foreach ($a in $Rest) {
        switch ($a) {
          { $_ -in "--yes", "-y" } { $cfg += "--yes" }
          "--force"                { $inst += "--force" }
          default                  { throw "Unknown option: $a" }
        }
      }
      $tty = Tty-Flag
      Dc build
      Dc run --rm @tty setup configure @cfg
      Dc up -d --wait --remove-orphans
      Dc exec -T database sh /scripts/import-db.sh
      Dc run --rm -T setup install @inst
      Dc run --rm -T setup info
    }
    "up"          { Need-Docker; Dc up -d --wait; Dc run --rm -T setup info }
    "down"        { Dc down }
    "info"        { Dc run --rm -T setup info }
    "open" {
      $url = Site-Url
      if (-not $url) { throw "Run .\wpdev.cmd init first." }
      Start-Process $url
    }
    "logs"        { Dc logs -f --tail=100 @Rest }
    "wp"          { $tty = Tty-Flag; Dc exec @tty --user www-data wordpress wp @Rest }
    "shell"       { Dc exec wordpress bash }
    "db-reimport" { Need-Docker; Dc exec -T database sh /scripts/import-db.sh; Dc run --rm -T setup fix-db }
    "db-dump"     { Dc exec -T database sh /scripts/dump-db.sh }
    "destroy" {
      $ok = Read-Host "Remove containers and volumes (database + WordPress core)? src\ and backup\ are kept. [y/N]"
      if ($ok -match '^[yY]$') { Dc down -v --remove-orphans } else { Write-Host "Cancelled." }
    }
    { $_ -in "help", "-h", "--help" } { Usage }
    default { Write-Host "Unknown command: $Command" -ForegroundColor Red; Usage; exit 1 }
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
