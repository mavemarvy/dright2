import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use realistic Nigeria/Africa import scenarios, quote assumptions in NGN, verify current customs or regulatory requirements with official authorities, and never treat a social-media claim as a legal or logistics guarantee.";
const seed:CourseSeed={
courseNumber:"010",slug:"china-importation-reselling-mastery-2026",title:"China Importation & Reselling Mastery 2026",
subtitle:"Source responsibly, verify suppliers, calculate landed cost and build a Nigeria-ready resale system",
promise:"Learn the complete import decision process from product research and supplier verification to negotiation, samples, freight, compliance awareness, landed-cost maths, inventory and resale. The goal is controlled risk and repeatable profit analysis, not cheap-product hype.",
accent:"trade",regionalContext:context,calculatorKind:"landed-cost",productPath:"/dright/store",
modules:[
m("Importation business foundations","Importation is a supply-chain business: demand, supplier reliability, logistics, compliance, cash flow and resale must all work together.",[
["Choose an import model","Compare wholesale resale, preorder, small-batch testing and private-label models by capital and risk.","Choose one model and draw its cash cycle from demand to restock."],
["Know the buyer first","Define who will buy, what problem the item solves and the maximum acceptable price before sourcing.","Collect ten buyer observations or marketplace reviews and summarize buying criteria."],
["Unit economics first","Estimate goods, freight, clearing, payment fees, defects and unsold stock before ordering.","Build rough economics for three candidate products."]
],"Create an import business model canvas with buyer, product, cash cycle and break-even assumptions.","Demand and landed-cost economics should be tested before supplier excitement."),
m("Product research","Good products solve a known need, survive logistics, fit purchasing power and leave enough margin after all costs.",[
["Demand signals","Use marketplaces, social conversations, local stores and repeat-purchase behaviour as evidence.","Score ten products using at least three demand signals."],
["Risk filters","Screen size, weight, fragility, batteries, liquids, regulation and after-sales burden.","Reject three products and explain why they are poor candidates."],
["Small test quantities","Use samples, preorder or smaller quantities when uncertainty is high.","Design a test order with a maximum-loss limit."]
],"Create a scored shortlist of five products.","A strong import product combines demand, manageable logistics and sufficient margin."),
m("Alibaba, 1688 and AliExpress","Different sourcing platforms suit different stages; compare language, MOQ, payment protection and supplier access.",[
["Alibaba workflow","Use supplier profiles, RFQs and Trade Assurance information as research inputs, not automatic guarantees.","Shortlist five suppliers and record specialization, history and terms."],
["1688 workflow","Understand domestic-China orientation and why local payment or forwarding support may be needed.","Compare one product on 1688 and Alibaba without assuming the cheapest price is usable."],
["AliExpress for samples","Use retail-size orders where appropriate to test quality or demand before larger sourcing.","Build a sample-order comparison with cost and delivery time."]
],"Build a three-platform sourcing comparison for one product.","Choose the platform that fits the order stage and risk, not only the lowest displayed price."),
m("Supplier verification","Verification reduces risk but never removes it; combine platform data, evidence, samples and protected payment methods.",[
["Supplier profile checks","Review business age, specialization, verified documents and transaction patterns.","Score three suppliers with a verification checklist."],
["Evidence requests","Ask for current product video, packaging, specifications and certificates where relevant.","Write a professional evidence-request message."],
["Red flags","Watch for pressure, changed payment details, impossible prices and refusal to sample.","Build a red-flag decision tree and test it on a sample chat."]
],"Complete a supplier due-diligence file with evidence and final decision.","No single badge, screenshot or chat message proves a supplier is safe."),
m("Quotations and negotiation","Professional negotiation covers specification, MOQ, quality, packaging, lead time and total cost.",[
["Write an RFQ","Specify quantity, destination, product specification, packaging and quotation terms.","Write one RFQ that three suppliers can answer consistently."],
["Negotiation levers","Use quantity, repeat orders, packaging and lead time as trade-offs instead of aggressive bargaining.","Set target, acceptable and walk-away positions."],
["Review the proforma invoice","Check seller, item, quantity, unit price, payment details, shipping term and lead time.","Audit a sample PI and mark every field that must match the agreement."]
],"Create a comparable quotation sheet and negotiation record.","Negotiate the complete commercial package, not only unit price."),
m("Samples and quality control","Samples reveal product quality, dimensions and packaging before large capital is committed.",[
["Sample plan","Define exactly what the sample must prove and which defects would stop the order.","Create a pass/fail checklist with measurements and photos."],
["Inspection planning","Use your own checklist or an appropriate inspection service for higher-risk orders.","Write an inspection brief with critical and major defects."],
["Defect allowance","Model expected defects and replacement costs in the economics.","Recalculate margin at 2%, 5% and 10% defect rates."]
],"Build a quality-control pack from sample to pre-shipment inspection.","Quality must be defined in measurable terms before production or shipment."),
m("Freight forwarding","Freight depends on size, weight, urgency, route, consolidation and the forwarder's actual scope.",[
["Air versus sea","Compare transit time, chargeable weight or volume and cash-cycle impact.","Calculate when air and sea each make sense for one product."],
["Forwarder quotation","Request origin charges, freight, destination scope, prohibited items and timing in writing.","Compare three forwarder quotes on total delivered service."],
["Consolidation and tracking","Use shipment references, packing lists and status updates to maintain visibility.","Build a shipment tracker from supplier dispatch to receipt."]
],"Choose a freight plan with quote comparison and contingency.","Compare freight by total service and risk, not headline rate."),
m("Customs and restricted-goods awareness","Importers must confirm current rules for the exact goods before payment and shipment.",[
["Restricted and prohibited items","Check official sources for food, medicine, cosmetics, radio, batteries and other controlled goods.","Add a compliance gate before every supplier payment."],
["Shipping documents","Understand commercial invoice, packing list and product-specific documents that may be required.","Build a shipment-document checklist."],
["Escalate unclear classification","Use a licensed professional or relevant authority when duty or regulatory status is unclear.","Write the questions you would ask a broker before shipping."]
],"Create a pre-shipment compliance file with official-source links.","Verify current rules for the exact goods before committing money."),
m("Landed cost and FX risk","Profit is calculated from delivered sellable inventory cost, not the supplier's unit price.",[
["Landed-cost formula","Combine goods, China inland cost, freight, clearing, applicable charges, payment cost and losses.","Calculate landed cost per sellable unit."],
["Exchange-rate buffer","Model currency movement between quotation, payment and restock.","Recalculate the order using three FX scenarios."],
["Cash-flow timing","Include deposits, balance payment, freight timing and when resale cash returns.","Draw a cash timeline and identify the peak cash requirement."]
],"Complete conservative, expected and worst-case landed-cost scenarios.","A cheap supplier price can become unprofitable after logistics and currency costs."),
m("Pricing and resale","Selling price must cover landed cost, selling expenses, discounts, defects and enough contribution to restock.",[
["Retail and wholesale pricing","Set separate price logic for single units, bundles and reseller quantities.","Create a three-level price table and calculate contribution."],
["Channel costs","Include delivery subsidy, payment fees, marketplace fees, content and returns.","Compare net contribution across three channels."],
["Stock velocity","Balance margin with how quickly capital turns.","Compare two price scenarios by monthly cash returned, not only margin percentage."]
],"Create a channel-specific resale price sheet.","Price should support both buyer value and sustainable restocking."),
m("Product listings and trust","Accurate listings reduce questions and returns by showing real dimensions, use cases and limitations.",[
["Photography and proof","Use clear photos or video of received stock and avoid misleading manufacturer-only images.","Create a ten-shot product photo plan."],
["Description structure","Write benefit, specification, size, compatibility, care and delivery information.","Draft one complete listing plus FAQ."],
["Reviews and complaints","Request honest feedback and respond visibly to defects or misunderstandings.","Create review-request and complaint-response scripts."]
],"Prepare a listing pack with content plan, description and support scripts.","Accurate product information builds trust and reduces costly returns."),
m("Sales channels and fulfilment","Choose channels that match the buyer and your fulfilment capability instead of listing everywhere.",[
["WhatsApp and social commerce","Use catalogs, Status/content and direct conversations with clear delivery terms.","Plan a seven-day launch sequence."],
["Marketplaces","Compare reach, fees, rules and logistics before committing.","Build a channel scorecard."],
["Delivery operations","Define packaging, dispatch time, courier handoff, failed delivery and returns.","Write an order-to-delivery SOP."]
],"Build a two-channel sales and fulfilment plan.","Sales growth without fulfilment discipline can destroy margin and reputation."),
m("Inventory and restocking","Import businesses fail when sales are confused with cash and restocking is mistimed.",[
["Stock records","Track received, damaged, sold, returned and available units by SKU.","Build and reconcile a sample stock ledger."],
["Reorder point","Use sales velocity, supplier lead time and safety stock.","Calculate a reorder point for one SKU."],
["Working capital","Separate business cash from owner withdrawals so successful stock can be replaced.","Create a restock-reserve rule."]
],"Produce an inventory and restocking dashboard.","Stock decisions should use velocity, lead time and available working capital."),
m("Risk management","Prepare for supplier failure, delays, damaged goods, demand change and payment problems before they happen.",[
["Pre-mortem","Imagine the order failed and list the likely causes.","Write ten risks and a mitigation for each."],
["Supplier diversification","Reduce dependence on one supplier once volume becomes meaningful.","Identify a backup supplier and switching conditions."],
["Customer policy","Set transparent returns, defect and warranty handling appropriate to the product and local law.","Draft a plain-language customer policy."]
],"Create a risk register with probability, impact and mitigation.","Risk is managed before it happens, not explained afterward."),
m("90-day importation capstone","Run a controlled source-to-resale cycle and compare forecast to actual results.",[
["Validate and source","Select one product, verify demand, obtain quotes and calculate landed cost.","Complete the sourcing file and decide whether it meets your loss limit."],
["Receive and launch","Check stock, create original listings and fulfil early sales.","Record defects, questions and actual delivery costs."],
["Review and reorder","Compare contribution, stock velocity and complaints before restocking.","Write a reorder, renegotiate or stop decision with evidence."]
],"Submit a complete import business file.","A disciplined decision is a success even when the correct decision is not to import.")
],
videos:[],
visuals:[
{title:"China sourcing to Nigeria resale",imageUrl:"/course-010-china-importation/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Demand, supplier verification, freight, landed cost and resale."},
{title:"Importation toolkit",imageUrl:"/course-010-china-importation/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Supplier scorecards, landed-cost planning and inventory tracking."}
],
references:[
{label:"Nigeria prohibited and restricted imports",url:"https://www.trade.gov/country-commercial-guides/nigeria-prohibited-and-restricted-imports",summary:"Country commercial guide reference; always re-check the current Nigerian rules with the relevant authority.",points:["Rules can change","Product-specific approvals may apply"]},
{label:"Alibaba Source Now",url:"https://source.alibaba.com/",summary:"Alibaba's official sourcing helper, currently advertised as free to use.",points:["Use as a sourcing aid","Still perform due diligence"]}
],
downloads:[],
freeTools:[
{label:"Alibaba.com",url:"https://www.alibaba.com/",summary:"International B2B sourcing and supplier research.",freeNote:"Free to browse and research"},
{label:"1688",url:"https://www.1688.com/",summary:"China domestic wholesale marketplace; Chinese-language and local-trade assumptions require care.",freeNote:"Free to browse"},
{label:"AliExpress",url:"https://www.aliexpress.com/",summary:"Useful for retail-size comparisons and some sample testing.",freeNote:"Free to browse"},
{label:"Alibaba Source Now",url:"https://source.alibaba.com/",summary:"Official visual/product sourcing helper from Alibaba.",freeNote:"Alibaba states it is free"},
{label:"Wise Currency Converter",url:"https://wise.com/gb/currency-converter/",summary:"Use for FX planning, then confirm your real payment rate and fees.",freeNote:"Free rate-checking tool"}
],
projects:[
{title:"Product opportunity shortlist",outcome:"Five products scored for demand, logistics and margin.",steps:["Collect evidence","Score risk","Choose a test candidate"]},
{title:"Supplier due-diligence file",outcome:"A documented supplier decision with evidence.",steps:["Compare profiles","Request proof","Record red flags"]},
{title:"Landed-cost workbook",outcome:"Conservative cost per sellable unit under multiple FX scenarios.",steps:["Collect quotes","Add all logistics","Model defects and FX"]},
{title:"Sales launch pack",outcome:"Original listing, pricing and fulfilment workflow.",steps:["Create content","Set channel prices","Define delivery SOP"]},
{title:"90-day import capstone",outcome:"A complete source-to-resale decision file.",steps:["Validate and source","Launch small","Review actual economics"]}
],
templates:[
{label:"China Importation Toolkit",href:"/course-010-china-importation/importation-toolkit.md",type:"Markdown",description:"RFQ, supplier verification, negotiation, QC and freight-comparison templates."},
{label:"Landed Cost & Inventory Tracker",href:"/course-010-china-importation/importation-tracker.csv",type:"CSV",description:"Track purchase, logistics, landed cost, stock and resale contribution."}
]};
export const course010=buildCourse(seed);
