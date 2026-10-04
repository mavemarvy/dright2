import { useMemo, useState } from 'react';
import { Calculator, RotateCcw } from 'lucide-react';

export type CourseCalculatorKind =
  | 'ai-service-profit'
  | 'landed-cost'
  | 'freelance-rate'
  | 'affiliate-earnings'
  | 'digital-product-profit'
  | 'saas-break-even'
  | 'pdf-pricing'
  | 'ghostwriting-quote'
  | 'kdp-planner'
  | 'youtube-production';

type Definition = {
  title: string;
  description: string;
  labels: [string, string, string, string];
  defaults: [number, number, number, number];
  calculate: (a: number, b: number, c: number, d: number) => { primary: string; secondary: string };
};

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);

const definitions: Record<CourseCalculatorKind, Definition> = {
  'ai-service-profit': {
    title: 'AI service profit planner',
    description: 'Estimate monthly revenue and contribution profit before promising an income target.',
    labels: ['Price per client (₦)', 'Clients per month', 'Delivery cost/client (₦)', 'Other monthly costs (₦)'],
    defaults: [50000, 4, 8000, 15000],
    calculate: (price, clients, delivery, fixed) => {
      const revenue = price * clients;
      const profit = revenue - (delivery * clients) - fixed;
      return { primary: 'Estimated monthly revenue: ' + money(revenue), secondary: 'Estimated contribution profit: ' + money(profit) };
    },
  },
  'landed-cost': {
    title: 'Import landed-cost calculator',
    description: 'Use conservative figures before paying a supplier. This is a planning estimate, not a customs quotation.',
    labels: ['Goods cost total (₦)', 'Units', 'Freight + clearing (₦)', 'Target selling price/unit (₦)'],
    defaults: [300000, 100, 120000, 6500],
    calculate: (goods, units, logistics, sell) => {
      const landed = units > 0 ? (goods + logistics) / units : 0;
      const margin = sell - landed;
      return { primary: 'Estimated landed cost/unit: ' + money(landed), secondary: 'Estimated gross margin/unit: ' + money(margin) };
    },
  },
  'freelance-rate': {
    title: 'Freelance rate planner',
    description: 'Turn an income goal into a rate that also covers non-billable time and platform fees.',
    labels: ['Monthly income target (₦)', 'Billable hours/month', 'Platform/fee %', 'Monthly business costs (₦)'],
    defaults: [500000, 80, 10, 50000],
    calculate: (target, hours, fee, costs) => {
      const needed = (target + costs) / Math.max(0.01, 1 - fee / 100);
      const rate = hours > 0 ? needed / hours : 0;
      return { primary: 'Minimum gross monthly billing: ' + money(needed), secondary: 'Planning hourly rate: ' + money(rate) };
    },
  },
  'affiliate-earnings': {
    title: 'Affiliate funnel estimator',
    description: 'Model clicks, conversion rate and commission instead of assuming every viewer will buy.',
    labels: ['Product price (₦)', 'Commission %', 'Qualified clicks', 'Conversion rate %'],
    defaults: [25000, 60, 500, 2],
    calculate: (price, commission, clicks, conversion) => {
      const sales = Math.max(0, Math.floor(clicks * conversion / 100));
      const earnings = sales * price * commission / 100;
      return { primary: 'Estimated sales: ' + sales, secondary: 'Estimated commission: ' + money(earnings) };
    },
  },
  'digital-product-profit': {
    title: 'Digital product profit planner',
    description: 'Estimate net contribution after platform/payment percentages and promotion spend.',
    labels: ['Selling price (₦)', 'Monthly sales', 'Fees %', 'Promotion spend (₦)'],
    defaults: [15000, 40, 8, 100000],
    calculate: (price, sales, fees, ads) => {
      const gross = price * sales;
      const net = gross * (1 - fees / 100) - ads;
      return { primary: 'Gross revenue: ' + money(gross), secondary: 'Estimated contribution after listed costs: ' + money(net) };
    },
  },
  'saas-break-even': {
    title: 'SaaS break-even planner',
    description: 'Estimate recurring revenue and how many paying users cover your fixed monthly costs.',
    labels: ['Monthly price/user (₦)', 'Paying users', 'Variable cost/user (₦)', 'Fixed monthly costs (₦)'],
    defaults: [5000, 100, 700, 150000],
    calculate: (price, users, variable, fixed) => {
      const mrr = price * users;
      const profit = mrr - variable * users - fixed;
      const contribution = Math.max(1, price - variable);
      const breakEven = Math.ceil(fixed / contribution);
      return { primary: 'MRR / estimated operating result: ' + money(mrr) + ' / ' + money(profit), secondary: 'Approx. break-even paying users: ' + breakEven };
    },
  },
  'pdf-pricing': {
    title: 'PDF product pricing planner',
    description: 'Price from value and economics rather than copying a competitor price.',
    labels: ['Target monthly revenue (₦)', 'Expected sales/month', 'Fees %', 'Promotion cost/month (₦)'],
    defaults: [300000, 30, 8, 50000],
    calculate: (target, sales, fees, promo) => {
      const requiredGross = (target + promo) / Math.max(0.01, 1 - fees / 100);
      const price = sales > 0 ? requiredGross / sales : 0;
      return { primary: 'Required gross revenue: ' + money(requiredGross), secondary: 'Planning price per sale: ' + money(price) };
    },
  },
  'ghostwriting-quote': {
    title: 'Ghostwriting quote planner',
    description: 'Create a transparent quote from scope instead of guessing a flat fee.',
    labels: ['Word count', 'Rate per word (₦)', 'Research/revision premium %', 'Other project costs (₦)'],
    defaults: [10000, 35, 20, 20000],
    calculate: (words, rate, premium, other) => {
      const base = words * rate;
      const quote = base * (1 + premium / 100) + other;
      return { primary: 'Base writing fee: ' + money(base), secondary: 'Planning project quote: ' + money(quote) };
    },
  },
  'kdp-planner': {
    title: 'KDP royalty planning calculator',
    description: 'Use the royalty percentage and print/delivery cost shown by KDP for the exact marketplace and format you choose.',
    labels: ['List price equivalent (₦)', 'Royalty %', 'Print/delivery cost per sale (₦)', 'Expected monthly sales'],
    defaults: [10000, 60, 2500, 30],
    calculate: (price, royalty, cost, sales) => {
      const perSale = Math.max(0, price * royalty / 100 - cost);
      return { primary: 'Planning royalty/sale: ' + money(perSale), secondary: 'Planning monthly royalty: ' + money(perSale * sales) };
    },
  },
  'youtube-production': {
    title: 'YouTube production economics planner',
    description: 'Plan content costs before scaling a faceless workflow. Revenue is never guaranteed.',
    labels: ['Videos per month', 'Cost per video (₦)', 'Expected revenue/video (₦)', 'Other monthly costs (₦)'],
    defaults: [8, 15000, 30000, 50000],
    calculate: (videos, cost, revenue, fixed) => {
      const spend = videos * cost + fixed;
      const projected = videos * revenue;
      return { primary: 'Monthly production cost: ' + money(spend), secondary: 'Scenario revenue / difference: ' + money(projected) + ' / ' + money(projected - spend) };
    },
  },
};

