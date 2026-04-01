#!/usr/bin/env bash
set -euo pipefail

# ── SetupIQ deploy script ─────────────────────────────────
# Usage: ./deploy.sh [--build] [--down]
#
#   --build   Force rebuild of all containers
#   --down    Tear down all containers and exit

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse flags
BUILD_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FLAG="--build" ;;
    --down)
      docker compose down
      echo "All containers stopped."
      exit 0
      ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# Ensure .env exists
if [ ! -f .env ]; then
  echo "No .env file found — copying from .env.example"
  cp .env.example .env
  echo ">>> Edit .env with your secrets, then re-run this script."
  exit 1
fi

# Pull latest if this is a git repo
if [ -d .git ]; then
  echo "Pulling latest changes..."
  git pull --ff-only || echo "Warning: git pull failed, deploying current state"
fi

# Build and start
echo "Starting SetupIQ..."
docker compose up -d $BUILD_FLAG

# Wait for postgres to be healthy
echo "Waiting for database..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U setupiq > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Run DB schema push (drizzle-kit push)
echo "Running database migrations..."
docker compose exec -T api sh -c 'cd /app/apps/api && npx drizzle-kit push' \
  && echo "✅ Migrations applied." \
  || echo "⚠️  Migration may need manual review."

echo ""
echo "================================================"
echo " SetupIQ is running!"
echo " https://$(grep SITE_DOMAIN .env | cut -d= -f2 | tr -d '[:space:]')"
echo "================================================"
echo ""
docker compose ps
