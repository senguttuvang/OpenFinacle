"use client";

import { ArrowRight } from "lucide-react";
import "../assessment-report.css";
import { Source } from "../evidence-presentation";
export function ImplementationProof() {
  return (
    <section
      id="proof"
      className="evidence-section"
      aria-labelledby="proof-title"
    >
      <div className="evidence-section-heading">
        <h2 id="proof-title">A claim should leave a trail.</h2>
        <p>
          These are dated maintainer observations and automated records. Source
          and CI links require access to the private repository. They are
          inspectable by authorised reviewers, not independent assurance.
        </p>
      </div>
      <div className="evidence-proof-grid">
        <figure className="evidence-transfer">
          <figcaption>
            <h3>One transfer. Two observed sides.</h3>
            <span>Recorded synthetic INR 1 transfer · 18 October 2026</span>
          </figcaption>
          <div className="evidence-transfer-pair">
            <div>
              <span>Sender statement</span>
              <strong>−₹1</strong>
              <small>Debit 231</small>
            </div>
            <ArrowRight aria-label="Same Core transfer" />
            <div>
              <span>Recipient statement</span>
              <strong>+₹1</strong>
              <small>Credit 232</small>
            </div>
          </div>
          <p className="evidence-net">
            Net movement across the pair <strong>₹0</strong>
          </p>
          <p>
            Core transfer 34; both statements persisted after reload and
            customer switching. This proves this selected transfer, not
            bank-wide reconciliation.
          </p>
          <Source id="release">Original observation record</Source>
        </figure>
        <div className="evidence-proof-ledger">
          <h3>Proof ledger</h3>
          <dl>
            <div>
              <dt>Release / execution</dt>
              <dd>
                <strong>
                  1d0b8a8 · 342 tests / 3,846 assertions · 87 workspace checks
                </strong>
                <br />
                Dated baseline counts, not this page’s changing live CI status.{" "}
                <Source id="checks">CI record</Source>
              </dd>
            </div>
            <div>
              <dt>Persistence / scope</dt>
              <dd>
                100 seeded relationships plus one staged onboarding observed at
                the checkpoint; customer-specific payee lists retained. Counts
                are a snapshot, not a live directory.{" "}
                <Source id="release">Acceptance record</Source>
              </dd>
            </div>
            <div>
              <dt>Failure / recovery</dt>
              <dd>
                Selected original-receipt, ownership, replay and uncertainty
                behaviour tested with fixtures; earlier live reversal and
                duplicate-prevention checks recorded.{" "}
                <Source id="recovery">Tests</Source> ·{" "}
                <Source id="verification">Live checkpoints</Source>
              </dd>
            </div>
            <div>
              <dt>Simulation boundary</dt>
              <dd>
                FD/RD, cards, service cases and household planning persist as
                app workflows; persistence does not establish investment,
                network settlement or regulated advice.{" "}
                <Source id="implementation">Source</Source>
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <section
        className="evidence-architecture"
        aria-label="Current architecture"
      >
        <div>
          <strong>Customer + branch</strong>
          <span>Application, review, enquiry</span>
        </div>
        <ArrowRight aria-hidden="true" />
        <div>
          <strong>Effect / TypeScript app</strong>
          <span>Commands, receipts, role/workspace scope</span>
        </div>
        <ArrowRight aria-hidden="true" />
        <div>
          <strong>Apache Fineract 1.15.0</strong>
          <span>Financial system of record</span>
        </div>
      </section>
      <p className="evidence-note">
        App workflows use D1; synthetic documents use R2. Core financial state
        uses PostgreSQL. A local frontend preview is not evidence of native
        financial functionality.
      </p>
    </section>
  );
}
