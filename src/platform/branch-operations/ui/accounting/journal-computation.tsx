export function JournalComputation({
  computed,
}: {
  computed: boolean | null | undefined;
}) {
  return (
    <small>
      Native running-balance flag:{" "}
      {computed === false
        ? "Not computed"
        : computed === true
          ? "Computed"
          : "Not returned"}
    </small>
  );
}
export function JournalComputationNote() {
  return (
    <p>
      Native running-balance flags describe individual journal calculations.
      They do not establish a current, currency-isolated branch cash position,
      reconciliation or close. Stored running-balance amounts are withheld.
    </p>
  );
}
