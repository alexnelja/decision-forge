import { useState } from "react";
import type { DependencyMap } from "@decision-forge/core";

interface CapturePanelProps {
  map: DependencyMap;
  onAddNode: (label: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CapturePanel({ map, onAddNode, selectedId, onSelect }: CapturePanelProps) {
  const [value, setValue] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onAddNode(trimmed);
    setValue("");
  }

  return (
    <div className="space-y-4">
      <div className="eyebrow">Factors</div>

      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a factor…"
        className="w-full border-0 border-b border-ink-faint bg-transparent px-0 py-1 font-display text-[15px] text-ink placeholder:text-ink-dim focus:border-ink focus:outline-none"
      />

      {map.nodes.length > 0 && (
        <ul className="space-y-1">
          {map.nodes.map((node) => {
            const isSelected = node.id === selectedId;
            return (
              <li key={node.id}>
                <button
                  type="button"
                  data-selected={isSelected}
                  onClick={() => onSelect(node.id)}
                  className={`w-full text-left px-2 py-1.5 font-display text-[14px] transition-colors ${
                    isSelected
                      ? "text-ink bg-paper-raised border-l-2 border-[color:var(--sec-depmap)]"
                      : "text-ink-dim hover:text-ink hover:bg-paper-raised"
                  }`}
                  style={isSelected ? { fontVariationSettings: '"wght" 500' } : undefined}
                >
                  {node.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {map.nodes.length === 0 && (
        <p className="meta italic">No factors yet — type one above and press Enter.</p>
      )}
    </div>
  );
}
