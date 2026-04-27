#!/bin/bash

set -e

# Fail early for truly required tooling, and skip optional tasks gracefully.
require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "✗ Required command not found: $1"
        exit 127
    fi
}

has_cmd() {
    command -v "$1" >/dev/null 2>&1
}

ensure_node() {
    if has_cmd node && has_cmd npm; then
        return 0
    fi

    print_info "Node.js not found in PATH, attempting to bootstrap via nvm..."

    export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        print_info "Installing nvm..."
        curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi

    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"

    if has_cmd nvm; then
        local node_version
        node_version="$(cat /workspace/project-ostgut/.nvmrc)"
        nvm install "$node_version"
        nvm alias default "$node_version"
        nvm use "$node_version" >/dev/null
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bougie.fm Development Container Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to print section headers
print_section() {
    echo ""
    echo "▶ $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Function to print success messages
print_success() {
    echo "✓ $1"
}

# Function to print info messages
print_info() {
    echo "ℹ $1"
}

# Verify Go installation
print_section "Verifying Go Installation"
require_cmd go
go version
print_success "Go installed"

# Verify Node.js installation
print_section "Verifying Node.js Installation"
ensure_node
require_cmd node
require_cmd npm
node --version
npm --version
print_success "Node.js installed"

# Backend setup
print_section "Setting up Backend"
cd /workspace/project-ostgut/backend

print_info "Downloading Go modules..."
go mod download
go mod verify
print_success "Go modules downloaded"

print_info "Creating .env file (if not exists)..."
if [ ! -f .env ]; then
    : "${DATABASE_URL:=postgres://postgres:postgres@postgres:5432/ostgut?sslmode=disable}"
    : "${JWT_SECRET:=dev-secret-key-change-in-production}"
    : "${ALLOWED_ORIGINS:=http://localhost:3000,http://localhost:8080}"
    : "${LOG_LEVEL:=info}"
    : "${ENV:=local}"

    cat > .env << EOF
# Database
DATABASE_URL=${DATABASE_URL}

# Authentication
JWT_SECRET=${JWT_SECRET}

# CORS
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}

# Logging
LOG_LEVEL=${LOG_LEVEL}

# Environment
ENV=${ENV}
EOF
    print_success ".env file created"
else
    print_info ".env file already exists"
fi

# Wait for PostgreSQL to be ready
print_section "Waiting for PostgreSQL"
if has_cmd pg_isready; then
    max_attempts=30
    attempt=0
    until pg_isready -h postgres -U postgres >/dev/null 2>&1 || [ $attempt -eq $max_attempts ]; do
        attempt=$((attempt + 1))
        print_info "Waiting for PostgreSQL... (attempt $attempt/$max_attempts)"
        sleep 2
    done

    if [ $attempt -eq $max_attempts ]; then
        print_info "PostgreSQL not reachable during post-create; skipping DB setup for now"
    else
        print_success "PostgreSQL is ready"
    fi
else
    print_info "pg_isready is unavailable; skipping PostgreSQL readiness check"
fi


# Frontend setup
print_section "Setting up Frontend"
cd /workspace/project-ostgut/frontend

print_info "Ensuring correct Node.js version..."
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
    if has_cmd nvm; then
        node_version="$(cat /workspace/project-ostgut/.nvmrc)"
        nvm install "$node_version" >/dev/null
        nvm use "$node_version" >/dev/null
        print_success "Node.js v${node_version} activated"
    else
        print_info "nvm is unavailable; continuing with current Node.js version"
    fi
else
    print_info "nvm.sh not found; continuing with current Node.js version"
fi

print_info "Installing npm dependencies..."
npm ci
print_success "Frontend dependencies installed"

print_info "Creating .env.local file (if not exists)..."
if [ ! -f .env.local ]; then
    : "${NEXT_PUBLIC_API_URL:=http://localhost:8080}"
    : "${NEXTAUTH_SECRET:=dev-secret-key-change-in-production}"
    : "${NEXTAUTH_URL:=http://localhost:3000}"

    cat > .env.local << EOF
NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=${NEXTAUTH_URL}
EOF
    print_success ".env.local file created"
else
    print_info ".env.local file already exists"
fi

# Summary
print_section "Setup Complete!"
echo ""
echo "  Your development environment is ready!"
echo ""
echo "  Next steps:"
echo "  1. Open VS Code integrated terminal (⌃\`)"
echo "  2. Start the development servers:"
echo ""
echo "    Terminal 1 - Backend:"
echo "      $ cd backend && go run ./cmd/api"
echo ""
echo "    Terminal 2 - Frontend:"
echo "      $ cd frontend && npm run dev"
echo ""
echo "  Access:"
echo "    Frontend:  http://localhost:3000"
echo "    Backend:   http://localhost:8080"
echo "    Database:  localhost:5432 (shared postgres + PGPASSWORD)"
echo ""
echo "  Or use VS Code tasks:"
echo "    - Open Command Palette (⌘ + Shift + P)"
echo "    - Search 'Tasks: Run Task'"
echo "    - Select 'All: Dev (Frontend + Backend)'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
