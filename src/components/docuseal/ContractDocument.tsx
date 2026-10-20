import { useState } from "react";
import type { ContractSignature } from "@/lib/api/types";
import { apiBaseUrl } from "@/lib/api/http/client";
import { contractSections, signatureView } from "@/lib/contracts/signature";
import { cn } from "@/lib/utils";

/** The script style of a typed signature (the same look as the pad's typed mode). */
export const TYPED_SIGNATURE_STYLE = { fontFamily: '"Segoe Script", "Brush Script MT", cursive' } as const;

/** A contract's full text (Contract.body), section by section: the same reading in the signer and the viewer. */
export function ContractText({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn("space-y-4 text-foreground", className)}>
      {contractSections(body).map((s, i) => (
        <section key={i} className="break-inside-avoid">
          {s.heading && <h3 className="text-sm font-semibold">{s.heading}</h3>}
          <p className={cn("whitespace-pre-line", s.heading && "mt-1")}>{s.text}</p>
        </section>
      ))}
    </div>
  );
}

/**
 * One signer's signature: the image when there is one (a data URL, or the API's stored file resolved against the
 * API), the name in the script style otherwise (a typed signature, or an image that fails to load).
 */
export function SignatureMark({ signature, signerName, alt }: { signature: ContractSignature | null | undefined; signerName: string; alt?: string }) {
  const view = signatureView(signature, signerName, apiBaseUrl());
  const [failed, setFailed] = useState(false);
  if (view.kind === "image" && !failed)
    return <img src={view.src} alt={alt ?? signerName} onError={() => setFailed(true)} className="h-12 max-w-full object-contain object-left" />;
  return <span className="text-2xl leading-none text-foreground" style={TYPED_SIGNATURE_STYLE}>{view.kind === "text" ? view.text : signerName}</span>;
}
