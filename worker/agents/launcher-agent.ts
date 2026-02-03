import {
  Agent,
  callable,
  getAgentByName,
  type Connection,
  type ConnectionContext,
} from "agents";

export type Configuration = {
  displayName: string;
  url: string;
  githubOwner: string;
  githubRepo: string;
  port: number;
};

export type LauncherState = {
  totalCount: number;
  hostname?: string;
  configs: Record<string, Configuration>;
};

export class Launcher extends Agent<Env, LauncherState> {
  initialState = {
    totalCount: 0,
    configs: {
      tacoyellmkg: {
        displayName: "Taco Yell Marketing Site",
        url: "https://tacoyell.craigsdemos.workers.dev",
        githubOwner: "craigsdennis",
        githubRepo: "tacoyell-marketing-site",
        port: 4321
      },
    },
  };

  onConnect(_connection: Connection, ctx: ConnectionContext) {
    if (this.state.hostname === undefined) {
      const url = new URL(ctx.request.url);
      this.setState({
        ...this.state,
        hostname: url.hostname,
      });
    }
  }

  @callable()
  async createNewPreview({ configKey }: { configKey: string }) {
    const timestamp = Date.now();
    const editorName = `${configKey}-${timestamp}`.toLowerCase();
    const editor = await getAgentByName(this.env.EditorAgent, editorName);
    const config = this.state.configs[configKey];
    const hostname = this.state.hostname || "";
    await editor.configure({ ...config, hostname });
    return editorName;
  }
}
