import { ReactNode } from "react";

export function ModuleFrame({
  title,
  accent,
  children
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section className="flex-1 p-8 overflow-auto">
      <header className="mb-6">
        <h1 className={`text-2xl font-semibold ${accent}`}>{title}</h1>
      </header>
      <div>{children}</div>
    </section>
  );
}
