import { ProductStory } from "../product-story";

export const metadata = {
  title: "OpenFinacle — Banking capability assessment",
  description:
    "Evidence, scoped capability comparison, production acceptance gates and AI-assisted development assessment for bank decision-makers.",
};

export default function AssessmentPage() {
  return (
    <main className="assessment-page">
      <ProductStory />
    </main>
  );
}
