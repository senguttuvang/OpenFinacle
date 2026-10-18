import { ProductStory } from "../product/product-story";
export const metadata = {
  title: "OpenFinacle — Banking, seen from both sides",
  description:
    "Explore connected banking journeys, household planning and the next chapter of a banking prototype.",
};
export default function DiscoverPage() {
  return (
    <main className="product-landing">
      <ProductStory />
    </main>
  );
}
