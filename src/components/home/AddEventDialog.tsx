import { useBusinesses, useUsers } from "@/lib/api/hooks";
import type { TaskWithComputed } from "@/lib/api/types";
import type { SchedulingPerson } from "@/lib/calendar/scheduling";
import { ScheduleMeetingDialog, type TaskChoice } from "@/components/calendar/ScheduleMeetingDialog";

/**
 * "Agendar reunión" of the home agenda: the person picks one of their open tasks, which brings the task's firm person
 * and the business owner as guests, and goes on with the one scheduling dialog.
 */
export function AddEventDialog({
  open,
  onOpenChange,
  tasks,
  bizName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tasks: TaskWithComputed[];
  bizName: (id: string) => string;
}) {
  const users = useUsers().data ?? [];
  const businesses = useBusinesses().data ?? [];
  const person = (id: string | undefined): SchedulingPerson[] => {
    const u = id ? users.find((x) => x.id === id) : undefined;
    return u ? [{ user_id: u.id, name: u.full_name }] : [];
  };
  const choices: TaskChoice[] = tasks
    .filter((x) => x.status !== "accepted" && x.status !== "cancelled")
    .map((x) => ({
      id: x.id,
      label: `${x.code} · ${x.name} (${bizName(x.business_id)})`,
      participants: [...person(x.assignee_user_id), ...person(businesses.find((b) => b.id === x.business_id)?.owner_user_id)],
    }));
  return <ScheduleMeetingDialog open={open} onOpenChange={onOpenChange} taskChoices={choices} />;
}
