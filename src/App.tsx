import { BrowserRouter, Routes, Route } from "react-router";
import { LauncherPage } from "./pages/LauncherPage";
import { EditorPage } from "./pages/EditorPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LauncherPage />} />
        <Route path="/previews/:editorName" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
