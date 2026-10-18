# Primary-source research — 18 October 2026

## Official source versus implementation

- [ICICI savings FAQ](https://www.icici.bank.in/personal-banking/accounts/savings-account/savings-account-faqs): adult independent opening and identity/address documentation inform the topics. The demo narrows eligibility to adults and uses generated sample records. It does not reproduce the bank's eligibility, document policy or pricing.
- [ICICI online savings terms](https://www.icici.bank.in/personal-banking/accounts/savings-account/sb-online-terms-and-conditions): staged declarations include tax residency, nomination and consent; the published flow uses identity verification. The demo keeps those topics but replaces verification with an explicitly simulated contact/identity pack and requires existing branch review and independent approval. No electronic signature or live KYC claim.
- [RBI official commercial-bank KYC directions index](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13141) was opened, but returned the master-direction listing rather than the complete operative text in this tool. No current legal requirement is inferred from that partial retrieval. Older 2016/2024 search results were not used as current law.

This is a synthetic experience model, not a compliance implementation or a replica of a regulated account-opening service. Nominee decline and India-only tax handling are deliberate demo simplifications. Source pages do not prove live integration or bank approval.

## Core recovery contract

[Apache Fineract 1.15.0 SavingsAccountsApiResource](https://github.com/apache/fineract/blob/1.15.0/fineract-provider/src/main/java/org/apache/fineract/portfolio/savings/api/SavingsAccountsApiResource.java) exposes GET by original savings external ID. Opening-exception inspection uses that read, then verifies the exact original client, configured product, applicant name and active state. Only local binding/status are reconciled; missing or partial Core results remain blocked. No Core write is replayed.

## Stage-by-stage provenance

This follows spec006 E-03/E-07. Observation depth is **official public text inspected**. No authenticated account-opening form, validation state or internal staff screen was observed. Seven screens and their exact order are OpenFinacle design decisions, not observed ICICI UI parity.

1. **Product/eligibility:** savings-product discovery and adult independent opening are supported by the savings FAQ; the single INR demo product and resident-only restriction are our scope.
2. **Contact:** online terms sections1.5/2.3 describe remote identity/contact verification. Our sample-contact check replaces that process; no real OTP or identity number.
3. **Personal:** online terms section2.2 supports collecting applicant information. Grouping fictional name and sample birth date on one screen is inferred design.
4. **Address/tax/occupation:** FAQ identity/address categories and online terms sections2.2/5.1 support address and FATCA declaration topics. Occupation choices and India-only tax handling are inferred demo rules.
5. **Nominee:** online terms include nomination in the application/consent. The current FAQ describes nomination as mandatory; our explicit decline is a demo preference, not claimed bank behavior or legal advice.
6. **Identity:** FAQ documentation categories and online terms section1.5 support an identity stage. Generated text records and officer review deliberately replace real verification. No video call is reproduced.
7. **Review/consent/outcome:** online terms sections2.1/5.1 support completeness and consent; the FAQ describes receipt of account details after opening. Back/edit, explicit confirmation, permanent operation reference and separate approver are OpenFinacle controls. Initial funding in the published terms is deliberately deferred to later existing deposit operations; this journey collects none.

The two official ICICI links above are the supporting primary sources. Public material establishes process topics, not the exact screen layout, sequence, field rules, staff gates or API integration.
