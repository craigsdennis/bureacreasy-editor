import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import { createOpencode } from "@cloudflare/sandbox/opencode";
import type { OpencodeClient, Config } from "@opencode-ai/sdk";
import { Agent, callable, StreamingResponse } from "agents";
import { mintGitHubInstallationToken } from "../utils/github";

export type EditEntry = {
  prompt: string;
  response: string;
  timestamp: number;
};

export type EditorState = {
  hostname?: string;
  displayName?: string;
  githubOwner?: string;
  githubRepo?: string;
  siteUrl?: string;
  previewUrl?: string;
  previewPort?: number;
  isSetup: boolean;
  edits: EditEntry[];
};

const LOCAL_PORT = 5173;

export class EditorAgent extends Agent<Env, EditorState> {
  sandbox?: Sandbox;
  initialState: EditorState = { isSetup: false, edits: [] };

  configure({
    hostname,
    displayName,
    githubOwner,
    githubRepo,
    url,
    port,
  }: {
    hostname: string;
    displayName: string;
    githubOwner: string;
    githubRepo: string;
    url: string;
    port: number;
  }) {
    this.setState({
      ...this.state,
      hostname,
      displayName,
      githubOwner,
      githubRepo,
      siteUrl: url,
      previewPort: port,
    });
  }

  onStart() {
    this.sandbox = getSandbox(this.env.Sandbox, `preview-${this.name}`);
  }

  async ensurePreview() {}

  @callable({ streaming: true })
  async setup(responseStream: StreamingResponse) {
    if (!this.sandbox) {
      throw Error("Sandbox should be set in onStart");
    }
    await this.sandbox.setEnvVars({
      CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_GATEWAY_ID: this.env.CLOUDFLARE_GATEWAY_ID,
      CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN,
      REPLICATE_API_TOKEN: this.env.REPLICATE_API_TOKEN,
      GIT_AUTHOR_NAME: this.env.GIT_AUTHOR_NAME,
      GIT_AUTHOR_EMAIL: this.env.GIT_AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: this.env.GIT_COMMITTER_NAME,
      GIT_COMMITTER_EMAIL: this.env.GIT_COMMITTER_EMAIL,
    });
    const { githubOwner, githubRepo } = this.state;
    
    // Mint a GitHub App installation token for git operations
    responseStream.send("Minting GitHub token...");
    const { token: githubToken } = await mintGitHubInstallationToken();
    
    // Git checkout into 'app' directory with token for authentication
    const repoUrl = `https://x-access-token:${githubToken}@github.com/${githubOwner}/${githubRepo}`;
    responseStream.send(`Cloning ${githubOwner}/${githubRepo}...`);
    await this.sandbox.gitCheckout(repoUrl, {
      targetDir: "app",
    });
    
    // Also set GITHUB_TOKEN in the sandbox env for gh cli usage
    await this.sandbox.setEnvVars({
      GITHUB_TOKEN: githubToken,
    });

    // Install dependencies with streaming output
    responseStream.send(`Installing dependencies...`);
    await this.sandbox.exec("npm install", {
      cwd: "app",
      stream: true,
      onOutput: (streamType, data) => {
        if (streamType === "stdout") {
          responseStream.send(`${data}`);
        }
      },
    });

    // Start dev server with --ip (host on other systems) to allow external access
    responseStream.send(`Starting preview server...`);
    const server = await this.sandbox.startProcess("npm run dev", {
      cwd: "app",
    });

    // Wait for port to be ready
    const port = this.state.previewPort || 0;
    responseStream.send(`Waiting for server to be ready on port ${port}...`);
    try {
      await server.waitForPort(port);
      responseStream.send(`Server is ready!`);

      // Give it a moment to fully initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));
      responseStream.send(`Server initialized`);
    } catch (error) {
      // Get logs to see what went wrong
      const logs = await this.sandbox.getProcessLogs(server.id);
      responseStream.send(`Server failed to start. Logs:`);
      responseStream.send(
        typeof logs === "string" ? logs : JSON.stringify(logs, null, 2),
      );
      throw error;
    }

    // Expose the port
    responseStream.send(`Exposing port 4321...`);
    let hostname = this.state.hostname || "";
    if (hostname === "localhost") {
      hostname += ":" + LOCAL_PORT;
    }
    responseStream.send(`Hostname is ${hostname}`);
    const results = await this.sandbox.exposePort(port, {
      hostname,
      token: "lfg",
    });
    responseStream.send(`Preview available at: ${results.url}`);

    this.setState({
      ...this.state,
      previewUrl: results.url,
      isSetup: true,
    });
  }

