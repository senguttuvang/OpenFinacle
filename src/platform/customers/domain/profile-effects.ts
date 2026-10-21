const maintenanceFields: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  address_change: { address: "address", city: "city", pincode: "pincode" },
  email_change: { email: "email" },
  branch_transfer: { home_branch: "branch" },
  employer_change: { employer: "employer" },
};

export const isProfileMaintenance = (code: string) =>
  Object.hasOwn(maintenanceFields, code);

// Field selection is shared by application effects and customer-facing explanations.
export const approvedProfilePatch = (
  code: string,
  fields: Readonly<Record<string, string>>,
) => {
  const selected = isProfileMaintenance(code)
    ? maintenanceFields[code]
    : undefined;
  return selected
    ? Object.fromEntries(
        Object.entries(selected).map(([field, source]) => [
          field,
          fields[source],
        ]),
      )
    : null;
};
