# AGENTS.md

This file provides guidance for AI coding assistants working with this codebase.

## Project Overview

A full-stack application using React + Vite + Tailwind CSS on the frontend and Cloudflare Workers with the Agents SDK on the backend. Features real-time state synchronization between Durable Object agents and React clients, with Cloudflare Sandbox for containerized preview environments.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | Frontend UI (functional components, hooks) |
| Vite 7 | Build tool and dev server |
| Tailwind CSS 4 | Utility-first styling |
| Hono | Backend HTTP framework |
| Cloudflare Workers | Serverless runtime |
| Agents SDK (`agents`) | Durable Object agent framework |
| Cloudflare Sandbox | Containerized preview environments |
| TypeScript (strict) | Type safety with ES2022/ES2023 targets |

## Commands

```bash
npm run dev        # Start dev server with HMR
npm run build      # Production build (Vite)
npm run lint       # Run ESLint
npm run deploy     # Build and deploy to Cloudflare
npm run cf-typegen # Regenerate worker-configuration.d.ts after wrangler.jsonc changes
```

**Note:** No test framework is currently configured.

## Project Structure

```
├── src/                      # Frontend React application
│   ├── main.tsx              # React entry point (StrictMode)
│   ├── App.tsx               # Router setup (BrowserRouter)
│   ├── index.css             # Tailwind + custom design system
│   └── pages/                # Page components
│       ├── LauncherPage.tsx  # Config selection launcher
│       └── EditorPage.tsx    # Editor preview page
├── worker/                   # Cloudflare Worker backend
│   ├── index.ts              # Hono server + agent exports
│   └── agents/               # Durable Object agent classes
│       ├── editor-agent.ts   # Sandbox/preview management
│       └── launcher-agent.ts # Config management & editor creation
├── vite.config.ts            # Vite + Cloudflare + Tailwind plugins
├── wrangler.jsonc            # Cloudflare Worker config (JSONC format)
├── tsconfig.json             # Root TS config (project references)
├── tsconfig.app.json         # Frontend TS config (ES2022, DOM)
├── tsconfig.worker.json      # Worker TS config (ES2023)
└── worker-configuration.d.ts # Auto-generated Cloudflare types
```

## Code Style Guidelines

### Formatting

- **Semicolons**: Required
- **Quotes**: Double quotes for imports and strings
- **Indentation**: 2 spaces (tabs in config files)
- **Trailing commas**: Yes, in multi-line objects/arrays

### Import Order

1. React/framework imports (npm packages)
2. Third-party library imports
3. Local/relative imports (`.` or `..`)
4. Use `type` keyword for type-only imports (`verbatimModuleSyntax` enforced)

```typescript
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAgent } from "agents/react";
import type { Launcher, LauncherState } from "../../worker/agents/launcher-agent";
```

### Naming Conventions

| Element | Convention | Examples |
|---------|------------|----------|
| React components | PascalCase | `LauncherPage`, `EditorPage` |
| Agent classes | PascalCase | `EditorAgent`, `Launcher` |
| Agent files | kebab-case | `editor-agent.ts`, `launcher-agent.ts` |
| Page files | PascalCase | `LauncherPage.tsx`, `EditorPage.tsx` |
| Types | PascalCase | `EditorState`, `Configuration` |
| Functions | camelCase | `handleConfigurationSelection` |
| Variables | camelCase | `isCreating`, `previewUrl` |
| CSS classes | kebab-case | `document-card`, `btn-official` |
| CSS variables | `--kebab-case` | `--paper-cream`, `--ink-navy` |

### TypeScript Patterns

- **Use `type` over `interface`** for object shapes
- **Strict mode enabled**: `noUnusedLocals`, `noUnusedParameters`
- **Error handling**: Simple try/catch with `console.error`

```typescript
// Type definitions
export type EditorState = {
  previewUrl?: string;
};

// Error handling pattern
try {
  const result = await agent.stub.someMethod();
} catch (error) {
  console.error("Operation failed:", error);
}
```

### React Patterns

- **Functional components only** (no class components)
- **Hooks for state**: `useState`, `useParams`, `useNavigate`, `useAgent`
- **Inline SVG icons**: Define as components with `className` and `style` props
- **Conditional rendering**: Ternary operators and `&&`

```typescript
// SVG icon component pattern
function IconName({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24">...</svg>;
}

// Agent state sync pattern
const [state, setState] = useState<AgentState>({});
useAgent<AgentClass, AgentState>({
  agent: "agent-name",
  name: instanceName,  // Optional: for named instances
  onStateUpdate(newState) {
    setState(newState);
  },
});
```

## Agent Development Patterns

### Agent Definition (Backend)

```typescript
// worker/agents/my-agent.ts
import { Agent, callable, getAgentByName } from "agents";

export type MyAgentState = { value: string };

export class MyAgent extends Agent<Env, MyAgentState> {
  initialState = { value: "default" };

  @callable()  // Required for frontend access
  async updateValue(newValue: string) {
    this.setState({ ...this.state, value: newValue });  // Auto-broadcasts
  }
}
```

### Agent Connection (Frontend)

```typescript
import { useAgent } from "agents/react";
import type { MyAgent, MyAgentState } from "../../worker/agents/my-agent";

const agent = useAgent<MyAgent, MyAgentState>({
  agent: "my-agent",  // Must match wrangler.jsonc binding (kebab-case)
  onStateUpdate(state) {
    setLocalState(state);
  },
});

await agent.stub.updateValue("new value");
```

### Agent-to-Agent Communication

```typescript
@callable()
async createChild() {
  const childName = crypto.randomUUID();
  const child = await getAgentByName(this.env.ChildAgent, childName);
  await child.initialize({ parentId: this.name });
  return childName;
}
```

## Adding a New Agent

1. Create agent class in `worker/agents/new-agent.ts`
2. Export from `worker/index.ts`: `export { NewAgent } from "./agents/new-agent";`
3. Add binding in `wrangler.jsonc`:
   ```jsonc
   "durable_objects": {
     "bindings": [{ "name": "NewAgent", "class_name": "NewAgent" }]
   }
   ```
4. Add migration: `{ "tag": "v2", "new_sqlite_classes": ["NewAgent"] }`
5. Run `npm run cf-typegen`

## Common Gotchas

1. **Missing `@callable()` decorator** - Methods won't be accessible from frontend
2. **Agent name mismatch** - `useAgent({ agent: "..." })` uses kebab-case, must match wrangler.jsonc
3. **Forgot to export agent** - Agent classes must be exported from `worker/index.ts`
4. **Type imports** - Use `import type` for types from worker files in frontend
5. **Missing migration** - New Durable Objects need `new_sqlite_classes` migration entry
6. **SVG icon props** - Include `style?: React.CSSProperties` for inline styling support

## ESLint Configuration

Uses flat config (`eslint.config.js`) with:
- ESLint recommended
- TypeScript-ESLint recommended
- React Hooks recommended
- React Refresh for Vite HMR

## Design System

Custom "Bureaucreasy" theme with CSS variables in `src/index.css`:
- Paper tones: `--paper-cream`, `--paper-manila`, `--paper-aged`
- Ink colors: `--ink-navy`, `--ink-faded`
- Accent colors: `--stamp-red`, `--stamp-green`
- Typography: `--font-typewriter`, `--font-serif`, `--font-mono`
