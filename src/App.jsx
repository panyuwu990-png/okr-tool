import { useState } from "react";
import { useOkrData } from "./hooks/useOkrData";
import ObjectivePanel from "./components/ObjectivePanel";
import TreeView from "./components/TreeView";

export default function App() {
  const {
    objectives,
    updateObjective,
    updateKR,
    addCheckin,
  } = useOkrData();

  const [view, setView] = useState("board");

  return (
    <div className="app">
      <header>
        <h1>OKR 战略系统</h1>

        <button onClick={() => setView("board")}>看板</button>
        <button onClick={() => setView("tree")}>关系树</button>
      </header>

      {view === "board" &&
        objectives.map((o) => (
          <ObjectivePanel
            key={o.id}
            objective={o}
            updateObjective={updateObjective}
            updateKR={updateKR}
            addCheckin={addCheckin}
          />
        ))}

      {view === "tree" && <TreeView objectives={objectives} />}
    </div>
  );
}
