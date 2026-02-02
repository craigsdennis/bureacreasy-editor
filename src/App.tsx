import { useState } from "react";
import { useAgent } from "agents/react";
import type { Launcher, LauncherState } from "../worker/agents/launcher-agent";

function App() {
  const [totalCount, setTotalCount] = useState<number>(0);
  const agent = useAgent<Launcher, LauncherState>({
    agent: "my-agent",
    onStateUpdate(state) {
      setTotalCount(state.totalCount);
    },
  });

  async function update(formData: FormData) {
    const someInputValue = (formData.get("some-input-value") as string) ?? "";
    await agent.stub.updateSomeValue({ someValue: someInputValue });
  }

  return (
    <>
    {totalCount} previews created.
    
    </>
  );
}

export default App;
