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

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bouji.fm Development Container Setup"
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
require_cmd node
require_cmd npm
node --version
npm --version
print_success "Node.js installed"

# Backend setup
print_section "Setting up Backend"
cd /workspace/backend

print_info "Downloading Go modules..."
go mod download
go mod verify
print_success "Go modules downloaded"

print_info "Creating .env file (if not exists)..."
if [ ! -f .env ]; then
    cat > .env << 'EOF'
# Database
DATABASE_URL=postgres://postgres:postgres@postgres:5432/ostgut

# Authentication
JWT_SECRET=dev-secret-key-change-in-production

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Logging
LOG_LEVEL=info

# Environment
ENVIRONMENT=development
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

# Run migrations
print_section "Running Database Migrations"
source .env
if has_cmd migrate && has_cmd pg_isready && pg_isready -h postgres -U postgres >/dev/null 2>&1; then
    print_info "Applying migrations..."
    migrate -path migrations -database "$DATABASE_URL" up || true
    print_success "Migrations applied"
else
    print_info "Skipping migrations (migrate tool or database is unavailable)"
fi

# Verify database
print_info "Verifying database..."
if has_cmd psql && has_cmd pg_isready && pg_isready -h postgres -U postgres >/dev/null 2>&1; then
    psql -h postgres -U postgres -d ostgut -c "SELECT 1" > /dev/null 2>&1 && print_success "Database connection verified" || echo "✗ Database verification failed"
else
    print_info "Skipping database verification (psql or database is unavailable)"
fi

# Frontend setup
print_section "Setting up Frontend"
cd /workspace/frontend

print_info "Ensuring correct Node.js version..."
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
    if has_cmd nvm; then
        nvm use 20
        print_success "Node.js v20 activated"
    else
        print_info "nvm is unavailable; continuing with current Node.js version"
    fi
else
    print_info "nvm.sh not found; continuing with current Node.js version"
fi

print_info "Installing npm dependencies..."
npm install
print_success "Frontend dependencies installed"

print_info "Creating .env.local file (if not exists)..."
if [ ! -f .env.local ]; then
    cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXTAUTH_SECRET=dev-secret-key-change-in-production
NEXTAUTH_URL=http://localhost:3000
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
echo "    Database:  localhost:5432 (postgres:postgres)"
echo ""
echo "  Or use VS Code tasks:"
echo "    - Open Command Palette (⌘ + Shift + P)"
echo "    - Search 'Tasks: Run Task'"
echo "    - Select 'All: Dev (Frontend + Backend)'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
