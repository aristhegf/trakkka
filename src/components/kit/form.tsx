"use client";

import { useId, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { RadioGroup, RadioGroupItem } from "@/components/motion/radio";
import { cn } from "@/lib/utils";

/**
 * Thin form adapters around beui controls. beui Select / Switch / Radio are state-only, so these add the hidden
 * <input name> that server-action forms read.
 */

export function FieldLabel({ children, htmlFor, hint }: { children: React.ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <div className="px-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {children}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function FormSelect({ name, label, options, defaultValue = "", placeholder = "Choose", hint, onValueChange, className }: { name: string; label?: string; options: Option[]; defaultValue?: string; placeholder?: string; hint?: string; onValueChange?: (v: string) => void; className?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? <FieldLabel hint={hint}>{label}</FieldLabel> : null}
      <Select
        value={value}
        onValueChange={(v) => {
          setValue(v);
          onValueChange?.(v);
        }}
      >
        <SelectTrigger className="h-11 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function FormSwitch({ name, label, description, defaultChecked = false, onCheckedChange }: { name: string; label: string; description?: string; defaultChecked?: boolean; onCheckedChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch
        checked={checked}
        ariaLabel={label}
        onCheckedChange={(v) => {
          setChecked(v);
          onCheckedChange?.(v);
        }}
      />
      {checked ? <input type="hidden" name={name} value="on" /> : null}
    </div>
  );
}

export function Textarea({ label, hint, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <FieldLabel htmlFor={id} hint={hint}>
          {label}
        </FieldLabel>
      ) : null}
      <textarea
        id={id}
        className={cn(
          "min-h-24 w-full rounded-2xl border border-border bg-transparent px-3.5 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:ring-2 focus:ring-ring/40",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

/**
 * Radio cards: each choice shows a description, so users understand options (e.g. tracking methods) instead of
 * picking from bare names. beui RadioGroup supplies selection state, keyboard support and the gliding dot.
 */
export function ChoiceCards({ name, options, value, onValueChange }: { name: string; options: ChoiceOption[]; value: string; onValueChange: (v: string) => void }) {
  return (
    <>
      <RadioGroup value={value} onValueChange={onValueChange} className="grid gap-2">
        {options.map((o) => (
          <div
            key={o.value}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "cursor-pointer rounded-2xl border bg-card px-4 py-3 transition-colors",
              value === o.value ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-foreground/20",
            )}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value={o.value} label={o.label} />
              {o.badge ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{o.badge}</span> : null}
            </div>
            {o.description ? <p className="mt-1 pl-7 text-xs leading-relaxed text-muted-foreground">{o.description}</p> : null}
          </div>
        ))}
      </RadioGroup>
      <input type="hidden" name={name} value={value} />
    </>
  );
}
