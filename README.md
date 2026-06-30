# Promptly

Promptly is an AI-powered automation and workspace builder. It allows users to automate their workflows, build interactive forms, and manage data without writing a single line of code—leveraging the power of Google's Gemini AI to do the heavy lifting.

## 🌟 Features

- **Promptly Agent (AI Chat)**: A conversational assistant powered by Google Gemini that helps you construct automations, extract intents, and manage your workspace interactively.
- **Workflow Builder**: A visual, drag-and-drop node-based editor (`@xyflow/react`) for creating advanced automation sequences with triggers, AI nodes, and integrations.
- **Form Builder**: Create, edit, and deploy beautiful, highly customizable data-collection forms with real-time previews and response tracking.
- **Interactive Dashboards**: Visual analytics and statistics powered by Recharts, enabling users to track workflow runs, form submissions, and active automations.
- **Premium UI/UX**: Built with modern web design principles featuring glassmorphism, responsive Tailwind CSS layouts, and smooth micro-interactions powered by GSAP.

## 🛠 Tech Stack

This project is structured as a monorepo containing a full-stack Javascript application.

### Frontend (`packages/ui`)
- **React 18** + **Vite**: Fast, modern frontend framework.
- **Tailwind CSS**: Utility-first styling for premium, responsive layouts.
- **GSAP**: Industry-standard animation library for smooth UI transitions.
- **React Flow (`@xyflow/react`)**: Interactive node-based workflow builder.
- **Recharts**: Composable charting library for dashboard analytics.

### Backend (`packages/cli`)
- **Node.js** + **Express**: Robust RESTful API server.
- **PostgreSQL** + **Sequelize (ORM)**: Relational database for structured storage.
- **Google GenAI API**: Integration with Google's Gemini models for intelligent workspace assistance.
- **JSON Web Tokens (JWT)** + **Bcrypt**: Secure user authentication.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- Google Gemini API Key

### 1. Installation

Clone the repository and install dependencies from the root directory:

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory and configure the following variables:

```env
# Server
PORT=3000

# Database (PostgreSQL)
DB_HOST=localhost
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_NAME=promptly_db

# Security
JWT_SECRET=your_super_secret_jwt_key

# AI Integration
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Running the Application

You can start both the backend server and frontend Vite development server concurrently using a single command from the root directory:

```bash
npm run dev
```

This uses `concurrently` to run:
- Backend API (nodemon watching `packages/cli/server.js`) on `http://localhost:3000`
- Frontend UI (vite dev server) on `http://localhost:5173`

## 📁 Project Structure

```text
promptly/
├── packages/
│   ├── cli/                  # Backend Node.js/Express Application
│   │   ├── controllers/      # Route logic (chat, dashboard, builder, forms)
│   │   ├── models/           # Sequelize DB models
│   │   ├── routes/           # Express API endpoints
│   │   ├── services/         # Integrations (e.g., geminiService.js)
│   │   └── server.js         # Backend entry point
│   │
│   └── ui/                   # Frontend React Application
│       ├── src/
│       │   ├── api/          # Backend client wrappers
│       │   ├── builder/      # Workflow and Form Builder UI
│       │   ├── chat/         # AI Chat interface
│       │   ├── components/   # Shared UI components & Toast Context
│       │   └── App.jsx       # Main React entry point
│       └── index.html
│
├── package.json              # Root package configuration & scripts
└── .env                      # Environment variables
```

## 📄 License
MIT License
