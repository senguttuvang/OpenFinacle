import {
  type PlanningAssumptions,
  type PlanningHousehold,
  type PlanningPosting,
  planningAmortize,
  planningAnchor,
} from "./planning";

const personas = [
  {
    id: "synthetic-kaveri",
    name: "Kaveri household",
    city: "Coimbatore",
    description: "Salaried household · rented home · one child",
    members: ["Meera", "Arun"],
    income: 85000,
    essential: 26000,
    discretionary: 10000,
    sip: 12000,
    age: 35,
    principal: 0,
    emi: 0,
    capital: 800000,
    pension: 0,
  },
  {
    id: "synthetic-nila",
    name: "Nila household",
    city: "Bengaluru",
    description: "Dual income · home loan · education goal",
    members: ["Nila", "Dev"],
    income: 260000,
    essential: 55000,
    discretionary: 30000,
    sip: 45000,
    age: 39,
    principal: 6400000,
    emi: 62000,
    capital: 4200000,
    pension: 10000,
  },
  {
    id: "synthetic-vaigai",
    name: "Vaigai household",
    city: "Pune",
    description: "Independent professional · variable income · parent care",
    members: ["Isha", "Ravi"],
    income: 175000,
    essential: 40000,
    discretionary: 18000,
    sip: 25000,
    age: 42,
    principal: 0,
    emi: 0,
    capital: 2300000,
    pension: 0,
  },
  {
    id: "synthetic-tamarai",
    name: "Tamarai household",
    city: "Chennai",
    description: "Near retirement · pension and investment income",
    members: ["Leela", "Kiran"],
    income: 110000,
    essential: 32000,
    discretionary: 14000,
    sip: 15000,
    age: 59,
    principal: 0,
    emi: 0,
    capital: 9500000,
    pension: 48000,
  },
] as const;
const paise = (rupees: number) => Math.round(rupees * 100);
export const planningHouseholds = (): PlanningHousehold[] =>
  personas.map((persona, index) => {
    let seed = 9217 + index * 19;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const assumptions: PlanningAssumptions = {
      age: persona.age,
      retireAge: 60,
      longevity: 90,
      income: paise(persona.income),
      essential: paise(persona.essential),
      discretionary: paise(persona.discretionary),
      pension: paise(persona.pension),
      dependent: paise(index === 2 ? 18000 : index === 1 ? 8000 : 0),
      dependentYears: 10,
      essentialInflation: 600,
      discretionaryInflation: 500,
      incomeGrowth: 500,
      returnRate: 700,
      fee: 50,
      sip: paise(persona.sip),
      sipStep: 500,
      prepayment: 0,
      education: paise(index === 1 ? 2500000 : index === 0 ? 800000 : 0),
      educationYear: 2034,
      breakYear: 2028,
      breakMonths: 0,
      medicalShock: 0,
      rentChange: 0,
      adverseSequence: false,
    };
    const postings: PlanningPosting[] = [];
    const checking = `${persona.id}-salary`;
    const reserve = `${persona.id}-reserve`;
    const card = `${persona.id}-card`;
    const add = (
      date: string,
      account: string,
      minor: number,
      kind: PlanningPosting["kind"],
      category: string,
      merchant: string,
      member: string = persona.members[0],
      link: string | null = null,
    ) =>
      postings.push({
        id: `${persona.id}-tx-${postings.length + 1}`,
        date,
        account,
        minor,
        kind,
        category,
        merchant,
        member,
        link,
      });
    let loan = {
      principal: paise(persona.principal + (index === 1 ? 350000 : 0)),
      rate: 850,
      emi: paise(persona.emi),
    };
    for (let monthIndex = 0; monthIndex < 25; monthIndex++) {
      const month = new Date(Date.UTC(2024, 9 + monthIndex, 1))
        .toISOString()
        .slice(0, 7);
      const date = (day: number) => `${month}-${String(day).padStart(2, "0")}`;
      const monthEnd =
        monthIndex === 24
          ? 17
          : new Date(Date.UTC(2024, 10 + monthIndex, 0)).getUTCDate();
      const amount =
        index === 2
          ? Math.round(persona.income * (0.55 + random() * 1.05))
          : persona.income;
      if (index === 1) {
        add(
          date(1),
          checking,
          paise(150000),
          "income",
          "Salary",
          "Synthetic Northlight payroll",
        );
        add(
          date(1),
          checking,
          paise(110000),
          "income",
          "Salary",
          "Synthetic Amber payroll",
          persona.members[1],
        );
      } else
        add(
          date(1),
          checking,
          paise(amount),
          "income",
          index === 2 ? "Professional receipts" : "Salary",
          index === 2
            ? "Synthetic project receipts"
            : "Synthetic employer payroll",
        );
      add(
        date(2),
        checking,
        -paise(persona.essential * 0.4),
        "expense",
        index === 1 ? "Home upkeep" : "Rent",
        index === 1 ? "Synthetic Cedar maintenance" : "Synthetic landlord",
      );
      const essentials = ["Groceries", "Utilities", "Transport", "Health"];
      const merchants = [
        "Synthetic Fresh Basket",
        "Synthetic City Power",
        "Synthetic Metro Pass",
        "Synthetic Care Clinic",
      ];
      for (let j = 0; j < 16; j++) {
        const day = 3 + Math.floor((j * 25) / 16);
        if (day > monthEnd) continue;
        const category = essentials[j % 4] ?? "Groceries";
        add(
          date(day),
          j % 3 === 0 ? card : checking,
          -paise(((persona.essential * 0.6) / 16) * (0.8 + random() * 0.4)),
          "expense",
          category,
          merchants[j % 4] ?? "Synthetic merchant",
          persona.members[j % 2] ?? persona.members[0],
        );
      }
      for (let j = 0; j < 6; j++) {
        const day = 4 + j * 4;
        if (day > monthEnd) continue;
        add(
          date(day),
          card,
          -paise((persona.discretionary / 6) * (0.65 + random() * 0.7)),
          "expense",
          ["Dining", "Shopping", "Travel"][j % 3] ?? "Dining",
          [
            "Synthetic Pepper Kitchen",
            "Synthetic Loom Store",
            "Synthetic Weekend Rail",
          ][j % 3] ?? "Synthetic merchant",
          persona.members[j % 2] ?? persona.members[0],
        );
      }
      add(
        date(5),
        checking,
        -paise(persona.sip),
        "investment",
        "Investments",
        "Synthetic Horizon SIP",
      );
      const reserveLink = `${persona.id}-${month}-reserve-transfer`;
      add(
        date(6),
        checking,
        -paise(3000),
        "transfer",
        "Transfers",
        "Reserve allocation",
        persona.members[0],
        reserveLink,
      );
      add(
        date(6),
        reserve,
        paise(3000),
        "transfer",
        "Transfers",
        "Reserve allocation",
        persona.members[0],
        reserveLink,
      );
      if (persona.emi) {
        const paid = planningAmortize(loan, 1);
        loan = { ...loan, principal: paid.principal };
        add(
          date(5),
          checking,
          -paid.paidPrincipal,
          "principal",
          "Home loan principal",
          "Synthetic Cedar Home Finance",
        );
        add(
          date(5),
          checking,
          -paid.interest,
          "interest",
          "Home loan interest",
          "Synthetic Cedar Home Finance",
        );
      }
      if (index === 2) {
        add(
          date(7),
          checking,
          -paise(18000),
          "expense",
          "Parent care",
          "Synthetic Family Care",
        );
        add(
          date(8),
          checking,
          -paise(amount * 0.15),
          "transfer",
          "Tax reserve",
          "Estimated professional tax reserve",
          persona.members[0],
          `${persona.id}-${month}-tax-reserve`,
        );
        add(
          date(8),
          reserve,
          paise(amount * 0.15),
          "transfer",
          "Tax reserve",
          "Estimated professional tax reserve",
          persona.members[0],
          `${persona.id}-${month}-tax-reserve`,
        );
        if (Number(month.slice(5)) === 3) {
          const fy = `${Number(month.slice(0, 4)) - 1}-04-01`;
          const reserved = postings
            .filter(
              (p) =>
                p.account === reserve &&
                p.category === "Tax reserve" &&
                p.date >= fy,
            )
            .reduce((sum, p) => sum + p.minor, 0);
          add(
            date(15),
            reserve,
            -reserved,
            "expense",
            "Tax payment",
            "Synthetic annual tax provision settlement",
          );
        }
      }
      if (index === 1 && monthIndex % 2 === 0) {
        const link = `${persona.id}-${month}-work-trip`;
        add(
          date(11),
          card,
          -paise(5000),
          "expense",
          "Work travel",
          "Synthetic project rail booking",
          persona.members[1],
          link,
        );
        add(
          date(16),
          checking,
          paise(3000),
          "reimbursement",
          "Work travel",
          "Synthetic employer partial reimbursement",
          persona.members[1],
          link,
        );
      }
      if (Number(month.slice(5)) === 4)
        add(
          date(12),
          checking,
          -paise(12000 + index * 6000),
          "expense",
          "Insurance",
          "Synthetic Family Shield annual renewal",
        );
      if (Number(month.slice(5)) === 6 && index < 2)
        add(
          date(10),
          checking,
          -paise(18000 + index * 24000),
          "expense",
          "Education",
          "Synthetic Learning Academy term fee",
        );
      if (Number(month.slice(5)) === 10) {
        add(
          date(12),
          checking,
          -paise(12000 + index * 3000),
          "expense",
          "Festivals",
          "Synthetic Festival Market",
        );
        if (index !== 2)
          add(
            date(15),
            checking,
            paise(persona.income * 0.25),
            "income",
            "Bonus",
            "Synthetic festive bonus",
          );
      }
      if (monthIndex % 3 === 0) {
        const link = `${persona.id}-${month}-returned-shirt`;
        add(
          date(10),
          card,
          -paise(2400),
          "expense",
          "Shopping",
          "Synthetic Loom Store",
          persona.members[0],
          link,
        );
        add(
          date(14),
          card,
          paise(1200),
          "refund",
          "Shopping",
          "Synthetic Loom partial return",
          persona.members[0],
          link,
        );
      }
      if (monthEnd >= 28) {
        const outstanding = -postings
          .filter((p) => p.account === card)
          .reduce((sum, p) => sum + p.minor, 0);
        const link = `${persona.id}-${month}-card-settlement`;
        add(
          date(28),
          checking,
          -outstanding,
          "transfer",
          "Card settlement",
          "Synthetic card bill",
          persona.members[0],
          link,
        );
        add(
          date(28),
          card,
          outstanding,
          "transfer",
          "Card settlement",
          "Synthetic card bill",
          persona.members[0],
          link,
        );
      }
    }
    return {
      id: persona.id,
      name: persona.name,
      city: persona.city,
      description: persona.description,
      members: persona.members,
      accounts: [
        {
          id: checking,
          label: "Synthetic River Bank · salary",
          owners: persona.members.join(" + "),
          opening: paise(250000 + index * 75000),
        },
        {
          id: reserve,
          label: "Synthetic Lotus Bank · reserve",
          owners: persona.members[0],
          opening: paise(100000),
        },
        {
          id: card,
          label: "Synthetic River card · unsettled purchases",
          owners: persona.members[0],
          opening: 0,
        },
      ],
      postings: postings.sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      ),
      holdings: [
        {
          id: `${persona.id}-equity`,
          name: "Synthetic Horizon diversified equity",
          category: "Equity funds",
          owner: persona.members[0],
          minor: paise(persona.capital * 0.55),
          liquidity: "investable",
          source: "Fictional broker snapshot",
          asOf: planningAnchor,
          units: `${1000 + index * 2500} illustrative units`,
          cost: paise(persona.capital * 0.48),
        },
        {
          id: `${persona.id}-bonds`,
          name: "Synthetic Lotus deposits and bonds",
          category: "Fixed income",
          owner: persona.members.join(" + "),
          minor: paise(persona.capital * 0.45),
          liquidity: "investable",
          source: "Fictional consolidated snapshot",
          asOf: planningAnchor,
          units: "One joint holding; counted once",
          cost: paise(persona.capital * 0.43),
        },
        {
          id: `${persona.id}-epf`,
          name: "Synthetic provident fund",
          category: "Retirement",
          owner: persona.members[0],
          minor: paise(persona.capital * 0.4),
          liquidity: "locked",
          source: "Fictional annual statement",
          asOf: "2026-03-31",
          units: "Locked; excluded from available capital",
          cost: paise(persona.capital * 0.32),
        },
        ...(index === 1 || index === 3
          ? [
              {
                id: `${persona.id}-home`,
                name: "Self-occupied fictional home",
                category: "Property",
                owner: persona.members.join(" + "),
                minor: paise(index === 1 ? 11000000 : 8500000),
                liquidity: "home" as const,
                source: "Illustrative owner estimate",
                asOf: "2026-09-30",
                units: "One joint home; no assumed sale",
                cost: paise(index === 1 ? 8500000 : 4200000),
              },
            ]
          : []),
      ],
      debt: loan,
      assumptions,
    };
  });
