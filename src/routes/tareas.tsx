import { createFileRoute } from "@tanstack/react-router";
import { MyTasksPage } from "@/components/tasks/MyTasksPage";
import { tStatic } from "@/lib/i18n";
import { validateTasksSearch } from "@/lib/tasks/table";

export const Route = createFileRoute("/tareas")({
  validateSearch: validateTasksSearch,
  head: () => ({
    meta: [
      { title: `${tStatic("pages.tasks.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.tasks") },
      { property: "og:title", content: `${tStatic("pages.tasks.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.tasks") },
    ],
  }),
  component: TasksRoute,
});

function TasksRoute() {
  const search = Route.useSearch();
  return <MyTasksPage search={search} />;
}
