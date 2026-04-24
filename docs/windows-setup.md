# Windows Setup

This repository works best on Windows with:

- Docker Desktop in Linux container mode
- WSL for the frontend and backend toolchains
- VS Code tasks that call the new Windows-specific WSL task variants

## One-time setup

### Docker Desktop

Use Linux containers:

```powershell
docker desktop engine use linux
```

Start the local database:

```powershell
docker compose up -d --wait
```

### WSL toolchain

Installed and verified for this repo:

- Node.js 20 via `nvm`
- Go 1.25.9 in `$HOME/.local/go/bin`
- `ffmpeg`
- `psql`
- `jq`
- Azure CLI
- `migrate`
- `golangci-lint`
- `gopls`
- Python 3 + pip

## Recommended VS Code tasks on Windows

Use these task labels instead of the Unix-host tasks:

- `Setup: Frontend Dependencies (Windows)`
- `Setup: Backend Dependencies (Windows)`
- `Frontend: Dev Server (Windows)`
- `Backend: Run (Local, Windows)`
- `Backend: Debug (Windows)`
- `All: Dev (Frontend + Backend, Windows)`
- `All: Dev (Debug, Windows)`
- `All: Build All (Windows)`

If the new task labels do not appear immediately, reload the VS Code window once.

## Manual run commands

Frontend:

```powershell
wsl bash -lc 'source "$HOME/.nvm/nvm.sh"; nvm use 20 >/dev/null; cd /mnt/c/git/project-ostgut/frontend; mkdir -p /tmp/project-ostgut /tmp/project-ostgut/cache; rm -rf .wsl-cache; ln -s /tmp/project-ostgut/cache .wsl-cache; NEXT_DIST_DIR=.wsl-cache/frontend-next npm run dev -- --hostname 0.0.0.0'
```

Frontend production build:

```powershell
wsl bash -lc 'source "$HOME/.nvm/nvm.sh"; nvm use 20 >/dev/null; cd /mnt/c/git/project-ostgut/frontend; mkdir -p /tmp/project-ostgut /tmp/project-ostgut/cache; rm -rf .wsl-cache; ln -s /tmp/project-ostgut/cache .wsl-cache; NEXT_DIST_DIR=.wsl-cache/frontend-next npm run build'
```

Backend:

```powershell
wsl bash -lc 'export PATH="$HOME/.local/go/bin:$PATH"; pkill -x api 2>/dev/null || true; cd /mnt/c/git/project-ostgut/backend; set -a; source .env; set +a; go run ./cmd/api'
```

The backend command clears stale WSL `api` processes first so repeated launches do not fail on port `8080` already being in use.

## Local URLs

Frontend from Windows:

- `http://localhost:3000`

Backend from WSL:

- `http://127.0.0.1:8080/health`

Backend from Windows:

- Prefer `http://[::1]:8080/health`

On this machine, Windows had an IPv6 localhost forward for the WSL backend on port `8080`, while `127.0.0.1:8080` could refuse connections.

## Troubleshooting

### Backend task exits with address already in use

A stale WSL backend process is still holding port `8080`.

Run:

```powershell
wsl bash -lc 'pkill -x api 2>/dev/null || true'
```

Then start `Backend: Run (Local, Windows)` again.

### Frontend starts on the wrong port or is not reachable

Start it with explicit host binding:

```powershell
wsl bash -lc 'source "$HOME/.nvm/nvm.sh"; nvm use 20 >/dev/null; cd /mnt/c/git/project-ostgut/frontend; mkdir -p /tmp/project-ostgut /tmp/project-ostgut/cache; rm -rf .wsl-cache; ln -s /tmp/project-ostgut/cache .wsl-cache; NEXT_DIST_DIR=.wsl-cache/frontend-next npm run dev -- --hostname 0.0.0.0'
```

### Frontend shows missing chunks or manifest files on Windows

If you see errors such as missing `.next` chunks, `routes-manifest.json`, or `prerender-manifest.json`, keep the Next.js build artifacts on the WSL filesystem instead of `/mnt/c`:

```powershell
wsl bash -lc 'cd /mnt/c/git/project-ostgut/frontend; mkdir -p /tmp/project-ostgut /tmp/project-ostgut/cache; rm -rf .wsl-cache; ln -s /tmp/project-ostgut/cache .wsl-cache; ls -ld .wsl-cache'
```

Then start the frontend with `NEXT_DIST_DIR=.wsl-cache/frontend-next` as shown above.

### Docker image pulls fail

Make sure Docker Desktop is using Linux containers:

```powershell
docker desktop engine use linux
```

## Notes

The existing non-Windows tasks are still intended for Unix-like host shells or the devcontainer. On Windows, use the `(..., Windows)` task variants.
