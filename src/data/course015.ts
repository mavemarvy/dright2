import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Teach with phone-friendly and low-cost workflows suitable for Nigerian and African creators. Keep files lightweight, readable and legally usable; distinguish free tools from paid features and never promise that PDF protection makes piracy impossible.";
const seed:CourseSeed={
courseNumber:"015",slug:"pdf-product-creation-automation-mastery-2026",title:"PDF Product Creation & Automation Mastery 2026",
subtitle:"Create professional ebooks, planners, worksheets, forms and sellable PDF systems with efficient tools",
promise:"Learn the complete PDF product workflow: research, writing, layout, clickable navigation, fillable forms, spreadsheet-to-PDF automation, quality control, compression, accessibility, licensing, packaging, delivery and pricing. Build real products rather than long unstructured documents.",
accent:"pdf",regionalContext:context,calculatorKind:"pdf-pricing",productPath:"/dright/store",
modules:[
m("PDF product strategy","A professional PDF begins with a user job and delivery format, not page count.",[
["Choose the product job","Decide whether the PDF teaches, records, guides, plans, collects data or supports a workflow.","List ten PDF ideas and state the exact job each completes."],
["Audience and device","Design for the screen or print context the buyer will actually use.","Choose page size, orientation and mobile/print priority for one idea."],
["Scope and outcome","Define what is included, completion point and what the product does not promise.","Write a one-page PDF product brief."]
],"Create a product brief with audience, job, format and success criteria.","Design around user action, not arbitrary page count."),
m("Research and source planning","Facts, examples and claims need traceable sources before layout begins.",[
["Research questions","Turn the topic into questions that must be answered accurately.","Write fifteen research questions and rank by importance."],
["Source log","Record source, date, claim and where the information will be used.","Build a source table with at least five credible references."],
["Original examples","Create your own scenarios, worksheets and explanations instead of copying competitor PDFs.","Write three original worked examples."]
],"Produce a source-backed content plan.","A polished layout cannot fix weak or copied information."),
m("Writing for usable PDFs","PDF copy should be concise, scannable and action-oriented.",[
["Section structure","Use headings, short paragraphs, tables and callouts to reduce cognitive load.","Rewrite one dense page into a scannable version."],
["Instructions","Write exact verbs, inputs and expected outputs for every worksheet or activity.","Create instructions for one planner page and test them with another person."],
["Editing","Remove repetition, unsupported claims and filler before design.","Cut a draft by 20 percent without losing meaning."]
],"Create three finished pages of edited source copy.","Useful PDFs guide action instead of maximizing word count."),
m("Layout systems","Consistent grids, type hierarchy and spacing create professional documents faster than decorating every page separately.",[
["Grid and margins","Set safe margins, columns and repeated alignment rules.","Create a one-page layout grid and apply it to three page types."],
["Typography","Use a small type system for title, heading, body, labels and captions.","Build a typography specimen at phone and print size."],
["Reusable components","Create repeatable callout, checklist, table and worksheet blocks.","Design five reusable components."]
],"Build a mini PDF design system before laying out the full product.","Consistency produces quality and speed."),
m("Canva PDF workflow","Canva is beginner-friendly, but export settings, licensing and layout discipline still matter.",[
["Document setup","Choose correct dimensions and organize pages with consistent templates.","Create a five-page Canva document with three reusable page types."],
["Assets and licensing","Use assets within their permitted licence and avoid implying ownership of stock media.","Audit every external asset in the sample file."],
["Export testing","Compare standard and print exports, links and file size.","Export two versions and document differences."]
],"Create and test a five-page Canva PDF prototype.","Easy tools still require deliberate design and licensing checks."),
m("Docs and office workflow","Google Docs and LibreOffice can produce clean text-heavy PDFs with styles, tables and page controls.",[
["Styles and headings","Use real styles so hierarchy and navigation are consistent.","Format a guide using heading styles instead of manual font changes."],
["Tables, headers and breaks","Control page flow so tables and sections do not break awkwardly.","Fix five deliberate pagination problems in a sample file."],
["Export and metadata","Set title/author metadata where possible and test generated links.","Export and inspect a finished document."]
],"Build a text-heavy guide using styles and clean pagination.","Structured source documents make later updates much easier."),
m("Interactive and fillable PDFs","Interactive elements should make completion easier, not create compatibility problems.",[
["Clickable navigation","Use linked contents, buttons and internal destinations where the authoring tool supports them.","Build a clickable contents page."],
["Form fields","Understand text fields, checkboxes and signatures while testing across common viewers.","Create a simple fillable intake form and test it in two viewers."],
["Fallback instructions","Provide print or manual alternatives when interactivity may not work everywhere.","Write fallback instructions for each interactive feature."]
],"Create a tested clickable or fillable mini-PDF.","Interactive features must be tested in the buyer's likely viewing environment."),
m("Spreadsheet-to-PDF systems","Business reports and trackers can be generated from structured spreadsheet data.",[
["Data structure","Keep inputs clean and separate calculations from presentation.","Design a simple input table for monthly business data."],
["Report layout","Create a summary sheet sized for PDF output with only decision-relevant metrics.","Build a one-page monthly report."],
["Repeatable export","Document the monthly process so another person can refresh and export consistently.","Write an export SOP with file naming."]
],"Create a repeatable spreadsheet-to-PDF reporting workflow.","Automation begins with structured data and a consistent output layout."),
m("Compression and optimization","A beautiful PDF that is too large for mobile data can create a bad customer experience.",[
["Image optimization","Resize images to the actual display need instead of embedding camera-size files.","Compare file size before and after image optimization."],
["Compression tools","Use reputable PDF tools and inspect quality after compression.","Compress a sample at two levels and check text and image quality."],
["Mobile delivery","Test download time, readability and scrolling on a phone connection.","Set a target file-size budget for your product."]
],"Deliver an optimized PDF with before/after size and quality notes.","Optimize for the buyer's device without destroying readability."),
m("Accessibility and readability","Accessible documents help more buyers and usually improve general usability.",[
["Contrast and type size","Use sufficient contrast and readable body size.","Audit five pages for small text and weak contrast."],
["Reading order and alt text","Use structured source documents and image descriptions where the authoring path supports them.","Write alt descriptions for ten meaningful images."],
["Plain language","Reduce unnecessary jargon and explain technical terms.","Rewrite one complex section for a beginner."]
],"Create an accessibility QA checklist and run it on the product.","Accessibility is a quality feature, not an afterthought."),
m("Protection, licensing and privacy","Password protection and watermarking can discourage casual misuse but do not make copying impossible.",[
["Permissions and passwords","Choose protection only when it does not block legitimate buyers from using the file.","Test a protected copy and document the buyer steps."],
["Licensing","State personal, classroom, client or commercial permissions clearly.","Write a plain-language licence."],
["Sensitive information","Remove hidden metadata, private examples and client information before release.","Run a privacy inspection before export."]
],"Create a licensing and privacy pack.","Protection should not create more friction than value."),
m("Packaging and buyer experience","The buyer should know which file to open first and how to use every included resource.",[
["File naming","Use versioned descriptive filenames instead of final-final2.pdf.","Create a clean delivery folder structure."],
["Start Here guide","Explain files, compatibility, printing and support in one page.","Write a Start Here document."],
["Bonus materials","Include only bonuses that strengthen the main job.","Remove any bonus that does not help the buyer finish the core task."]
],"Package the product as a clean buyer-ready folder.","Delivery experience is part of product quality."),
m("Pricing and selling PDFs","Price from usefulness, audience, support and economics rather than the number of pages.",[
["Value and alternatives","Compare what the buyer would spend in time or other tools to complete the same job.","Write a value comparison for your PDF."],
["Price and margin","Include affiliate commission, payment fees and promotion in the price decision.","Use the course calculator for three pricing scenarios."],
["Sales page","Show exact contents, page previews, compatibility and limitations.","Draft a transparent product listing."]
],"Create a pricing sheet and sales-page copy.","A useful 20-page tool can be worth more than a padded 100-page PDF."),
m("Quality assurance and versioning","Every link, field, calculation, page and download should be tested before release.",[
["Preflight checklist","Check spelling, links, page order, blank pages, print margins and asset rights.","Run a full preflight and record defects."],
["Version control","Keep source files and a change log so fixes can be reproduced.","Create version 1.0 and a change-log template."],
["Buyer updates","Decide whether existing buyers receive fixes or major upgrades and communicate clearly.","Write an update policy."]
],"Produce a signed-off QA report and version history.","Do not publish until the exported file has been tested like a product."),
m("90-day PDF product capstone","Take one useful PDF system from research to tested sale-ready package.",[
["Month 1: content and prototype","Validate the problem, write source copy and build a small prototype.","Test the prototype with at least one user."],
["Month 2: production","Complete layout, interactive features, optimization and packaging.","Run accessibility and export QA."],
["Month 3: launch and improve","Publish, track questions and update the product from evidence.","Create version 1.1 from actual feedback."]
],"Submit a complete PDF product, source files, listing, QA and update plan.","The capstone is judged by usefulness and reliability, not page count.")
],
videos:[],
visuals:[
{title:"Professional PDF product workflow",imageUrl:"/course-015-pdf-products/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Research, write, design, optimize, package and sell."},
{title:"PDF creator toolkit",imageUrl:"/course-015-pdf-products/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"QA, pricing, templates and repeatable export systems."}
],
references:[
{label:"PDF24 Tools",url:"https://tools.pdf24.org/en/",summary:"Official PDF24 collection for creating, converting, compressing, merging and editing PDFs.",points:["Web tools process files","Avoid uploading sensitive documents unnecessarily"]},
{label:"PDF24 Write PDF",url:"https://tools.pdf24.org/en/write-pdf",summary:"PDF24 states this browser-based writer is free and can create structured PDF documents.",points:["Test export quality","Review privacy needs"]},
{label:"LibreOffice",url:"https://www.libreoffice.org/",summary:"Free open-source office suite for document and spreadsheet workflows.",points:["Useful offline","Export PDFs locally"]}
],
downloads:[],
freeTools:[
{label:"PDF24",url:"https://tools.pdf24.org/en/",summary:"Merge, split, compress, convert, edit and create PDFs.",freeNote:"Free online tools"},
{label:"Canva",url:"https://www.canva.com/",summary:"Design ebooks, planners, covers and visual worksheets.",freeNote:"Free plan available"},
{label:"LibreOffice",url:"https://www.libreoffice.org/",summary:"Offline Writer and Calc tools with PDF export.",freeNote:"Free and open source"},
{label:"iLovePDF",url:"https://www.ilovepdf.com/",summary:"Browser tools for common PDF operations.",freeNote:"Free usage with limits"},
{label:"Sejda",url:"https://www.sejda.com/",summary:"Browser and desktop PDF tools including forms and editing.",freeNote:"Free usage with limits"}
],
projects:[
{title:"Five-page ebook sample",outcome:"A polished, source-aware guide sample.",steps:["Research and write","Apply design system","Test export"]},
{title:"Fillable planner",outcome:"A tested interactive or printable planner.",steps:["Define fields","Build pages","Test viewers and fallback"]},
{title:"Spreadsheet report system",outcome:"Structured data to repeatable PDF report.",steps:["Design inputs","Build report","Document export"]},
{title:"Buyer-ready PDF package",outcome:"Files, licence, Start Here and listing previews.",steps:["Package files","Optimize size","Run preflight"]},
{title:"90-day PDF capstone",outcome:"A complete product from validation to version 1.1.",steps:["Prototype","Produce","Launch and improve"]}
],
templates:[
{label:"PDF Product Production Kit",href:"/course-015-pdf-products/pdf-product-toolkit.md",type:"Markdown",description:"Research, layout, preflight, licensing, delivery and launch templates."},
{label:"PDF QA & Sales Tracker",href:"/course-015-pdf-products/pdf-product-tracker.csv",type:"CSV",description:"Track versions, file size, defects, sales, fees, support and updates."}
]};
export const course015=buildCourse(seed);
