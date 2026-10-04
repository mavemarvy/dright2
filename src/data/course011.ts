import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use realistic Nigerian and African freelancer constraints: mobile-first access, power/data costs, international time zones, platform fees, honest identity, and cross-border client communication. Never teach fake location, fake credentials, account renting or platform-rule evasion.";
const seed:CourseSeed={
courseNumber:"011",slug:"fiverr-upwork-freelancing-mastery-2026",title:"Fiverr & Upwork Freelancing Mastery 2026",
subtitle:"Choose a sellable skill, build proof, price professionally and win international clients without fake credentials",
promise:"Learn a realistic freelancing operating system for Nigerians and Africans: skill selection, portfolio creation, profiles, gigs, proposals, discovery, contracts, delivery, reviews, scam avoidance, international communication and AI-assisted productivity.",
accent:"freelance",regionalContext:context,calculatorKind:"freelance-rate",productPath:"/dright/store",
modules:[
m("Freelancing economics","Freelancing is a service business with acquisition, delivery, platform fees, non-billable time and reputation risk.",[
["How platforms make money","Understand seller fees, Connects/credits, payment protection and why current platform rules affect your rate.","Read the current fee pages for your platform and record every cost that affects take-home pay."],
["Gross billing versus income","Separate client billing from platform fees, software, data, electricity, taxes and unpaid sales time.","Use the course calculator to turn a monthly target into a realistic rate."],
["Professional identity","Use your real identity, skills and location; build trust with proof instead of fabricated experience.","Write a truthful two-sentence positioning statement."]
],"Create a personal freelance business model with income target, costs, capacity and one service focus.","Treat freelancing as a business with transparent identity and measurable economics."),
m("Choose a sellable service","The best beginner offer is specific enough to practise, demonstrate and deliver reliably.",[
["Skill inventory","Map what you can already do, what can be learned quickly and what buyers repeatedly request.","List twenty skills and narrow to three using demand, ability and proofability."],
["Narrow the outcome","Turn broad labels like design or writing into a concrete result for a customer type.","Rewrite three broad skills into narrow offers."],
["Market evidence","Inspect real jobs and gigs for requirements, pricing language and recurring buyer problems.","Collect twenty relevant listings and summarize common requirements."]
],"Choose one primary service and one backup service with evidence.","A focused service is easier to position, practise and sell."),
m("Portfolio before clients","You can prove ability with honest sample work without pretending it was paid client work.",[
["Design sample briefs","Create realistic briefs that force the same decisions a real client would require.","Write three sample briefs at increasing difficulty."],
["Case-study format","Show problem, approach, deliverable and what would be measured without inventing performance.","Turn one sample into a one-page case study."],
["Mobile presentation","Use clear thumbnails, short explanations and files that are easy to review on a phone.","Build a three-piece portfolio folder or page."]
],"Publish a truthful three-piece portfolio labelled as sample work where relevant.","Proof of process and skill is more credible than fake client logos or results."),
m("Upwork profile","A strong profile makes the service, target client and proof immediately understandable.",[
["Headline and overview","Lead with specialty and outcome, then explain process and proof in plain English.","Write three headlines and one concise overview."],
["Skills and portfolio","Choose skills that match the jobs you actually want and attach focused examples.","Align each portfolio item to one target job type."],
["Rate and availability","Set a rate that can support delivery quality and fees, then adjust with evidence.","Write your minimum acceptable project economics."]
],"Complete an Upwork profile draft with headline, overview, portfolio and rate rationale.","Profile positioning should match the exact work you want to win."),
m("Upwork job selection","Selective applications protect Connects, time and morale.",[
["Read the client","Check payment history, hire rate, scope, budget, feedback and clarity before applying.","Score ten job posts and choose the best three."],
["Fit and risk","Decide whether you can produce the requested outcome, timeline and communication standard.","Create a no-bid checklist for risky jobs."],
["Application routine","Apply when you can write a useful proposal, not just because the job is new.","Set a daily maximum for high-quality applications."]
],"Build a job-scoring sheet and use it to select five high-fit opportunities.","Proposal quality begins with job selection."),
m("Upwork proposals","A proposal should prove that you understood the problem and can take a sensible first step.",[
["Opening lines","Reference the actual goal or risk instead of starting with biography.","Write five job-specific openings."],
["Evidence and plan","Use one relevant example plus a short approach instead of a long generic letter.","Draft a concise proposal with evidence and next steps."],
["Questions and CTA","Ask one or two useful questions that reveal scope and make replying easy.","Create ten discovery questions for your service."]
],"Write five tailored proposals for five real or archived job descriptions.","A proposal should reduce uncertainty for the client."),
m("Fiverr gig strategy","Fiverr works better when one gig solves one recognizable buyer problem and packages are easy to compare.",[
["Gig positioning","Use a clear title and category that match buyer intent without keyword stuffing.","Draft three gig titles and choose the clearest."],
["Packages","Separate Basic, Standard and Premium by scope, turnaround or complexity.","Create three packages with deliverables and revision limits."],
["Gallery and FAQ","Use original visuals, honest examples and answers that reduce pre-order confusion.","Plan three gallery assets and ten FAQ answers."]
],"Build one complete Fiverr gig draft.","Clear scope makes a service easier to buy and deliver."),
m("Pricing and scope control","Underpricing can make quality unsustainable and attract work that does not fit.",[
["Fixed versus hourly","Choose the model based on uncertainty, scope stability and client expectations.","Price the same project both ways and compare risk."],
["Revision limits","Define what counts as revision versus new scope.","Write a plain-language revision clause."],
["Milestones","Break larger work into reviewable stages to reduce ambiguity.","Design milestones for a four-week project."]
],"Create a pricing sheet with hourly, fixed and retainer examples.","Price must cover both visible work and hidden delivery costs."),
m("Discovery and communication","Clear communication prevents more problems than perfect grammar.",[
["Discovery call","Ask about goal, audience, current process, constraints, deadline and decision maker.","Role-play a 15-minute discovery call."],
["Written updates","Send short updates with completed work, blocker, next step and required client decision.","Write a status-update template."],
["Time zones and boundaries","Set response windows and meeting times that work internationally without 24/7 availability.","Create a communication policy."]
],"Produce a client communication kit.","Professional clarity matters more than pretending to be in another country."),
m("Delivery and quality","Repeatable delivery turns one job into reviews, repeat work and referrals.",[
["Definition of done","Translate the brief into acceptance criteria before starting.","Create a checklist for your service."],
["Version control","Use filenames, backups and change logs so feedback does not create confusion.","Set up a sample delivery folder."],
["Handoff","Explain what is delivered, how to use it, limitations and next steps.","Write a professional handoff message."]
],"Complete a mock project from brief through QA and handoff.","Delivery quality includes organization and communication."),
m("Reviews, repeat work and retainers","Freelance income improves when satisfied clients return instead of every month starting from zero.",[
["Review requests","Ask for honest feedback after successful delivery without pressure.","Write an ethical review request."],
["Expansion opportunities","Recommend additional work only when it solves an observed need.","Create a post-project opportunity checklist."],
["Retainer design","Package recurring tasks around predictable scope and reporting.","Design one retainer with limits, price and monthly report."]
],"Create a client-retention plan.","Retention should come from continued value, not aggressive upselling."),
m("Scam and account safety","Freelancers face phishing, suspicious attachments, fake support messages and off-platform payment pressure.",[
["Scam patterns","Recognize overpayment stories, credential requests, strange files and urgent payment changes.","Build a red-flag checklist."],
["Platform rules","Follow current contact and payment rules instead of risking account restrictions.","Read one current policy and summarize three important rules."],
["Safe access","Use malware scanning, separate client accounts and least-privilege permissions.","Create a secure access-request process."]
],"Produce a freelancer security checklist.","No opportunity is worth bypassing basic security or platform rules."),
m("AI-assisted freelancing","AI can speed research and drafting while the freelancer remains responsible for confidentiality, originality and final quality.",[
["AI for proposals","Use AI to critique or shorten a proposal after you understand the job, not to mass-generate applications.","Draft manually, then use AI to improve one proposal."],
["AI for delivery","Use AI only on steps where client data and permissions make it appropriate.","Map safe and unsafe AI steps for your service."],
["Disclosure and QA","Follow client requirements and never misrepresent AI-assisted work.","Write an internal AI-use policy."]
],"Build an AI-assisted workflow with human review.","AI should improve delivery without misrepresenting how work was produced."),
m("Beyond the platforms","A healthy freelance business can add referrals, authority content and direct clients while respecting platform terms.",[
["Personal brand","Share useful lessons and sample case studies without exposing confidential client information.","Create a four-week authority-content plan."],
["Referral system","Ask satisfied clients for introductions respectfully.","Write a referral request and thank-you process."],
["Direct pipeline","Build compliant outreach around a narrow service and proof.","Create a 25-prospect outreach list separate from platform clients."]
],"Create a diversified client acquisition plan.","Build multiple ethical sources of demand rather than depending on one algorithm."),
m("90-day capstone","Turn skill practice into a professional portfolio and measurable client pipeline.",[
["Month 1: proof","Finish portfolio, profiles and pricing before chasing application volume.","Publish three samples and complete profiles."],
["Month 2: applications","Use job scoring and targeted proposals while tracking responses.","Track twenty high-fit applications and outcomes."],
["Month 3: delivery and retention","Deliver professionally, request feedback and refine the offer.","Review win rate, pricing, hours and next steps."]
],"Submit a 90-day freelancing operating portfolio.","Consistency is measured by quality actions and learning, not application volume.")
],
videos:[
{module:1,title:"How to Start Freelancing from Zero in 2026 — Fiverr & Upwork Beginner Guide",url:"https://www.youtube.com/watch?v=T69sWShK5JU",description:"Beginner roadmap covering service choice, profiles, portfolios, proposals and first-client strategy.",region:"English • 2026 • Beginner"}
],
visuals:[
{title:"Freelance client pipeline",imageUrl:"/course-011-freelancing/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Skill, proof, profile, proposal, delivery and retention."},
{title:"Freelancing toolkit",imageUrl:"/course-011-freelancing/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Rate planning, proposal templates and client tracking."}
],
references:[
{label:"Upwork 2026 free-plan guide",url:"https://www.upwork.com/resources/is-upwork-free",summary:"Official Upwork overview of free joining, Basic features and current fees.",points:["Fees and Connects can change","Use current platform terms"]},
{label:"Upwork freelancer getting started",url:"https://support.upwork.com/hc/en-us/articles/211067578-How-to-get-started-as-a-freelancer-on-Upwork",summary:"Official onboarding guidance for profiles, skills and starting work.",points:["Complete a strong profile","Follow platform rules"]},
{label:"Fiverr seller start",url:"https://www.fiverr.com/start_selling",summary:"Official Fiverr seller entry point and current marketplace categories.",points:["Use real skills and identity","Scope gigs clearly"]}
],
downloads:[],
freeTools:[
{label:"Upwork",url:"https://www.upwork.com/",summary:"International work marketplace for profiles, proposals and contracts.",freeNote:"Free Basic plan; some actions have fees"},
{label:"Fiverr",url:"https://www.fiverr.com/",summary:"Create packaged services and receive marketplace orders.",freeNote:"Free account; seller fees apply"},
{label:"Canva",url:"https://www.canva.com/",summary:"Build portfolio covers, case studies and client presentations.",freeNote:"Free plan available"},
{label:"Google Docs",url:"https://docs.google.com/",summary:"Draft proposals, briefs and writing samples with shareable permissions.",freeNote:"Free with a Google account"},
{label:"Notion",url:"https://www.notion.so/",summary:"Organize portfolio pages, SOPs and project trackers.",freeNote:"Free plan available"}
],
projects:[
{title:"Three-piece portfolio",outcome:"Honest sample work targeted to one service.",steps:["Create sample briefs","Do the work","Write case-study explanations"]},
{title:"Upwork profile + proposal set",outcome:"A focused profile and five tailored proposals.",steps:["Position profile","Score jobs","Write specific proposals"]},
{title:"Fiverr gig",outcome:"One complete gig with packages and requirements.",steps:["Choose buyer intent","Package scope","Create gallery and FAQ"]},
{title:"Client delivery simulation",outcome:"A full mock project from brief to handoff.",steps:["Kickoff","Deliver with QA","Handle one revision"]},
{title:"90-day capstone",outcome:"A measurable portfolio-to-client operating system.",steps:["Build proof","Apply selectively","Review wins and losses"]}
],
templates:[
{label:"Freelancer Client Kit",href:"/course-011-freelancing/freelancer-client-kit.md",type:"Markdown",description:"Proposal, discovery, kickoff, update, revision and handoff templates."},
{label:"Application & Earnings Tracker",href:"/course-011-freelancing/freelance-tracker.csv",type:"CSV",description:"Track applications, replies, interviews, jobs, hours, fees and net earnings."}
]};
export const course011=buildCourse(seed);
