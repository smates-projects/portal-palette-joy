import type { ReactNode } from "react";
import type { ContractExplainer } from "@/lib/api/types";

/**
 * The plain-words window above a contract (Contract.explainer): title, paragraphs and the key points, inside a
 * visible border. `children` go at the bottom (the note on who already signed, "Leer el ... completo").
 */
export function ContractExplainerCard({ explainer, children }: { explainer: ContractExplainer; children?: ReactNode }) {
  return (
    <section className="rounded-[4px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">{explainer.title}</h3>
      {explainer.paragraphs.map((p, i) => (
        <p key={i} className="mt-2 text-sm text-foreground">{p}</p>
      ))}
      {explainer.bullets.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
          {explainer.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
      {children && <div className="mt-3 border-t border-border pt-3">{children}</div>}
    </section>
  );
}
