import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use legitimate publishing examples suitable for Nigerian and African authors while keeping the workflow globally competitive. Use real identity and tax/account information, respect copyright and trademarks, verify current KDP policies, and never teach fake-region, fake-review or account-evasion tactics.";
const seed:CourseSeed={
courseNumber:"017",slug:"amazon-kdp-publishing-book-business-mastery-2026",title:"Amazon KDP Publishing & Book Business Mastery 2026",
subtitle:"Research, write, format, publish and market original ebooks and print books with a policy-safe publishing system",
promise:"Learn Amazon KDP as a publishing business rather than a shortcut. Build original books, research readers, format ebooks and print interiors, create covers, set metadata and pricing, understand royalties, preview files, publish carefully, market ethically and maintain a long-term catalogue.",
accent:"kdp",regionalContext:context,calculatorKind:"kdp-planner",productPath:"/dright/store",
modules:[
m("KDP business foundations","KDP is a self-publishing platform; sustainable results come from useful books, original rights-cleared content and sound catalogue economics.",[
["How KDP works","Understand ebook, paperback and hardcover workflows, marketplace distribution, royalties and the difference between publishing and guaranteed sales.","Draw the journey from manuscript to live book to royalty report."],
["Account integrity","Use accurate personal/business, tax and payment information and keep one compliant account relationship.","Create an account-preparation checklist containing only truthful information."],
["Publishing economics","Separate list price, royalty rate, print/delivery cost, ads and production costs.","Use the course calculator on three sample book scenarios."]
],"Create a one-page KDP business model with format, target reader, production cost and royalty assumptions.","Treat KDP as a publishing operation with rights, quality and economics."),
m("Reader and market research","A book should solve a reader problem, entertain a defined audience or provide a clear experience.",[
["Reader profile","Define who the book is for, what they already know and what outcome or experience they want.","Write one reader profile with needs, objections and buying context."],
["Competitive shelf","Study titles, covers, descriptions, length, reviews and gaps without copying protected content.","Compare ten books and identify five unmet reader needs."],
["Demand signals","Combine Amazon search observations, Google Trends, communities and real reader questions.","Collect three independent signals before choosing a topic."]
],"Produce a reader-and-market research brief with evidence and open questions.","Research informs positioning; it does not guarantee sales."),
m("Topic, niche and rights screening","A publishable idea must be useful and legally clean enough to build on.",[
["Niche selection","Score ideas for reader need, your ability to add value, competition and production complexity.","Rank ten ideas and select one with a written rationale."],
["Trademark and brand caution","Do not build misleading titles around protected brands, personalities or franchises without proper rights.","Create a rights-risk checklist for title, subtitle and cover."],
["Public-domain awareness","Public-domain status varies by work and country; verify before republishing or adapting.","Choose one public-domain example and document how you would verify its status."]
],"Create a go/no-go topic decision with rights notes.","A marketable idea is not automatically a legally safe or original book."),
m("Book concept and outline","A strong outline connects the reader promise to chapters, examples and exercises before drafting.",[
["Reader promise","Write a specific truthful promise the book can realistically fulfil.","Draft five subtitle/value-proposition options and choose the clearest."],
["Chapter outcomes","Give each chapter one job and a logical place in the reader journey.","Outline ten chapters with one-sentence outcomes."],
["Evidence and examples map","Assign stories, examples, research and worksheets before writing.","Create a source-to-chapter map."]
],"Build a complete book blueprint with reader promise, chapter outcomes and source map.","Approve the structure before investing heavily in prose."),
m("Writing an original manuscript","Original authorship requires human decisions, verified facts and a consistent voice even when AI assists parts of the workflow.",[
["Drafting routine","Use a repeatable schedule and chapter checklist instead of waiting for inspiration.","Plan a four-week writing sprint with realistic word targets."],
["AI-assisted writing responsibly","Use AI for ideation, outlining or editing where appropriate, but verify facts and follow current disclosure/content policies.","Write an internal AI-use policy for the manuscript."],
["Originality and attribution","Quote sparingly, cite where appropriate and never copy competitor text, reviews or summaries.","Run an originality review on one chapter and replace derivative passages."]
],"Produce one polished original chapter plus source notes.","AI assistance does not transfer responsibility for originality or accuracy."),
m("Editing and beta feedback","Editing separates structural problems, clarity problems and proofreading so revisions are efficient.",[
["Developmental edit","Check promise, chapter order, missing evidence, repetition and reader progression.","Run a structural review on the full outline or sample chapter set."],
["Line and copy edit","Improve clarity, consistency, grammar and style without flattening the author's voice.","Line-edit 1,000 words and explain five major decisions."],
["Beta readers","Ask target readers structured questions about usefulness, confusion and missing material.","Create a five-question beta-reader form and analyze sample feedback."]
],"Create an editing plan and beta-feedback report.","Editing should improve the reader experience, not only remove typos."),
m("Ebook formatting and Kindle Create","Ebooks are reflowable documents; formatting should remain readable across devices and font sizes.",[
["Styles and structure","Use headings, paragraphs, lists and page breaks cleanly instead of manual spaces and tabs.","Format a three-chapter sample using real styles."],
["Images and tables","Use images only when they remain readable on small screens and add real value.","Test one image and one table on a narrow ebook preview."],
["Navigation and Kindle Create","Create functioning navigation, then use Kindle Create where suitable to import, theme, preview and export supported book workflows.","Build clickable navigation and document a Kindle Create import-preview-export test."]
],"Produce a clean ebook-format sample ready for preview.","Ebook formatting should survive device and font-size changes."),
m("Paperback and hardcover interiors","Print interiors require trim size, margins, page count and bleed decisions before final export.",[
["Trim and margins","Choose trim size based on genre and reading experience, then set margins for the expected page count.","Create a print-spec sheet for one book."],
["Bleed and images","Understand when art reaches the edge and when bleed settings are required.","Mark which sample pages need bleed and why."],
["Print PDF QA","Check fonts, page size, image quality, blank pages and margin safety.","Run a print preflight on a ten-page sample."]
],"Create a print-ready interior sample plus preflight checklist.","Print files must match the exact physical specifications selected in KDP."),
m("Cover design and print dimensions","A cover must communicate genre and promise at thumbnail size while meeting exact print dimensions.",[
["Market fit","Study visual conventions in the category without copying another cover.","Create a moodboard of patterns, then design an original direction."],
["Front cover hierarchy","Prioritize title, subtitle where needed and author name for small-thumbnail readability.","Create three thumbnail concepts and test them at phone size."],
["Full-wrap print cover","Use the current KDP cover calculator/template for spine and bleed dimensions.","Generate the correct template and place your design inside its safe areas."]
],"Create an ebook front cover plus print-wrap draft using current dimensions.","Design quality and specification accuracy are equally important."),
m("Metadata, keywords and categories","Metadata should accurately describe the book and help the right reader understand it.",[
["Title and subtitle","Use accurate descriptive language and avoid stuffing unrelated keywords or protected brands.","Write five truthful title/subtitle combinations."],
["Book description","Explain the reader problem, value, contents and fit in clear sales copy.","Draft a structured book description with no unsupported claims."],
["Keywords and categories","Choose relevant search language and categories that match the actual content.","Build a keyword/category rationale from reader research."]
],"Create a complete metadata sheet ready for KDP entry.","Metadata should improve discoverability without misleading the buyer."),
m("ISBN, rights and publishing setup","Understand ownership, ISBN choices and territory rights before pressing Publish.",[
["Publishing rights","Confirm that you own or control the text, images and other assets used.","Create a rights ledger for manuscript, cover and illustrations."],
["ISBN choices","Understand when KDP-provided ISBNs apply and when owning your own ISBN may matter.","Write a decision note for one print title."],
["Territories and pricing","Choose distribution territories only where you hold the required publishing rights.","Create a territory and price checklist."]
],"Produce a rights and publishing-setup file.","Only publish content and territories you are authorized to use."),
m("Pricing and royalty planning","Pricing varies by format, marketplace and cost; use current KDP information rather than memorizing one percentage.",[
["Royalty models","Read the current KDP royalty terms for the exact format and marketplace.","Record the current rate options and conditions from KDP before pricing."],
["Print cost impact","Understand that print royalty depends on list price and current printing cost.","Use the calculator with the real KDP print cost for your selected book."],
["Portfolio economics","Track production cost, ads, returns and royalties across titles.","Build a title-level profit and royalty tracker."]
],"Create a pricing sheet for ebook and print formats using current KDP figures.","Pricing decisions must use the current marketplace-specific terms."),
m("Upload, preview and quality assurance","Publishing is a controlled release process: upload, inspect, correct and only then approve.",[
["Book details and files","Enter metadata consistently and upload the correct manuscript and cover versions.","Create a pre-upload file naming convention."],
["Previewer","Inspect every warning, page break, image and navigation issue instead of assuming upload success means quality.","Run a full preview and record corrections."],
["Proof copies and final checks","Use proofing options where appropriate before promoting widely.","Create a release-signoff checklist."]
],"Complete a simulated KDP upload/preview QA report.","The book is not finished until the store files have been inspected."),
m("Launch, reviews and catalogue growth","Ethical marketing builds reader awareness without manipulating reviews or violating platform rules.",[
["Launch plan","Use audience content, email, social, advance readers where allowed and a realistic launch calendar.","Create a 14-day launch plan."],
["Review ethics","Never buy, trade or pressure for misleading reviews; use current Amazon rules for review requests.","Write a neutral review-request message."],
["Catalogue strategy","Improve existing books and add related titles only when reader evidence supports them.","Design a three-book catalogue roadmap with shared audience logic."]
],"Build a policy-safe launch and catalogue plan.","Long-term publishing value comes from reader trust and a coherent catalogue."),
m("90-day KDP capstone","Take one original book from validated idea to publication-ready files and launch plan.",[
["Month 1: research and manuscript","Validate the reader, finish outline, draft and edit core content.","Complete the research file and manuscript milestone."],
["Month 2: production","Format ebook/print, create cover, metadata and rights records.","Run preview and print preflight."],
["Month 3: release and learn","Publish only after QA, execute the launch plan and review reader/store data.","Write a post-launch improvement decision."]
],"Submit a complete KDP publishing portfolio: manuscript, formats, cover, metadata, rights, QA and launch plan.","The capstone proves a professional publishing process, not guaranteed bestseller status.")
],
videos:[
{module:1,title:"Create a Verified Amazon KDP Account in Nigeria — Easy Tutorial",url:"https://www.youtube.com/watch?v=Tbb5HVdPPes",description:"Nigeria-specific KDP account setup walkthrough; learners must use truthful identity, tax and payout information.",region:"Nigerian English • Practical"},
{module:1,title:"Create and Verify Amazon KDP Account in Nigeria",url:"https://www.youtube.com/watch?v=ggkSNJEdr7s",description:"Nigeria-focused KDP onboarding and account setup tutorial.",region:"Nigerian English • Practical"},
{module:15,title:"Why You Should Not Buy the Viral Amazon KDP Course in Nigeria",url:"https://www.youtube.com/watch?v=SfD3129ILBU",description:"Critical Nigerian perspective useful for separating publishing fundamentals from hype.",region:"Nigerian English • Practical"},
{module:1,title:"Create and Verify Your Amazon KDP Account in Nigeria — Step-by-Step",url:"https://www.youtube.com/watch?v=ftBbpQa51VU",description:"Detailed Nigerian KDP account, payment and verification walkthrough.",region:"Nigerian English • Practical"},
{module:1,title:"Amazon Kindle Tutorial — Create a KDP Account in Nigeria",url:"https://www.youtube.com/watch?v=9BB3XelKIyc",description:"Nigeria-focused KDP beginner setup; ignore any outdated account-location workarounds and follow current KDP policies.",region:"Nigerian English • Practical"},
{module:1,title:"How to Start Amazon KDP in 2026 — Beginner Tutorial",url:"https://www.youtube.com/watch?v=7BIjghZLJjs",description:"Current end-to-end KDP overview covering research, formatting, metadata, covers and publishing.",region:"International English • Practical"},
{module:11,title:"Amazon KDP Keyword Research That Works — 2026",url:"https://www.youtube.com/watch?v=ceHBNpN3EcY",description:"Keyword and metadata research tutorial focused on current KDP discoverability.",region:"International English • Practical"},
{module:11,title:"Discovering Metadata — Amazon KDP",url:"https://www.youtube.com/watch?v=grQb-T-jmvM",description:"Official Amazon KDP training on categories, keywords and book detail-page metadata.",region:"International English • Official"},
{module:10,title:"34 Minutes of Amazon KDP Cover Creation Knowledge + Tutorial",url:"https://www.youtube.com/watch?v=H2NKimQBckA",description:"2026 cover-design walkthrough focusing on effective KDP cover creation.",region:"International English • Practical"},
{module:14,title:"How to Publish an eBook and Paperback on KDP",url:"https://www.youtube.com/watch?v=H4x8fH-vd1g",description:"Step-by-step publishing workflow covering formatted files, upload, preview, territories and pricing.",region:"International English • Practical"}
],
visuals:[
{title:"KDP publishing system",imageUrl:"/course-017-kdp/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Reader research, manuscript, formatting, cover, metadata, preview and launch."},
{title:"KDP publishing toolkit",imageUrl:"/course-017-kdp/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Book brief, rights ledger, QA, royalty planning and launch tracking."}
],
references:[
{label:"Amazon KDP publishing",url:"https://kdp.amazon.com/en_US/publish",summary:"Official KDP publishing overview for ebooks and print books.",points:["KDP self-publishing has no upfront publishing fee","Current royalties and print costs vary by format/marketplace"]},
{label:"Kindle Create help",url:"https://kdp.amazon.com/en_US/help/topic/GUGQ4WDZ92F733GC",summary:"Official KDP guidance for Kindle Create and supported book preparation workflows.",points:["Preview output before publishing","Features vary by book type"]},
{label:"KDP help centre",url:"https://kdp.amazon.com/en_US/help",summary:"Use the current KDP help centre as the source of truth for metadata, ISBN, royalties and content policies.",points:["Policies can change","Re-check before publishing"]}
],
downloads:[],
freeTools:[
{label:"Amazon KDP",url:"https://kdp.amazon.com/",summary:"Amazon's self-publishing dashboard for eligible ebooks, paperbacks and hardcovers.",freeNote:"No upfront KDP publishing fee; sales royalties/cost rules apply"},
{label:"Kindle Create",url:"https://www.amazon.com/Kindle-Create/b?ie=UTF8&node=18292298011",summary:"Amazon formatting application for supported ebook and print workflows.",freeNote:"Free download"},
{label:"Reedsy Studio",url:"https://reedsy.com/studio",summary:"Browser-based writing and book-formatting workspace for authors.",freeNote:"Core writing/formatting tools available free; verify current extras"},
{label:"Canva",url:"https://www.canva.com/",summary:"Create cover concepts, launch graphics and simple promotional assets.",freeNote:"Free plan available"},
{label:"Google Docs",url:"https://docs.google.com/",summary:"Draft, comment, collaborate and maintain manuscript versions.",freeNote:"Free with a Google account"}
],
projects:[
{title:"Reader + market brief",outcome:"A book concept grounded in reader evidence and rights screening.",steps:["Research readers","Map competing shelf","Choose defensible positioning"]},
{title:"Original manuscript sample",outcome:"A researched, edited chapter plus source log.",steps:["Outline","Draft","Edit and verify"]},
{title:"Ebook + print production",outcome:"Formatted ebook and print interior samples.",steps:["Apply styles","Set print specs","Run preview/preflight"]},
{title:"Metadata + cover package",outcome:"Original cover, description, keywords, categories and rights ledger.",steps:["Design cover","Write metadata","Confirm rights"]},
{title:"90-day publishing capstone",outcome:"A complete publication-ready book business file.",steps:["Research/write","Produce/QA","Launch and review"]}
],
templates:[
{label:"KDP Publishing Toolkit",href:"/course-017-kdp/kdp-publishing-toolkit.md",type:"Markdown",description:"Reader research, outline, rights ledger, metadata, QA and launch templates."},
{label:"KDP Project & Royalty Tracker",href:"/course-017-kdp/kdp-project-tracker.csv",type:"CSV",description:"Track titles, production costs, formats, list price, print cost, royalties, sales and launch actions."}
]};
export const course017=buildCourse(seed);
