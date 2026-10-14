import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/home/HomePage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  validateSearch: (raw: Record<string, unknown>): { task?: string } =>
    typeof raw.task === "string" && raw.task ? { task: raw.task } : {},
  head: () => ({
    meta: [
      { title: `${tStatic("pages.home.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.home") },
      { property: "og:title", content: `${tStatic("pages.home.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.home") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeRoute,
});

function HomeRoute() {
  const { task } = Route.useSearch();
  return <HomePage taskId={task} />;
}
