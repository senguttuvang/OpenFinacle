"use client";
import { CustomerOnboarding } from "../customer-onboarding";
import { ReadingSize } from "../reading-size";
export default function OpenAccountPage() {
  return (
    <main className="onboarding-page">
      <a href="/">OpenFinacle · Banking portal</a>
      <ReadingSize />
      <CustomerOnboarding />
    </main>
  );
}
