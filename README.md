# project-ostgut

Stealth mode SaaS — Full-stack monorepo with Go backend and Next.js frontend.

## 📦 Project Structure

```
├── backend/             # Go Gin REST API
├── frontend/            # Next.js React frontend
├── infra/               # OpenTofu infrastructure-as-code (Azure)
└── .github/workflows/   # CI/CD pipelines
```

## 🚀 Quick Start

### Backend

```bash
cd backend
go mod download
go run ./cmd/api
```

API runs at `http://localhost:8080`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`

## 📋 Requirements

- Go 1.23+
- Node.js 20+
- OpenTofu 1.9+ (for infrastructure)

## 🔧 Development

### Run Both Services

From the root directory:

```bash
# Terminal 1 - Backend
cd backend && go run ./cmd/api

# Terminal 2 - Frontend
cd frontend && npm install && npm run dev
```

Access the application at `http://localhost:3000`

### Detailed Guides

- [Backend Development](./backend/README.md) (if available)
- [Frontend Development](./frontend/README.md)
- Infrastructure is managed via OpenTofu in the `infra/` directory

## 🐳 Docker

Build and run with Docker Compose (if configured):

```bash
docker-compose up
```

Individual images:

```bash
docker build -t backend:latest backend/
docker build -t frontend:latest frontend/
```

## 📚 Documentation

- **API Endpoints**: See backend documentation
- **Frontend Components**: See `frontend/src/app/` and `frontend/src/lib/`
- **Infrastructure**: See `infra/` and OpenTofu configuration

## 🔐 Environment Variables

### Backend
Set in environment or `.env`

### Frontend
Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

## 🚢 Deployment

Automated CI/CD pipelines handle:

- Code linting and testing
- Docker image builds and pushes to Azure Container Registry
- OpenTofu infrastructure provisioning

See `.github/workflows/` for pipeline configuration.
