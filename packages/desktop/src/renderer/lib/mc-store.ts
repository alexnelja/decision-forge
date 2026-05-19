import { useEffect, useState } from "react";
import type { MCVariable } from "@decision-forge/core";

type Listener = (vars: MCVariable[]) => void;

let _vars: MCVariable[] = [];
const _listeners = new Set<Listener>();

export function setLatestMCVariables(vars: MCVariable[]): void {
  _vars = vars;
  _listeners.forEach((l) => l(vars));
}

export function getLatestMCVariables(): MCVariable[] {
  return _vars;
}

export function useLatestMCVariables(): MCVariable[] {
  const [vars, setVars] = useState<MCVariable[]>(_vars);
  useEffect(() => {
    _listeners.add(setVars);
    return () => {
      _listeners.delete(setVars);
    };
  }, []);
  return vars;
}
