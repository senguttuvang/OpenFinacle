# Primary-source research — 18 October 2026

## Official source versus implementation

- [ICICI savings FAQ](https://www.icici.bank.in/personal-banking/accounts/savings-account/savings-account-faqs): adult independent opening and identity/address documentation inform the topics. The demo narrows eligibility to adults and uses generated sample records. It does not reproduce the bank's eligibility, document policy or pricing.
- [ICICI online savings terms](https://www.icici.bank.in/personal-banking/accounts/savings-account/sb-online-terms-and-conditions): staged declarations include tax residency, nomination and consent; the published flow uses identity verification. The demo keeps those topics but replaces verification with an explicitly simulated contact/identity pack and requires existing branch review and independent approval. No electronic signature or live KYC claim.
- [RBI official commercial-bank KYC directions index](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13141) was opened, but returned the master-direction listing rather than the complete operative text in this tool. No current legal requirement is inferred from that partial retrieval. Older 2016/2024 search results were not used as current law.

This is a synthetic experience model, not a compliance implementation or a replica of a regulated account-opening service. Nominee decline and India-only tax handling are deliberate demo simplifications. Source pages do not prove live integration or bank approval.

## Core recovery contract

[Apache Fineract 1.15.0 SavingsAccountsApiResource](https://github.com/apache/fineract/blob/1.15.0/fineract-provider/src/main/java/org/apache/fineract/portfolio/savings/api/SavingsAccountsApiResource.java) exposes GET by original savings external ID. Opening-exception inspection uses that read, then verifies the exact original client, configured product, applicant name and active state. Only local binding/status are reconciled; missing or partial Core results remain blocked. No Core write is replayed.
