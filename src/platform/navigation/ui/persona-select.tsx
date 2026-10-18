import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Users } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Role } from "../../banking-workspace/domain/banking";

interface Props {
  value: Role;
  disabled: boolean;
  options: Record<Role, { name: string }>;
  onChange: (role: Role) => void;
}

export function PersonaSelect({ value, disabled, options, onChange }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!disabled && restoreFocus.current) {
      restoreFocus.current = false;
      if (document.activeElement === document.body) trigger.current?.focus();
    }
  }, [disabled]);
  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={(role) => {
        if (role === "customer" || role === "officer" || role === "approver") {
          restoreFocus.current = true;
          onChange(role);
        }
      }}
    >
      <Select.Trigger
        ref={trigger}
        className="role-select persona-trigger"
        aria-label="Demo persona"
      >
        <Users size={20} aria-hidden="true" />
        <Select.Value />
        <Select.Icon asChild>
          <ChevronDown size={18} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="persona-options"
          position="popper"
          sideOffset={8}
          collisionPadding={12}
        >
          <Select.Viewport>
            {Object.entries(options).map(([role, option]) => (
              <Select.Item key={role} value={role} className="persona-option">
                <Select.ItemText>{option.name}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={20} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
