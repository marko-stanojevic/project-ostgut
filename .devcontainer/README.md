# Development Container Setup

This directory contains the configuration for a complete development environment using VS Code Dev Containers.

## Quick Start

### Prerequisites

- **VS Code** (1.86+)
- **Docker Desktop** (with Docker Compose)
- **Remote - Containers** extension (ID: `ms-vscode-remote.remote-containers`)

### Installation

1. **Install Docker Desktop**
   ```bash
   # macOS with Homebrew
   brew install --cask docker
   ```

2. **Install VS Code Remote Extension**
   - Open VS Code
   - Go to Extensions (⌘ + Shift + X)
   - Search for "Remote - Containers"
   - Install `ms-vscode-remote.remote-containers`

3. **Open Project in Dev Container**
   - Open the project folder in VS Code
   - Press `⌘ + Shift + P` (macOS) or `Ctrl + Shift + P` (Linux/Windows)
   - Type "Dev Containers: Reopen in Container"
   - Select and wait for container to build and start (~2-3 minutes on first run)

### What Gets Set Up Automatically

✅ **Go 1.25.9** — Backend runtime
✅ **Node.js 20** — Frontend runtime (via nvm)
✅ **PostgreSQL 15** — Database service
✅ **golang-migrate** — Database migration tool
✅ **golangci-lint** — Go linter
✅ **Azure CLI** — Cloud tools
✅ **All project dependencies** — npm packages and Go modules
✅ **Environment files** — `.env` and `.env.local` (auto-created)
✅ **Database migrations** — Applied automatically

### After Container Starts

The `postCreateCommand.sh` script automatically:
1. Verifies all tool installations
2. Downloads and verifies Go modules
3. Creates `.env` file with development defaults
4. Waits for PostgreSQL to become healthy
5. Applies database migrations
6. Installs npm dependencies
7. Creates `.env.local` file for frontend

### Development Workflow

**Option A: Use VS Code Tasks** (Recommended)

```
1. Open Command Palette (⌘ + Shift + P)
2. Search for "Tasks: Run Task"
3. Select "All: Dev (Frontend + Backend)"
```

This starts:
- PostgreSQL (if not running)
- Backend on http://localhost:8080
- Frontend on http://localhost:3000

**Option B: Manual Terminal Commands**

```bash
# Terminal 1: Backend
cd backend
go run ./cmd/api

# Terminal 2: Frontend
cd frontend
npm run dev
```

### Accessing Services

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **API Health**: http://localhost:8080/health
- **Database**: localhost:5432 (postgres:postgres)

### VS Code Extensions Included

The container automatically installs these extensions:

- `golang.go` — Go language support
- `ms-vscode.go` — Go tools and debugging
- `esbenp.prettier-vscode` — Code formatter
- `dbaeumer.vscode-eslint` — JavaScript/TypeScript linting
- `bradlc.vscode-tailwindcss` — Tailwind CSS support
- `GitHub.copilot` — AI-powered code completions
- `GitHub.copilot-chat` — AI chat interface
- `eamodio.gitlens` — Git integration
- And more...

### File Forwarding & Port Mapping

These ports are automatically forwarded from container to host:

| Port | Service | Auto-forward |
|------|---------|---|
| 3000 | Frontend (Next.js) | Notify |
| 8080 | Backend API (Gin) | Notify |
| 5432 | PostgreSQL | Silent |

### Stopping the Container

**Option A: In VS Code**
- Click the remote indicator (green icon, bottom-left)
- Select "Close Remote Connection"

**Option B: Via Terminal**
```bash
docker compose -f .devcontainer/docker-compose.yml down
```

### Restarting the Container

**Option A: In VS Code**
- Press `⌘ + Shift + P`
- Search "Dev Containers: Rebuild Container"

**Option B: Via Terminal**
```bash
docker compose -f .devcontainer/docker-compose.yml restart
```

### Rebuilding the Container

Use this when Dockerfile or dependencies change:

```bash
# In VS Code:
# ⌘ + Shift + P → "Dev Containers: Rebuild Container"

# Or via terminal:
docker compose -f .devcontainer/docker-compose.yml down -v
docker compose -f .devcontainer/docker-compose.yml build --no-cache
docker compose -f .devcontainer/docker-compose.yml up -d
```

