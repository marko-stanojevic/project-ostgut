# Bouji.fm Development Environment Setup — macOS Guide

This guide covers everything needed to set up a complete development environment for the Bouji.fm project on macOS.

## Quick Start: Two Options

### Option 1: Dev Container (Recommended) ⚡

**Best for:** Most developers, consistent environments, minimal local setup

With **VS Code Dev Containers**, everything is automated:

```bash
# 1. Install Docker Desktop and VS Code Remote extension
brew install --cask docker
# Then install "Remote - Containers" extension in VS Code

# 2. Open project in VS Code
code project-ostgut

# 3. Press ⌘ + Shift + P and select "Dev Containers: Reopen in Container"

# 4. Wait ~2-3 minutes for first-time build
# All tools, dependencies, and database are set up automatically!
```

**✅ What's automated:**

- Go 1.25.9, Node.js 20, PostgreSQL 16
- All npm and Go dependencies
- Database migrations
- Environment variables
- VS Code extensions
- Everything works out-of-the-box

**📖 Full guide:** [.devcontainer/README.md](.devcontainer/README.md)

---

### Option 2: Manual Local Setup

**Best for:** Advanced users, custom configurations, performance optimization

Follow the detailed steps in this guide (sections 2-10 below).

This is the traditional approach where you install each tool manually on your macOS system.

---

## Table of Contents

