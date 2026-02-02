import { Hono } from "hono";
import { EditorAgent } from "./agents/editor-agent";
import { Launcher } from "./agents/launcher-agent";
import { agentsMiddleware } from "hono-agents";

// Export the agents
export { EditorAgent, Launcher };
// todo env
export { Sandbox } from "@cloudflare/sandbox";

const app = new Hono<{ Bindings: Env }>();

app.get("/api", async (c) => {
  return c.json({ example: "This is coming from the worker" });
});

app.use("*", agentsMiddleware());

export default app;
