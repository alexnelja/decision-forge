#!/usr/bin/env node
export async function run(argv: string[]): Promise<string> {
  const [cmd] = argv;
  switch (cmd) {
    case "version":
      return "decision-forge 0.1.0";
    default:
      return "usage: decision-forge <version>";
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then((out) => console.log(out));
}