1. [Quick Start: Two Options](#quick-start-two-options)
2. [System Requirements](#system-requirements)
3. [Package Manager Setup](#package-manager-setup)
4. [Core Runtimes & Tools](#core-runtimes--tools)
5. [Database Setup](#database-setup)
6. [Project Setup](#project-setup)
7. [Running the Development Environment](#running-the-development-environment)
8. [Verification Checklist](#verification-checklist)
9. [AI Agent Tools & Best Practices](#ai-agent-tools--best-practices)
10. [Troubleshooting](#troubleshooting)

---

## System Requirements

- **macOS Version**: 12.0 or later (Monterey or newer)
- **Processor**: Apple Silicon (M1, M2, M3, etc.) or Intel
- **RAM**: Minimum 8GB (16GB+ recommended for comfortable development)
- **Disk Space**: 20GB available
- **Internet**: Stable connection for downloading dependencies

---

## Package Manager Setup

### 1. Install Homebrew

Homebrew is the primary package manager for macOS.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Post-installation (Apple Silicon only):**

```bash
# Add Homebrew to PATH
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
source ~/.zprofile
```

**Verify installation:**

```bash
brew --version
```

---

## Core Runtimes & Tools

### 2. Install Go

The backend is built with Go 1.25+.

```bash
brew install go
```

**Verify installation:**

```bash
go version
# Expected output: go version go1.25.x darwin/arm64 (or darwin/amd64 for Intel)
```

**Verify Go workspace support:**

```bash
# The project uses go.work for monorepo support
cat go.work  # Should display the go.work configuration
```

### 3. Install Node.js & npm

The frontend is built with Node.js. Use **nvm** (Node Version Manager) for version management.

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Add nvm to shell (usually automatic, but verify)
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zprofile
echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.zprofile
source ~/.zprofile

# Verify nvm
nvm --version
```

**Install Node.js:**

```bash
# Install Node 20.x (currently stable for Next.js 15)
nvm install 20
nvm use 20

# Set as default
nvm alias default 20
```

**Verify installation:**

```bash
node --version   # Should be v20.x.x
npm --version    # Should be 10.x.x or higher
```

### 4. Install Docker & Docker Compose

Docker is essential for running PostgreSQL locally.

```bash
# Install Docker Desktop for macOS
# Option A: Via Homebrew (recommended)
brew install --cask docker

# Option B: Download directly from https://www.docker.com/products/docker-desktop
```

**Verify installation:**

```bash
docker --version
docker compose version
```

**Start Docker Desktop:**

- Launch "Docker" from Applications folder, or
- Run: `open /Applications/Docker.app`

### 5. Install PostgreSQL Client Tools (Optional but Recommended)

For direct database access and migrations:

```bash
brew install postgresql@15
```

**Verify installation:**

```bash
psql --version
```

### 6. Install Git & Git Tools

```bash
# Git usually comes with Xcode, but ensure it's installed
brew install git

# Optional: Install GitHub CLI for easier GitHub workflows
brew install gh

# Verify
git --version
gh version  # If installed
```

### 7. Install Additional CLI Tools

```bash
# Azure CLI (for infrastructure commands)
brew install azure-cli

# Terraform / OpenTofu (for infrastructure as code)
brew install opentofu

# jq (for JSON parsing in scripts)
brew install jq

# curl & wget (usually pre-installed, but ensure)
brew install curl wget
```

---

## Database Setup

### 8. Configure Environment Variables

Create the shared Docker/PostgreSQL env file used by both local and devcontainer workflows:

```bash
cp .devcontainer/.env.example .devcontainer/.env
```

Edit `.devcontainer/.env` and set at least:

- `POSTGRES_PASSWORD`
- `PGPASSWORD`

Then create a `.env` file in the `backend/` directory with your local backend configuration:

```bash
cd backend
cat > .env << 'EOF'
# Database
DATABASE_URL=postgres://postgres:<your-postgres-password>@localhost:5432/ostgut?sslmode=disable

# Authentication
JWT_SECRET=dev-secret-key-change-in-production

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080

# Logging
LOG_LEVEL=info

# Environment
ENV=local
EOF
```

**Important:** Never commit `.env` to version control. It's in `.gitignore`.

### 9. Start PostgreSQL via Docker Compose

```bash
cd /path/to/project-ostgut

# Start the PostgreSQL container
docker compose up -d postgres

# Verify it's running
docker compose ps
# You should see the postgres service running

# Wait for the database to be ready (10-15 seconds)
docker compose up --wait postgres
```

**Verify database connection:**

```bash
# Option A: Via docker compose
docker compose exec postgres psql -U postgres -d ostgut -c "SELECT 1"

# Option B: Via local psql (if installed)
PGPASSWORD=<your-postgres-password> psql -h localhost -U postgres -d ostgut -c "SELECT 1"
```

### 10. Run Database Migrations

```bash
cd backend

# Install golang-migrate
brew install golang-migrate

# Run migrations against your local database
migrate -path migrations -database "$DATABASE_URL" up

# Verify migrations
migrate -path migrations -database "$DATABASE_URL" version
```

**Verify migration success:**

```bash
docker compose exec postgres psql -U postgres -d ostgut -c "\dt"
# Should show tables: users, subscriptions, stations, media_assets, etc.
```

---

## Project Setup

### 11. Clone the Repository

```bash
git clone https://github.com/marko-stanojevic/project-ostgut.git
cd project-ostgut
```

### 12. Install Backend Dependencies

```bash
cd backend

# Download Go modules
go mod download

# Verify modules are loaded
go mod verify
```

### 13. Install Frontend Dependencies

```bash
cd frontend

# Ensure nvm is using the correct Node version
nvm use 20

# Install npm dependencies
npm install

# Verify installation
npm list next react typescript
```

### 14. Create Frontend Environment File

```bash
cd frontend

cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXTAUTH_SECRET=dev-secret-key-change-in-production
NEXTAUTH_URL=http://localhost:3000
EOF
```

---

## Running the Development Environment

### 15. Start All Services (Recommended)

Use the built-in VS Code task to start everything in sequence:

```bash
# In VS Code:
# 1. Open Command Palette (⌘ + Shift + P)
# 2. Search for "Tasks: Run Task"
# 3. Select "All: Dev (Frontend + Backend)"
```

Or manually:

```bash
# Terminal 1: Start database
docker compose up --wait postgres

# Terminal 2: Start backend
cd backend
set -a && source .env && set +a
go run ./cmd/api

# Terminal 3: Start frontend
cd frontend
nvm use 20
npm run dev
```

### 16. Access the Application

Once all services are running:

- **Frontend**: <http://localhost:3000>
- **Backend API**: <http://localhost:8080>
- **API Health**: <http://localhost:8080/health>
- **Database**: localhost:5432 (postgres / your configured password)

---

## Verification Checklist

Run this checklist to ensure everything is set up correctly:

```bash
# 1. Check Go
go version

# 2. Check Node.js
node --version && npm --version

# 3. Check Docker
docker --version && docker compose version

# 4. Check Git
git --version

# 5. Check PostgreSQL (optional)
psql --version

# 6. Check database connection
docker compose up --wait postgres
docker compose exec postgres psql -U postgres -d ostgut -c "SELECT 1"

# 7. Check backend builds
cd backend && go build -o ./bin/api ./cmd/api && ls -lh ./bin/api

# 8. Check frontend builds
cd frontend && npm run build && ls -lh .next

# 9. Check Go tests
cd backend && go test -v ./...

# 10. Check linting
cd frontend && npm run lint
```

---

## AI Agent Tools & Best Practices

### Purpose

These tools help AI agents (like GitHub Copilot) understand the codebase structure, conventions, and requirements more efficiently, reducing token usage and improving code quality.

### Preferred Tools & Commands

#### 1. **Semantic Understanding**

- **Use**: Agent codebase navigation before writing code
- **Commands**:

  ```bash
  # Get repository structure
  find . -name "*.go" -o -name "*.tsx" | head -30

  # List key files
  ls -la backend/internal/handler/
  ls -la frontend/src/context/
  ```

#### 2. **Code Search & Grep**

- **Purpose**: Find patterns and existing implementations
- **Commands**:

  ```bash
  # Find all store interfaces
  grep -r "interface.*Store" backend/internal/store/

  # Find all API handlers
  grep -r "func (h \*Handler)" backend/internal/handler/

  # Find context usage
  grep -r "useContext\|useAuth\|usePlayer" frontend/src/
  ```

#### 3. **Architecture Review Before Changes**

- **Use**: Read key architectural files first
- **Priority Files**:

  ```
  CLAUDE.md                          # Agent instructions (read first)
  .github/copilot-instructions.md    # Specific patterns & conventions
  backend/internal/handler/handler.go  # Handler structure & registration
  backend/internal/store/*.go        # Data access patterns
  frontend/src/context/*.tsx         # State management patterns
  ```

#### 4. **Dependency Analysis**

- **Purpose**: Understand module imports and dependencies
- **Commands**:

  ```bash
  # Go module structure
  cat backend/go.mod | grep "require"

  # Frontend dependencies
  cat frontend/package.json | jq '.dependencies'

  # Find imports in a file
  grep "^import" backend/internal/handler/handler.go
  ```

#### 5. **Configuration & Environment**

- **Use**: Understand configuration loading patterns
- **Key Files**:

  ```
  backend/internal/config/config.go      # Config struct & loading
  frontend/.env.local                     # Frontend env vars
  backend/.env                            # Backend env vars
  docker-compose.yml                      # Local service setup
  ```

#### 6. **Error Handling & Patterns**

- **Commands**:

  ```bash
  # Find error handling patterns
  grep -r "ErrNotFound\|errors.Is\|errors.New" backend/internal/

  # Find middleware patterns
  grep -r "middleware\." backend/internal/handler/
  ```

#### 7. **Database Schema Understanding**

- **Use**: Check migrations before writing schema-related code
- **Commands**:

  ```bash
  # List all migrations in order
  ls -1 backend/migrations/*.up.sql | sort

  # Check specific table schema
  cat backend/migrations/001_init.up.sql | grep -A 20 "CREATE TABLE users"
  ```

#### 8. **Test File Locations**

- **Pattern**: `*_test.go` for backend, same directory as implementation
- **Commands**:

  ```bash
  # Find all test files
  find . -name "*_test.go" -o -name "*.test.ts"

  # Run specific tests
  cd backend && go test -run TestHandlerName -v
  cd frontend && npm test -- test-name.test.ts
  ```

### Recommended Agent Workflow

1. **Context Gathering Phase**
   - Read `CLAUDE.md` or `copilot-instructions.md` first
   - Scan relevant `*Store` interfaces in `backend/internal/store/`
   - Review context files in `frontend/src/context/`

2. **Implementation Phase**
   - Use grep to find similar implementations
   - Check existing tests for patterns
   - Follow SOLID principles from the instructions

3. **Validation Phase**
   - Run tests: `go test ./...` or `npm test`
   - Check linting: `npm run lint`
   - Verify builds: `go build` or `npm run build`

4. **Review Phase**
   - Check for consistency with existing patterns
   - Verify error handling matches project standards
   - Ensure no hardcoded secrets or env vars

### Token Optimization Tips

1. **Batch Similar Queries**: Instead of asking about 3 functions separately, ask about all 3 together
2. **Use Grep Output**: Provide grep results instead of asking AI to search
3. **Reference Files**: Point to specific files rather than explaining code verbally
4. **Schema Clarity**: Share database schema via `psql` output rather than describing tables
5. **Error Context**: Include actual error messages and stack traces, not paraphrased descriptions

### Best Practices for Agent Interactions

#### Good Prompt

```
"Add a new handler method to get user billing status.
Reference: POST /users/me/billing is in backend/internal/handler/billing.go
Store method: UserStore.GetBillingByUserID in backend/internal/store/user_store.go
Follow the pattern in GetUser() for error handling.
Use context key 'user_id' from middleware.GetUserID()."
```

#### Avoid (Inefficient)

```
"Add a billing handler... it should probably look at other handlers...
use similar patterns... I think the store is in the user file or billing file..."
```

### Key Files to Always Provide to Agents

- **Architecture**: `CLAUDE.md`, `copilot-instructions.md`
- **Backend Patterns**: `backend/internal/handler/handler.go`, `backend/internal/store/user_store.go`
- **Frontend Context**: `frontend/src/context/AuthContext.tsx` (or relevant context)
- **Config**: `backend/internal/config/config.go`
- **Latest Migration**: Most recent `backend/migrations/*.up.sql`

### Common Agent Tasks & Recommended Approach

| Task                  | First Read                       | Then Check         | Commands                                                                     |
| --------------------- | -------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| Add API endpoint      | handler.go, copilot-instructions | Similar handler    | `grep -r "func (h \*Handler)" backend/`                                      |
| Add database column   | Latest migration                 | Schema in psql     | `docker compose exec postgres psql -U postgres -d ostgut -c "\d table_name"` |
| Add React component   | AuthContext, existing UI files   | Similar components | `find frontend/src/components -name "*.tsx"`                                 |
| Add API client method | AuthContext.tsx, existing hooks  | Similar hooks      | `grep -r "fetch.*API_URL" frontend/src/`                                     |
| Modify error handling | store/user_store.go              | Similar methods    | `grep -r "errors.Is.*ErrNotFound" backend/`                                  |

---

## Troubleshooting

### Docker Issues

**Problem**: `docker compose up` fails to start

```bash
# Solution: Ensure Docker Desktop is running
open /Applications/Docker.app

# Check Docker status
docker ps

# Clean up containers and restart
docker compose down -v
docker compose up --wait postgres
```

**Problem**: Database connection refused

```bash
# Solution: Check if container is running
docker compose ps

# View logs
docker compose logs postgres

# Restart database
docker compose restart postgres
docker compose up --wait postgres
```

### Go Issues

**Problem**: `go: no Go files in /...`

```bash
# Solution: Ensure you're in the backend directory
cd backend
go mod tidy
go build ./cmd/api
```

**Problem**: Port 8080 already in use

```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or use a different port
PORT=8081 go run ./cmd/api
```

### Node.js Issues

**Problem**: `npm install` fails

```bash
# Solution: Clear npm cache
npm cache clean --force

# Remove node_modules and lock file
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

**Problem**: nvm not found or not activated

```bash
# Ensure nvm is in your shell profile
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zprofile
echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.zprofile

# Reload shell
source ~/.zprofile

# Verify
nvm --version
```

**Problem**: Port 3000 already in use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or run on different port
PORT=3001 npm run dev
```

### Database Issues

**Problem**: Migrations fail to run

```bash
# Solution: Check database exists and is accessible
docker compose exec postgres psql -U postgres -l | grep ostgut

# View migration status
cd backend
migrate -path migrations -database "$DATABASE_URL" version

# Rollback to version X
migrate -path migrations -database "$DATABASE_URL" force X

# Re-run all migrations
migrate -path migrations -database "$DATABASE_URL" down -all
migrate -path migrations -database "$DATABASE_URL" up
```

**Problem**: `database does not exist`

```bash
# Solution: Database is created by docker-compose, but ensure it's configured
docker compose config | grep -A 5 "postgres:"

# Manually create database
docker compose exec postgres psql -U postgres -c "CREATE DATABASE ostgut"
```

### General Debugging

**Enable verbose logging:**

```bash
# Backend
LOG_LEVEL=debug go run ./cmd/api

# Frontend (add to .env.local)
echo 'DEBUG=true' >> frontend/.env.local
npm run dev
```

**Check all services are running:**

```bash
# In separate terminals, verify each is responsive
curl http://localhost:8080/health          # Backend
curl http://localhost:3000                 # Frontend (should show HTML)
docker compose ps                          # Database
```

---

## Next Steps

1. ✅ Install all tools from [Core Runtimes & Tools](#core-runtimes--tools)
2. ✅ Set up database and environment variables
3. ✅ Clone and install project dependencies
4. ✅ Run the development environment
5. ✅ Access frontend at <http://localhost:3000>
6. ✅ Bookmark the AI agent tools section for future reference
7. 📖 Read `CLAUDE.md` and `copilot-instructions.md` for architecture details
8. 🚀 Start contributing!

---

## Additional Resources

- [Go Documentation](https://golang.org/doc)
- [Next.js 14 Documentation](https://nextjs.org/docs)
- [PostgreSQL 16 Documentation](https://www.postgresql.org/docs/16/)
- [Docker Documentation](https://docs.docker.com/)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Project Architecture Guide](./CLAUDE.md)
- [Development Best Practices](./copilot-instructions.md)
