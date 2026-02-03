import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import { createOpencode } from "@cloudflare/sandbox/opencode";
import type { OpencodeClient, Config } from "@opencode-ai/sdk";
import { Agent, callable, StreamingResponse } from "agents";

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
    // Git checkout into 'app' directory
    const repoUrl = `https://github.com/${githubOwner}/${githubRepo}`;
    responseStream.send(`Cloning ${githubOwner}/${githubRepo}...`);
    await this.sandbox.gitCheckout(repoUrl, {
      targetDir: "app",
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
    responseStream.send("Starting OpenCode session...");

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
    responseStream.send("Session created, subscribing to events...");

    // Send prompt and wait for response
    responseStream.send("Sending prompt to AI...");
    console.log("About to send prompt to session:", sessionId);
    
    const result = await client.session.prompt({
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

    // Extract the response from the result
    const responseParts: string[] = [];
    
    if (result.data) {
      const { parts } = result.data;
      
      if (parts) {
        for (const part of parts) {
          if (part.type === "text") {
            responseParts.push(part.text);
          } else if (part.type === "tool") {
            const toolState = part.state;
            if (toolState.status === "completed" && toolState.title) {
              responseParts.push(`[${toolState.title}]`);
            }
          }
        }
      }
    }
    
    // Send each part with newlines between them
    for (const part of responseParts) {
      responseStream.send(part + "\n");
    }
    
    responseStream.send("\n--- Edit complete ---");
    
    // Store the edit in state
    const fullResponse = responseParts.join("\n");
    const newEdit: EditEntry = {
      prompt,
      response: fullResponse,
      timestamp: Date.now(),
    };
    
    this.setState({
      ...this.state,
      edits: [...this.state.edits, newEdit],
    });
  }
}
