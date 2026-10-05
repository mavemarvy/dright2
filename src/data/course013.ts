import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use Nigerian and African buyer examples, phone-friendly formats, clear NGN pricing and honest product claims. Keep files light enough for mobile users and test any spreadsheet, template or workflow before selling it.";
const seed:CourseSeed={
courseNumber:"013",slug:"digital-product-creation-selling-mastery-2026",title:"Digital Product Creation & Selling Mastery 2026",
subtitle:"Research, build, package and sell useful ebooks, templates, trackers, prompt packs and business tools",
promise:"Learn to create digital products that solve a specific problem and are easy to use on phones and laptops. Research demand, design the product, build with accessible tools, package files, price sustainably, publish on DRIGHT or other storefronts, launch ethically and improve from customer evidence.",
accent:"digital",regionalContext:context,calculatorKind:"digital-product-profit",productPath:"/dright/store",
modules:[
m("Digital product foundations","Digital products are reusable files or access products; their value comes from the job they help a buyer complete.",[
["Product categories","Compare ebooks, templates, spreadsheets, prompt packs, checklists, planners and mini-courses by buyer job and complexity.","List twenty ideas and group them by the job they help complete."],
["Problem-first design","Choose a painful repeated task instead of starting from the format you personally want to make.","Observe or interview ten target users and capture repeated problems."],
["Outcome definition","State what the buyer will be able to do after using the product without impossible promises.","Write one clear outcome and three non-goals for one idea."]
],"Create a one-page product opportunity brief.","Choose the buyer problem before choosing the file format."),
m("Market research and validation","Validation tests whether people understand and value the solution before you spend weeks polishing it.",[
["Competitor mapping","Study price, format, reviews, complaints and gaps without copying proprietary content.","Compare ten products and list five differentiation opportunities."],
["Demand evidence","Use search, communities, support questions and marketplace behaviour as multiple signals.","Collect at least three independent demand signals."],
["Prototype testing","Show a sample, waitlist or smaller version and collect feedback before a full build.","Design a low-risk validation experiment with a pass/fail threshold."]
],"Build a validation report with evidence and a decision rule.","Validation reduces uncertainty; it does not guarantee sales."),
m("Product architecture","A useful digital product has a clear start, sequence, instructions and completion point.",[
["Information hierarchy","Organize content around the user's workflow rather than dumping everything you know.","Create a table of contents or screen map from first action to final result."],
["Instruction design","Use examples, checklists and prompts so buyers know what to do.","Add one worked example to every major section."],
["Mobile accessibility","Use readable type, strong contrast and lightweight files.","Test a prototype on a small phone and list issues."]
],"Produce the full product outline and one finished sample section.","Structure the product around user action and clarity."),
m("Ebooks and guides","Ebooks sell when they are concise, original and actionable rather than padded with generic text.",[
["Research and outline","Plan chapters around buyer questions and use sources where factual claims need support.","Build a source-backed outline with chapter outcomes."],
["Draft and edit","Use AI only as an assistant; rewrite for specificity, accuracy and original examples.","Draft one chapter and run fact, clarity and originality edits."],
["Layout and export","Design headings, tables, callouts and page breaks, then test links and export.","Create a five-page sample and test phone and desktop viewing."]
],"Create a polished five-page ebook sample.","A shorter useful guide is better than a long generic ebook."),
m("Templates and planners","Templates should save decisions or repeated setup, not simply decorate a blank page.",[
["Template job","Define the exact repeatable task the template simplifies.","Write the before-and-after workflow for one template."],
["Editable design","Use clear fields, labels and enough flexibility without overwhelming the user.","Create one planner or worksheet and test it with another person."],
["Quick-start guide","Include instructions, a completed example and reset/copy steps.","Write a one-page user guide."]
],"Build an editable template with instructions and example.","Templates create value by reducing repeated work and confusion."),
m("Spreadsheet products","Spreadsheets become strong products when formulas are tested, inputs are obvious and outputs are explained.",[
["Input design","Separate user inputs from formulas and clearly label units and currency.","Design the input section for one calculator or tracker."],
["Formula testing","Test normal, zero, negative and extreme values.","Create ten test cases and fix every failure."],
["Dashboard outputs","Show the few metrics a buyer needs for a decision.","Build a simple summary tab with three decision metrics."]
],"Create one tested spreadsheet product.","A spreadsheet product must be tested like software, not only styled like a document."),
m("Prompt packs and AI workflows","Prompt products need context, variables, examples and workflow guidance or they are easy to replace with one question.",[
["Reusable prompt structure","Create placeholders for role, input, constraints, audience and output.","Turn ten one-line prompts into reusable templates."],
["Workflow sequences","Combine prompts into research, draft, critique and finalization steps.","Build and test one four-step workflow twice."],
["Verification guidance","Explain what must be checked and what the prompt cannot guarantee.","Add a verification note to every prompt category."]
],"Build a 20-prompt toolkit organized around one job.","A valuable prompt product teaches a workflow, not just commands."),
m("Brand and design","The visual identity should make the product recognizable and easy to use without sacrificing readability.",[
["Cover and thumbnail","Communicate category and outcome in one glance with crisp text and relevant imagery.","Create three cover directions and test them at thumbnail size."],
["Interior system","Use consistent typography, spacing, icons and page components.","Create a mini style guide before full layout."],
["Mockups","Show realistic previews without implying physical items that are not included.","Create three honest product mockups."]
],"Produce a cover, mini style guide and truthful mockups.","Design should clarify the product, not exaggerate it."),
m("Pricing and bundles","Price should reflect buyer value, competition, support burden, affiliate commission and desired margin.",[
["Price research","Compare alternatives while accounting for depth, support and included tools.","Build a ten-product price comparison."],
["Contribution margin","Calculate payment fees, affiliate commission, promotion and support costs.","Use the course calculator under three price scenarios."],
["Bundles and tiers","Bundle complementary products that solve a larger job rather than random bonuses.","Design Starter, Standard and Premium options."]
],"Create a pricing and bundle sheet with margin.","A sustainable price funds support, promotion and improvement."),
m("Storefronts and delivery","The sales platform should deliver files reliably and explain access, refunds and support.",[
["DRIGHT listing","Use title, subtitle, gallery, benefits, price, commission and access settings accurately.","Draft a complete DRIGHT product page."],
["External storefronts","Understand that Payhip, Gumroad and similar services have their own fees and terms.","Compare two storefronts against your needs."],
["File delivery","Name files clearly, package versions and include a Start Here document.","Create the final delivery folder and test every file."]
],"Build a complete delivery package and storefront listing.","A smooth delivery experience is part of the product."),
m("Sales page copy","A sales page should explain buyer, problem, product, proof, contents, limitations and next step.",[
["Value proposition","Describe the useful outcome without inflated income or transformation claims.","Write five headline options and choose the clearest."],
["What's included","List exact files, pages, templates and access details.","Create a precise contents section."],
["FAQ and objections","Answer compatibility, editing, support, refunds and who should not buy.","Write ten FAQ answers."]
],"Produce a complete sales-page copy deck.","Clarity converts better than hiding limitations."),
m("Launch and content marketing","A launch combines useful education, demonstration, proof and repeated reminders across a limited period.",[
["Pre-launch","Collect interested people and share problem-aware content before opening sales.","Plan seven pre-launch posts."],
["Launch week","Rotate demo, use case, FAQ, proof and reminder content instead of repeating one flyer.","Create a seven-day launch calendar."],
["Evergreen sales","Turn the launch winners into repeatable content and search assets.","Choose five pieces to convert into evergreen content."]
],"Build a 14-day launch plan.","Launches work best when they teach and demonstrate."),
m("Customer support and updates","Digital products still need support for file access, compatibility, instructions and version changes.",[
["Support boundaries","Define what help is included and expected response times.","Write a support policy."],
["Versioning","Track version, change log and whether old buyers receive updates.","Create a version-history template."],
["Feedback loop","Turn repeated questions into documentation and improvements.","Create a feedback form and monthly review routine."]
],"Create a support and update system.","Support data should improve the product over time."),
m("Practical protection and licensing","No anti-piracy method is perfect; focus on clear licensing, legitimate buyer experience and controlled access.",[
["Usage licence","Explain personal and commercial-use permissions in plain language.","Write a simple product licence."],
["File hygiene","Use sensible filenames and delivery methods without making files unusable.","Choose an appropriate protection level."],
["Ownership evidence","Keep source files, drafts and creation records for platform reporting if copying occurs.","Build an ownership evidence folder."]
],"Produce a licensing and ownership-evidence pack.","Protection should discourage misuse without punishing legitimate buyers."),
m("90-day capstone","Take one validated problem from prototype to listing, launch and improvement.",[
["Month 1: build","Validate, outline, prototype and test the product.","Complete an MVP and record feedback."],
["Month 2: publish","Finish design, listing, delivery and launch content.","Publish Admin Only first and QA purchase/access before public launch."],
["Month 3: improve","Review traffic, conversion, support questions and refunds.","Create version 1.1 based on evidence."]
],"Submit a complete digital product business pack.","A successful capstone is a useful tested product with a repeatable improvement process.")
],
videos:[
{module:10,title:"How to Sell Digital Products Online Using Selar",url:"https://www.youtube.com/watch?v=SJc-mHH8j_k",description:"Selar walkthrough for listing and delivering digital products in an African-friendly storefront.",region:"Nigerian English • Practical"},
{module:10,title:"Selar — Sell Digital Products Online",url:"https://www.youtube.com/watch?v=cB2fL3jWuwo",description:"Practical store setup and digital product selling workflow on Selar.",region:"Nigerian English • Practical"},
{module:2,title:"How to Make Money Selling Digital Products — Step-by-Step",url:"https://www.youtube.com/watch?v=uwUfrHeUYoU",description:"Nigeria-focused creator walkthrough from product idea to selling; income is not guaranteed.",region:"Nigerian English • Practical"},
{module:12,title:"How To Create an Online Course in 7 Simple Steps for Free",url:"https://www.youtube.com/watch?v=Z8C_5WlJwv8",description:"Practical product-creation workflow useful for turning expertise into a structured digital learning product.",region:"Nigerian English • Practical"},
{module:1,title:"10 Digital Products You Can Create as a Nigerian — No Laptop Required",url:"https://www.youtube.com/watch?v=lJ4CTv83Byg",description:"Mobile-first Nigerian digital-product idea and execution guide.",region:"Nigerian English • Practical"},
{module:10,title:"Create & Start Selling Digital Products for Free — Canva, Gumroad & Payhip",url:"https://www.youtube.com/watch?v=u_T6r1w-27w",description:"Beginner walkthrough combining product creation and storefront setup.",region:"International English • Practical"},
{module:10,title:"Sell Digital Products with Gumroad & Payhip — Step-by-Step",url:"https://www.youtube.com/watch?v=6lk0I2PifIQ",description:"Storefront and delivery workflow for creators selling downloadable products.",region:"International English • Practical"},
{module:3,title:"Selling Digital Products with Canva — Practical Workflow",url:"https://www.youtube.com/watch?v=UkCojDw6wjg",description:"Canva-oriented product workflow; headline earnings should be treated as creator examples, not promises.",region:"International English • Practical"},
{module:10,title:"How to Sell Digital Products 2026 — Full Tutorial",url:"https://www.youtube.com/watch?v=-O74EgXFJiw",description:"Current end-to-end digital product selling tutorial.",region:"International English • Practical"},
{module:4,title:"Turn Your Skill Into an eBook With AI and Sell on Gumroad",url:"https://www.youtube.com/watch?v=VSTvNED3K38",description:"eBook creation and storefront workflow with AI used as an assistant rather than a substitute for QA.",region:"International English • Practical"}
],
visuals:[
{title:"Digital product system",imageUrl:"/course-013-digital-products/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Research, build, package, list, deliver and improve."},
{title:"Digital product toolkit",imageUrl:"/course-013-digital-products/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Templates, profit planning, launch tracking and QA."}
],
references:[
{label:"Payhip free-product help",url:"https://help.payhip.com/article/76-how-to-create-a-free-product",summary:"Official Payhip help covering free products and pricing plans.",points:["Useful for lead magnets","Check current transaction terms"]},
{label:"Canva pricing",url:"https://www.canva.com/pricing/",summary:"Official plan comparison including Canva Free.",points:["Check asset licensing","Premium features require paid plans"]}
],
downloads:[],
freeTools:[
{label:"Canva",url:"https://www.canva.com/",summary:"Design ebooks, workbooks, templates, covers and mockups.",freeNote:"Free plan available"},
{label:"Google Docs",url:"https://docs.google.com/",summary:"Draft guides, checklists and editable documents.",freeNote:"Free with a Google account"},
{label:"Google Sheets",url:"https://sheets.google.com/",summary:"Build trackers, planners and calculators.",freeNote:"Free with a Google account"},
{label:"Payhip",url:"https://payhip.com/",summary:"Storefront option for digital products, courses and lead magnets.",freeNote:"Free plan with transaction fees; verify current terms"},
{label:"Gumroad",url:"https://gumroad.com/",summary:"Digital product storefront and delivery platform.",freeNote:"Basic selling without monthly subscription; fees apply"}
],
projects:[
{title:"Validated product brief",outcome:"One buyer problem, format and evidence-backed concept.",steps:["Research demand","Map competitors","Test a prototype"]},
{title:"Ebook or guide sample",outcome:"A polished source-aware five-page sample.",steps:["Outline","Draft and edit","Export and test"]},
{title:"Template or spreadsheet",outcome:"A tested editable product with instructions.",steps:["Design inputs","Build formulas/layout","Run a user test"]},
{title:"Sales + delivery package",outcome:"Listing copy, files and support system.",steps:["Write product page","Package delivery","QA access"]},
{title:"90-day capstone",outcome:"A complete build-launch-improve system.",steps:["Build","Launch","Review and version"]}
],
templates:[
{label:"Digital Product Builder Kit",href:"/course-013-digital-products/digital-product-toolkit.md",type:"Markdown",description:"Research, outline, QA, listing, launch and support templates."},
{label:"Digital Product Profit Tracker",href:"/course-013-digital-products/digital-product-tracker.csv",type:"CSV",description:"Track traffic, sales, fees, affiliate payouts, promotion and contribution."}
]};
export const course013=buildCourse(seed);
