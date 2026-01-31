# AGENTS.md

This file provides guidance for AI coding assistants working with this codebase.

## Project Overview

A full-stack application using React + Vite + Tailwind CSS on the frontend and Cloudflare Workers with the Agents SDK on the backend. The app demonstrates real-time state synchronization between a Durable Object agent and React clients.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | Frontend UI |
| Vite 7 | Build tool and dev server |
| Tailwind CSS 4 | Styling |
| Hono | Backend HTTP framework |
| Cloudflare Workers | Serverless runtime |
| Agents SDK (`agents`) | Durable Object agent framework |
| Vercel AI SDK (`ai`) | AI integrations |
| TypeScript | Type safety |

## Project Structure

```
├── src/                      # Frontend React application
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Main component with agent integration
│   └── index.css             # Tailwind imports
├── worker/                   # Cloudflare Worker backend
│   ├── index.ts              # Hono server entry point
│   └── agents/               # Agent class definitions
│       └── my-agent.ts       # Example agent implementation
├── vite.config.ts            # Vite + Cloudflare plugin config
├── wrangler.jsonc            # Cloudflare Worker config
├── tsconfig.json             # Root TS config (project references)
├── tsconfig.app.json         # Frontend TS config
├── tsconfig.worker.json      # Worker TS config
└── worker-configuration.d.ts # Auto-generated Cloudflare types
```

## Key Patterns

### Agent Definition (Backend)

Agents are Durable Objects that maintain state and expose callable methods:

```typescript
// worker/agents/my-agent.ts
export type PublicAgentState = { 
  someValue: string; 
  updateCount: number; 
}

export class MyAgent extends Agent<Env, PublicAgentState> {
  initialState = { someValue: "default", updateCount: 0 }

  @callable()  // Required decorator for frontend access
  updateValue(newValue: string) {
    this.setState({ 
      ...this.state, 
      someValue: newValue,
      updateCount: this.state.updateCount + 1 
    })  // Auto-broadcasts to all connected clients
  }
}
```

### Agent Connection (Frontend)

Connect to agents using the `useAgent` hook:

```typescript
// src/App.tsx
import { useAgent } from "agents/react"
import type { MyAgent, PublicAgentState } from "../worker/agents/my-agent"

const agent = useAgent<MyAgent, PublicAgentState>({
  agent: "my-agent",  // Must match name in wrangler.jsonc
  onStateUpdate(state) {
    setLocalState(state)  // Sync to React state
  },
})

// Call agent methods
await agent.stub.updateValue("new value")
```

### Worker Entry Point

```typescript
// worker/index.ts
import { agentsMiddleware } from "hono-agents"
import { MyAgent } from "./agents/my-agent"

const app = new Hono<{ Bindings: Env }>()
app.use("*", agentsMiddleware())
app.get("/api", (c) => c.json({ status: "ok" }))

export default app
export { MyAgent }  // Must export agent classes
```

## Important Configuration

### wrangler.jsonc

Defines Durable Object bindings and migrations:

```jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "MyAgent", "class_name": "MyAgent" }]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["MyAgent"] }
  ]
}
```

### Adding a New Agent

1. Create the agent class in `worker/agents/`
2. Export the class from `worker/index.ts`
3. Add binding in `wrangler.jsonc` under `durable_objects.bindings`
4. Add migration if new (under `migrations` with `new_sqlite_classes`)
5. Run `npm run cf-typegen` to update types

### Renaming the Project

Update these locations:
- `package.json` → `name` field
- `wrangler.jsonc` → `name` field
- `wrangler.jsonc` → `durable_objects.bindings`
- Agent class names and filenames
- Imports in `worker/index.ts` and `src/App.tsx`

## Commands

```bash
npm run dev        # Start dev server with HMR
npm run build      # Production build
npm run deploy     # Build and deploy to Cloudflare
npm run lint       # Run ESLint
npm run cf-typegen # Regenerate worker-configuration.d.ts
```

## Conventions

- **Agent classes**: PascalCase (`MyAgent`)
- **Agent files**: kebab-case (`my-agent.ts`)
- **Shared types**: Prefix with `Public` (`PublicAgentState`)
- **Styling**: Tailwind utility classes in JSX
- **State updates**: Always use `this.setState()` for auto-broadcast

## Common Gotchas

1. **Missing `@callable()` decorator** - Methods won't be accessible from frontend
2. **Agent name mismatch** - `useAgent({ agent: "..." })` must match wrangler.jsonc binding name (kebab-case)
3. **Forgot to export agent** - Agent classes must be exported from `worker/index.ts`
4. **Type sync** - Import types from worker files to maintain type safety across frontend/backend
5. **Missing migration** - New Durable Object classes need a migration entry with `new_sqlite_classes`
