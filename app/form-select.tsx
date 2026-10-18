"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { type AriaAttributes, useEffect, useId, useRef, useState } from "react";
import "./form-select.css";

type Option = { value: string; label: string; disabled?: boolean };
type Props = Pick<
  AriaAttributes,
  "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid"
> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly Option[];
  placeholder?: string;
  id?: string;
  name?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The portal and rows follow Demo persona; Radix retains the native form value. */
export function FormSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  name,
  form,
  required,
  disabled = false,
  className,
  ...aria
}: Props) {
  const uniqueId = useId();
  const emptyValue = `${uniqueId}-empty`;
  const trigger = useRef<HTMLButtonElement>(null);
  const [fieldsetDisabled, setFieldsetDisabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const blocked = disabled || fieldsetDisabled;
  const validationId = `${uniqueId}-validation`;

  useEffect(() => {
    const button = trigger.current;
    if (!button) return;
    const fieldsets: HTMLFieldSetElement[] = [];
    for (
      let parent = button.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (parent instanceof HTMLFieldSetElement) fieldsets.push(parent);
    }
    // Native fieldsets disable descendants except the first legend. A portalled
    // list must also close and disable its choices when that state changes.
    const sync = () => {
      const inherited = fieldsets.some((fieldset) => {
        const legend = Array.from(fieldset.children).find(
          (child) => child.tagName === "LEGEND",
        );
        return fieldset.disabled && !legend?.contains(button);
      });
      setFieldsetDisabled(inherited);
      if (inherited) setOpen(false);
    };
    sync();
    const observer = new MutationObserver(sync);
    for (const fieldset of fieldsets)
      observer.observe(fieldset, {
        attributes: true,
        attributeFilter: ["disabled"],
      });
    return () => observer.disconnect();
  }, []);

  return (
    <span
      className="form-select"
      onInvalidCapture={(event) => {
        event.preventDefault();
        setMissing(true);
        trigger.current?.focus();
      }}
    >
      <Select.Root
        value={value}
        name={name}
        form={form}
        required={required}
        disabled={blocked}
        open={open && !blocked}
        onOpenChange={setOpen}
        onValueChange={(next) => {
          if (trigger.current?.matches(":disabled")) return;
          const selected = next === emptyValue ? "" : next;
          setMissing(Boolean(required && !selected));
          onValueChange(selected);
        }}
      >
        <Select.Trigger
          {...aria}
          id={id}
          ref={trigger}
          className={`form-select-trigger ${className ?? ""}`}
          aria-invalid={
            aria["aria-invalid"] || (missing && !value) || undefined
          }
          aria-describedby={
            [aria["aria-describedby"], missing && !value ? validationId : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          <Select.Value
            placeholder={
              placeholder ??
              options.find((o) => !o.value)?.label ??
              "Choose an option"
            }
          />
          <Select.Icon asChild>
            <ChevronDown size={18} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="form-select-options"
            position="popper"
            sideOffset={8}
            collisionPadding={12}
          >
            <Select.ScrollUpButton className="form-select-scroll">
              <ChevronUp size={18} aria-hidden="true" />
            </Select.ScrollUpButton>
            <Select.Viewport>
              {options.map((option) => (
                <Select.Item
                  className="form-select-option"
                  key={option.value}
                  value={option.value || emptyValue}
                  disabled={option.disabled}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={20} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="form-select-scroll">
              <ChevronDown size={18} aria-hidden="true" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {missing && !value && (
        <span id={validationId} className="form-select-error" role="alert">
          Choose an option.
        </span>
      )}
    </span>
  );
}
