"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Home, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { followPortalLink } from "../../navigation/ui/portal-location";
import "./profile-menu.css";

export function ProfileMenu({
  name,
  initials,
  persona,
  profileLabel,
  disabled,
  onProfile,
  onExit,
}: {
  name: string;
  initials: string;
  persona: string;
  profileLabel: string;
  disabled: boolean;
  onProfile: () => void;
  onExit: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="person profile-trigger"
          disabled={disabled}
          aria-label={`Profile menu for ${name}`}
        >
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div>
            <strong>{name}</strong>
            <small>{persona}</small>
          </div>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="profile-menu"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Profile actions"
        >
          <DropdownMenu.Label className="profile-menu-identity">
            <strong>{name}</strong>
            <span>{persona} · Demo session</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="profile-menu-rule" />
          <DropdownMenu.Item asChild disabled={disabled}>
            <a
              href="/profile"
              className="profile-menu-item"
              onClick={(event) =>
                followPortalLink(event, () => {
                  setOpen(false);
                  onProfile();
                })
              }
            >
              <UserRound size={19} aria-hidden="true" /> {profileLabel}
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild disabled={disabled}>
            <a href="/" className="profile-menu-item">
              <Home size={19} aria-hidden="true" /> Back to website
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="profile-menu-rule" />
          <DropdownMenu.Item
            className="profile-menu-item"
            disabled={disabled}
            onSelect={onExit}
          >
            <LogOut size={19} aria-hidden="true" /> Exit demo (log out)
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
