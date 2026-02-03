# Bureaucreasy Editor

A full-stack AI-powered document editing application built with React, Cloudflare Workers, the Agents SDK, and Cloudflare Sandbox. Features real-time state synchronization and containerized preview environments.

## Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser (React Frontend)"]
        LP[LauncherPage]
        EP[EditorPage]
        IFrame[Preview iFrame]
    end

    subgraph CF["Cloudflare Workers"]
        Hono[Hono Server]
        
        subgraph Agents["Agents SDK (Durable Objects)"]
            LA[Launcher Agent]
            EA[Editor Agent]
        end
    end

    subgraph Sandbox["Cloudflare Sandbox (Container)"]
        Git[Git Clone]
        NPM[npm install]
        DevServer[Dev Server]
        OC[OpenCode CLI]
        Files[Project Files]
    end

    subgraph External["External Services"]
        GH[GitHub API]
        AI[AI Gateway<br/>Claude]
    end

    %% Frontend to Backend connections
    LP <-->|"useAgent() WebSocket<br/>State Sync"| LA
    EP <-->|"useAgent() WebSocket<br/>State Sync"| EA
    
    %% Launcher flow
    LA -->|"Stores configs<br/>Creates editors"| EA
    
    %% Editor to Sandbox flow
    EA -->|"getSandbox()"| Sandbox
    EA -->|"mintGitHubToken()"| GH
    
    %% Sandbox operations
    Git -->|"x-access-token auth"| GH
    Git --> NPM
    NPM --> DevServer
    OC -->|"opencode run"| Files
    OC -->|"API calls"| AI
    
    %% Preview flow
    DevServer -->|"exposePort()"| IFrame
    
    %% State updates
    EA -.->|"setState()<br/>previewUrl, edits[]"| EP
    LA -.->|"setState()<br/>configs, totalCount"| LP

    classDef frontend fill:#e1f5fe,stroke:#01579b
    classDef backend fill:#fff3e0,stroke:#e65100
    classDef sandbox fill:#e8f5e9,stroke:#2e7d32
    classDef external fill:#fce4ec,stroke:#880e4f
    
    class LP,EP,IFrame frontend
    class Hono,LA,EA backend
    class Git,NPM,DevServer,OC,Files sandbox
    class GH,AI external
```

## Data Flow

### 1. Launcher Phase

```mermaid
sequenceDiagram
    participant U as User
    participant LP as LauncherPage
    participant LA as Launcher Agent
    participant EA as Editor Agent

    U->>LP: Opens app
    LP->>LA: useAgent() connects
    LA-->>LP: State sync (configs[])
    LP->>U: Shows config cards
    
    U->>LP: Selects config
    LP->>LA: createEditor(config)
    LA->>EA: getAgentByName() + configure()
    LA-->>LP: Returns editorName
    LP->>U: Redirects to /editor/:name
```

### 2. Editor Setup Phase

```mermaid
sequenceDiagram
    participant U as User
    participant EP as EditorPage
    participant EA as Editor Agent
    participant SB as Sandbox
    participant GH as GitHub

    U->>EP: Opens editor page
    EP->>EA: useAgent() connects
    EP->>EA: setup() streaming call
    
    EA->>GH: mintGitHubToken()
    GH-->>EA: Installation token
    
    EA->>SB: gitCheckout(repo + token)
    SB->>GH: Clone repo
    
    EA->>SB: writeFile(opencode.json)
    Note over SB: Merge with existing config
    
    EA->>SB: exec("npm install")
    SB-->>EA: Stream output
    EA-->>EP: Stream to UI
    
    EA->>SB: startProcess("npm run dev")
    EA->>SB: waitForPort()
    EA->>SB: exposePort()
    SB-->>EA: Preview URL
    
    EA->>EA: setState({previewUrl, isSetup: true})
    EA-->>EP: State update
    EP->>U: Shows preview iframe
```

### 3. Edit Phase

```mermaid
sequenceDiagram
    participant U as User
    participant EP as EditorPage
    participant EA as Editor Agent
    participant SB as Sandbox
    participant OC as OpenCode
    participant AI as AI Gateway

    U->>EP: Types prompt
    U->>EP: Clicks Submit
    EP->>EA: submitPrompt(prompt) streaming
    
    EA->>SB: exec("opencode run ...")
    SB->>OC: Runs CLI
    OC->>AI: Sends prompt
    AI-->>OC: Streams response
    
    OC->>SB: Reads/writes files
    OC-->>SB: Output stream
    SB-->>EA: onOutput callback
    EA-->>EP: responseStream.send()
    EP->>U: Shows AI response
    
    EA->>EA: setState({edits: [..., newEdit]})
    EA-->>EP: State update
    EP->>EP: Refresh iframe
    EP->>U: Updated preview
```

## State Management

### Launcher Agent State

```typescript
type LauncherState = {
  hostname: string;           // Current hostname
  totalCount: number;         // Total edits across all editors
  configurations: Config[];   // Available project configs
};
```

### Editor Agent State

```typescript
type EditorState = {
  hostname?: string;          // Deployment hostname
  displayName?: string;       // Human-readable name
  githubOwner?: string;       // GitHub org/user
  githubRepo?: string;        // Repository name
  siteUrl?: string;           // Production site URL
  previewUrl?: string;        // Sandbox preview URL
  previewPort?: number;       // Dev server port
  isSetup: boolean;           // Setup complete flag
  edits: EditEntry[];         // Edit history
};

type EditEntry = {
  prompt: string;             // User's request
  response: string;           // AI's response
  timestamp: number;          // When edit was made
};
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 7, Tailwind CSS 4 |
| Backend | Hono, Cloudflare Workers |
| State | Agents SDK (Durable Objects) |
| Containers | Cloudflare Sandbox |
| AI | OpenCode CLI, Claude via AI Gateway |
| Auth | GitHub App (installation tokens) |

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Deploy to Cloudflare
npm run deploy
```

## Environment Variables

Copy `.dev.vars.example` to `.dev.vars` and fill in:

- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account
- `CLOUDFLARE_API_TOKEN` - API token with Workers access
- `CLOUDFLARE_GATEWAY_ID` - AI Gateway ID
- `GITHUB_APP_ID` - GitHub App ID
- `GITHUB_APP_PRIVATE_KEY_PEM` - GitHub App private key (PKCS#8)
- `GITHUB_INSTALLATION_ID` - GitHub App installation ID

## TODO

- [ ] Add GitHub PR creation via `gh` CLI
- [ ] Add wiki rules for AI guidance
- [ ] Implement edit history UI
- [ ] Add collaborative editing support
