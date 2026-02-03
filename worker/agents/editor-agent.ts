import { getSandbox, Sandbox } from "@cloudflare/sandbox";
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

    // Merge opencode.json config with our provider settings
    responseStream.send("Configuring OpenCode...");
    await this.mergeOpencodeConfig();

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

  /**
   * Deep merge two objects. Values from source override target for conflicts.
   */
  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };
    
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (
        sourceValue !== null &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        // Both are objects, deep merge
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        // Overwrite with source value
        result[key] = sourceValue;
      }
    }
    
    return result;
  }

  /**
   * Get our OpenCode config that we want to merge with any existing config
   */
  private getOurOpencodeConfig(): Record<string, unknown> {
    return {
      "$schema": "https://opencode.ai/config.json",
      model: "cloudflare-ai-gateway/anthropic/claude-haiku-4-5",
      provider: {
        "cloudflare-ai-gateway": {
          models: {
            "anthropic/claude-haiku-4-5": {},
          },
        },
      },
      permission: {
        webfetch: "allow",
        bash: "allow",
      },
    };
  }

  /**
   * Read existing opencode.json from sandbox, merge with our config, and write back
   */
  private async mergeOpencodeConfig(): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const configPath = "app/opencode.json";
    let existingConfig: Record<string, unknown> = {};

    // Try to read existing config
    try {
      const result = await this.sandbox.readFile(configPath);
      if (result.success && result.content) {
        existingConfig = JSON.parse(result.content);
        console.log("Found existing opencode.json:", JSON.stringify(existingConfig).slice(0, 200));
      }
    } catch (error) {
      // File doesn't exist or can't be parsed, that's fine
      console.log("No existing opencode.json found, creating new one");
    }

    // Merge configs (our config takes precedence for conflicts)
    const ourConfig = this.getOurOpencodeConfig();
    const mergedConfig = this.deepMerge(existingConfig, ourConfig);

    // Write merged config back
    const mergedContent = JSON.stringify(mergedConfig, null, 2);
    await this.sandbox.writeFile(configPath, mergedContent);
    console.log("Wrote merged opencode.json:", mergedContent.slice(0, 300));
  }

  /**
   * Strip ANSI escape codes from a string
   */
  private stripAnsi(str: string): string {
    // Matches ANSI escape sequences: ESC[ ... m (colors/styles)
    // and ESC[ ... other control codes
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  }

  @callable({ streaming: true })
  async submitPrompt(responseStream: StreamingResponse, {prompt}: {prompt: string}) {
    if (this.sandbox === undefined) {
      throw new Error("Sandbox not initialized");
    }
    
    console.log("Received prompt:", prompt);
    responseStream.send("Starting OpenCode...\n");

    // Escape the prompt for shell usage
    const escapedPrompt = prompt
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");

    const fullPrompt = `Do what you need in the codebase to make the following request happen:

<Request>${escapedPrompt}</Request>

Do not ask questions, just perform actions to make the request happen.`;

    // Build the opencode run command (no --format json, just stream raw output)
    const command = `opencode run "${fullPrompt}"`;
    console.log("Running command:", command.slice(0, 200));
    responseStream.send("Running opencode...\n\n");

    // Collect response for storing
    const responseParts: string[] = [];

    // Run opencode via sandbox.exec with streaming
    try {
      await this.sandbox.exec(command, {
        cwd: "app",
        stream: true,
        onOutput: (streamType, data) => {
          // Strip ANSI codes for clean output
          const cleanData = this.stripAnsi(data);
          
          if (streamType === "stderr") {
            console.log("stderr:", cleanData);
            // Still send stderr to client, might have useful info
            if (cleanData.trim()) {
              responseStream.send(cleanData);
              responseParts.push(cleanData);
            }
            return;
          }

          // Stream stdout directly to client
          if (cleanData) {
            responseStream.send(cleanData);
            responseParts.push(cleanData);
          }
        },
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("opencode run failed:", errorMsg);
      responseStream.send(`\n[Error: ${errorMsg}]\n`);
      responseParts.push(`Error: ${errorMsg}`);
    }

    responseStream.send("\n\n--- Edit complete ---\n");

    // Store the edit in state with full response
    const fullResponse = responseParts.join("");

    const newEdit: EditEntry = {
      prompt,
      response: fullResponse,
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
