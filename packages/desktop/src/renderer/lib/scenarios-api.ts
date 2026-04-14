export const scenariosApi = {
  list: () => window.api.scenarios.list(),
  load: (id: string) => window.api.scenarios.load(id),
  save: (scenario: unknown) => window.api.scenarios.save(scenario)
};
