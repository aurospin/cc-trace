import React, { useEffect, useState } from "react";
import type { HttpPair } from "../shared/types.js";
import { ConversationView } from "./components/ConversationView.js";
import { JsonView } from "./components/JsonView.js";
import { RawPairsView } from "./components/RawPairsView.js";
import { StatsBlock } from "./components/StatsBlock.js";
import { VersionLabel } from "./components/VersionLabel.js";
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
        <div className="error-panel">
          <h2>Render error</h2>
          <pre>{this.state.error.message}</pre>
          <button type="button" onClick={() => this.setState({ error: null })}>
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
  typeof window !== "undefined" && window.ccTraceData ? window.ccTraceData : null;

const IS_LIVE = STATIC_DATA === null;

const WS_URL: string | null =
  IS_LIVE && typeof window !== "undefined" && window.location.host
    ? `ws://${window.location.host}`
    : null;

export function App() {
  const livePairs = useWebSocket<HttpPair>(WS_URL);
  const pairs = STATIC_DATA ?? livePairs;
  const [view, setView] = useState<View>("conversations");
  const [includeAll, setIncludeAll] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.mode = IS_LIVE ? "live" : "static";
  }, []);

  const tabs: { id: View; label: string }[] = [
    { id: "conversations", label: "Transcript" },
    { id: "raw", label: `Pairs · ${pairs.length}` },
    { id: "json", label: "JSON" },
  ];

  const errorCount = pairs.filter((p) => p.response && p.response.status_code >= 400).length;

  return (
    <div className="page">
      <header className="masthead">
        <h1 className="masthead-title serif">
          cc-<em>trace</em>
        </h1>
        <span className="smallcaps">{IS_LIVE ? "Wire Room" : "Bound Transcript"}</span>
        <div className="masthead-meta">
          <span className="smallcaps">
            <span className="heartbeat" />
            {IS_LIVE ? "Listening" : "Archived"}
          </span>
          {errorCount > 0 && (
            <span className="smallcaps" style={{ color: "var(--accent)" }}>
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </span>
          )}
          <VersionLabel />
        </div>
      </header>

      <StatsBlock pairs={pairs} live={IS_LIVE} />

      <nav className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            className="tab"
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <span className="tabs-spacer" />
        <label className="tab-toggle">
          <input
            type="checkbox"
            checked={includeAll}
            onChange={(e) => setIncludeAll(e.target.checked)}
          />
          Include single-message turns
        </label>
      </nav>

      <ErrorBoundary>
        {view === "conversations" && <ConversationView pairs={pairs} includeAll={includeAll} />}
        {view === "raw" && <RawPairsView pairs={pairs} />}
        {view === "json" && <JsonView pairs={pairs} />}
      </ErrorBoundary>

      <footer className="footer">
        <span>
          cc-trace · {pairs.length} pair{pairs.length === 1 ? "" : "s"} captured
        </span>
        <span className="caret">{IS_LIVE ? "listening" : "self-contained report"}</span>
      </footer>
    </div>
  );
}
