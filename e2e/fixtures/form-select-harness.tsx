import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../app/globals.css";
import "../../app/banking-design.css";
import { FormSelect } from "../../app/form-select";

function Harness() {
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submission, setSubmission] = useState("");
  const [additional, setAdditional] = useState(false);
  const [backup, setBackup] = useState("");
  const [recipient, setRecipient] = useState("payee-0");
  return (
    <main className="app-shell" style={{ display: "block", padding: 24 }}>
      <h1>FormSelect contract fixture</h1>
      <button type="button" onClick={() => setAdditional(true)}>
        Require backup choice
      </button>
      <button type="button" onClick={() => setDisabled(!disabled)}>
        Toggle fieldset
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmission(
            JSON.stringify(
              Object.fromEntries(new FormData(event.currentTarget)),
            ),
          );
        }}
      >
        <fieldset disabled={disabled}>
          <legend>Delivery</legend>
          <label htmlFor="fixture-choice">Delivery preference</label>
          <p id="fixture-help">Choose a sample delivery method.</p>
          <FormSelect
            id="fixture-choice"
            name="delivery"
            required
            aria-describedby="fixture-help"
            value={value}
            disabled={busy}
            onValueChange={(next) => {
              setValue(next);
              setBusy(true);
              setTimeout(() => setBusy(false), 200);
            }}
            placeholder="Choose delivery"
            options={[
              { value: "", label: "Choose delivery" },
              { value: "branch", label: "Collect at branch" },
              {
                value: "unavailable",
                label: "Unavailable sample delivery",
                disabled: true,
              },
              {
                value: "address",
                label:
                  "Deliver to the confirmed fictional residential address in another city",
              },
            ]}
          />
        </fieldset>
        {additional && (
          <>
            <label htmlFor="fixture-backup">Backup delivery</label>
            <FormSelect
              id="fixture-backup"
              required
              name="backup"
              value={backup}
              onValueChange={setBackup}
              options={[{ value: "branch", label: "Collect at branch" }]}
            />
          </>
        )}
        <button type="submit">Submit fixture</button>
      </form>
      <label htmlFor="fixture-filter">Account filter</label>
      <FormSelect
        id="fixture-filter"
        value={filter}
        onValueChange={setFilter}
        options={[
          { value: "", label: "All accounts" },
          ...Array.from({ length: 61 }, (_, index) => ({
            value: String(index + 1),
            label: `Synthetic account ${index + 1}`,
          })),
        ]}
      />
      <output aria-label="Submitted fields">{submission}</output>
      <label htmlFor="fixture-recipient">Saved recipient</label>
      <FormSelect
        id="fixture-recipient"
        value={recipient}
        onValueChange={setRecipient}
        options={Array.from({ length: 15 }, (_, index) => ({
          value: `payee-${index}`,
          label: `Demo Lakshmi Narayanan Synthetic ${index + 1} · Savings account ending ${4000 + index}`,
        }))}
      />
    </main>
  );
}
const container = document.getElementById("fixture");
if (!container) throw new Error("FormSelect fixture container is missing");
createRoot(container).render(<Harness />);
