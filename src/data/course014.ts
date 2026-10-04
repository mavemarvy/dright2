import { buildCourse, type CourseSeed, type ModuleSeed } from './courseFactory';
const m=(title:string,intro:string,lessons:ModuleSeed['lessons'],deliverable:string,principle:string):ModuleSeed=>({title,intro,lessons,deliverable,principle});
const context="Use mobile-first examples that Nigerians and Africans can test with low-cost tooling. Distinguish learning/free tiers from production/commercial plans, protect secrets, and never paste API keys into public repositories.";
const seed:CourseSeed={
courseNumber:"014",slug:"ai-website-app-bot-building-mastery-2026",title:"AI Website, App & Bot Building Mastery 2026",
subtitle:"Plan, build and deploy useful web apps, databases, APIs and Telegram bots with AI-assisted development",
promise:"Learn the full build cycle from idea and interface to GitHub, databases, authentication, APIs, bots, AI features, payments, security, deployment and monitoring. The course is beginner-friendly but treats production reliability and business economics seriously.",
accent:"builder",regionalContext:context,calculatorKind:"saas-break-even",productPath:"/dright/store",
modules:[
m("Product thinking before code","A useful app begins with a narrow user problem, clear workflow and testable success metric.",[
["Problem statement","Define user, problem, current workaround and why software helps.","Write a one-sentence problem statement for three app ideas."],
["MVP scope","Separate must-have workflow from nice-to-have features so the first version can be tested quickly.","Cut one idea to five essential screens or actions."],
["Success metric","Choose a measurable user outcome such as completed booking, submitted form or resolved support request.","Define one activation and one retention metric."]
],"Create a one-page product brief with user, workflow, MVP and metric.","Build the smallest complete workflow that proves value."),
m("Web foundations","Understand the browser, HTML, CSS, JavaScript and client-server flow so AI-generated code can be evaluated instead of blindly copied.",[
["HTML structure","Use semantic elements, forms and accessible labels to create meaningful pages.","Build a simple service page with a form."],
["CSS and responsive layout","Use flexible layout, spacing and breakpoints so the interface works on phones first.","Rebuild the page for 360px and desktop widths."],
["JavaScript behaviour","Understand variables, functions, events and async requests at a practical level.","Add form validation and a simple dynamic result."]
],"Build a responsive interactive landing page without a framework.","AI assistance is safest when you understand the structure it generates."),
m("Git and GitHub","Version control protects work, enables collaboration and makes deployment repeatable.",[
["Repository basics","Understand clone, add, commit, push and the difference between local files and repository history.","Create a repository and make three meaningful commits."],
["Branches and pull requests","Use branches for risky changes and review diffs before merging.","Create one feature branch and review its changes."],
["Secrets and .gitignore","Keep environment files, keys and private credentials out of version control.","Audit a sample repo and remove secret-like files."]
],"Create a clean GitHub project with README, branches and safe ignore rules.","Source control should preserve history without exposing secrets."),
m("Modern frontend development","Use component-based interfaces to keep screens reusable, testable and consistent.",[
["Components and props","Break repeated interface patterns into reusable components with clear inputs.","Create a reusable card, form field and button."],
["State and forms","Track user input and async states such as loading, success and error.","Build a form with loading and error feedback."],
["Routing and navigation","Map user workflows to predictable routes and protect private pages.","Create a route map for public, authenticated and admin screens."]
],"Build a small multi-page frontend with reusable components.","Component boundaries should match user and product responsibilities."),
m("Databases and data modelling","A database design should reflect entities, relationships, constraints and lifecycle rather than a collection of random tables.",[
["Tables and relationships","Model users, products, orders or messages with primary and foreign keys.","Draw an ER diagram for one app."],
["Constraints and indexes","Use required fields, uniqueness and indexes to protect correctness and performance.","Add three data rules and explain what each prevents."],
["CRUD workflows","Map create, read, update and delete actions to actual user permissions.","Write a CRUD matrix by role."]
],"Create a normalized schema and CRUD matrix for one MVP.","Model rules in the database as well as the interface."),
m("Supabase and Firebase foundations","Hosted backends can accelerate learning and MVPs, but quotas, security rules and pricing still matter.",[
["Supabase project","Understand Postgres, Auth, Storage, Realtime and Edge Functions as separate capabilities.","Create a practice project and document which service each feature uses."],
["Firebase project","Understand Firestore, Authentication, Storage and Functions enough to compare fit.","Model the same simple app in Firebase terms."],
["Platform comparison","Compare relational needs, realtime patterns, free-tier limits and operational trade-offs.","Write a short decision memo for your MVP."]
],"Choose a backend for one project and justify it using requirements.","Pick infrastructure from product needs, not trend popularity."),
m("Authentication and authorization","Authentication proves identity; authorization decides what that identity may do.",[
["Signup and login","Implement clear account states, email verification and password recovery where needed.","Draw the full auth journey including failure states."],
["Roles and permissions","Use server/database checks for buyer, seller, admin or team permissions.","Create a permission matrix."],
["Row-level security","Protect records so users can only read or mutate data they are entitled to access.","Write three RLS rules in plain English before coding."]
],"Produce an auth and authorization specification.","Never rely on hidden buttons as the only access control."),
m("APIs and integrations","APIs connect services, but every integration needs authentication, validation, error handling and rate awareness.",[
["REST basics","Understand endpoints, methods, status codes, JSON and idempotency.","Document a sample create-order API request and response."],
["Third-party APIs","Read official docs, start in sandbox where available and store keys server-side.","Integrate or mock one harmless public API."],
["Webhooks","Verify incoming events, prevent duplicate processing and keep audit logs.","Design a payment-webhook flow with idempotency."]
],"Create an API integration plan with auth, errors and retry behaviour.","Integrations must be secure and idempotent before they are automated."),
m("AI features inside apps","AI features need a defined task, context, cost limit, safety boundary and fallback.",[
["Choose the AI job","Use AI where language or pattern reasoning adds value, not for every button.","List five app features and select only those where AI meaningfully helps."],
["Prompt and context design","Provide structured context and restrict output format so the app can use the response safely.","Design a JSON-output prompt with validation rules."],
["Failure handling","Plan for unavailable models, bad output, rate limits and human escalation.","Create fallback messages and retry rules."]
],"Build an AI feature specification with cost and safety limits.","An AI feature is a product workflow, not just a model call."),
m("Telegram bot building","Bots can automate commands, onboarding, support and subscriptions when state and permissions are designed carefully.",[
["Bot commands","Use BotFather setup, commands and clear help text to define the user interface.","Design a command map for one bot."],
["User state and database","Store user settings and workflow state instead of relying on one global memory.","Model bot users, rules and subscription status."],
["Media and automation","Handle messages or media with explicit validation and safe fallbacks.","Build a test flow that accepts text and one media type."]
],"Create a functional bot specification and prototype flow.","Bots need per-user state, permission checks and clear failure messages."),
m("Payments and subscriptions","Payment code must separate checkout initiation, verified server confirmation and entitlement delivery.",[
["Checkout flow","Create an order before redirecting to payment and never trust the browser alone as proof of payment.","Draw the order-to-payment state machine."],
["Verification and webhooks","Verify provider references server-side and make fulfilment idempotent.","Write a duplicate-webhook test case."],
["Subscriptions and access","Store plan, start/end date, renewal state and entitlement separately from marketing UI.","Design a subscription record and access check."]
],"Create a payment and entitlement architecture diagram.","Money and access state must be driven by verified server records."),
m("Deployment and domains","Deployment is a repeatable release process with environment configuration, logs and rollback.",[
["Environment variables","Separate development and production values; never hard-code secrets.","Create an environment-variable inventory."],
["Hosting choices","Compare platform capabilities, limits and commercial terms before selecting a host.","Choose a learning host and a production path for one app."],
["Domains and HTTPS","Connect DNS carefully and confirm secure HTTPS before collecting credentials or payments.","Write a launch-domain checklist."]
],"Deploy a practice project and document the release procedure.","A deployment is complete only when configuration, security and rollback are understood."),
m("Security and production hardening","Small apps still need input validation, least privilege, logging, backups and abuse controls.",[
["Input and output safety","Validate form data, sanitize where needed and avoid rendering untrusted content unsafely.","List validation rules for five inputs."],
["Secrets and permissions","Rotate exposed keys, minimize service-role use and restrict admin actions.","Create a secrets and privileged-access checklist."],
["Monitoring and backups","Log important failures, watch usage and plan restoration before an incident.","Write a basic incident and backup plan."]
],"Produce a production-readiness checklist.","Security must be designed into data and server boundaries, not added after launch."),
m("SaaS economics and operations","A subscription app must understand recurring revenue, variable usage cost, support and churn before scaling.",[
["Pricing model","Choose free trial, freemium, one-time or recurring pricing based on value and cost.","Design three pricing tiers with clear limits."],
["Break-even users","Calculate contribution per user, fixed costs and the paying users required to break even.","Use the course calculator with three price scenarios."],
["Support and retention","Track activation, repeated use, support load and cancellations.","Define five product-health metrics."]
],"Create a SaaS financial and operations dashboard.","Growth without sustainable unit economics creates expensive problems."),
m("90-day build capstone","Take one useful product from idea to deployed, tested MVP with documentation.",[
["Weeks 1-2: specify","Validate the problem, write user stories and design the schema and screens.","Complete the product brief and architecture."],
["Weeks 3-8: build","Implement the core workflow, auth, data, tests and one integration.","Ship a private beta and record defects."],
["Weeks 9-12: harden","Fix critical issues, add monitoring, document support and prepare a controlled launch.","Run the full production-readiness checklist."]
],"Submit a deployed MVP plus repository, architecture, test evidence and launch plan.","A successful capstone is a reliable useful workflow, not the largest feature list.")
],
videos:[
{module:2,title:"Learn Git & GitHub for Beginners — 2026 Tutorial",url:"https://www.youtube.com/watch?v=h2a3Kw-I_Ec",description:"Beginner walkthrough of Git and GitHub fundamentals for version-controlled projects.",region:"English • 2026 • Beginner"},
{module:3,title:"React Tutorial for Beginners",url:"https://www.youtube.com/watch?v=SqcY0GlETPk",description:"Beginner-friendly React walkthrough covering core frontend concepts.",region:"English • Beginner"}
],
visuals:[
{title:"Build stack from idea to deployment",imageUrl:"/course-014-ai-builder/banner.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Frontend, backend, database, auth, APIs, bot and deployment."},
{title:"Builder toolkit",imageUrl:"/course-014-ai-builder/toolkit.svg",sourceUrl:"https://dright.store",sourceLabel:"DRIGHT original course artwork",caption:"Architecture templates, calculators and production checklists."}
],
references:[
{label:"GitHub pricing",url:"https://github.com/pricing",summary:"Official GitHub plan page including the Free plan and included repositories/Actions limits.",points:["Free limits can change","Public repositories expose code"]},
{label:"Supabase billing",url:"https://supabase.com/docs/guides/platform/billing-on-supabase",summary:"Official explanation of Supabase Free and paid plans, quotas and project limits.",points:["Free projects have quotas","Monitor usage"]},
{label:"Cloudflare Workers pricing",url:"https://developers.cloudflare.com/workers/platform/pricing/",summary:"Official Workers Free and paid-plan documentation.",points:["Useful for practice and small workloads","Check current limits"]}
],
downloads:[],
freeTools:[
{label:"GitHub",url:"https://github.com/",summary:"Host repositories, issues and version history.",freeNote:"Free plan available"},
{label:"Supabase",url:"https://supabase.com/",summary:"Hosted Postgres, Auth, Storage, Realtime and Functions.",freeNote:"Free plan with quotas"},
{label:"Firebase",url:"https://firebase.google.com/",summary:"Google backend platform with database, auth, hosting and other services.",freeNote:"Spark/no-cost options for eligible services; check pricing"},
{label:"Cloudflare Workers",url:"https://workers.cloudflare.com/",summary:"Deploy serverless code and Pages Functions for practice and small projects.",freeNote:"Workers Free plan available"},
{label:"Google AI Studio",url:"https://aistudio.google.com/",summary:"Prototype Gemini prompts and structured outputs before integration.",freeNote:"Free usage available within current limits"},
{label:"Vercel",url:"https://vercel.com/",summary:"Excellent deployment workflow for frontend apps; verify plan terms before commercial use.",freeNote:"Hobby is $0 but intended for personal/non-commercial use"}
],
projects:[
{title:"Responsive business site",outcome:"A phone-first multi-page site with form validation.",steps:["Design routes","Build reusable components","Test on small screens"]},
{title:"Database-backed app",outcome:"Auth plus CRUD with real permission rules.",steps:["Model schema","Implement auth","Add RLS/authorization"]},
{title:"Telegram bot",outcome:"A stateful bot prototype with database-backed user settings.",steps:["Define commands","Persist state","Test failure cases"]},
{title:"Payment-ready SaaS architecture",outcome:"Order, verified payment, entitlement and subscription design.",steps:["Model states","Design webhook idempotency","Document access checks"]},
{title:"90-day MVP capstone",outcome:"A deployed, tested and documented product.",steps:["Specify","Build private beta","Harden and launch"]}
],
templates:[
{label:"AI App Builder Kit",href:"/course-014-ai-builder/app-builder-toolkit.md",type:"Markdown",description:"Product brief, schema, API, auth, deployment and security templates."},
{label:"SaaS Build & Cost Tracker",href:"/course-014-ai-builder/saas-build-tracker.csv",type:"CSV",description:"Track features, defects, deployments, monthly costs, users and MRR."}
]};
export const course014=buildCourse(seed);
