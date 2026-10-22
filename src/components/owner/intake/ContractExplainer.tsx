import type { ReactNode } from "react";
import type { Contract, ContractLanguage } from "@/lib/api/types";
import { contractExplainerIn } from "@/lib/contracts/language";
import { ContractFallbackNote, ContractLanguageToggle } from "@/components/docuseal/ContractLanguage";

/**
 * The plain-words window above a contract (Contract.explainers, or the older Spanish explainer): title, paragraphs
 * and the key points, inside a visible border, in the language chosen with its "ES | EN" toggle (Spanish when the
 * English one is missing). `children` go at the bottom (the note on who already signed, "Leer el ... completo").
 */
export function ContractExplainerCard(props: {
  contract: Contract;
  language: ContractLanguage;
  onLanguageChange: (language: ContractLanguage) => void;
  children?: ReactNode;
}) {
  const reading = contractExplainerIn(props.contract, props.language);
  const explainer = reading.value;
  if (!explainer) return null;
  return (
    <section className="rounded-[4px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 lang={reading.language} className="text-sm font-semibold">{explainer.title}</h3>
        <ContractLanguageToggle value={props.language} onChange={props.onLanguageChange} />
      </div>
      <ContractFallbackNote show={reading.fallback} className="mt-1" />
      <div lang={reading.language}>
        {explainer.paragraphs.map((p, i) => (
          <p key={i} className="mt-2 text-sm text-foreground">{p}</p>
        ))}
        {explainer.bullets.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
            {explainer.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>
      {props.children && <div className="mt-3 border-t border-border pt-3">{props.children}</div>}
    </section>
  );
}
