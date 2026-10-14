import { Fragment, useMemo, useRef, useState } from "react";
import type { User } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Renders comment text, highlighting @Full Name mentions of known people. */
export function MentionText({ body, people }: { body: string; people: User[] }) {
  const parts = useMemo(() => {
    if (!people.length) return [body];
    const re = new RegExp(`(@(?:${people.map((p) => escape(p.full_name)).join("|")}))`, "g");
    return body.split(re);
  }, [body, people]);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("@") && people.some((u) => `@${u.full_name}` === p) ? (
          <span key={i} className="rounded-[3px] bg-accent px-0.5 font-medium text-accent-foreground">{p}</span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Textarea with an @ suggestion list. */
export function MentionInput(props: {
  value: string;
  onChange: (v: string) => void;
  people: User[];
  placeholder: string;
  label: string;
  mentionLabel: string;
  rows?: number;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const match = /@([\p{L}]*)$/u.exec(props.value);
  const query = match?.[1]?.toLowerCase() ?? null;
  const suggestions =
    query === null ? [] : props.people.filter((p) => p.full_name.toLowerCase().startsWith(query)).slice(0, 5);

  const pick = (u: User) => {
    props.onChange(props.value.replace(/@([\p{L}]*)$/u, `@${u.full_name} `));
    ref.current?.focus();
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        aria-label={props.label}
        rows={props.rows ?? 2}
        value={props.value}
        placeholder={props.placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) props.onSubmit?.();
          if (e.key === "Enter" && suggestions.length && !e.shiftKey) {
            e.preventDefault();
            pick(suggestions[0]!);
          }
        }}
        className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      {focused && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-md border border-border bg-popover p-1 text-sm shadow-sm">
          <p className="px-2 py-1 text-xs text-muted-foreground">{props.mentionLabel}</p>
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(u)}
              className={cn("flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left hover:bg-muted", i === 0 && "bg-muted")}
            >
              <span>{u.full_name}</span>
              {u.title && <span className="text-xs text-muted-foreground">{u.title}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
