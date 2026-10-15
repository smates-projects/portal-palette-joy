import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useProposeMeeting } from "@/lib/api/hooks";
import type { TaskWithComputed } from "@/lib/api/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Adds an event to the agenda as a meeting proposed on one of the user's tasks. */
export function AddEventDialog({
  open,
  onOpenChange,
  day,
  tasks,
  bizName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  day: string;
  tasks: TaskWithComputed[];
  bizName: (id: string) => string;
}) {
  const { t } = useTranslation();
  const propose = useProposeMeeting();
  const open_ = tasks.filter((x) => x.status !== "accepted" && x.status !== "cancelled");
  const [taskId, setTaskId] = useState("");
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(day);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDate(day);
  }
  const valid = !!taskId && topic.trim().length > 0 && !!date && !!time;

  const submit = () => {
    if (!valid) return;
    propose.mutate(
      { id: taskId, topic: topic.trim(), starts_at: new Date(`${date}T${time}:00`).toISOString(), duration_minutes: duration },
      {
        onSuccess: () => {
          toast.success(t("home.event_added"));
          setTopic("");
          setTaskId("");
          onOpenChange(false);
        },
        onError: () => toast.error(t("home.event_error")),
      },
    );
  };

  const field = "h-9 w-full rounded-md border border-input bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("home.add_event_title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ev-task">{t("home.event_task")}</Label>
            <select id="ev-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} className={field}>
              <option value="">{t("home.event_task_placeholder")}</option>
              {open_.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.name} ({bizName(x.business_id)})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-topic">{t("home.event_topic")}</Label>
            <Input id="ev-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="ev-date">{t("home.event_date")}</Label>
              <input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-time">{t("home.event_time")}</Label>
              <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-dur">{t("home.event_duration")}</Label>
              <select id="ev-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field}>
                {[15, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>{t("home.event_minutes", { count: m })}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("home.event_cancel")}</Button>
          <Button onClick={submit} disabled={!valid || propose.isPending}>{t("home.event_save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
