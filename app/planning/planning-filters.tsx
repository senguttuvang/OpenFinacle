import { SlidersHorizontal } from "lucide-react";
import {
  type PlanningFilter,
  type PlanningHousehold,
  planningAnchor,
  planningRange,
} from "../../src/domain/planning";

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
          <select
            aria-label="Date range"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              if (e.target.value !== "custom")
                setFilter({
                  ...filter,
                  ...planningRange(e.target.value),
                });
            }}
          >
            {[
              ["30", "Last 30 days"],
              ["90", "Last 90 days"],
              ["month", "This month"],
              ["quarter", "This quarter"],
              ["fy", "FY to date · Apr–Mar"],
              ["prior-fy", "Prior financial year"],
              ["all", "All recorded history"],
              ["custom", "Custom dates"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
          <select
            aria-label="Account"
            value={filter.account}
            onChange={(e) => setFilter({ ...filter, account: e.target.value })}
          >
            <option value="">All accounts</option>
            {household.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Member
          <select
            aria-label="Member"
            value={filter.member}
            onChange={(e) => setFilter({ ...filter, member: e.target.value })}
          >
            <option value="">All members</option>
            {household.members.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            aria-label="Category"
            value={filter.category}
            onChange={(e) => setFilter({ ...filter, category: e.target.value })}
          >
            <option value="">All categories</option>
            {[...new Set(household.postings.map((p) => p.category))]
              .sort()
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
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
