# Frontend

Next.js frontend for Project Ostgut SaaS.

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- `ffmpeg` installed locally if you also run the backend and want loudness probing to work

### Development

Install dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file based on `.env.example`:

```bash
cp .env.example .env.local
```

### Building for Production

Build the application:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

### Linting

Check for linting issues:
```bash
npm run lint
```

## Project Structure

- `src/app/` - Next.js App Router (pages and layouts)
- `src/lib/` - Utility functions and API client
- `public/` - Static assets

## API Integration

The frontend communicates with the Go backend via `src/lib/api-client.ts`. By default, it expects the API to be available at `http://localhost:8080`.

Update the `NEXT_PUBLIC_API_URL` environment variable to change the backend URL.

## Docker

Build the Docker image:
```bash
docker build -t frontend:latest .
```

Run the container:
```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://backend:8080 \
  frontend:latest
```
