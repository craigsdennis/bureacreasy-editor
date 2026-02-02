import { useState } from "react";
import { useNavigate } from "react-router";
import { useAgent } from "agents/react";
import type { Launcher, LauncherState } from "../../worker/agents/launcher-agent";

export function LauncherPage() {
  const [state, setState] = useState<LauncherState>({
    totalCount: 0,
    configs: {},
  });
  const [isCreating, setIsCreating] = useState<string | null>(null);
  const navigate = useNavigate();

  const agent = useAgent<Launcher, LauncherState>({
    agent: "launcher",
    onStateUpdate(newState) {
      setState(newState);
    },
  });

  async function handleConfigurationSelection(configKey: string) {
    setIsCreating(configKey);
    try {
      const editorName = await agent.stub.createNewPreview({ configKey });
      navigate(`/previews/${editorName}`);
    } catch (error) {
      console.error("Failed to create preview:", error);
      setIsCreating(null);
    }
  }

  const configs = Object.entries(state.configs);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Bureaucreasy Editor
        </h1>
        <p className="text-gray-600 mb-8">
          Select a site configuration to start editing
        </p>

        <div className="mb-4 text-sm text-gray-500">
          {state.totalCount} previews created
        </div>

        <div className="grid gap-4">
          {configs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              Loading configurations...
            </div>
          ) : (
            configs.map(([key, config]) => (
              <div
                key={key}
                className="bg-white rounded-lg shadow p-6 border border-gray-200"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  {config.displayName}
                </h2>
                <p className="text-gray-600 text-sm mb-4">
                  <a
                    href={config.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {config.url}
                  </a>
                </p>
                <p className="text-gray-500 text-xs mb-4">
                  {config.githubOwner}/{config.githubRepo}
                </p>
                <button
                  onClick={() => handleConfigurationSelection(key)}
                  disabled={isCreating !== null}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating === key ? "Creating Preview..." : "Start Editing"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
