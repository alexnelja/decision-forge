import type { DependencyMap } from "@decision-forge/core";

export const mapsApi = {
  list: () => window.api.maps.list(),
  load: (id: string) => window.api.maps.load(id) as Promise<DependencyMap | null>,
  save: (map: DependencyMap) => window.api.maps.save(map),
  delete: (id: string) => window.api.maps.delete(id)
};
