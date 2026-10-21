import { BuildEstimator } from "../../src/site/build-estimator/build-estimator";

export const metadata = {
  title: "OpenFinacle — Build estimator preview",
  robots: { index: false, follow: false },
};

export default function EstimatorPreviewPage() {
  return <BuildEstimator />;
}
