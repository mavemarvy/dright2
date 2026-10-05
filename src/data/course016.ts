import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use Nigerian and African client examples while keeping the service globally competitive. Teach truthful portfolios, clear contracts, source verification, confidentiality and professional English without pretending to have credentials, locations or clients that do not exist.";
const seed:CourseSeed={
courseNumber:"016",slug:"ghostwriting-freelance-writing-income-mastery-2026",title:"Ghostwriting & Freelance Writing Income Mastery 2026",
subtitle:"Research, write, edit and sell books, articles, newsletters, scripts and thought-leadership services professionally",
promise:"Learn ghostwriting as a professional client service: niche selection, research, interviews, voice matching, outlining, drafting, editing, pricing, contracts, confidentiality, client acquisition and retainers. Build an honest portfolio and repeatable writing system instead of relying on generic AI output.",
accent:"writing",regionalContext:context,calculatorKind:"ghostwriting-quote",productPath:"/dright/store",
modules:[
m("Ghostwriting foundations","Ghostwriting means creating work in another person's voice or under agreed authorship terms; it requires trust, research and clear scope.",[
["What ghostwriters deliver","Compare books, articles, speeches, newsletters, social posts and scripts by depth and client involvement.","Choose two formats and describe the typical deliverables and risks."],
["Authorship and ethics","Understand agreed credit, confidentiality and the difference between legitimate ghostwriting and academic cheating or impersonation.","Write a service boundary explaining work you will and will not accept."],
["Business economics","Separate research, interviews, drafting, revisions and project management when estimating effort.","Use the course quote calculator on three sample projects."]
],"Create a one-page ghostwriting business model.","Trust, scope and authorship terms should be clear before writing begins."),
m("Choose a profitable writing niche","A niche helps you research faster, understand buyer expectations and build relevant proof.",[
["Niche options","Compare business thought leadership, books, newsletters, scripts, blogs and executive content.","Score five niches by interest, demand, proofability and complexity."],
["Client types","Map founders, coaches, professionals, agencies, creators and organizations to the writing outcomes they buy.","Choose one primary client type and list ten likely needs."],
["Positioning statement","Explain who you help, what you write and what makes the process reliable.","Write three positioning statements and choose the clearest."]
],"Choose a niche and target-client profile with evidence.","Specific positioning makes proof and outreach easier."),
m("Research systems","Strong ghostwriting depends on reliable source material, not confident-sounding filler.",[
["Source plan","Separate primary sources, client materials, interviews and external research.","Create a source plan for one sample article or chapter."],
["Fact log","Record names, dates, claims, links and uncertainty so facts can be checked later.","Build a fact log with ten entries."],
["Citation and source notes","Even when the final piece has no formal citations, keep internal evidence for factual claims.","Create a research folder with source notes and dates."]
],"Produce a research pack for one sample project.","A ghostwriter should be able to trace important factual claims back to evidence."),
m("Client interviews","Interviews capture stories, opinions, language and details that cannot be invented responsibly.",[
["Interview preparation","Review the brief and research before asking questions so the session goes beyond basics.","Write fifteen interview questions grouped by topic."],
["Follow-up questions","Listen for vague statements, timelines, examples and emotional detail that need clarification.","Turn five weak answers into stronger follow-up questions."],
["Interview notes","Organize quotes, facts, stories and open questions immediately after the call.","Create an interview-note template and summarize a mock interview."]
],"Run or simulate one structured client interview and produce clean notes.","The best interview questions uncover specific experience and language."),
m("Voice and tone matching","Voice matching is pattern analysis, not copying phrases mechanically.",[
["Voice samples","Collect approved writing or recordings and identify sentence length, vocabulary, humour, formality and rhythm.","Analyze two voice samples using a scorecard."],
["Voice guide","Turn observations into practical do/don't rules and example sentences.","Create a one-page voice guide."],
["Consistency test","Rewrite the same paragraph in three distinct voices and compare.","Produce a client-voice sample for approval before a long project."]
],"Create a voice guide and approved sample page.","Voice should be documented so consistency does not depend on memory."),
m("Outlining books and long-form work","An outline is a delivery and thinking tool that prevents expensive structural rewrites later.",[
["Outcome-based chapters","Give each chapter one job and a clear reader transformation or question.","Outline ten chapters with one-sentence outcomes."],
["Story and evidence placement","Assign stories, examples, frameworks and research to specific sections.","Create a source-to-chapter map."],
["Approval gates","Get structure approval before full drafting where the project is large.","Write an outline-approval message and change process."]
],"Create a complete long-form outline with chapter outcomes and source map.","Approve structure before investing heavily in prose."),
m("Drafting clear prose","Professional drafts prioritize reader need, specificity and flow over impressive vocabulary.",[
["Strong openings","Open with a specific tension, story, claim or useful promise appropriate to the format.","Write five different openings for one topic."],
["Paragraph logic","Use one main idea per paragraph with evidence, example or transition.","Edit one page so every paragraph has a clear function."],
["Examples and specificity","Replace vague advice with concrete situations, numbers or steps when evidence supports them.","Rewrite ten generic sentences into specific ones."]
],"Produce a polished 1,000-word sample in the client's voice.","Clear specific writing beats ornamental writing."),
m("Editing and revision","Editing happens at structural, paragraph, sentence and proofreading levels; mixing them wastes time.",[
["Developmental edit","Check argument, sequence, missing evidence and repetition before line edits.","Run a structural edit on one sample."],
["Line edit","Improve clarity, rhythm, transitions and word choice without changing meaning unnecessarily.","Line-edit 500 words and explain five changes."],
["Proofread","Check grammar, punctuation, names, numbers, formatting and links after major changes stop.","Create and run a proofread checklist."]
],"Deliver before/after editing evidence for one sample.","Edit from big structural problems down to small surface errors."),
m("Articles, newsletters, thought leadership and scripts","Shorter recurring formats need strong positioning, consistent cadence and useful point of view.",[
["Thought-leadership angle","Start from a real experience, observation or argument the client can defend.","Turn five generic topics into specific angles."],
["Newsletter structure","Combine hook, useful idea, example and CTA in a repeatable format.","Draft a four-edition newsletter plan."],
["Repurposing and scripts","Adapt approved source material into posts, newsletters or spoken scripts without distorting the message; write scripts for the ear with visual beats.","Create a repurposing matrix and a three-minute video-script outline from one approved article."]
],"Build a one-month thought-leadership package.","Recurring content should deepen a point of view, not repeat slogans."),
m("Pricing and proposals","A quote should reflect word count, research, interview load, revisions, timeline and risk.",[
["Estimate effort","Break the project into discovery, research, draft, edit, revision and management.","Estimate hours for three project types."],
["Quote structure","Use per-word, project, milestone or retainer pricing only when it fits scope.","Create three quote options using the calculator."],
["Proposal","Explain outcome, process, timeline, deliverables, exclusions and payment schedule.","Write a two-page proposal for a sample client."]
],"Create a professional quote and proposal pack.","Price the complete project process, not typing speed."),
m("Contracts and confidentiality","Written agreements reduce misunderstanding around ownership, payment, revisions and confidential information.",[
["Scope clauses","Define deliverables, length range, milestones and revision rounds.","Draft a plain-language scope section."],
["Rights and credit","State when rights transfer, whether attribution exists and how portfolio use is handled.","Write three authorship/portfolio options."],
["Confidentiality","Protect private interviews, unpublished manuscripts and business information.","Create a confidentiality checklist for file and tool handling."]
],"Build a contract checklist to review with appropriate professional advice.","Confidentiality and rights should be explicit before sensitive work begins."),
m("Finding clients","Client acquisition should demonstrate relevance and proof rather than sending generic mass pitches.",[
["Portfolio targeting","Show samples close to the format and industry you want to sell.","Choose three portfolio pieces for one target client type."],
["Warm outreach","Use referrals, communities and existing relationships where appropriate.","Write a helpful referral request."],
["Cold outreach","Reference a real content gap or opportunity and offer a small next step.","Create twenty personalized prospect notes and three outreach templates."]
],"Build a 30-prospect acquisition pipeline with follow-up dates.","Relevant proof and respectful follow-up outperform generic spam."),
m("Retainers and operations","Recurring writing work needs capacity planning, editorial calendars and predictable approvals.",[
["Retainer scope","Define monthly quantity, meeting time, turnaround and revision limits.","Design one retainer at three service levels."],
["Editorial calendar","Plan topics, source interviews, draft dates and approval deadlines.","Create a four-week calendar."],
["Capacity and delegation","Know the number of clients you can serve without quality dropping.","Calculate monthly writing and editing capacity."]
],"Create a retainer operating system with capacity limits.","Recurring revenue is valuable only when delivery remains sustainable."),
m("AI-assisted writing responsibly","AI can support ideation, transcription cleanup, outlines and editing, but confidential data and client expectations matter.",[
["Safe AI tasks","Separate low-risk brainstorming from sensitive client information or unpublished material.","Create an AI-use matrix for your workflow."],
["Human originality","Use AI drafts only as raw material; preserve client experience, verified facts and original structure.","Compare an AI draft with a human-rewritten version and explain improvements."],
["Client policy","Follow client contracts and disclose AI use when required.","Write an internal and client-facing AI policy."]
],"Build an AI-assisted writing SOP with privacy and QA gates.","AI should support professional judgment, not replace source truth or authorship agreements."),
m("90-day ghostwriting capstone","Build proof, acquisition and delivery systems around one focused writing niche.",[
["Month 1: portfolio","Create three samples, voice guide and proposal package.","Finish the portfolio and pricing system."],
["Month 2: outreach","Run targeted outreach and track conversations, proposals and objections.","Complete thirty high-fit outreach attempts."],
["Month 3: delivery","Complete a mock or real permitted project using the full research-to-handoff system.","Review hours, quality, feedback and next pricing decision."]
],"Submit a complete ghostwriting business portfolio.","The capstone proves a professional process, not guaranteed client income.")
],
videos:[
{module:1,title:"Ghostwriting Income Generator — Writing for Foreign Platforms",url:"https://www.youtube.com/watch?v=Dpmo1uwNpk4",description:"Nigerian ghostwriting overview; treat earnings claims as examples and focus on the writing/client workflow.",region:"Nigerian English • Practical"},
{module:13,title:"Ghostwriting for Beginners — Earn From Ghostwriting",url:"https://www.youtube.com/watch?v=JL6CWQ7u-EE",description:"Nigeria-focused ghostwriting introduction and client-acquisition orientation; no income is guaranteed.",region:"Nigerian English • Practical"},
{module:1,title:"How I'd Approach Ghostwriting in Nigeria With No Experience",url:"https://www.youtube.com/watch?v=d0GxtdoogvA",description:"Beginner Nigerian ghostwriting roadmap covering services, pricing and foreign-client positioning.",region:"Nigerian English • Practical"},
{module:1,title:"From Classroom Teacher to Writing Stories for Foreign Companies",url:"https://www.youtube.com/watch?v=dzmvxR2RYjE",description:"Nigerian case-study lesson explaining story ghostwriting and how the work functions.",region:"Nigerian English • Practical"},
{module:2,title:"Fiverr Writing Crash Course for Beginners in Nigeria",url:"https://www.youtube.com/watch?v=bI6TlCEQRm4",description:"Long-form Nigerian freelance-writing course covering samples, article/eBook work and client marketplace setup; skip any outdated account-evasion tactics and follow current platform rules.",region:"Nigerian English • Practical"},
{module:1,title:"Ghostwriting for Beginners 2026 — How Writing for Others Works",url:"https://www.youtube.com/watch?v=tq5sY6pGg_E",description:"Modern beginner overview covering services, portfolio, voice, pricing, clients, AI and confidentiality.",region:"International English • Practical"},
{module:4,title:"How to Become a Ghostwriter — Tips from a Full-Time Ghostwriter",url:"https://www.youtube.com/watch?v=tFarGdbayKc",description:"Interview-style practical lesson on client work, voice, qualifications and scheduling.",region:"International English • Practical"},
{module:13,title:"How to Find Clients as a Ghostwriter",url:"https://www.youtube.com/watch?v=nWkjPjkFbJo",description:"Client-acquisition discussion covering outreach and a professional ghostwriting process.",region:"International English • Practical"},
{module:1,title:"The Basics of Ghostwriting for Writers",url:"https://www.youtube.com/watch?v=2ZYf8ufhe1o",description:"Ghostwriting fundamentals including who hires writers, job sources and career considerations.",region:"International English • Practical"},
{module:1,title:"Ghostwriting 101 for Beginner Ghostwriters",url:"https://www.youtube.com/watch?v=uw1zRLVlClk",description:"Beginner step-by-step introduction to ghostwriting and freelance-writing opportunities.",region:"International English • Practical"}
],
visuals:[
{title:"Ghostwriting workflow",imageUrl:"/course-016-ghostwriting/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Research, interview, voice, outline, draft, edit and deliver."},
{title:"Writer toolkit",imageUrl:"/course-016-ghostwriting/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Briefs, proposals, voice guides, revision logs and pricing."}
],
references:[
{label:"Upwork Writing & Translation marketplace",url:"https://www.upwork.com/freelance-jobs/writing/",summary:"Use current marketplace demand as one research source for writing-service requirements and pricing context.",points:["Do not copy proposals","Check current fees and rules"]},
{label:"Zotero",url:"https://www.zotero.org/",summary:"Free research and source-management tool useful for evidence-heavy writing projects.",points:["Save source metadata","Keep client research organized"]}
],
downloads:[],
freeTools:[
{label:"Google Docs",url:"https://docs.google.com/",summary:"Draft, comment, suggest edits and collaborate with clients.",freeNote:"Free with a Google account"},
{label:"LanguageTool",url:"https://languagetool.org/",summary:"Grammar and style checking across multiple languages and English variants.",freeNote:"Free version available"},
{label:"Grammarly",url:"https://www.grammarly.com/",summary:"Writing feedback and grammar support; still review every suggestion yourself.",freeNote:"Free plan available"},
{label:"Hemingway Editor",url:"https://hemingwayapp.com/",summary:"Readability-focused editing workflow; current AI Plus features may require trial or subscription.",freeNote:"Use available free/trial features; check current plan"},
{label:"Zotero",url:"https://www.zotero.org/",summary:"Collect, tag and cite research sources.",freeNote:"Free and open source"}
],
projects:[
{title:"Voice-matching portfolio",outcome:"A documented voice guide plus sample writing.",steps:["Analyze sources","Create voice rules","Write and compare sample"]},
{title:"Long-form outline",outcome:"A book or guide structure with source map.",steps:["Define chapter outcomes","Place stories/evidence","Prepare approval gate"]},
{title:"Thought-leadership pack",outcome:"One article, newsletter and repurposed social set.",steps:["Choose angle","Draft and edit","Repurpose carefully"]},
{title:"Proposal + contract pack",outcome:"Professional scope, quote and client process.",steps:["Estimate effort","Price project","Define rights and revisions"]},
{title:"90-day capstone",outcome:"Portfolio-to-client operating system.",steps:["Build proof","Run targeted outreach","Deliver and review"]}
],
templates:[
{label:"Ghostwriting Client Kit",href:"/course-016-ghostwriting/ghostwriting-toolkit.md",type:"Markdown",description:"Brief, interview, voice guide, outline, proposal, revision and handoff templates."},
{label:"Writing Project Tracker",href:"/course-016-ghostwriting/ghostwriting-tracker.csv",type:"CSV",description:"Track prospects, word counts, hours, milestones, fees, revisions and payment."}
]};
export const course016=buildCourse(seed);
