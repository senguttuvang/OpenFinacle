import { SlidersHorizontal } from "lucide-react";
import {
  type PlanningFilter,
  type PlanningHousehold,
  planningAnchor,
  planningRange,
} from "../../src/domain/planning";
import { FormSelect } from "../form-select";

type Props = {
  household: PlanningHousehold;
  filter: PlanningFilter;
  preset: string;
  previous: PlanningFilter;
  setPreset: (preset: string) => void;
  setFilter: (filter: PlanningFilter) => void;
  clearFilters: () => void;
};
export function PlanningFilters({
  household,
  filter,
  preset,
  previous,
  setPreset,
  setFilter,
  clearFilters,
}: Props) {
  return (
    <section className="wp-filters" aria-label="Recorded transaction filters">
      <div className="wp-filter-heading">
        <SlidersHorizontal size={19} />
        <strong>Recorded cash flow</strong>
        <span>Wealth snapshots and projections keep their own as-of date.</span>
      </div>
      <div className="wp-filter-grid">
        <label>
          Date range
          <FormSelect
            aria-label="Date range"
            value={preset}
            onValueChange={(value) => {
              setPreset(value);
              if (value !== "custom")
                setFilter({
                  ...filter,
                  ...planningRange(value),
                });
            }}
            options={[
              ["30", "Last 30 days"],
              ["90", "Last 90 days"],
              ["month", "This month"],
              ["quarter", "This quarter"],
              ["fy", "FY to date · Apr–Mar"],
              ["prior-fy", "Prior financial year"],
              ["all", "All recorded history"],
              ["custom", "Custom dates"],
            ].map(([value, label]) => ({ value, label }))}
          />
        </label>
        <label>
          From
          <input
            type="date"
            min="2024-10-01"
            max={filter.to}
            value={filter.from}
            onChange={(e) => {
              if (e.target.value) {
                setPreset("custom");
                setFilter({ ...filter, from: e.target.value });
              }
            }}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            min={filter.from}
            max={planningAnchor}
            value={filter.to}
            onChange={(e) => {
              if (e.target.value) {
                setPreset("custom");
                setFilter({ ...filter, to: e.target.value });
              }
            }}
          />
        </label>
        <label>
          Account
          <FormSelect
            aria-label="Account"
            value={filter.account}
            onValueChange={(value) => setFilter({ ...filter, account: value })}
            options={[
              { value: "", label: "All accounts" },
              ...household.accounts.map((a) => ({
                value: a.id,
                label: a.label,
              })),
            ]}
          />
        </label>
        <label>
          Member
          <FormSelect
            aria-label="Member"
            value={filter.member}
            onValueChange={(value) => setFilter({ ...filter, member: value })}
            options={[
              { value: "", label: "All members" },
              ...household.members.map((name) => ({
                value: name,
                label: name,
              })),
            ]}
          />
        </label>
        <label>
          Category
          <FormSelect
            aria-label="Category"
            value={filter.category}
            onValueChange={(value) => setFilter({ ...filter, category: value })}
            options={[
              { value: "", label: "All categories" },
              ...[...new Set(household.postings.map((p) => p.category))]
                .sort()
                .map((c) => ({ value: c, label: c })),
            ]}
          />
        </label>
        <label>
          Merchant search
          <input
            type="search"
            placeholder="Find a source merchant"
            value={filter.merchant}
            onChange={(e) => setFilter({ ...filter, merchant: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            clearFilters();
          }}
        >
          Clear filters
        </button>
      </div>
      <small>
        {filter.from} to {filter.to} inclusive · compare {previous.from} to{" "}
        {previous.to}. Current month is partial; prior history may not cover the
        comparison. Transfers move between accounts; member filters attribute
        postings, not joint ownership.
      </small>
    </section>
  );
}
