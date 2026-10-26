import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContractLanguage } from "@/lib/api/types";

/** DocuSeal's official signing form, a web component (https://www.docuseal.com/docs/embedded/form). */
const FORM_SCRIPT = "https://cdn.docuseal.com/js/form.js";

let loading: Promise<void> | null = null;

/** Loads the web component once per page, in the browser only (TanStack Start renders this file on the server too). */
function loadDocusealForm(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("docuseal_form_browser_only"));
  if (window.customElements?.get("docuseal-form")) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = FORM_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("docuseal_form_unavailable"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Brand of the form: Strategic Mates' navy, square corners and the portal's font (no AI look, radius 4 px). */
const BRAND_CSS = [
  "#submit_form_button, .base-button { background-color: #153f58 !important; border-color: #153f58 !important; border-radius: 4px !important; }",
  ".base-button:hover { background-color: #0f2f42 !important; }",
  "#expand_form_button { background-color: #153f58 !important; border-radius: 4px !important; }",
].join("\n");

/**
 * The signer's own DocuSeal form inside the portal's dialog (never an iframe of ours). Mounted only on the client:
 * the element is created in an effect, after the script loaded. The same signature is reused in the second document
 * (data-reuse-signature), DocuSeal emails nothing but the one-time code (the portal sends the copies), and its
 * completed and declined events only tell the dialog to ask the API: the signature itself is recorded by DocuSeal's
 * webhook or the API's own sync, never from here.
 */
export function DocusealEmbed(props: {
  src: string;
  email: string | null | undefined;
  language: ContractLanguage;
  title: string;
  onCompleted: () => void;
  onDeclined: () => void;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // The latest handlers without mounting the form again when they change.
  const handlers = useRef({ onCompleted: props.onCompleted, onDeclined: props.onDeclined });
  handlers.current = { onCompleted: props.onCompleted, onDeclined: props.onDeclined };
  const completedTitle = t("intake.docuseal.completed_title");
  const completedBody = t("intake.docuseal.completed_body");

  useEffect(() => {
    let cancelled = false;
    let form: HTMLElement | null = null;
    const completed = () => handlers.current.onCompleted();
    const declined = () => handlers.current.onDeclined();
    setFailed(false);
    loadDocusealForm()
      .then(() => {
        if (cancelled || !host.current) return;
        form = document.createElement("docuseal-form");
        const attributes: Record<string, string | null | undefined> = {
          "data-src": props.src,
          "data-email": props.email,
          "data-language": props.language,
          "data-reuse-signature": "true",
          "data-allow-typed-signature": "true",
          "data-send-copy-email": "false",
          "data-with-send-copy-button": "false",
          "data-with-download-button": "false",
          "data-with-decline": "true",
          "data-with-title": "true",
          "data-logo": `${window.location.origin}/brand/sm-logo-horizontal.png`,
          "data-background-color": "#ffffff",
          "data-completed-message-title": completedTitle,
          "data-completed-message-body": completedBody,
          "data-custom-css": BRAND_CSS,
        };
        for (const [name, value] of Object.entries(attributes)) if (value) form.setAttribute(name, value);
        form.addEventListener("completed", completed);
        form.addEventListener("declined", declined);
        host.current.replaceChildren(form);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      form?.removeEventListener("completed", completed);
      form?.removeEventListener("declined", declined);
      form?.remove();
    };
  }, [props.src, props.email, props.language, completedTitle, completedBody]);

  if (failed) return <p className="text-sm text-status-danger-fg" role="alert">{t("intake.docuseal.embed_error")}</p>;
  return <div ref={host} aria-label={props.title} className="min-h-[420px] w-full" />;
}