  getOpencodeConfig(): Config {
    return {
      model: "cloudflare-ai-gateway/anthropic/claude-haiku-4-5",
      provider: {
        "cloudflare-ai-gateway": {
          models: {
            "anthropic/claude-haiku-4-5": {},
            // "anthropic/claude-sonnet-4": {},
          },
        },
      },
      permission: { 
        webfetch: "allow", 
        bash: "allow",
      },
    };
  }

  @callable({ streaming: true })
  async submitPrompt(responseStream: StreamingResponse, {prompt}: {prompt: string}) {
    if (this.sandbox === undefined) {
      throw new Error("Define sandbox first");
    }
    console.log("Received prompt:", prompt);
    responseStream.send("Starting OpenCode session...\n");

    const { client } = await createOpencode<OpencodeClient>(this.sandbox, {
      directory: "/workspace/app/",
      config: this.getOpencodeConfig(),
    });

    const session = await client.session.create({
      body: { title: "Edit Session" },
      query: { directory: "/workspace/app" },
    });
    if (session.data === undefined) {
      throw new Error("Couldn't start OpenCode");
    }
    const sessionId = session.data.id;
    console.log("Session created with ID:", sessionId);
    responseStream.send(`Session created: ${sessionId}\n`);

    // Subscribe to events FIRST before sending prompt
    responseStream.send("Subscribing to event stream...\n");
    const events = await client.event.subscribe();
    console.log("Subscribed to events");

    // Send prompt asynchronously (doesn't wait for completion)
    responseStream.send("Sending prompt to AI (async)...\n");
    console.log("About to send promptAsync to session:", sessionId);
    
    await client.session.promptAsync({
      path: { id: sessionId },
      query: { directory: "/workspace/app/" },
      body: {
        parts: [
          {
            type: "text",
            text: `Do what you need in the codebase to make the following request happen: 
            
            <Request>${prompt}</Request>
            
            Do not ask questions, just perform actions to make the request happen
            `,
          },
        ],
      },
    });
    
    responseStream.send("Prompt sent, listening for events...\n");
    console.log("promptAsync sent, now iterating events");

    // Collect response parts for storing
    const responseParts: string[] = [];
    const toolCalls: string[] = [];
    let eventCount = 0;

    // Stream events back to the client
    for await (const event of events.stream) {
      eventCount++;
      const eventType = (event as { type?: string }).type || "unknown";
      console.log(`Event #${eventCount}: ${eventType}`, JSON.stringify(event).slice(0, 500));
      
      // Handle message.part.updated events
      if (eventType === "message.part.updated") {
        const { part, delta } = (event as { 
          type: string; 
          properties: { 
            part: { 
              type: string; 
              sessionID: string; 
              text?: string;
              state?: { status: string; title?: string; error?: string; output?: string };
              tool?: string;
            }; 
            delta?: string 
          } 
        }).properties;
        
        // Only process parts from our session
        if (part.sessionID !== sessionId) {
          console.log(`Skipping event - wrong session (got ${part.sessionID}, expected ${sessionId})`);
          continue;
        }

        console.log(`Part type: ${part.type}, delta length: ${delta?.length || 0}`);

        if (part.type === "text") {
          if (delta) {
            // Incremental text update
            responseStream.send(delta);
            responseParts.push(delta);
            console.log(`Text delta: "${delta.slice(0, 100)}..."`);
          } else if (part.text) {
            // Full text (no delta)
            responseStream.send(part.text + "\n");
            responseParts.push(part.text);
            console.log(`Full text: "${part.text.slice(0, 100)}..."`);
          }
        } else if (part.type === "tool" && part.state) {
          const toolState = part.state;
          const toolName = part.tool || "unknown";
          
          if (toolState.status === "pending") {
            const msg = `\n[Tool pending: ${toolName}]\n`;
            responseStream.send(msg);
            console.log(`Tool pending: ${toolName}`);
          } else if (toolState.status === "running") {
            const title = toolState.title || toolName;
            const msg = `\n[Tool running: ${title}]\n`;
            responseStream.send(msg);
            toolCalls.push(`Running: ${title}`);
            console.log(`Tool running: ${title}`);
          } else if (toolState.status === "completed") {
            const title = toolState.title || toolName;
            const msg = `\n[Tool completed: ${title}]\n`;
            responseStream.send(msg);
            toolCalls.push(`Completed: ${title}`);
            console.log(`Tool completed: ${title}, output length: ${toolState.output?.length || 0}`);
          } else if (toolState.status === "error") {
            const errorMsg = toolState.error || "Unknown error";
            const msg = `\n[Tool error: ${toolName} - ${errorMsg}]\n`;
            responseStream.send(msg);
            toolCalls.push(`Error: ${toolName} - ${errorMsg}`);
            console.log(`Tool error: ${toolName} - ${errorMsg}`);
          }
        } else if (part.type === "step-start") {
          responseStream.send("\n[Step started]\n");
          console.log("Step started");
        } else if (part.type === "step-finish") {
          responseStream.send("\n[Step finished]\n");
          console.log("Step finished");
        } else if (part.type === "reasoning") {
          if (delta) {
            responseStream.send(`[Reasoning: ${delta}]`);
            console.log(`Reasoning delta: "${delta.slice(0, 100)}..."`);
          }
        } else {
          // Log any other part types we encounter
          console.log(`Unhandled part type: ${part.type}`, JSON.stringify(part).slice(0, 300));
        }
      }
      
      // Handle message.updated events (check for completion)
      if (eventType === "message.updated") {
        const message = (event as {
          type: string;
          properties: {
            info: {
              sessionID: string;
              role: string;
              time: { created: number; completed?: number };
              error?: { name: string; data: { message: string } };
            }
          }
        }).properties.info;
        
        console.log(`Message updated: role=${message.role}, sessionID=${message.sessionID}, completed=${message.time.completed}`);
        
        if (message.sessionID === sessionId && message.role === "assistant") {
          if (message.error) {
            const errorMsg = `\n[Error: ${message.error.name} - ${message.error.data?.message || "Unknown"}]\n`;
            responseStream.send(errorMsg);
            responseParts.push(errorMsg);
            console.log(`Message error: ${message.error.name}`);
          }
          
          if (message.time.completed) {
            console.log("Message completed, breaking event loop");
            responseStream.send("\n\n--- Edit complete ---\n");
            break;
          }
        }
      }
      
      // Handle session status updates
      if (eventType === "session.status.updated") {
        console.log("Session status updated:", JSON.stringify(event).slice(0, 300));
      }
    }
    
    console.log(`Event loop ended after ${eventCount} events`);
    
    // Store the edit in state with full response
    const fullResponse = responseParts.join("");
    const toolSummary = toolCalls.length > 0 ? `\n\nTools used:\n${toolCalls.join("\n")}` : "";
    
    const newEdit: EditEntry = {
      prompt,
      response: fullResponse + toolSummary,
      timestamp: Date.now(),
    };
    
    console.log(`Storing edit: prompt="${prompt.slice(0, 50)}...", response length=${newEdit.response.length}`);
    
    this.setState({
      ...this.state,
      edits: [...this.state.edits, newEdit],
    });
    
    responseStream.send(`\n[Stored edit #${this.state.edits.length}]\n`);
  }
}
