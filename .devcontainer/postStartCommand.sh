#!/bin/bash

set -e

has_cmd() {
    command -v "$1" >/dev/null 2>&1
}

# This script runs every time the devcontainer starts (but not on first creation)
# Use this for tasks that should happen on every start (migrations, warm-ups, etc.)

# Ensure NVM is sourced
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Set Node.js version
has_cmd nvm && nvm use 20 > /dev/null 2>&1 || true

# Ensure database migrations are up-to-date
cd /workspace/project-ostgut/backend
source .env 2>/dev/null || true

# Check if PostgreSQL is ready
if has_cmd pg_isready && pg_isready -h postgres -U postgres >/dev/null 2>&1; then
    # Run migrations to ensure database is at latest version
    has_cmd migrate && migrate -path migrations -database "$DATABASE_URL" up 2>/dev/null || true
fi

echo "✓ Container ready for development"
