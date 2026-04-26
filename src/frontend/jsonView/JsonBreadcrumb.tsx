import type React from "react";
import { formatJsonPath } from "./json-path.js";

interface Props {
  lastFocused: ReadonlyArray<string | number>;
}

/**
 * Breadcrumb that displays the most recently hovered path and copies it to the clipboard on click.
 * @param lastFocused - segment array of the most recently focused JSON node
 * @returns a button rendering the human-readable path
 */
export function JsonBreadcrumb({ lastFocused }: Props): React.ReactElement {
  const breadcrumb = formatJsonPath(lastFocused);
  const copyPath = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(breadcrumb).catch(() => {
        /* clipboard denied — silent */
      });
    }
  };
  return (
    <button type="button" className="json-breadcrumb" onClick={copyPath} title="click to copy path">
      {breadcrumb}
    </button>
  );
}
