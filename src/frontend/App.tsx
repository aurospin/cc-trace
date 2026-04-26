import React, { useState } from "react";
import type { HttpPair } from "../shared/types.js";
import { ConversationView } from "./components/ConversationView.js";
import { JsonView } from "./components/JsonView.js";
import { RawPairsView } from "./components/RawPairsView.js";
import { useWebSocket } from "./hooks/useWebSocket.js";

type View = "conversations" | "raw" | "json";

const WS_URL =
  typeof window !== "undefined" ? `ws://${window.location.host}` : "ws://localhost:3000";

// For static HTML report, data is injected at build time
const STATIC_DATA: HttpPair[] | null =
  typeof window !== "undefined" && (window as unknown as { ccTraceData?: HttpPair[] }).ccTraceData
    ? (window as unknown as { ccTraceData: HttpPair[] }).ccTraceData
    : null;

export function App() {
  const livePairs = useWebSocket<HttpPair>(WS_URL);
  const pairs = STATIC_DATA ?? livePairs;
  const [view, setView] = useState<View>("conversations");
  const [includeAll, setIncludeAll] = useState(false);

  const tabs: { id: View; label: string }[] = [
    { id: "conversations", label: "Conversations" },
    { id: "raw", label: `Raw (${pairs.length})` },
    { id: "json", label: "JSON" },
  ];

  return (
    <div
      style={{
        fontFamily: "monospace",
        background: "#1e1e1e",
        color: "#d4d4d4",
        minHeight: "100vh",
        padding: 16,
      }}
    >
      <h1 style={{ color: "#569cd6", marginBottom: 16 }}>cc-trace</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            style={{
              padding: "6px 12px",
              background: view === tab.id ? "#569cd6" : "#2d2d2d",
              color: view === tab.id ? "#fff" : "#d4d4d4",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
        <label style={{ marginLeft: "auto", color: "#888", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={includeAll}
            onChange={(e) => setIncludeAll(e.target.checked)}
            style={{ marginRight: 4 }}
          />
          Show all requests
        </label>
      </div>

      {view === "conversations" && <ConversationView pairs={pairs} includeAll={includeAll} />}
      {view === "raw" && <RawPairsView pairs={pairs} />}
      {view === "json" && <JsonView pairs={pairs} />}
    </div>
  );
}
