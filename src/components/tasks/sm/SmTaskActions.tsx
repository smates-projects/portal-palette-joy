import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { useCancelTasks, useOrganizations, useUpdateTasks, useUsers } from "@/lib/api/hooks";
import type { TaskPatch, TaskStep, TaskWithComputed } from "@/lib/api/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

export type EditMode = "all" | "assignee" | "due" | "step";
const STEPS: TaskStep[] = ["survey", "design", "implement", "validate", "document"];
const inputCls =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";
const textareaCls =
  "w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

/** Same value on every task, or "" when they differ. */
const common = <T,>(tasks: TaskWithComputed[], pick: (t: TaskWithComputed) => T): T | "" => {
  const first = tasks[0] ? pick(tasks[0]) : "";
  return tasks.every((t) => pick(t) === first) ? first : "";
};

/** SM: reassign (firm + person), change due date and step. One task (all fields) or many (one field). */
export function EditTasksDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; tasks: TaskWithComputed[]; mode: EditMode; onDone?: () => void }) {
  const { t } = useTranslation();
  const orgsQ = useOrganizations();
  const usersQ = useUsers();
  const update = useUpdateTasks();
  const tasks = props.tasks;
  const [org, setOrg] = useState<string>(common(tasks, (x) => x.organization_id));
  const [person, setPerson] = useState<string>(common(tasks, (x) => x.assignee_user_id));
  const [due, setDue] = useState<string>(common(tasks, (x) => x.due_date));
  const [step, setStep] = useState<string>(common(tasks, (x) => x.step));

  const firms = (orgsQ.data ?? []).filter((o) => o.kind === "partner_firm" || o.kind === "sm");
  const people = (usersQ.data ?? []).filter((u) => u.organization_id === org && (u.role === "partner_firm" || u.role === "sm_team"));
  const firmLabel = (o: (typeof firms)[number]) =>
    o.kind === "sm" ? t("sm.internal_label", { name: o.name }) : t("owner.firm_label", { name: o.name, what: t(`firmWhat.${o.area ?? "B1"}`) });
  const show = (m: EditMode) => props.mode === "all" || props.mode === m;

  const patch: TaskPatch = {};
  if (show("assignee") && person) Object.assign(patch, { organization_id: org, assignee_user_id: person });
  if (show("due") && due) patch.due_date = due;
  if (show("step") && step) patch.step = step as TaskStep;
  const changes = tasks.some(
    (x) =>
      (patch.assignee_user_id && patch.assignee_user_id !== x.assignee_user_id) ||
      (patch.due_date && patch.due_date !== x.due_date) ||
      (patch.step && patch.step !== x.step),
  );

  const save = () => {
    // Undo restores each task's previous values.
    const before = tasks.map((x) => ({ id: x.id, patch: { organization_id: x.organization_id, assignee_user_id: x.assignee_user_id, due_date: x.due_date, step: x.step } }));
    update.mutate(
      { ids: tasks.map((x) => x.id), patch },
      {
        onSuccess: () => {
          props.onOpenChange(false);
          props.onDone?.();
          toast.success(tasks.length === 1 ? t("sm.t_updated_one", { code: tasks[0]!.code }) : t("sm.t_updated_many", { count: tasks.length }), {
            action: {
              label: t("taskDetail.undo"),
              onClick: () => before.forEach((b) => update.mutate({ ids: [b.id], patch: b.patch })),
            },
          });
        },
        onError: () => toast.error(t("taskDetail.t_error")),
      },
    );
  };

  const title =
    props.mode === "all" ? t("sm.d_edit_title", { code: tasks[0]?.code ?? "" }) : t(`sm.d_bulk_${props.mode}`, { count: tasks.length });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("sm.d_edit_body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {props.mode === "all" && tasks[0] && (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
              <p className="font-medium">{tasks[0].name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{t("sm.catalog_note")}</p>
            </div>
          )}
          {show("assignee") && (
            <>
              <Field label={t("sm.d_firm")}>
                <select value={org} onChange={(e) => { setOrg(e.target.value); setPerson(""); }} className={inputCls}>
                  {org === "" && <option value="">{t("sm.d_keep")}</option>}
                  {firms.map((o) => <option key={o.id} value={o.id}>{firmLabel(o)}</option>)}
                </select>
              </Field>
              <Field label={t("sm.d_person")}>
                <select value={person} onChange={(e) => setPerson(e.target.value)} className={inputCls} disabled={!org}>
                  <option value="">{org ? t("sm.d_pick_person") : t("sm.d_keep")}</option>
                  {people.map((u) => <option key={u.id} value={u.id}>{u.full_name}{u.title ? ` · ${u.title}` : ""}</option>)}
                </select>
              </Field>
            </>
          )}
          {show("due") && (
            <Field label={t("sm.d_due")}>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
            </Field>
          )}
          {show("step") && (
            <Field label={t("sm.d_step")}>
              <select value={step} onChange={(e) => setStep(e.target.value)} className={inputCls}>
                {step === "" && <option value="">{t("sm.d_keep")}</option>}
                {STEPS.map((s) => <option key={s} value={s}>{t(`steps.${s}`)}</option>)}
              </select>
            </Field>
          )}
          <p className="text-xs text-muted-foreground">{t("sm.d_logged")}</p>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("taskDetail.d_cancel")}</SecondaryButton>
          <PrimaryButton disabled={!changes || update.isPending} onClick={save}>{t("sm.d_save")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** SM: cancel one or many tasks with a required reason. They stay as Cancelada. */
export function CancelTasksDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; tasks: TaskWithComputed[]; onDone?: () => void }) {
  const { t } = useTranslation();
  const cancel = useCancelTasks();
  const [reason, setReason] = useState("");
  const tasks = props.tasks;
  const submit = () =>
    cancel.mutate(
      { ids: tasks.map((x) => x.id), reason: reason.trim() },
      {
        onSuccess: () => {
          props.onOpenChange(false);
          setReason("");
          props.onDone?.();
          toast.success(tasks.length === 1 ? t("sm.t_cancelled_one", { code: tasks[0]!.code }) : t("sm.t_cancelled_many", { count: tasks.length }));
        },
        onError: () => toast.error(t("taskDetail.t_error")),
      },
    );
  return (
    <Dialog open={props.open} onOpenChange={(o) => { props.onOpenChange(o); if (!o) setReason(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tasks.length === 1 ? t("sm.d_cancel_title_one", { code: tasks[0]?.code ?? "" }) : t("sm.d_cancel_title_many", { count: tasks.length })}</DialogTitle>
          <DialogDescription>{t("sm.d_cancel_body")}</DialogDescription>
        </DialogHeader>
        <Field label={t("sm.d_cancel_reason")}>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("sm.d_cancel_placeholder")} className={textareaCls} />
        </Field>
        {!reason.trim() && <p className="text-xs text-muted-foreground">{t("sm.d_cancel_required")}</p>}
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("sm.d_keep_task")}</SecondaryButton>
          <PrimaryButton disabled={!reason.trim() || cancel.isPending} onClick={submit}>{t("sm.action_cancel_task")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
