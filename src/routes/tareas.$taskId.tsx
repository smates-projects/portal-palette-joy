import { createFileRoute } from "@tanstack/react-router";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/tareas/$taskId")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.tasks.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.tasks") },
      { property: "og:title", content: `${tStatic("pages.tasks.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.tasks") },
    ],
  }),
  component: TaskPage,
});

function TaskPage() {
  const { taskId } = Route.useParams();
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <TaskDetail taskId={taskId} mode="page" />
    </div>
  );
}
