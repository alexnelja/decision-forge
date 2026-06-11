import { useEffect, useState } from "react";

export interface McLink {
  mapId: string;
  nodeId: string;
  varName: string;
}

type Listener = (links: McLink[]) => void;

let _links: McLink[] = [];
const _listeners = new Set<Listener>();

function _notify(): void {
  _listeners.forEach((l) => l(_links));
}

/** Replace any existing binding with the same nodeId, otherwise append. */
export function addMcLink(link: McLink): void {
  _links = [..._links.filter((l) => l.nodeId !== link.nodeId), link];
  _notify();
}

/** Replace the entire set of bindings. */
export function setMcLinks(links: McLink[]): void {
  _links = [...links];
  _notify();
}

export function getMcLinks(): McLink[] {
  return _links;
}

/** Clear all bindings (for tests). */
export function clearMcLinks(): void {
  _links = [];
  _notify();
}

export function useMcLinks(): McLink[] {
  const [links, setLinks] = useState<McLink[]>(_links);
  useEffect(() => {
    _listeners.add(setLinks);
    return () => {
      _listeners.delete(setLinks);
    };
  }, []);
  return links;
}
