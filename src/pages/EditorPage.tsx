import { useState } from "react";
import { useParams, Link } from "react-router";
import { useAgent } from "agents/react";
import type { EditorAgent, EditorState } from "../../worker/agents/editor-agent";

export function EditorPage() {
  const { editorName } = useParams<{ editorName: string }>();
  const [state, setState] = useState<EditorState>({});
  const [connected, setConnected] = useState(false);

  // Agent connection - used for state sync via onStateUpdate callback
  useAgent<EditorAgent, EditorState>({
    agent: "editor-agent",
    name: editorName,
    onStateUpdate(newState) {
      setState(newState);
      setConnected(true);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            to="/"
            className="text-blue-600 hover:underline text-sm"
          >
            &larr; Back to Launcher
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Editor Preview
        </h1>
        <p className="text-gray-600 text-sm mb-8 font-mono">
          {editorName}
        </p>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Editor State
          </h2>

          {!connected ? (
            <div className="text-gray-500">Connecting to editor agent...</div>
          ) : (
            <div className="space-y-4">
              <div>
                <span className="text-gray-600 font-medium">Preview URL: </span>
                {state.previewUrl ? (
                  <a
                    href={state.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {state.previewUrl}
                  </a>
                ) : (
                  <span className="text-gray-400 italic">
                    Setting up preview...
                  </span>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Raw State
                </h3>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(state, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