export default function CourseInteractiveToolbox({ kind }: { kind: CourseCalculatorKind }) {
  const definition = definitions[kind];
  const [values, setValues] = useState<[number, number, number, number]>(definition.defaults);
  const result = useMemo(() => definition.calculate(...values), [definition, values]);

  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shrink-0"><Calculator className="w-5 h-5" /></div>
        <div><h3 className="font-black text-emerald-950">{definition.title}</h3><p className="mt-1 text-sm leading-6 text-emerald-900/75">{definition.description}</p></div>
      </div>
      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {definition.labels.map((label, index) => (
          <label key={label} className="text-xs font-bold text-emerald-950">{label}
            <input type="number" value={values[index]} onChange={(event) => {
              const next = [...values] as [number, number, number, number];
              next[index] = Number(event.target.value || 0);
              setValues(next);
            }} className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
          </label>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-white border border-emerald-200 p-4">
        <p className="font-black text-emerald-950">{result.primary}</p>
        <p className="mt-1 text-sm text-emerald-800">{result.secondary}</p>
        <p className="mt-2 text-[11px] leading-5 text-emerald-700">Planning estimate only. Verify platform fees, exchange rates, taxes, customs, printing costs and local rules before making financial decisions.</p>
      </div>
      <button type="button" onClick={() => setValues(definition.defaults)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-emerald-800"><RotateCcw className="w-3.5 h-3.5" /> Reset calculator</button>
    </section>
  );
}
