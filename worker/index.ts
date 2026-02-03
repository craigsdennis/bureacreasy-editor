import { Hono } from "hono";
import { proxyToSandbox } from "@cloudflare/sandbox";
import { EditorAgent } from "./agents/editor-agent";
import { Launcher } from "./agents/launcher-agent";
import { agentsMiddleware } from "hono-agents";

// Export the agents
export { EditorAgent, Launcher };
export { Sandbox } from "@cloudflare/sandbox";

const app = new Hono<{ Bindings: Env }>();

// Proxy requests to sandbox preview URLs first (subdomains or localhost with port pattern)
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const hostname = url.hostname;
  
  // Check if this is a preview URL:
  // - Production: subdomains of bureaucreasy.work (e.g., 4321-sandbox-id.bureaucreasy.work)
  // - Local dev: localhost with preview path pattern
  const isProductionPreview = hostname !== "bureaucreasy.work" && hostname.endsWith(".bureaucreasy.work");
  const isLocalPreview = hostname.endsWith("localhost") || hostname === "127.0.0.1";
  if (isProductionPreview || isLocalPreview) {
    const proxyResponse = await proxyToSandbox(c.req.raw, c.env);
    if (proxyResponse) {
      return proxyResponse;
    }
    // For production subdomains, return 404 if proxy didn't handle it
    if (isProductionPreview) {
      return c.text("Not found", 404);
    }
  }
  return next();
});

app.get("/api", async (c) => {
  return c.json({ example: "This is coming from the worker" });
});

app.use("*", agentsMiddleware());

// Fallback to static assets for the main domain
app.use("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
