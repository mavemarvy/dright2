import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use Nigerian and African creator examples while targeting global audiences where relevant. Teach original, rights-cleared and useful content. AI-assisted or faceless production must not become mass-produced reused content, copyright infringement, impersonation or a promise of monetization.";
const seed:CourseSeed={
courseNumber:"018",slug:"youtube-ai-automation-faceless-channel-mastery-2026",title:"YouTube AI Automation & Faceless Channel Mastery 2026",
subtitle:"Research, script, produce, edit and grow original faceless videos with AI-assisted workflows and policy-safe monetization",
promise:"Build a faceless YouTube production system that uses AI to assist research, scripting, voice, visuals and workflow management while preserving originality, fact checking and human creative direction. Learn Shorts, long-form, thumbnails, retention, analytics, copyright, reused-content risks and sustainable production economics.",
accent:"youtube",regionalContext:context,calculatorKind:"youtube-production",productPath:"/dright/store",
modules:[
m("Faceless channel foundations","Faceless means the creator may not appear on camera; it does not mean the content can be generic, copied or fully unattended.",[
["Business models","Compare education, documentary, commentary, explainers and story-led channels by research burden, rights risk and production cost.","Score five channel models and choose one that matches your skills and budget."],
["Original value","Define what your channel adds through research, explanation, storytelling, editing or perspective.","Write a one-sentence original-value statement for three channel ideas."],
["Economics before scale","Estimate cost per video, production capacity and realistic revenue scenarios without assuming monetization.","Use the course calculator on low, expected and high scenarios."]
],"Create a one-page channel business model with audience, value, format, costs and risks.","Faceless production still requires original editorial value and sustainable economics."),
m("Niche and audience research","A good niche has recurring viewer questions, enough topic depth and a production burden you can sustain.",[
["Audience profile","Define who watches, what they already know, what they fear or desire and why they choose YouTube.","Build a viewer profile using real comments and search observations."],
["Topic depth","Check whether the niche can support at least fifty useful original topics rather than one viral idea.","Draft fifty topic seeds and group them into five content pillars."],
["Risk screening","Identify niches with high factual, medical, financial, copyright or advertiser-suitability risk.","Create a risk score and escalation rule for sensitive topics."]
],"Produce a niche decision memo with audience, topic depth and risk assessment.","Choose a niche you can research and produce responsibly for many videos."),
m("Channel brand, topic research and content calendar","Topic selection should combine audience need, search/discovery signals, seasonality and your own angle.",[
["Channel promise and brand","Define the recurring viewer promise and an original visual system for thumbnails, fonts and channel graphics.","Write the channel promise and build a mini brand board that does not copy another creator."],
["Idea sources and topic scoring","Use YouTube search, comments, Google Trends, competitor gaps and audience questions, then score ideas by value, originality, effort and evidence.","Collect thirty ideas, score twenty and choose the top eight."],
["Calendar and channel operations","Balance proven formats, experiments and timely topics; set production deadlines, upload roles and basic channel-security rules.","Create a four-week publishing calendar plus an MFA/permissions checklist."]
],"Create a scored eight-video content calendar.","A content calendar should manage evidence, production and learning, not only dates."),
m("Research and fact checking","AI summaries are starting points; documentary or educational claims need reliable source verification.",[
["Research brief","Define the exact questions the video must answer and what evidence is needed.","Write a research brief for one 8-minute video."],
["Source hierarchy","Prefer primary and official sources, then reputable reporting or expert material; record dates.","Build a source log with at least five references."],
["Fact-check pass","Check names, dates, numbers, quotes and causal claims before recording narration.","Run a fact-check checklist and mark uncertainty explicitly."]
],"Produce a source-backed research pack for one video.","The script should never be more confident than the evidence."),
m("AI-assisted scripting","Use AI to accelerate structure and revision while keeping the human creator responsible for accuracy, originality and voice.",[
["Outline before prose","Plan hook, promise, sections, evidence and payoff before drafting paragraphs.","Create a beat sheet for one video."],
["Draft with constraints","Give AI source material, audience, length, tone and prohibited claims rather than asking for a generic script.","Write a structured script prompt and compare two drafts."],
["Human rewrite","Remove repetition, unsupported claims and generic filler; add transitions and original examples.","Rewrite one AI-assisted section until it sounds specific and natural."]
],"Create a complete source-linked script plus revision notes.","AI can accelerate writing but cannot replace editorial judgment."),
m("Narration and voice","Narration must be clear, rights-safe and appropriate to the audience whether recorded by a person or generated with a licensed voice tool.",[
["Human voice workflow","Record clean audio with controlled environment, pacing and retakes even on a phone.","Record a one-minute sample and evaluate noise, pace and clarity."],
["Synthetic voice workflow","Use voices and services you are permitted to use; do not imitate a real person deceptively.","Create a voice-use checklist covering licence, disclosure needs and consistency."],
["Audio cleanup","Normalize levels, remove obvious noise and add music conservatively so speech remains clear.","Edit a one-minute narration to a consistent listening level."]
],"Produce two narration tests and choose a channel voice standard.","Voice automation should never become deceptive impersonation."),
m("Visual sourcing and copyright","Every image, clip, chart and music track needs a defensible source or licence.",[
["Original visuals","Create diagrams, screen recordings, simple animation and original graphics where possible.","Plan five original visual types for your niche."],
["Stock and public resources","Read licence terms and keep source records instead of assuming 'found online' means free.","Build an asset ledger with source, licence and use."],
["Transformative editing","Use licensed assets to support an original narrative rather than stitching together long unaltered clips.","Storyboard one section with purposeful visual changes every few seconds."]
],"Create a rights-cleared visual asset plan and source ledger.","Copyright safety begins before editing, not after a claim appears."),
m("Editing for clarity and retention","Editing should make the explanation easier to follow, not merely add constant effects.",[
["Pacing","Cut dead time, use visual changes when they add information and let important moments breathe.","Edit a 60-second sequence and justify each cut."],
["On-screen information","Use captions, labels, maps, charts and callouts to clarify the narration.","Create five reusable information graphics."],
["Sound design","Use music and effects at levels that support rather than overpower speech.","Build a simple audio-mix checklist."]
],"Produce a polished 60-90 second sample sequence.","Retention improves when every editing choice serves comprehension or emotion."),
m("Titles and thumbnails","Packaging earns the click, but it must accurately represent the video that follows.",[
["Title promise","Make the topic, tension or outcome clear without false claims.","Write twenty title options and remove any the video cannot fulfil."],
["Thumbnail hierarchy","Communicate one idea with readable contrast and minimal text at phone size.","Create three thumbnail concepts and test at small scale."],
["Packaging experiments","Compare title/thumbnail changes using platform tools and enough data instead of constant panic edits.","Write a test plan and decision rule."]
],"Create a three-option title/thumbnail package for one finished script.","High CTR is valuable only when the content fulfils the promise."),
m("YouTube Shorts workflow","Shorts require immediate context, vertical composition and a complete idea rather than random excerpts.",[
["Shorts scripting","Deliver hook, useful point and payoff quickly without misleading cliffhangers.","Write five 20-40 second scripts."],
["Vertical visual design","Use 9:16 framing, captions and safe placement for mobile UI overlays.","Storyboard one Short with visual changes."],
["Short-to-long strategy","Use Shorts to test topics or introduce deeper videos without forcing every Short into a sales funnel.","Map five Shorts to one long-form topic."]
],"Produce a five-Short mini-series with original scripts and visual plan.","A Short should provide value even if the viewer never watches another video."),
m("Long-form retention and storytelling","Long videos need structure, open loops, evidence and progress rather than filler added to reach a target duration.",[
["First minute","Confirm the promise quickly and show why the viewer should keep watching.","Write three opening versions for one video."],
["Section progression","Use clear questions, reveals, examples and transitions so each section earns the next.","Build an eight-section retention outline."],
["Pattern variation","Alternate narration, examples, visuals and pacing without distracting from the topic.","Mark where a 10-minute script needs visual or narrative variation."]
],"Create a complete long-form retention map.","Long-form watch time should come from sustained value, not artificial padding."),
m("Publishing and discoverability","Publishing includes metadata, chapters, subtitles, accessibility and a clean viewer handoff.",[
["Description and chapters","Write useful descriptions and chapters that accurately reflect the content.","Create a complete metadata package for one video."],
["Subtitles and accessibility","Review auto-captions or upload corrected captions, especially for names and technical terms.","Correct a one-minute caption sample."],
["Search and browse balance","Use relevant language in titles/descriptions while also designing for recommendation and returning viewers.","Choose which topics are search-led versus browse-led."]
],"Prepare a complete upload package ready for YouTube Studio.","Metadata should describe the video accurately rather than game search."),
m("Analytics and iteration","Analytics is a diagnostic system: impressions, CTR, retention, returning viewers and conversion must be read together.",[
["Reach metrics","Use impressions and CTR to evaluate packaging in context, not as isolated targets.","Create a weekly reach dashboard."],
["Retention","Read audience-retention drops against the exact script and edit moments.","Mark three likely causes for sample retention drops."],
["Channel learning","Compare topic, format, packaging and returning-viewer patterns across uploads.","Write a monthly keep/change/stop review."]
],"Build a channel analytics review template.","Use analytics to diagnose the content system, not to chase one vanity metric."),
m("Monetization, reused content and policy","Monetization requires current eligibility plus content that complies with YouTube monetization and copyright rules.",[
["YPP eligibility","Read the current YouTube Partner Program requirements for your country and channel type before planning around ad revenue.","Record the current official eligibility requirements with date and source."],
["Reused and repetitive content","Do not mass-produce near-identical videos, compilations or lightly modified third-party material and assume AI makes it original.","Audit five channel concepts for original commentary, editing and value."],
["Revenue diversification","Consider legitimate affiliate links, sponsors, products or services only when audience fit and disclosure are clear.","Create a monetization map that does not depend on one revenue source."]
],"Create a policy and monetization readiness checklist.","Monetization is earned through eligibility and original viewer value, not through automation alone."),
m("90-day faceless channel capstone","Build a repeatable production system and publish or privately prototype enough content to learn from evidence.",[
["Month 1: system","Validate niche, brand, research process and create two full production prototypes.","Document time and cost per production stage."],
["Month 2: production","Publish or complete a controlled batch with consistent packaging and rights records.","Track production cost, CTR/retention where available and viewer questions."],
["Month 3: improve","Use analytics and QA findings to refine topics, scripting, visuals and workflow.","Write a next-quarter decision with a realistic production budget."]
],"Submit a complete channel operating system: research, scripts, rights ledger, videos, packaging, analytics and economics.","The capstone proves a sustainable original production process, not guaranteed monetization.")
],
videos:[
{module:12,title:"YouTube Studio Analytics — Understand Your Channel Data",url:"https://www.youtube.com/watch?v=J1t34uTT0iA",description:"Official YouTube guidance on using Studio analytics to understand channel performance.",region:"English • Official YouTube"}
],
visuals:[
{title:"Faceless YouTube production system",imageUrl:"/course-018-youtube-ai/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Research, script, voice, visuals, edit, package, publish and learn."},
{title:"YouTube AI creator toolkit",imageUrl:"/course-018-youtube-ai/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Production economics, source logs, rights checks, analytics and content planning."}
],
references:[
{label:"YouTube Studio and Analytics Help",url:"https://support.google.com/youtube/topic/9257532",summary:"Official YouTube help for Studio analytics, reach, engagement and audience data.",points:["Metrics and labels can change","Use channel data in context"]},
{label:"YouTube monetization policies",url:"https://support.google.com/youtube/answer/1311392",summary:"Official YouTube channel monetization policy guidance, including original/authentic content expectations.",points:["Re-check before applying","AI assistance does not excuse reused or repetitive content"]},
{label:"YouTube Partner Program overview",url:"https://creatoracademy.youtube.com/page/course/monetization-options",summary:"Official YouTube learning resource for monetization options and eligibility context.",points:["Availability varies by country and feature","Eligibility can change"]}
],
downloads:[],
freeTools:[
{label:"YouTube Studio",url:"https://studio.youtube.com/",summary:"Upload videos, manage metadata, review analytics and channel settings.",freeNote:"Free for YouTube creators"},
{label:"Google Trends",url:"https://trends.google.com/",summary:"Compare topic interest and seasonality as one research signal.",freeNote:"Free"},
{label:"Canva",url:"https://www.canva.com/",summary:"Create thumbnails, channel graphics and simple visual assets.",freeNote:"Free plan available"},
{label:"CapCut",url:"https://www.capcut.com/",summary:"Mobile and desktop video editing for captions, cuts, audio and short-form production.",freeNote:"Free features available; some AI/effects require paid plans"},
{label:"YouTube Audio Library",url:"https://www.youtube.com/audiolibrary",summary:"Music and sound effects supplied for creators; follow the licence/attribution shown for each asset.",freeNote:"Free creator resource"}
],
projects:[
{title:"Channel research brief",outcome:"A niche, audience and fifty-topic map with risk screening.",steps:["Research audience","Score niche","Build topic pillars"]},
{title:"Source-backed script",outcome:"One long-form script with source log and fact-check notes.",steps:["Research","Outline and draft","Human edit and verify"]},
{title:"Rights-cleared production sample",outcome:"A 60-90 second polished sequence with asset ledger.",steps:["Create/source visuals","Record narration","Edit and mix"]},
{title:"Packaging + analytics system",outcome:"Titles, thumbnails and a weekly diagnostic dashboard.",steps:["Design three packages","Set test rule","Build analytics review"]},
{title:"90-day channel capstone",outcome:"A complete original faceless-channel operating system.",steps:["Build system","Produce controlled batch","Review economics and analytics"]}
],
templates:[
{label:"YouTube AI Production Toolkit",href:"/course-018-youtube-ai/youtube-ai-toolkit.md",type:"Markdown",description:"Research brief, source log, script QA, rights ledger, packaging and upload templates."},
{label:"YouTube Production Tracker",href:"/course-018-youtube-ai/youtube-production-tracker.csv",type:"CSV",description:"Track topics, scripts, assets, rights, production cost, upload dates, CTR, retention and decisions."}
]};
export const course018=buildCourse(seed);
