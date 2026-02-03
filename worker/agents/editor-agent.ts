import { getSandbox } from "@cloudflare/sandbox";
import { Agent, callable, StreamingResponse } from "agents";

export type EditorState = {
  hostname?: string;
  displayName?: string;
  githubOwner?: string;
  githubRepo?: string;
  siteUrl?: string;
  previewUrl?: string;
  isSetup: boolean;
};

export class EditorAgent extends Agent<Env, EditorState> {
  initialState = { isSetup: false };

  configure({
    hostname,
    displayName,
    githubOwner,
    githubRepo,
    url,
  }: {
    hostname: string;
    displayName: string;
    githubOwner: string;
    githubRepo: string;
    url: string;
  }) {
    this.setState({
      ...this.state,
      hostname,
      displayName,
      githubOwner,
      githubRepo,
      siteUrl: url,
    });
  }

  @callable({ streaming: true })
  async setup(responseStream: StreamingResponse) {
    responseStream.send("Getting sandbox");
    const { githubOwner, githubRepo } = this.state;
    const sandbox = getSandbox(this.env.Sandbox, `preview-${this.name}`);

    // Git checkout into 'app' directory
    const repoUrl = `https://github.com/${githubOwner}/${githubRepo}`;
    responseStream.send(`Cloning ${githubOwner}/${githubRepo}...`);
    await sandbox.gitCheckout(repoUrl, {
      targetDir: "app",
    });

    // Install dependencies with streaming output
    responseStream.send(`Installing dependencies...`);
    await sandbox.exec("npm install --verbose", {
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
    const server = await sandbox.startProcess(
      "npm run dev",
      {
        cwd: "app",
      },
    );

    // Wait for port to be ready
    responseStream.send(`Waiting for server to be ready on port 4321...`);
    try {
      await server.waitForPort(4321);
      responseStream.send(`Server is ready!`);

      // Give it a moment to fully initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));
      responseStream.send(`Server initialized`);
    } catch (error) {
      // Get logs to see what went wrong
      const logs = await sandbox.getProcessLogs(server.id);
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
        hostname += ":5173";
    }
    responseStream.send(`Hostname is ${hostname}`);
    const results = await sandbox.exposePort(4321, {
      hostname,
    });
    responseStream.send(`Preview available at: ${results.url}`);

    this.setState({
      ...this.state,
      previewUrl: results.url,
      isSetup: true,
    });
  }
}
