export {
  bootstrap,
  startBank,
  startBankWithJourney,
} from "../../../demo/workspaces/workspace-provisioning";
export {
  reviewApplication,
  submitApplication,
} from "./account-applications";
export { addBeneficiary, confirmBeneficiary } from "./beneficiaries";
export { dashboard } from "./dashboard";
export {
  createCommand,
  executeCommand,
  rejectCommand,
} from "./instructions";
export { requiredBank } from "./workspace-context";