### Database Access

**Via VS Code** (with PostgreSQL extension):
1. Install "PostgreSQL" extension by Chris Kolkman
2. Add connection: `postgres:postgres@postgres:5432/ostgut`
3. Browse tables and run queries directly

**Via psql CLI** (in container terminal):
```bash
psql -h postgres -U postgres -d ostgut
```

**Via Docker CLI** (from host):
```bash
docker compose -f .devcontainer/docker-compose.yml exec postgres psql -U postgres -d ostgut
```

### Environment Variables

Created automatically in container:

**Backend** (`.env`):
```
DATABASE_URL=postgres://postgres:postgres@postgres:5432/ostgut
JWT_SECRET=dev-secret-key-change-in-production
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
LOG_LEVEL=info
ENVIRONMENT=development
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXTAUTH_SECRET=dev-secret-key-change-in-production
NEXTAUTH_URL=http://localhost:3000
```

**Note**: These are development-only values. Change `*_SECRET` keys before deploying to production.

### Troubleshooting

#### Container won't start

```bash
# Check Docker status
docker ps

# Check logs
docker compose -f .devcontainer/docker-compose.yml logs devcontainer

# Rebuild container
docker compose -f .devcontainer/docker-compose.yml build --no-cache
```

#### PostgreSQL connection refused

```bash
# Check if postgres service is running
docker compose -f .devcontainer/docker-compose.yml ps postgres

# Check postgres logs
docker compose -f .devcontainer/docker-compose.yml logs postgres

# Restart database
docker compose -f .devcontainer/docker-compose.yml restart postgres
```

#### Port already in use

```bash
# Find process using port (macOS/Linux)
lsof -ti:3000    # Find process on port 3000
kill -9 <PID>    # Kill the process

# Or change port in docker-compose.yml
# ports: ["3001:3000"]  # Use 3001 instead
```

#### npm install fails

```bash
# In container terminal:
cd frontend
rm -rf node_modules package-lock.json
npm install
```

#### Go build errors

```bash
# In container terminal:
cd backend
go clean -cache
go mod tidy
go build ./cmd/api
```

### Development Best Practices

1. **Always run migrations after pulling changes**
   ```bash
   cd backend
   migrate -path migrations -database "$DATABASE_URL" up
   ```

2. **Use Go tests frequently**
   ```bash
   cd backend
   go test -v ./...
   ```

3. **Check TypeScript/ESLint before committing**
   ```bash
   cd frontend
   npm run lint
   ```

4. **Keep Docker Desktop running** — container needs Docker daemon

5. **Restart migrations if database gets corrupted**
   ```bash
   migrate -path migrations -database "$DATABASE_URL" drop  # ⚠️ Deletes all data
   migrate -path migrations -database "$DATABASE_URL" up
   ```

### File Structure

```
.devcontainer/
├── devcontainer.json          # VS Code configuration
├── Dockerfile                 # Container image definition
├── docker-compose.yml         # Services (devcontainer + postgres)
├── postCreateCommand.sh       # Runs once on first container creation
├── postStartCommand.sh        # Runs every time container starts
└── README.md                  # This file
```

### Advanced Configuration

#### Customize Container Resources

Edit `.devcontainer/docker-compose.yml`:

```yaml
services:
  devcontainer:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

#### Add Additional Services

Add to `docker-compose.yml` (e.g., Redis, Elasticsearch):

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - bouji-network
```

#### Persist Database Between Sessions

Database is already persisted via `postgres_data` volume.

To clear database:
```bash
docker volume rm <devcontainer_postgres_data>
```

### Documentation

- [VS Code Dev Containers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Project Architecture Guide](../CLAUDE.md)
- [Development Setup Guide](../DEVELOPMENT_SETUP.md)

### Getting Help

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review Docker logs: `docker compose -f .devcontainer/docker-compose.yml logs`
3. Rebuild container: `docker compose -f .devcontainer/docker-compose.yml build --no-cache`
4. Check [project README](../README.md) for additional context

---

**Happy coding! 🚀**
