import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use Nigerian and African examples, mobile-first buyer journeys, honest income claims, clear affiliate disclosures and current platform rules. Do not teach spam, fake testimonials, fake earnings screenshots or deceptive tracking.";
const seed:CourseSeed={
courseNumber:"012",slug:"affiliate-marketing-online-sales-mastery-2026",title:"Affiliate Marketing & Online Sales Mastery 2026",
subtitle:"Build trust, choose offers, create useful content and turn qualified attention into trackable sales",
promise:"Learn affiliate marketing as a measurable sales discipline. Choose defensible offers, research audiences, create conversion content, use WhatsApp and social platforms responsibly, track the funnel, understand DRIGHT affiliate workflows and scale without fake earnings claims.",
accent:"affiliate",regionalContext:context,calculatorKind:"affiliate-earnings",productPath:"/dright/store",
modules:[
m("Affiliate foundations","Affiliate income is a commission for influencing a tracked purchase; it depends on offer economics, trust and conversion.",[
["How tracking works","Understand referral links, attribution windows, qualifying orders, reversals and payout rules.","Map click to qualified sale for one program and note where attribution may fail."],
["Commission economics","Compare percentage, fixed commission, refunds and payout timing instead of chasing the highest rate.","Calculate actual naira earnings per sale for five sample offers."],
["Ethical expectations","Avoid guaranteed income language, fake screenshots and misleading scarcity.","Rewrite five hype claims into accurate benefit-led messages."]
],"Create an affiliate business model with rules, traffic source and payout timing.","Affiliate marketing is tracked sales, not guaranteed passive income."),
m("Audience research","High-converting content starts with a specific person, problem, context and buying objection.",[
["Buyer profile","Define situation, pain, desired outcome, budget and trusted information sources.","Write a one-page buyer profile from real evidence."],
["Customer language","Collect phrases from reviews, comments and support questions.","Build a 30-phrase customer language bank."],
["Journey stages","Separate awareness, comparison, decision and post-purchase questions.","Map ten content ideas to four journey stages."]
],"Build an audience research sheet with pains, objections and proof needs.","Relevant customer insight matters more than generic follower counts."),
m("Choosing offers","A strong affiliate offer fits the audience, has clear value and workable commission economics.",[
["Product quality","Evaluate whether the product solves the promised problem and support/refund policies are credible.","Score five offers on value, fit, proof and risk."],
["Price and commission","Calculate actual earnings per sale and sales required for a target.","Use the course calculator on three offers."],
["Program terms","Check allowed traffic sources, brand bidding, coupon rules and payout conditions.","Summarize the important rules of one program before promotion."]
],"Create a ranked offer shortlist.","Promote products you can explain and defend, not simply the highest commission."),
m("Positioning and trust","People buy through recommendations when the recommendation is useful, specific and transparent.",[
["Niche positioning","Choose a problem space broad enough for multiple products but narrow enough to build expertise.","Write three niche statements and choose one."],
["Trust assets","Use demonstrations, honest pros/cons, tutorials and comparisons.","Plan five trust-building posts before a sales CTA."],
["Disclosure","Make the commercial relationship clear where the recommendation appears.","Write disclosure examples for social, video and article formats."]
],"Build an affiliate brand guide with niche, proof standards and disclosure.","Trust compounds when recommendations remain transparent."),
m("Content that converts","Conversion content answers a buyer question and creates a sensible next step.",[
["Hooks and framing","Open with a real problem, comparison or useful observation without fake shock tactics.","Write twenty honest hooks for one offer."],
["Reviews and demos","Show how the product works, who it fits, who it does not fit and what to check.","Create a review outline with proof, limitations and FAQ."],
["Calls to action","Tell the viewer exactly what to do next and what happens after clicking.","Write ten CTAs for different awareness levels."]
],"Produce a seven-piece conversion content pack.","Good affiliate content reduces buyer uncertainty before asking for the click."),
m("TikTok and short-form","Short-form content needs fast relevance, demonstration and clear disclosure while feeling native to the platform.",[
["Short-form structure","Use hook, useful explanation, proof or limitation and one CTA.","Storyboard five 20-40 second videos."],
["Series strategy","Build recurring formats so one product can be taught from multiple angles.","Design a ten-video series around one problem."],
["Comments and DMs","Answer genuine questions and move complex buying questions appropriately without spam.","Create replies for ten common comments."]
],"Create a ten-post short-form affiliate series.","Short-form reach is useful only when it attracts the right buyer."),
m("WhatsApp affiliate selling","WhatsApp works best for warm conversations, follow-up and product explanation rather than unsolicited mass messaging.",[
["Status strategy","Use educational sequences, proof and FAQs before direct offer posts.","Plan seven days of Status content."],
["One-to-one follow-up","Ask what the person needs, answer objections honestly and send the correct tracked link.","Write a five-message follow-up sequence."],
["Broadcast discipline","Use consented lists, segmentation and reasonable frequency.","Create an opt-in and opt-out process."]
],"Build a WhatsApp affiliate follow-up system.","Permission-based communication is more sustainable than message blasting."),
m("Long-form and search","Searchable articles and videos can answer detailed buyer questions and compound over time.",[
["Comparison content","Compare relevant criteria without invented rankings or hidden sponsorship.","Create a comparison table for three products."],
["Tutorial content","Teach a job that naturally uses the product so the link is relevant.","Outline a step-by-step tutorial."],
["Search intent","Match questions to informational, comparison or purchase intent.","Group thirty queries by intent and choose five priority pieces."]
],"Create one long-form review, comparison or tutorial.","Search content wins by satisfying intent, not stuffing links."),
m("Landing pages and link hubs","A landing page should organize proof, FAQs and offers while remaining transparent about the affiliate relationship.",[
["Page structure","Use headline, problem, benefit, proof, limitations, FAQ and CTA logically.","Wireframe one mobile-first affiliate landing page."],
["Link organization","Use clear labels and avoid deceptive redirect chains.","Audit every link and record the expected destination."],
["Mobile conversion","Test speed, readability, tap targets and checkout handoff on affordable phones.","Complete the funnel on mobile and list friction points."]
],"Build a landing-page blueprint and link audit.","A landing page should make the buying decision clearer."),
m("Tracking and analytics","Track the funnel so you know whether the bottleneck is attention, clicks, conversion or offer fit.",[
["UTM and link naming","Use consistent campaign labels so traffic sources can be compared.","Create a naming convention for platform, campaign and creative."],
["Funnel metrics","Measure views, qualified clicks, conversion rate, commission per click and reversals.","Build a weekly affiliate dashboard."],
["Decision rules","Set enough evidence before declaring a winner or scaling.","Write keep, improve and stop rules."]
],"Produce a performance dashboard with decision rules.","Optimize the bottleneck rather than celebrating vanity metrics."),
m("DRIGHT affiliate workflow","Use DRIGHT's referral and commission systems accurately and follow each product's current terms.",[
["Product selection","Choose offers by audience fit, product quality, price and actual commission amount.","Compare five DRIGHT offers using a scorecard."],
["Referral links","Use your assigned tracking link and test the buyer journey before promotion.","Test your own link in a clean browser session and document the steps."],
["Commission records","Reconcile successful orders, reversals and wallet records instead of relying on screenshots.","Build a weekly commission reconciliation habit."]
],"Create a DRIGHT affiliate promotion plan for one product.","Use actual order and commission records as the source of truth."),
m("Paid promotion basics","Paid traffic can lose money quickly; only use it when allowed and when tracking and economics are understood.",[
["Program permissions","Confirm whether paid social, search, brand bidding and direct linking are allowed.","Create a traffic-source permissions checklist."],
["Break-even CPA","Calculate maximum acquisition cost from commission and reversal risk.","Calculate break-even CPA for three offers."],
["Controlled tests","Start with a hypothesis, budget cap and stop rule.","Design a seven-day test without assuming profitability."]
],"Build a paid-traffic experiment sheet.","Never buy traffic until permissions and break-even math are clear."),
m("Scaling","Scaling means increasing qualified reach while economics remain acceptable.",[
["Creative scaling","Produce new hooks and formats around the same proven customer insight.","Create six new concepts without copying the original creative."],
["Channel expansion","Move to a second channel only when the message and tracking are stable.","Choose one expansion channel and define prerequisites."],
["Offer portfolio","Add complementary products so income is not dependent on one seller.","Build a three-offer ladder for the same audience."]
],"Create a scale plan with guardrails and diversification.","Scale what has evidence; do not multiply an unproven funnel."),
m("Compliance and reputation","Affiliate businesses inherit risk from the products they recommend and claims they make.",[
["Claims review","Avoid medical, financial and earnings guarantees; check rules for regulated products.","Create a pre-publish claims checklist."],
["Refund signals","High refunds can reveal poor product fit or misleading promotion.","Add refund/reversal rate to the dashboard."],
["Reputation protection","Stop promoting offers that repeatedly disappoint buyers even when commission is high.","Write product-removal criteria."]
],"Create an affiliate compliance and reputation policy.","Long-term trust is more valuable than one high-commission sale."),
m("90-day capstone","Build one evidence-driven affiliate funnel from audience research to content, tracking and iteration.",[
["Month 1: audience and offer","Research one audience, select one defensible offer and build tracking.","Complete the offer scorecard and funnel map."],
["Month 2: publish","Create useful content across one primary and one support channel.","Publish or simulate twenty pieces and track qualified clicks."],
["Month 3: improve","Review conversion, questions, reversals and creative performance.","Write a scale, reposition or stop decision based on evidence."]
],"Submit a 90-day affiliate operating plan.","The capstone measures a repeatable process, not a promised earnings result.")
],
videos:[],
visuals:[
{title:"Affiliate conversion funnel",imageUrl:"/course-012-affiliate/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Audience, useful content, qualified click, sale and commission."},
{title:"Affiliate toolkit",imageUrl:"/course-012-affiliate/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Offer scorecards, scripts, analytics and compliance checks."}
],
references:[
{label:"Google Trends",url:"https://trends.google.com/",summary:"Use search-interest patterns as one research signal, not proof of guaranteed demand.",points:["Compare terms","Check geography and seasonality"]},
{label:"Meta Ad Library",url:"https://www.facebook.com/ads/library/",summary:"Research active ad creative and positioning patterns without copying competitors.",points:["Observe patterns","Build original creative"]}
],
downloads:[],
freeTools:[
{label:"Google Trends",url:"https://trends.google.com/",summary:"Explore interest and seasonality for topics and product problems.",freeNote:"Free"},
{label:"Meta Ad Library",url:"https://www.facebook.com/ads/library/",summary:"Study currently running ads and creative angles.",freeNote:"Free public research tool"},
{label:"Canva",url:"https://www.canva.com/",summary:"Create carousels, comparison graphics and thumbnails.",freeNote:"Free plan available"},
{label:"Bitly",url:"https://bitly.com/",summary:"Organize and measure links where the affiliate program permits redirects.",freeNote:"Free plan available; check limits"},
{label:"YouTube Studio",url:"https://studio.youtube.com/",summary:"Track reach, engagement and viewer behaviour for YouTube content.",freeNote:"Free for YouTube creators"}
],
projects:[
{title:"Offer scorecard",outcome:"Five offers ranked by fit, economics and risk.",steps:["Research audience","Read program rules","Calculate commission per sale"]},
{title:"Seven-piece content pack",outcome:"Useful multi-format content for one offer.",steps:["Choose buyer questions","Create honest content","Add clear disclosure"]},
{title:"WhatsApp follow-up system",outcome:"Permission-based Status and one-to-one workflow.",steps:["Plan Status","Write replies","Create opt-out rule"]},
{title:"Analytics dashboard",outcome:"A funnel from views to commission.",steps:["Standardize links","Track clicks and sales","Set decision rules"]},
{title:"90-day capstone",outcome:"A complete measurable affiliate operating plan.",steps:["Select offer","Publish and track","Review and scale carefully"]}
],
templates:[
{label:"Affiliate Sales Toolkit",href:"/course-012-affiliate/affiliate-toolkit.md",type:"Markdown",description:"Offer scorecard, content briefs, WhatsApp scripts, disclosures and review checklist."},
{label:"Affiliate Funnel Tracker",href:"/course-012-affiliate/affiliate-tracker.csv",type:"CSV",description:"Track content, clicks, sales, commission, reversals and conversion rate."}
]};
export const course012=buildCourse(seed);
