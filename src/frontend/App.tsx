import React, { useState } from "react";
import type { HttpPair } from "../shared/types.js";
import { ConversationView } from "./components/ConversationView.js";
import { JsonView } from "./components/JsonView.js";
import { RawPairsView } from "./components/RawPairsView.js";
import { useWebSocket } from "./hooks/useWebSocket.js";

type View = "conversations" | "raw" | "json";

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, color: "#f48771" }}>
          <h2>Render error</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{ padding: "6px 12px", marginTop: 8 }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// For static HTML report, data is injected at build time
const STATIC_DATA: HttpPair[] | null =
  typeof window !== "undefined" && (window as unknown as { ccTraceData?: HttpPair[] }).ccTraceData
    ? (window as unknown as { ccTraceData: HttpPair[] }).ccTraceData
    : null;

// Only connect to a live server when not rendering a static report and the host is non-empty
// (file:// URLs have an empty host, which would make `new WebSocket("ws://")` throw).
const WS_URL: string | null =
  STATIC_DATA === null && typeof window !== "undefined" && window.location.host
    ? `ws://${window.location.host}`
    : null;

export function App() {
  const livePairs = useWebSocket<HttpPair>(WS_URL);
  const pairs = STATIC_DATA ?? livePairs;
  const [view, setView] = useState<View>("conversations");
  const [includeAll, setIncludeAll] = useState(true);

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
          Include single-message requests
        </label>
      </div>

      <ErrorBoundary>
        {view === "conversations" && <ConversationView pairs={pairs} includeAll={includeAll} />}
        {view === "raw" && <RawPairsView pairs={pairs} />}
        {view === "json" && <JsonView pairs={pairs} />}
      </ErrorBoundary>
    </div>
  );
}
