import { createFileRoute } from "@tanstack/react-router";
import { EntryLinkPage } from "@/components/auth/EntryLinkPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/entrada/$token")({
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
  return <EntryLinkPage token={token} />;
}
