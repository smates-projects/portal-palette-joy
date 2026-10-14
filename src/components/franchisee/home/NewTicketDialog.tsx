import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useCreateTicket } from "@/lib/api/hooks";
import { primaryButton, secondaryButton } from "@/components/bishop/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_SUBJECT = 120;
const MAX_BODY = 2000;

/** Form to ask the franchisor for help ("Nuevo pedido de ayuda"). Both fields are required; the server checks them too. */
export function NewTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const create = useCreateTicket();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const subjectMissing = subject.trim() === "";
  const bodyMissing = body.trim() === "";

  const close = (next: boolean) => {
    if (!next) {
      setSubject("");
      setBody("");
      setSubmitted(false);
    }
    onOpenChange(next);
  };

  const submit = () => {
    setSubmitted(true);
    if (subjectMissing || bodyMissing) return;
    create.mutate(
      { subject: subject.trim(), body: body.trim() },
      {
        onSuccess: (ticket) => {
          toast.success(t("franchisee.home.t_ticket_sent", { code: ticket.code }));
          close(false);
        },
        onError: () => toast.error(t("franchisee.error_action")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("franchisee.home.ticket_title")}</DialogTitle>
          <DialogDescription>{t("franchisee.home.ticket_help")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">{t("franchisee.home.ticket_subject")}</Label>
            <Input
              id="ticket-subject"
              value={subject}
              maxLength={MAX_SUBJECT}
              aria-invalid={submitted && subjectMissing}
              aria-describedby={submitted && subjectMissing ? "ticket-subject-error" : undefined}
              onChange={(e) => setSubject(e.target.value)}
            />
            {submitted && subjectMissing && <p id="ticket-subject-error" className="text-xs text-status-danger-fg">{t("franchisee.home.ticket_subject_required")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-body">{t("franchisee.home.ticket_body")}</Label>
            <Textarea
              id="ticket-body"
              rows={5}
              value={body}
              maxLength={MAX_BODY}
              aria-invalid={submitted && bodyMissing}
              aria-describedby={submitted && bodyMissing ? "ticket-body-error" : undefined}
              onChange={(e) => setBody(e.target.value)}
            />
            {submitted && bodyMissing && <p id="ticket-body-error" className="text-xs text-status-danger-fg">{t("franchisee.home.ticket_body_required")}</p>}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => close(false)} className={secondaryButton}>{t("franchisee.cancel")}</button>
            <button type="submit" disabled={create.isPending} className={primaryButton}>{t("franchisee.home.ticket_send")}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
