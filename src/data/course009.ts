import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Apply the idea to a realistic Nigerian or African example, using mobile-first workflows, transparent pricing, local payment/data constraints and international opportunities where relevant.";
const seed:CourseSeed={
courseNumber:"009",slug:"ai-business-income-mastery-2026",title:"AI Business & Income Mastery 2026",
subtitle:"Turn AI into practical services, digital products, content systems and business workflows",
promise:"Learn to use AI as a productivity and business tool, not a get-rich-quick button. Research real problems, design offers, build repeatable workflows, price your work, protect client data and complete portfolio projects you can demonstrate honestly.",
accent:"ai",regionalContext:context,calculatorKind:"ai-service-profit",productPath:"/dright/store",
modules:[
m("AI business foundations","Start with a real customer problem, measurable outcome and human responsibility before choosing a tool.",[
["What AI can and cannot do","Use AI for drafting, analysis, transformation and structured assistance while checking facts, context and final quality.","List ten small-business tasks and mark which AI may assist, which need human review and which should stay human-only."],
["Income models without guarantees","Compare services, digital products, retainers and internal automation by effort, risk and repeatability.","Choose two models and write the customer, deliverable, price logic and main risk for each."],
["The value chain","Map problem, input, AI-assisted process, human QA, delivery and customer outcome.","Draw one workflow for a salon, fashion seller, school or other real business."]
],"Create a one-page AI business opportunity map.","Start from customer value and human accountability, then choose the AI tool."),
m("Responsible prompting","Good prompting is structured communication: objective, context, constraints, examples, output format and verification.",[
["Prompt anatomy","Build prompts with task, background, constraints, source material and clear output format.","Rewrite five weak prompts into structured prompts and compare results."],
["Iterative prompting","Treat the first response as a draft; critique it, add missing context and request targeted revisions.","Run a three-round prompt refinement and record what changed."],
["Verification","Check claims, calculations, names and citations against reliable sources before delivery.","Create and test a verification checklist on one AI-generated report."]
],"Build a reusable prompt template.","A strong prompt includes context plus a verification plan; AI output is not automatically correct."),
m("AI research for business","Combine search, primary sources, customer evidence and explicit uncertainty instead of asking one model to guess the market.",[
["Research questions","Turn a broad idea into specific questions about customer, competition, price, demand and distribution.","Write twelve research questions for one idea before searching."],
["Source quality","Prioritize official and recent first-party sources; separate evidence from inference.","Build a source table with five sources, dates, claims and confidence notes."],
["Customer evidence","Use reviews, support questions and interviews to learn customer language and objections.","Collect twenty real customer phrases without copying private data."]
],"Produce a short evidence-backed market brief.","Research should show what is known, assumed and still untested."),
m("AI writing services","Writing services become valuable when research, brand voice, editing and accuracy are added to AI speed.",[
["Choose a narrow service","Select a concrete offer such as product descriptions, newsletters, scripts or help-centre content.","Define scope, turnaround, exclusions and revision limit for one service."],
["Client briefing","Capture audience, tone, examples, prohibited claims, CTA and source material before drafting.","Create a client brief for a sample Nigerian SME."],
["Human editing","Rewrite AI drafts for specificity, facts, voice and original examples.","Improve one generic AI draft until every paragraph has a clear purpose."]
],"Create a three-piece writing portfolio labelled as sample work.","Clients pay for useful communication, not unedited AI text."),
m("AI content systems","Connect audience problems, content pillars, formats, approvals, publishing and measurement into one repeatable system.",[
["Content pillars","Build recurring themes from customer questions and business goals rather than chasing every trend.","Create four pillars and ten ideas under each."],
["Repurposing","Turn one strong source asset into posts, scripts, carousels, email and FAQ content.","Repurpose one article into five distinct formats."],
["Editorial workflow","Use templates, naming, approval checkpoints and calendars for consistent output.","Build a two-week calendar with owner, status and success metric."]
],"Deliver a 14-day content operating system.","Content systems optimize consistency and learning, not just volume."),
m("AI customer support","Use AI to shorten response time while keeping escalation, empathy, privacy and human control for sensitive cases.",[
["FAQ knowledge base","Turn repeated questions into approved answers with sources and escalation rules.","Draft twenty FAQ entries for one business."],
["Reply assistance","Use AI to suggest replies while staff verify order facts, refunds and promises before sending.","Design five reply templates with editable variables."],
["Escalation and safety","Route disputes, payment issues, personal data and unclear cases to a human.","Create a red-flag matrix showing what AI may answer and what must escalate."]
],"Build a support playbook with FAQ, tone guide and escalation matrix.","Automation should reduce repetitive work without removing responsibility."),
m("AI image and design workflows","Use AI for ideation, then check text accuracy, rights, brand consistency and realism before publishing.",[
["Design briefs","Define audience, format, message hierarchy, brand colours and prohibited elements before generation.","Write briefs for a banner, social post and thumbnail."],
["Generate and select","Compare multiple concepts for readability, anatomy, logos, text and cultural fit.","Create a scorecard and rank five concepts."],
["Finish in design tools","Use Canva or another editor for typography, real logos, prices and final export.","Rebuild one draft into a clean editable design."]
],"Produce a three-asset mini campaign.","AI visuals are drafts until factual and design details are checked."),
m("Spreadsheet and document automation","Standardize repetitive documents, trackers and calculations before adding complex software.",[
["Structured inputs","Separate raw inputs from calculated outputs and define required fields.","Turn one messy business process into a clean input schema."],
["AI-assisted formulas","Use AI to explain formulas, then test normal and edge cases yourself.","Build and test a simple profit tracker."],
["Document generation","Create repeatable proposals and reports from structured data with human approval.","Design a proposal template with variables and QA checklist."]
],"Build a spreadsheet-plus-document workflow.","Simple structured automation often creates more reliable value than unnecessary complexity."),
m("Service packaging and pricing","Price from scope, value, effort, risk and support instead of charging only for AI time.",[
["Scope design","Define inputs, outputs, turnaround, revisions, client responsibilities and exclusions.","Write a one-page statement of work."],
["Pricing models","Compare project, package and retainer pricing using margin and capacity.","Price three tiers and calculate delivery cost and retained margin."],
["Proof without hype","Use samples, transparent process and measured case studies; avoid guaranteed earnings claims.","Write a sales-page proof section without invented results."]
],"Create a three-tier service menu.","Price the outcome and scope while protecting delivery quality."),
m("Client acquisition","Use targeting, helpful outreach, proof, follow-up and qualification rather than mass spam.",[
["Ideal client profile","Choose businesses with a visible problem, ability to pay and a workflow you can improve.","Build a 25-company prospect list with one observed problem each."],
["Personalized outreach","Reference a real observation, useful insight and small next step.","Write versions for email, LinkedIn and WhatsApp."],
["Discovery calls","Ask about process, volume, pain, cost, decision maker and success criteria before pitching.","Create and role-play a ten-question discovery script."]
],"Build a compliant 30-prospect outreach campaign.","Relevant respectful outreach beats high-volume spam."),
m("Delivery operations","Professional delivery needs file organization, milestones, approvals, deadlines and a definition of done.",[
["Project setup","Create folders, naming rules, milestones and communication checkpoints.","Set up a sample project workspace."],
["Quality assurance","Check facts, formatting, links, brand voice and client requirements before handoff.","Run a QA checklist and record defects."],
["Revision control","Separate corrections from new scope and record approved changes.","Create a revision log."]
],"Complete a mock client project from brief to handoff.","Reliable operations turn AI speed into a professional service."),
m("Data privacy and security","Do not paste secrets, payment data or confidential customer records into tools without a suitable data basis.",[
["Data classification","Separate public, internal, confidential and highly sensitive information.","Classify twenty data examples and decide what may enter an external AI tool."],
["Consent and contracts","Explain tool use and data handling expectations when client information is involved.","Draft a plain-language AI/data clause."],
["Account security","Use MFA, least privilege, unique passwords and controlled sharing.","Audit a sample tool stack and remove unnecessary access."]
],"Create an AI-data safety policy.","Do not trade customer privacy or account security for convenience."),
m("Selling digital AI products","AI may speed production, but products still need original value, instructions, testing and support.",[
["Product selection","Choose templates, prompt systems or checklists that help one user complete one job.","Score ten ideas for pain, specificity and repeatability."],
["Production","Combine AI drafting with original structure, examples and testing.","Create a minimum viable toolkit and test every instruction."],
["Listing and support","Explain exactly what is included, who it is for, limitations and delivery.","Write a transparent listing and five support answers."]
],"Build one small sellable AI-assisted toolkit.","The seller remains responsible for usefulness, originality and claims."),
m("Measurement and improvement","Track leads, conversion, delivery hours, refunds, customer outcomes and contribution profit.",[
["Business dashboard","Monitor the few numbers that explain acquisition, delivery and profit.","Build a weekly dashboard with metric definitions."],
["Customer feedback","Ask structured questions about usefulness, clarity and missing value.","Create a five-question post-delivery survey."],
["Process experiments","Change one major variable at a time and document the result.","Design three 30-day experiments with hypothesis and stop rule."]
],"Create a monthly review dashboard and improvement backlog.","The goal is a learning business system, not constant tool switching."),
m("90-day capstone","Combine research, offer design, workflow, pricing, outreach, delivery and measurement into a controlled launch.",[
["Weeks 1-2: validate","Interview or observe the market, build a sample and test whether the problem is urgent.","Complete five customer conversations or evidence reviews."],
["Weeks 3-6: sell and deliver","Run focused outreach and only close work you can deliver well.","Track every lead, proposal, delivery hour and response."],
["Weeks 7-12: improve","Refine offer, templates and price from evidence before adding more services.","Write a before/after operating review with next-quarter decisions."]
],"Submit a 90-day AI business launch portfolio.","Success is disciplined execution and learning, not a guaranteed income number.")
],
videos:[
{module:2,title:"Edtech Student Onboarding Automation with n8n, Google Workspace & Airtable",url:"https://www.youtube.com/watch?v=SPWxIdR2bO4",description:"Practical Nigerian automation build showing how several business tools can be connected into one workflow.",region:"Nigerian English • Practical"},
{module:10,title:"Can AI Get Me a Client in 30 Days? Claude + Apify Experiment",url:"https://www.youtube.com/watch?v=_XQBjFsLD_c",description:"A real-world client-acquisition experiment useful for studying AI research, prospecting and evidence instead of assuming results.",region:"Nigerian English • Practical"},
{module:1,title:"He Lost His Job Trying to Learn AI Automation — Was It Worth It?",url:"https://www.youtube.com/watch?v=gacc13V48oc",description:"Career-focused discussion about learning AI automation, trade-offs and realistic expectations.",region:"Nigerian English • Practical"},
{module:6,title:"AI Sales Coaching System with n8n, Claude & Slack",url:"https://www.youtube.com/watch?v=fkteDCvD9Kc",description:"Workflow example for reviewing calls and turning AI analysis into a repeatable business process.",region:"Nigerian English • Practical"},
{module:2,title:"Connect Claude Code to n8n — Beginner Tutorial",url:"https://www.youtube.com/watch?v=dLNY42qm9Uc",description:"Hands-on introduction to connecting an AI coding assistant with an automation workflow.",region:"Nigerian English • Practical"},
{module:9,title:"How To Start an AI Automation Agency — Beginners Guide",url:"https://www.youtube.com/watch?v=Dgs1tQngbec",description:"Agency model overview covering offer selection, automation services and client acquisition.",region:"International English • Practical"},
{module:8,title:"ChatGPT for Automation in Business and Personal Tasks",url:"https://www.youtube.com/watch?v=RcCFDnq-in4",description:"Shows practical ways to use ChatGPT in repeatable business and productivity workflows.",region:"International English • Practical"},
{module:5,title:"How to Use ChatGPT Work — AI Workflow Automation Guide 2026",url:"https://www.youtube.com/watch?v=lmFAhaTNiZQ",description:"Current workflow-oriented tutorial for structuring AI-assisted work.",region:"International English • Practical"},
{module:5,title:"How to Use ChatGPT for Business Automation — Step-by-Step 2026",url:"https://www.youtube.com/watch?v=-u02gYtNLjw",description:"Beginner workflow tutorial focused on business automation with AI.",region:"International English • Practical"},
{module:9,title:"How To Actually Start an AI Automation Agency — Beginners Guide",url:"https://www.youtube.com/watch?v=q0g7Bl59QbY",description:"Practical agency-building walkthrough; learners should validate every earnings or market claim independently.",region:"International English • Practical"}
],
visuals:[
{title:"AI business workflow",imageUrl:"/course-009-ai-business/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Problem, workflow, human QA and customer outcome before tool choice."},
{title:"AI toolkit and projects",imageUrl:"/course-009-ai-business/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Projects, templates, calculators and free/easy practice tools."}
],
references:[
{label:"Google free AI tools guide",url:"https://cloud.google.com/use-cases/free-ai-tools",summary:"Official Google overview of AI Studio, NotebookLM and other free-usage AI tools.",points:["Free usage has limits","Availability can vary"]},
{label:"GitHub Copilot plans",url:"https://github.com/features/copilot/plans",summary:"Official plan page showing a limited Copilot Free tier for coding practice.",points:["Check current limits","Use client code responsibly"]}
],
downloads:[],
freeTools:[
{label:"ChatGPT",url:"https://chatgpt.com/",summary:"Draft, analyze, brainstorm and structure work; verify important outputs.",freeNote:"Free access available with limits"},
{label:"Google Gemini",url:"https://gemini.google.com/",summary:"General AI assistant for research, drafting and multimodal work.",freeNote:"Free access in supported regions"},
{label:"Google AI Studio",url:"https://aistudio.google.com/",summary:"Experiment with Gemini models and structured prompts.",freeNote:"Free usage within published limits"},
{label:"NotebookLM",url:"https://notebooklm.google.com/",summary:"Ground research and study on sources you provide.",freeNote:"Free plan with usage limits"},
{label:"Canva",url:"https://www.canva.com/",summary:"Finish proposals, social designs and simple digital products.",freeNote:"Free plan available"}
],
projects:[
{title:"AI service offer",outcome:"A narrow priced service with a real business use case.",steps:["Choose one customer segment","Build a sample deliverable","Price from scope and margin"]},
{title:"AI content system",outcome:"A two-week content engine with prompts and QA.",steps:["Define content pillars","Create reusable prompts","Build approval and publishing steps"]},
{title:"Customer-support playbook",outcome:"FAQ, reply system and escalation matrix.",steps:["Collect repeated questions","Draft approved answers","Mark human-only cases"]},
{title:"Digital AI toolkit",outcome:"A small original product ready for testing.",steps:["Pick one job-to-be-done","Build templates and instructions","Test with a user"]},
{title:"90-day launch capstone",outcome:"A documented AI business launch plan and evidence portfolio.",steps:["Validate","Sell and deliver","Review metrics and improve"]}
],
templates:[
{label:"AI Business Toolkit",href:"/course-009-ai-business/ai-business-toolkit.md",type:"Markdown",description:"Offer canvas, prompt framework, QA checklist, outreach and client-brief templates."},
{label:"AI Business Metrics Tracker",href:"/course-009-ai-business/ai-business-tracker.csv",type:"CSV",description:"Track leads, sales, delivery hours, costs and contribution profit."}
]};
export const course009=buildCourse(seed);
