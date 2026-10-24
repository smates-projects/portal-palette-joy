import { createFileRoute } from "@tanstack/react-router";
import { EntryLinkPage } from "@/components/auth/EntryLinkPage";
import { tStatic } from "@/lib/i18n";

/** ?siguiente=: the portal page the email points at (a step of "Tu ingreso", a meeting, a signed copy). */
interface EntrySearch {
  siguiente?: string;
}

export const Route = createFileRoute("/entrada/$token")({
  validateSearch: (raw: Record<string, unknown>): EntrySearch =>
    typeof raw["siguiente"] === "string" && raw["siguiente"] ? { siguiente: raw["siguiente"] } : {},
  head: () => ({
    meta: [
      { title: `${tStatic("auth.entry_link.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: EntryLinkRoute,
});

function EntryLinkRoute() {
  const { token } = Route.useParams();
  const { siguiente } = Route.useSearch();
  return <EntryLinkPage token={token} next={siguiente} />;
}
