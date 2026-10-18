import { recipeModels, recipeModules, salaryInr } from "../build-recipe-model";
import { ProductArticle } from "../product-article";
import { ProductTable } from "../product-table";
export const metadata = {
  title: "OpenFinacle — The build story & recipe assumptions",
};
export default function BuildPage() {
  return (
    <ProductArticle
      title="What does it take to rebuild a banking experience?"
      intro="People, a bounded scope, reusable foundations and the right AI assistance. The recipe is an explicit scenario model, not a benchmark or a delivery commitment."
    >
      <section>
        <h2>A fast first chapter, with foundations already in place.</h2>
        <p>
          The founder reports roughly 500 million tokens and one week to reach
          the prototype. Human attention, rework and billing were not
          independently measured. Apache Fineract supplies the core; the result
          is not a new banking core written in one week.
        </p>
        <p>
          PhotoCraft’s independent Photoshop reimplementation inspired the
          approach of familiar behaviour with explicit boundaries. Banking adds
          financial correctness, security, operational resilience and
          institutional acceptance.
        </p>
        <p>
          AI can help draft code, interfaces, research and tests. People remain
          responsible for product intent, architecture, financial decisions and
          final acceptance.
        </p>
      </section>
      <section id="assumptions">
        <h2>Open the recipe.</h2>
        <p>
          All scope ranges and talent factors below are uncalibrated planning
          assumptions. They are not measured productivity or vendor-rebuild
          estimates. Change the inputs to explore a hypothesis, then replace
          these assumptions with discovery and actual team data.
        </p>
        <h3>People and pay</h3>
        <ul>
          <li>
            Monthly INR pay supplied by the founder: intern ₹
            {salaryInr.intern.toLocaleString("en-IN")}; experienced developer ₹
            {salaryInr.developer.toLocaleString("en-IN")}; expert ₹
            {salaryInr.expert.toLocaleString("en-IN")}.
          </li>
          <li>
            One model month has 20 working days. Payroll is headcount × monthly
            pay × selected months, plus the chosen overhead. Benefits,
            recruitment, specialist partners and unentered costs are excluded.
          </li>
          <li>
            Reference capacity per working day is assumed at 0.35 for an intern,
            1 for an experienced developer and 1.3 for an expert, then reduced
            by the chosen learning/coordination allowance. These are
            editable-scenario conventions, not judgments about individuals or
            observed team performance.
          </li>
        </ul>
        <h3>Selected capability effort</h3>
        <p>
          Each module has a baseline range in reference developer-days. Extend
          the existing app uses 0.6×; independently rebuild comparable journeys
          on an existing core uses 2×; production foundations use 3× plus
          200–500 reference days for controls and operations. These are starting
          assumptions, not a statement of all the work a bank needs.
        </p>
        <dl>
          {recipeModules.map((item) => (
            <div key={item.id}>
              <dt>{item.name}</dt>
              <dd>
                {item.low}–{item.high} baseline reference developer-days
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Effort is adjusted by 1 − (AI-assisted task share × assumed drafting
          saving) + (AI-assisted task share × 10% review allowance). With zero
          assumed saving, AI assistance can add review work. Neither token
          quantity, API price nor reasoning level multiplies team output. This
          adjustment applies only to module work; the separate 200–500-day
          production-control allowance is added afterward and is never reduced
          by the AI saving assumption.
        </p>
        <p>
          Illustrative months = adjusted effort ÷ monthly reference capacity,
          rounded up to whole months in the displayed range. The selected team
          budget is for the chosen months, not an automatic budget for the full
          delivery range. External integration access, specialist review and
          bank approvals can extend elapsed time. A broad banking-core
          replacement is deliberately not estimated.
        </p>
        <h3>AI-assisted versus AI-first</h3>
        <p>
          AI-assisted starts with 40% of drafting tasks assigned AI help.
          AI-first starts with 75%, organised around agent drafts and human
          supervision. Both shares can be changed. The 20% drafting-saving
          default is a user-adjustable hypothesis, offset by review work; it is
          not a causal result from this prototype.
        </p>
        <h3>API usage, in USD</h3>
        <p>
          Rates retrieved 18 October 2026: standard short-context API tier, per
          million tokens. These are API usage scenarios, not Claude or Codex
          subscription prices. Check provider pricing before purchasing.
        </p>
        <ProductTable label="Scrollable API price assumptions">
          <table>
            <caption>Dated API price snapshots · USD / million tokens</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Uncached input</th>
                <th scope="col">Cached input</th>
                <th scope="col">Generated output</th>
              </tr>
            </thead>
            <tbody>
              {recipeModels.map((model) => (
                <tr key={model.id}>
                  <th scope="row">{model.name}</th>
                  <td>${model.input.toFixed(2)}</td>
                  <td>${model.cached.toFixed(2)}</td>
                  <td>${model.output.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ProductTable>
        <p>
          <a href={recipeModels[0].source}>OpenAI API pricing</a> ·{" "}
          <a href={recipeModels[1].source}>Anthropic API pricing</a>
        </p>
        <p>
          For modelling only, low reasoning reserves 10% and medium reserves 20%
          of total tokens for generated output, including reasoning; the
          remainder is input. These shares are not measured model behaviour.
          Cached input defaults to 50% of input and is adjustable. The unit
          price does not change with the reasoning label.
        </p>
        <p>
          Blended rate = input share × ((uncached input share × input rate) +
          (cached input share × cached rate)) + output share × output rate. API
          cost = total million tokens × blended rate; in budget mode, tokens =
          budget ÷ blended rate.
        </p>
        <p>
          Cache creation/writes, long-context premiums, tool calls, hosting,
          taxes, subscriptions and specialised service tiers are excluded.
          Reasoning preference is a scenario label, not an API call; supported
          settings vary by provider.{" "}
          <a href="https://developers.openai.com/api/docs/guides/reasoning">
            OpenAI reasoning documentation
          </a>
          .
        </p>
        <h3>Impact, payback and ROI</h3>
        <p>
          No benefit is assumed by default. You enter monthly benefit and
          additional running cost. INR payroll and USD API allowance stay
          separate until you explicitly enter your INR-per-USD rate. The
          calculator uses your rate, not a live exchange quote.
        </p>
        <p>
          At that rate, planned upfront cost = selected-month payroll with
          overhead + the whole-plan USD AI allowance converted once.
          Twelve-month ROI = ((monthly benefit − monthly running cost) × 12 −
          upfront cost) ÷ upfront cost. Payback = upfront cost ÷ positive
          monthly net benefit; otherwise there is no positive payback.
        </p>
        <p>
          These outputs exclude unentered costs, time value of money and benefit
          ramp-up. ROI is unavailable when no team or scope is selected, or when
          a broad core replacement has no estimate. They do not establish
          accepted capability, a production launch date, a realised saving or
          investment suitability.
        </p>
      </section>
    </ProductArticle>
  );
}
