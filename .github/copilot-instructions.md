# Promptly - Full-Stack Express.js + Vue.js Application

## Project Overview
Full-stack app with:
- **Backend**: Express.js server (packages/cli)
- **Frontend**: Vue.js 3 with Vite (packages/ui)
- **Development**: Single root command runs both servers

## Project Structure
```
promptly/
├── packages/
│   ├── cli/         # Express.js server (server.js)
│   └── ui/          # Vite + Vue app
├── package.json     # Root scripts and dependencies
├── package-lock.json
├── .env             # Root environment variables
└── .github/         # Project automation/config
```

## Development Guidelines
- Keep backend and frontend separated under packages/
- Use REST conventions for API routes
- Use Vue 3 Composition API in the UI
- Configure environment via root .env (e.g., PORT)

## Getting Started
1. Install dependencies: npm install
2. Run both servers: npm run dev
3. Backend: http://localhost:3000 (or PORT from .env)
4. Frontend: http://localhost:5173 (proxied /api to backend)
5. Backend watch only: npm run cli:watch
6. Frontend only: npm run ui:dev
