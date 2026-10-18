"use client";
import { CustomerOnboarding } from "../../src/platform/account-opening/ui/customer-onboarding";
export default function OpenAccountPage() {
  return (
    <main className="onboarding-page">
      <a href="/">OpenFinacle · Banking portal</a>
      <CustomerOnboarding />
    </main>
  );
}
