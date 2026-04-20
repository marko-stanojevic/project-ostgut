# Development Container Setup

This directory contains the VS Code Dev Containers configuration for Bouji.fm.

The setup uses a single PostgreSQL container for both host-side development and devcontainer development.

- The shared database lives in ../docker-compose.yml
- The devcontainer service lives in .devcontainer/docker-compose.yml
- .devcontainer/devcontainer.json loads both Compose files together

## Quick Start

### Prerequisites

- VS Code 1.86+
- Docker Desktop or Docker Engine with Docker Compose
- Remote - Containers extension (`ms-vscode-remote.remote-containers`)

### Installation

1. Install Docker.

```bash
# macOS with Homebrew
brew install --cask docker
```

2. Install the VS Code Remote - Containers extension.

3. Reopen the project in the devcontainer.

## Architecture

- One PostgreSQL service, defined once in `docker-compose.yml`
- One devcontainer overlay service, defined in `.devcontainer/docker-compose.yml`
- One DB task set, shared by host and devcontainer workflows
- One local secret file for devcontainer and database settings: `.devcontainer/.env`

## What Gets Set Up Automatically

- Go 1.25.9
- Node.js 20
- PostgreSQL 16
- golang-migrate
- golangci-lint
- Azure CLI
- Backend and frontend dependencies
- Backend `.env` if missing
- Frontend `.env.local` if missing

## Development Workflow

### VS Code Tasks

Inside the devcontainer:

1. Open Command Palette.
2. Run `Tasks: Run Task`.
3. Select `All: Dev (Devcontainer)`.

Outside the devcontainer on the host:

1. Open Command Palette.
2. Run `Tasks: Run Task`.
3. Select `All: Dev (Frontend + Backend)`.

Shared DB tasks in either environment:

- `DB: Start`
- `DB: Stop`
- `DB: Reset`
- `DB: psql`

### Manual Commands

Start the shared database:

```bash
docker compose up -d --wait postgres
```

Open `psql`:

```bash
docker compose exec postgres psql -U postgres -d ostgut
```

Start the backend:

```bash
cd backend
set -a && source .env && set +a
go run ./cmd/api
```

Start the frontend:

```bash
cd frontend
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
npm run dev
```

## Accessing Services

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8080`
- API Health: `http://localhost:8080/health`
- Database: `localhost:5432`

Database credentials come from `.devcontainer/.env`.

## Database Access

Via VS Code PostgreSQL extension:

1. Install the PostgreSQL extension.
2. Connect with `postgres:<POSTGRES_PASSWORD>@localhost:5432/ostgut`.

Via `psql` in the devcontainer shell:

```bash
psql -h postgres -U postgres -d ostgut
```

Via Docker from the host:

```bash
docker compose exec postgres psql -U postgres -d ostgut
```

## Environment Files

### Devcontainer Source Env

Local only, not committed: `.devcontainer/.env`

```dotenv
POSTGRES_PASSWORD=<local-password>
PGPASSWORD=<local-password>

DATABASE_URL=postgres://postgres:<local-password>@postgres:5432/ostgut?sslmode=disable
JWT_SECRET=<local-jwt-secret>
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
LOG_LEVEL=info
ENV=local

NEXT_PUBLIC_API_URL=http://localhost:8080
NEXTAUTH_SECRET=<local-nextauth-secret>
NEXTAUTH_URL=http://localhost:3000
```

### Backend Env

If `backend/.env` does not exist, the post-create script generates it from the devcontainer environment.

Typical devcontainer values:

```dotenv
DATABASE_URL=postgres://postgres:<local-password>@postgres:5432/ostgut?sslmode=disable
JWT_SECRET=<local-jwt-secret>
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
LOG_LEVEL=info
ENV=local
```

Typical host-side values:

```dotenv
DATABASE_URL=postgres://postgres:<local-password>@localhost:5432/ostgut?sslmode=disable
JWT_SECRET=<local-jwt-secret>
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
LOG_LEVEL=info
ENV=local
```

## Lifecycle Commands

Stop the devcontainer stack:

```bash
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.yml down
```

Restart the devcontainer service:

```bash
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.yml restart devcontainer
```

Rebuild the devcontainer image:

```bash
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.yml build --no-cache devcontainer
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.yml up -d devcontainer
```

Inspect the shared database:

```bash
docker compose ps postgres
docker compose logs postgres
```

## Troubleshooting

### Container Won't Start

```bash
docker ps
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.yml logs devcontainer
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.yml build --no-cache devcontainer
```

### PostgreSQL Connection Refused

```bash
docker compose ps postgres
docker compose logs postgres
docker compose restart postgres
```

### Port Already In Use

```bash
lsof -ti:3000
lsof -ti:5432
```

### Reset Database

```bash
docker compose down -v
docker compose up -d --wait postgres
```

## File Structure

```text
.devcontainer/
├── devcontainer.json          # Dev Containers configuration
├── Dockerfile                 # Devcontainer image definition
├── docker-compose.yml         # Devcontainer service overlay
├── postCreateCommand.sh       # Runs once after container creation
├── postStartCommand.sh        # Runs on every container start
└── README.md                  # This file
```

## Documentation

- VS Code Dev Containers Documentation: https://code.visualstudio.com/docs/devcontainers/containers
- Docker Compose Documentation: https://docs.docker.com/compose/
- Project Architecture Guide: ../CLAUDE.md
- Development Setup Guide: ../DEVELOPMENT_SETUP.md
