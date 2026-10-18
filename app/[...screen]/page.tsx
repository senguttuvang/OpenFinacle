import type { Metadata } from "next";
import BankingPage from "../banking-page";
import PlanningPage from "../planning/page";
import {
  exportedPortalPaths,
  planningSections,
  resolvePortalRoute,
} from "../portal-routes";

export const dynamicParams = false;
export function generateStaticParams() {
  return [
    ...exportedPortalPaths,
    ...Object.values(planningSections).map((slug) => `/planning/${slug}`),
  ].map((path) => ({ screen: path.slice(1).split("/") }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ screen: string[] }>;
}): Promise<Metadata> {
  const { screen } = await params;
  return {
    title: `${resolvePortalRoute(`/${screen.join("/")}`)?.title ?? "Banking"} — OpenFinacle`,
  };
}
export default async function PortalScreen({
  params,
}: {
  params: Promise<{ screen: string[] }>;
}) {
  const { screen } = await params;
  return screen[0] === "planning" ? <PlanningPage /> : <BankingPage />;
}
