"use client";

import { usePortalLocation } from "../portal-location";
import { type PlanningTab, planningSections } from "../portal-routes";
import { PlanningWorkspace } from "./planning-workspace";

export default function PlanningPage() {
  const { path, navigate } = usePortalLocation();
  const tab = Object.entries(planningSections).find(
    ([, slug]) => path === `/planning/${slug}`,
  )?.[0] as PlanningTab | undefined;
  return (
    <PlanningWorkspace
      routeTab={tab ?? "Overview"}
      navigate={(next) =>
        navigate(next.replace("/wealth-planning", "/planning"))
      }
      standalone
    />
  );
}
