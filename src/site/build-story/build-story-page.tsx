import { ProductArticle } from "../product/product-article";
import { ProductTable } from "../product/product-table";
import {
  defaultHistory,
  historicalSources,
  recipeModels,
  recipeModules,
  salaryInr,
  scopeOptions,
} from "./build-recipe-model";
export const metadata = {
  title: "OpenFinacle — Finacle history & team comparison assumptions",
};
export default function BuildPage() {
  return (
    <ProductArticle
      title="Decades of investment. Two teams starting today."
      intro="Compare a mature product’s history with new human-led and AI-first teams. Published milestones and editable scenarios have different evidence behind them."
    >
      <section id="history">
        <h2>What the historical record establishes.</h2>
        <p>
          <a href={historicalSources.launch}>
            Infosys announced Finacle on 5 July 2000
          </a>
          , 26 years before this October 2026 scenario. The{" "}
          <a href={historicalSources.case}>
            Dartmouth / Tuck case study, Infosys in a Distinct Business: Finacle
          </a>
          , traces its predecessor to a 1993 client project. It records 180
          people in the banking business unit in January 1999 and a Finacle unit
          approaching 2,500 people around 2006. Those are dated business-unit
          figures spanning development, delivery and commercial activity, not
          measurements of current engineering headcount.
        </p>
        <p>
          The{" "}
          <a href={historicalSources.version10}>
            20 February 2008 Finacle 10 announcement
          </a>{" "}
          reports more than 240,000 person-days for that version and more than
          US$60 million invested over the preceding three years. The reported
          investment is a three-year snapshot. It is not Finacle’s lifetime
          cost, an annual budget, or an engineering salary breakdown.
        </p>
        <p>
          At an assumed 220 working days per year, 240,000 person-days over
          three years corresponds to roughly 364 full-time equivalents. This
          arithmetic is context only: it does not disclose the actual team
          structure, prove that every day was engineering work, or establish a
          constant staffing level across decades.
        </p>
        <h3>A lifetime scenario you can inspect.</h3>
        <p>
          The reviewed sources do not establish cumulative Finacle salaries,
          overhead or lifetime R&amp;D investment. The estimator therefore
          exposes assumed product years, average engineering headcount, average
          historical monthly pay and overhead. Its defaults are{" "}
          {defaultHistory.years} years, {defaultHistory.engineers} average
          engineers, ₹{defaultHistory.monthlyPay.toLocaleString("en-IN")}{" "}
          average historical monthly pay and {defaultHistory.overhead * 100}%
          overhead. Headcount, pay and overhead are illustrative starting
          inputs, not Infosys disclosures.
        </p>
        <p>
          Modelled salary = years × 12 × average engineers × average historical
          monthly pay. Overhead = salary × entered overhead rate. Engineering
          person-days = years × average engineers × 220 working days/year. A
          chosen ± sensitivity is applied to total modelled cost; it is a
          scenario envelope, not statistical confidence. Historical pay is an
          assumed nominal average, not today’s salary multiplied backward or an
          inflation-adjusted valuation.
        </p>
        <p>
          The default window starts with the Finacle brand in 2000; the
          predecessor would span 33 years from 1993 to 2026. Customer
          implementation programmes, acquisitions, financing and expenses not
          captured by the entered overhead are excluded. The chart shows
          different time horizons and scopes; no cost or speed ratio establishes
          equal product capability.
        </p>
      </section>
      <section>
        <h2>A prototype with foundations already in place.</h2>
        <p>
          The founder reports roughly one week and 500 million AI tokens to
          reach this prototype. Human attention, rework and billing were not
          independently measured. Apache Fineract supplies the banking core.
          PhotoCraft’s independent Photoshop reimplementation inspired the
          approach of familiar behaviour with explicit boundaries; banking also
          requires financial integrity, security, operational resilience and
          institutional acceptance.
        </p>
        <p>
          That anecdote does not calibrate the new teams’ productivity or
          establish a new banking core written in a week. The comparison is a
          tool for exploring assumptions and planning discovery.
        </p>
      </section>
      <section id="assumptions">
        <h2>How the two-team scenario works.</h2>
        <h3>The same brief, independent teams</h3>
        <p>
          Team A starts with human-led implementation, autocomplete and light AI
          assistance. Team B starts with AI-first drafting and human
          direction/review. Each has mostly-intern, mixed and experienced/expert
          presets, adjustable headcount and individual counts. Neither is
          designated the preferred team. All six combinations use the same
          capability brief and selected window; their AI, review, coordination
          and overhead assumptions remain visible and independent.
        </p>
        <p>
          Tiny crews use discrete rounding: one person is an intern, experienced
          developer or expert according to the selected composition. Small
          mostly-intern crews can have no expert; control-bearing scopes then
          remain blocked. Custom counts are visible and do not silently add
          expertise.
        </p>
        <h3>Pay and human capacity</h3>
        <p>
          Founder-supplied monthly pay begins at intern ₹
          {salaryInr.intern.toLocaleString("en-IN")}, experienced developer ₹
          {salaryInr.developer.toLocaleString("en-IN")} and expert ₹
          {salaryInr.expert.toLocaleString("en-IN")}. You may change these
          shared rates. Salary months = weeks × 12 ÷ 52. Payroll = monthly
          salaries × salary months; entered overhead is added separately.
          Working days = weeks × chosen days/week; changing working days does
          not silently change the monthly pay scale.
        </p>
        <p>
          Unweighted human effort is people × working days. Scenario capacity is
          (interns × 0.35 + experienced developers × 1 + experts × 1.3) ×
          working days × (1 − learning/coordination allowance). Talent weights
          are uncalibrated reference developer-day conventions, not measured
          performance or judgments about individuals. Experience, bank-domain
          knowledge and actual team data can change the outcome substantially.
        </p>
        <h3>Scope, work and elapsed time</h3>
        <p>
          Each selected capability starts with the following uncalibrated
          reference developer-day range:
        </p>
        <dl>
          {recipeModules.map((m) => (
            <div key={m.id}>
              <dt>{m.name}</dt>
              <dd>
                {m.low}–{m.high} baseline reference developer-days
              </dd>
            </div>
          ))}
        </dl>
        <ul>
          {scopeOptions.map((s) => (
            <li key={s.id}>
              {s.name}: {s.factor}× module effort; {s.controls[0]}–
              {s.controls[1]} additional expert control-days.
            </li>
          ))}
        </ul>
        <p>
          Existing-core scopes reuse a mature engine such as Apache Fineract. An
          independent core starter includes more original engineering and human
          control work. Neither scope is a claim to rebuild the full current
          Finacle suite. Unknown integration access, product rules, external
          rails, migration, independent assurance and bank acceptance can extend
          the calendar; commercial/legal/IP and bank-specific decisions are
          outside this calculator.
        </p>
        <p>
          Module effort is multiplied by 1 − (AI-assisted drafting share ×
          assumed drafting saving) + (AI-assisted drafting share × added human
          review). Defaults use 15% AI drafting share for A and 75% for B, with
          35% assumed drafting saving and 15% added review on that share. These
          are adjustable hypotheses. With no savings, more AI assistance can add
          work. Model price, token volume and reasoning level never multiply
          delivery output.
        </p>
        <p>
          Expert control-days are added afterward and never reduced by AI
          savings. Each control-day occupies an expert’s full slot, so it counts
          as 1.3 reference developer-days in total capacity; expert-day
          availability is also checked separately. Expert capacity = experts ×
          working days × (1 − coordination allowance). Elapsed low/high weeks =
          selected weeks × the greater of (total low/high effort ÷ total
          scenario capacity) and (control low/high effort ÷ expert capacity). No
          experts means a control-bearing scope has no delivery range. No people
          or selected capabilities also means no delivery range.
        </p>
        <p>
          The capability sequence reserves controls first, then accumulates
          module work in the displayed order. “Within both bounds” means both
          the total-capacity and expert-capacity constraints fit; “Optimistic
          bound only” fits only the lower assumptions. This is a hypothetical
          sequence, not an optimised schedule, completed functionality,
          production acceptance or a feature-parity percentage.
        </p>
        <p>
          The chosen-window budget covers the selected weeks only.
          Delivery-range budgets multiply each team’s weekly people and AI
          spending by its low/high elapsed weeks. This assumes the same crew and
          AI spending rate throughout, including in USD-budget mode; it may
          exceed the original window allowance. It is not an automatically
          approved budget. The token slider uses a logarithmic control for small
          autocomplete volumes through large agent allowances; its displayed
          token count drives the same linear cost arithmetic.
        </p>
        <h3>API costs in USD</h3>
        <p>
          Rates retrieved 18 October 2026. Standard short-context API tier, USD
          per million tokens. Claude cache writes use the five-minute tier.
          These are API usage estimates; subscription allowances are separate.
        </p>
        <ProductTable label="Scrollable API pricing assumptions">
          <table>
            <caption>Standard API snapshot · USD / million tokens</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Fresh input</th>
                <th scope="col">Cache hit</th>
                <th scope="col">Cache write</th>
                <th scope="col">Generated output</th>
              </tr>
            </thead>
            <tbody>
              {recipeModels.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.name}</th>
                  <td>${m.input.toFixed(2)}</td>
                  <td>${m.cached.toFixed(2)}</td>
                  <td>${m.write.toFixed(2)}</td>
                  <td>${m.output.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ProductTable>
        <p>
          <a href={recipeModels[0].source}>OpenAI API pricing</a> ·{" "}
          <a href={recipeModels[1].source}>Anthropic API pricing</a>.
          Long-context premiums, tools, hosting, subscriptions, taxes, regional
          uplifts and special service tiers are excluded. This comparison
          performs no purchases or model calls.
        </p>
        <p>
          Low/medium reasoning presets assume 10%/20% generated output,
          including reasoning, with the remainder input. That token mix is not
          observed model behaviour and can be adjusted. Reasoning labels do not
          change unit prices. Fresh, cached and cache-write fractions partition
          the input; changing hits caps writes so their sum cannot exceed 100%.
          Cache hits and writes default to zero.
        </p>
        <p>
          Blended USD/M = output share × output rate + input share × (fresh
          fraction × fresh rate + cache-hit fraction × cached rate + cache-write
          fraction × write rate). In token mode, total million tokens = daily
          million tokens/person × people × working days. In budget mode, total
          million tokens = entered whole-window USD budget ÷ blended rate. A
          zero-person crew has no modelled usage.
        </p>
        <p>
          A positive AI drafting share with zero token usage or zero API budget
          is an incomplete scenario: no delivery range, completion budget or ROI
          is produced. Add usage or explicitly set AI drafting assistance to
          zero. A cost allowance does not automatically establish a productivity
          gain.
        </p>
        <h3>Impact and ROI are optional hypotheses.</h3>
        <p>
          No benefit, exchange rate or realised saving is assumed. INR payroll
          and USD API cost stay separate until the visitor enters an explicit
          INR-per-USD rate. That rate is supplied by the visitor, not a live
          exchange quote. Planned-window upfront cost = selected-window payroll
          and overhead + API allowance converted once.
        </p>
        <p>
          For a hypothetical year after launch, ROI = ((monthly benefit −
          monthly additional running cost) × 12 − upfront cost) ÷ upfront cost.
          Payback = upfront cost ÷ positive monthly net benefit; otherwise there
          is no positive payback. No people, no selected scope, missing
          conversion/benefit or an expert-blocked scope produces no ROI. If
          delivery takes longer than the selected window, extend the window
          before interpreting its budget. Benefit ramp-up, financing, time value
          of money and unentered costs are excluded.
        </p>
      </section>
    </ProductArticle>
  );
}
