import type { Article } from './sports-hub-articles';

const YOUTH_AUTHOR = {
  name: 'The Squad Youth Sports Team',
  title: 'Youth Program Operations',
};

export const YOUTH_ARTICLES: Record<string, Article> = {
  'how-to-run-a-youth-sports-camp': {
    id: 'how-to-run-a-youth-sports-camp',
    slug: 'how-to-run-a-youth-sports-camp',
    title: 'How to Run a Youth Sports Camp: A Complete Planning Guide',
    excerpt: 'Plan a safe, organized youth sports camp with a practical timeline for registration, staffing, schedules, communication, payments, and post-camp follow-up.',
    categories: ['Youth Sports', 'Team Management'],
    tags: ['youth sports camp', 'camp management', 'registration', 'scheduling', 'safeguarding', 'program operations'],
    author: YOUTH_AUTHOR,
    readingTime: 11,
    publishedAt: '2026-08-08',
    seoTitle: 'How to Run a Youth Sports Camp: Complete Planning Guide',
    seoDescription: 'A step-by-step youth sports camp planning guide covering registration, staffing, safeguarding, schedules, communication, payments, and follow-up.',
    isFeatured: true,
    section: 'youth',
    content: `## Start With a Camp Operating Plan

A successful youth sports camp is not just a collection of drills. It is a short-term program with registration, staffing, facilities, safeguarding, communication, medical information, payments, and daily handoffs between adults.

Write the operating plan before opening registration. At minimum, decide:

- The age range and skill level the camp serves
- The dates, daily start and finish times, and drop-off window
- The maximum number of participants
- The coach-to-participant structure required by your governing body, insurer, facility, and local rules
- The facility, weather backup, equipment, and first-aid plan
- What is included in the fee and how refunds will work
- Who has authority for safety, parent communication, and schedule changes

Do not publish a capacity based only on floor or field space. Staffing, supervision, washrooms, emergency access, and the ability to keep age groups organized often create the real limit.

## An Eight-Week Camp Planning Timeline

### Eight to Six Weeks Before Camp

- Confirm the facility agreement and permitted activities
- Verify insurance requirements and certificates
- Name the camp director and safeguarding lead
- Recruit qualified coaches and support staff
- Define age groups, skill groups, capacity, fees, and refund terms
- Build the registration form and parent information page

### Six to Four Weeks Before Camp

- Open registration
- Publish a clear daily schedule and packing list
- Collect participant needs, emergency contacts, medical alerts, and authorized pickup information
- Order equipment, shirts, awards, or participant materials
- Confirm staff screening, training, and required certifications

### Four to Two Weeks Before Camp

- Review enrollment by age and experience
- Build balanced groups without promising permanent placements
- Confirm staff assignments and backup coverage
- Walk through emergency, weather, injury, missing-child, and pickup procedures
- Send families the first operational update

### Final Week

- Freeze the working roster and flag missing forms
- Print or securely prepare emergency-access information
- Confirm facility access, keys, equipment, and first-aid supplies
- Share staff contacts and the escalation chain
- Send a final parent message with arrival time, location, clothing, food, water, medication, and pickup instructions

## Build a Registration Form That Prevents Check-In Problems

The registration form should collect only information the program genuinely needs and can protect. Typical fields include:

- Participant legal and preferred name
- Date of birth or age group
- Sport experience and requested level
- Parent or guardian name, email, and mobile number
- Emergency contact and relationship
- Relevant medical, allergy, accessibility, or accommodation information
- Authorized pickup people
- Consent, waiver, media preference, and refund acknowledgement
- Shirt size or equipment needs when applicable

Mark essential questions as required. Explain why sensitive information is collected, who can access it, and when it will be deleted. Never place medical or emergency details in a public roster, shared spreadsheet link, or general staff group chat.

## Design the Daily Schedule Around Young Athletes

Build the day in blocks with a clear purpose. A useful structure is:

1. Arrival and attendance
2. Group warm-up and movement preparation
3. Skill instruction in small groups
4. Water and recovery break
5. Applied game or competition activity
6. Lunch or longer rest period
7. Second skill theme or multi-sport activity
8. Small-sided games and review
9. Controlled pickup and sign-out

Alternate high-focus instruction with play, water, and lower-intensity activity. Adjust for age, heat, facility conditions, and the demands of the sport. A schedule should help coaches pace the day; it should never prevent them from stopping for safety or fatigue.

## Staff Roles and Safeguarding

Every adult should know their role before participants arrive.

**Camp director:** Owns the program, staffing decisions, parent escalations, and facility relationship.

**Safeguarding lead:** Receives concerns, documents incidents, and follows the reporting policy required by the organization and jurisdiction.

**Lead coaches:** Deliver the activity plan and supervise assigned groups.

**Support staff:** Manage attendance, equipment, transitions, water, and controlled pickup.

**First-aid lead:** Maintains supplies, knows participant alerts, documents care, and activates emergency services when required.

Use the screening, rule-of-two, conduct, and reporting standards required by your sport organization and jurisdiction. In Canada, review the [Universal Code of Conduct to Prevent and Address Maltreatment in Sport](https://sportintegritycommissioner.ca/uccms). In the United States, programs connected to the Olympic and Paralympic movement should review the [U.S. Center for SafeSport](https://uscenterforsafesport.org/) requirements.

## Parent Communication That Reduces Day-One Confusion

Send information in short, timed messages instead of one enormous email.

**Registration confirmation:** Dates, location, payment status, refund terms, and a link to the camp information page.

**One-week reminder:** Packing list, arrival process, staff contact, medication procedure, and weather plan.

**Day-of update:** Only when something changes, such as a field move, delayed start, air-quality response, or pickup change.

**Post-camp message:** Thank families, share approved photos or resources, provide lost-and-found instructions, and request feedback.

Use one authoritative communication channel. If a schedule changes, update the source schedule first and then notify families from that source.

## Payments, Refunds, and Financial Controls

Publish the total fee and everything it includes. State the refund deadline, administrative fee, cancellation policy, and what happens if the organizer cancels because of weather or enrollment.

Keep payment records separate from participant health information. Limit refund and financial access to authorized staff. Reconcile paid, pending, refunded, waived, and offline payments before camp begins so coaches are not making financial decisions at check-in.

## The Camp-Day Control Checklist

- Attendance is taken at arrival and after every major transition
- Emergency contacts are available to authorized staff
- Medical alerts are visible only to staff who need them
- Equipment and playing areas are inspected before use
- Water, shade, rest, and weather monitoring are planned
- Participant-to-staff counts are checked throughout the day
- Injuries, incidents, and early pickups are documented
- Pickup identity and authorization are confirmed
- No participant is left without an approved handoff

## Measure the Camp After It Ends

Within 48 hours, debrief with staff. Review attendance, incidents, schedule pressure, equipment, parent questions, group placement, and staffing. Ask families a short set of questions: Was the information clear? Did the participant feel safe and included? Was the level appropriate? Would they return?

Turn those answers into the next camp plan. The best camp system is reusable: forms, schedules, messages, staff roles, checklists, and reporting improve each time instead of being rebuilt from memory.

## Frequently Asked Questions

### How early should youth sports camp registration open?

For a local day camp, six to eight weeks is often enough to confirm demand and staffing. Larger travel, residential, or specialized camps may need a longer runway. Do not open registration until the facility, capacity, refund policy, and core safety plan are confirmed.

### What information should a youth camp collect?

Collect identity, guardian contact, emergency, accommodation, consent, and operational details that are necessary to run the camp safely. Avoid collecting sensitive information without a defined purpose, access policy, and retention plan.

### What software helps run a youth sports camp?

A useful camp system connects registration forms, participant lists, schedules, attendance, communication, waivers, facilities, and payment status. The Squad supports these workflows across team and organization workspaces so staff and families follow one current source.`,
  },

  'how-to-start-a-youth-sports-nonprofit': {
    id: 'how-to-start-a-youth-sports-nonprofit',
    slug: 'how-to-start-a-youth-sports-nonprofit',
    title: 'How to Start a Youth Sports Nonprofit in Canada or the United States',
    excerpt: 'A practical formation guide for youth sports founders covering mission, incorporation, governance, tax status, safeguarding, insurance, fundraising, and first-season operations.',
    categories: ['Youth Sports', 'Team Management'],
    tags: ['youth sports nonprofit', 'nonprofit formation', 'governance', 'fundraising', 'sports organization'],
    author: YOUTH_AUTHOR,
    readingTime: 14,
    publishedAt: '2026-08-07',
    seoTitle: 'How to Start a Youth Sports Nonprofit in Canada or the US',
    seoDescription: 'A practical guide to forming a youth sports nonprofit, including mission, incorporation, governance, tax status, insurance, safeguarding, and operations.',
    isFeatured: true,
    section: 'youth',
    content: `## First, Decide Whether a Nonprofit Is the Right Structure

A nonprofit is an organization created for a purpose other than distributing profit to owners. It can pay employees, buy equipment, charge registration fees, and build reserves, but its resources must support the organization's stated purpose.

Nonprofit status is not a shortcut to free money or automatic tax exemption. It creates legal, reporting, governance, and public-trust responsibilities. Before incorporating, confirm that the program needs a separate legal entity rather than operating under an existing club, school, municipality, or fiscal sponsor.

> This guide is educational, not legal, tax, accounting, insurance, or safeguarding advice. Requirements vary by country, province, state, municipality, sport, and funding source. Use the official sources linked below and obtain qualified local advice before filing.

## Step 1: Write a Specific Public-Benefit Mission

A useful mission explains who the organization serves, what it provides, and why the work matters.

**Too broad:** "We promote sports."

**More useful:** "We provide affordable after-school basketball instruction and league play for youth ages 9 to 15 in North Calgary, with fee assistance for families facing financial barriers."

The mission guides legal objects, grant applications, budgets, program eligibility, and board decisions. Define geographic scope, age range, sport or activity, access commitments, and the outcomes the program intends to create.

## Step 2: Validate Community Need

Before creating an entity, speak with families, schools, recreation departments, coaches, facilities, and existing clubs. Document:

- The number and age of potential participants
- Current programs, waitlists, cost barriers, and transportation gaps
- Available facilities and realistic rental costs
- Similar organizations that could partner instead of compete
- Coach, official, volunteer, and board-member availability
- Expected registration fees and fee-assistance demand

Validation should change the plan. A program that cannot secure safe facilities, qualified adults, or sustainable funding should not open registration yet.

## Step 3: Choose the Legal Path

### Canada

In Canada, incorporation and registered charity status are separate decisions.

A group may incorporate federally under the Canada Not-for-profit Corporations Act or provincially or territorially under the law where it operates. Federal incorporation can support a national name and framework, but it may still require extra-provincial registration where the organization operates.

Registered charity status is a separate application to the Canada Revenue Agency. Not every amateur sports organization qualifies as a charity. A Registered Canadian Amateur Athletic Association is also a distinct federal designation with specific eligibility requirements.

Start with the [Government of Canada guidance for not-for-profit corporations](https://ised-isde.canada.ca/site/corporations-canada/en/not-profit-corporations) and the [Canada Revenue Agency charity guidance](https://www.canada.ca/en/services/taxes/charities.html).

### United States

In the United States, founders generally create a nonprofit corporation under state law, obtain an Employer Identification Number from the IRS, adopt governance documents, and then apply for federal tax-exempt recognition if appropriate.

Many youth sports charities apply under Internal Revenue Code section 501(c)(3), but other classifications may fit some membership organizations. IRS Form 1023 or Form 1023-EZ may be used for eligible 501(c)(3) applications. State charity registration, sales-tax, employment, and local requirements may also apply.

Start with the [IRS lifecycle of an exempt organization](https://www.irs.gov/charities-non-profits/life-cycle-of-an-exempt-organization) and the relevant state corporation and charity regulators.

## Step 4: Build an Independent, Working Board

The board is not a ceremonial group of friends who approves whatever the founder requests. It owes duties to the organization and should be able to review finances, risk, compensation, conflicts, and program results independently.

Recruit directors with complementary skills:

- Youth development or coaching
- Finance and bookkeeping
- Legal or governance experience
- Safeguarding and risk management
- Fundraising and community partnerships
- Facilities and program operations
- Lived connection to the families served

Adopt bylaws that cover director terms, meetings, voting, officers, committees, records, conflicts of interest, and removal. Record decisions in minutes. Use a written conflict-of-interest policy and require directors to disclose personal or financial interests.

## Step 5: Create the Foundational Documents

The exact package varies, but most organizations need:

- Articles or certificate of incorporation
- Bylaws
- Initial board resolutions and officer appointments
- Conflict-of-interest policy
- Financial controls and signing authority
- Participant and staff codes of conduct
- Safeguarding, complaint, and incident procedures
- Privacy and record-retention policies
- Registration, refund, accessibility, and fee-assistance policies
- Volunteer screening and training standards

Policies should describe what staff actually do. A copied policy that no one understands creates a false sense of safety.

## Step 6: Set Up Banking and Financial Controls

Open an account in the organization's legal name. Do not run registration revenue through a founder's personal account.

Use basic separation of duties:

- One person initiates a payment and another approves it
- Bank statements go to someone who does not perform every transaction
- Cash is counted by two people and deposited promptly
- Refunds and fee waivers are documented
- Related-party transactions are disclosed and approved by disinterested directors
- The board receives regular budget-to-actual reports

Build the first budget from realistic participant counts. Include incorporation, accounting, insurance, facilities, equipment, screening, officials, technology, marketing, financial assistance, and contingency reserves.

## Step 7: Secure Insurance and Manage Risk

Discuss the actual program with a broker experienced in amateur or youth sport. Depending on activities and staffing, coverage may include commercial general liability, directors and officers liability, accident coverage, property, cyber or privacy, abuse and molestation, event coverage, and vehicle or travel considerations.

Insurance does not replace safe operations. Maintain incident reporting, emergency action plans, facility inspections, coach qualifications, supervision rules, return-to-play processes, and documented parent communication.

## Step 8: Establish Safeguarding Before Recruitment

Safeguarding is a launch requirement, not a policy to add after the first complaint.

Define:

- Screening and background-check requirements where lawful and applicable
- Training requirements for staff and volunteers
- Adult-to-youth interaction rules
- Travel, locker room, overnight, and electronic communication standards
- How concerns are received, escalated, documented, and reported
- Mandatory reporting responsibilities
- Anti-retaliation and participant-support processes

Align these policies with the relevant governing body, insurer, facility, and law. Communicate the standards to families in plain language.

## Step 9: Build a Sustainable Revenue Model

Most youth sports nonprofits use a mix of:

- Registration and program fees
- Donations
- Local sponsorships
- Grants
- Fundraising events or campaigns
- Merchandise or concessions
- Municipal, school, or facility partnerships

Do not promise tax receipts until the organization has the legal authority to issue them. In Canada, incorporation alone does not permit official charitable donation receipts. In the United States, state incorporation alone does not automatically create federal 501(c)(3) recognition.

Create a written fee-assistance process with eligibility, confidentiality, approval authority, and budget limits. Financial access is part of the mission, but it still needs controls.

## Step 10: Plan the First Season Conservatively

Start with a program the organization can supervise well. A smaller first season allows the board to test registration, screening, facilities, communications, payments, incident handling, and financial reporting.

Before registration opens, confirm:

- Legal entity and banking are active
- Insurance is bound for the planned activities
- Facility agreements are signed
- Safeguarding and emergency procedures are approved
- Coaches and volunteers meet screening and training requirements
- Registration, waiver, privacy, and refund language has been reviewed
- The budget works at a conservative enrollment level
- Families know who operates the program and how to raise concerns

## Frequently Asked Questions

### Is a nonprofit automatically tax exempt?

No. Incorporation and tax-exempt or charitable recognition are separate processes. The correct path depends on jurisdiction and organizational purpose.

### Can a youth sports nonprofit pay coaches or staff?

Generally, a nonprofit can pay reasonable compensation for real work, subject to its governing documents, conflict rules, tax requirements, and board oversight. Compensation should be approved and documented by disinterested decision-makers.

### Does a nonprofit need a board?

Incorporated nonprofits generally require directors under the law governing the corporation. The number, residency rules, terms, and reporting requirements vary. A functioning board is also essential for financial and safeguarding accountability.

### What software does a youth sports nonprofit need?

At minimum, the organization needs controlled systems for registration, rosters, schedules, communication, payments, documents, volunteers, and financial records. The Squad connects these operational workflows while maintaining role-based access for staff, coaches, athletes, and families.`,
  },

  'youth-sports-team-name-ideas': {
    id: 'youth-sports-team-name-ideas',
    slug: 'youth-sports-team-name-ideas',
    title: '100 Youth Sports Team Name Ideas and a Practical Naming Checklist',
    excerpt: 'Find youth sports team name ideas by style, then use a practical checklist to choose a name that is memorable, respectful, searchable, and usable for years.',
    categories: ['Youth Sports'],
    tags: ['team names', 'youth sports team names', 'team branding', 'club identity', 'name ideas'],
    author: YOUTH_AUTHOR,
    readingTime: 9,
    publishedAt: '2026-08-06',
    seoTitle: '100 Youth Sports Team Name Ideas and Naming Checklist',
    seoDescription: 'Browse 100 youth sports team name ideas and use a practical checklist for choosing a memorable, respectful, searchable, and lasting team name.',
    isFeatured: false,
    section: 'youth',
    content: `## A Good Team Name Has to Work in Real Life

A youth sports team name will appear on uniforms, registration forms, schedules, tournament brackets, social profiles, fundraising materials, and public announcements. The best name is not only clever. It is easy to say, easy to spell, appropriate for young athletes, and distinct enough to find online.

Before choosing, decide whether you are naming one team, a club with multiple age groups, a school program, or a community organization. A single team can use a playful identity. A long-term club usually needs a broader name that still works when athletes age up or new sports are added.

## 100 Youth Sports Team Name Ideas

### Speed and Energy

- Accelerators
- Afterburners
- Breakaways
- Chargers
- Comets
- Dash
- Fast Lane
- Flashpoint
- High Voltage
- Jetstream
- Momentum
- Quickstrike
- Redline
- Rush
- Sonic
- Sparks
- Surge
- Velocity
- Wildfire
- Zoom

### Strength and Resilience

- Anchors
- Bedrock
- Forge
- Fortitude
- Guardians
- Grit
- Ironclad
- Keystone
- Northstar
- Outlast
- Pillars
- Rampart
- Resolute
- Stonewall
- Stronghold
- Summit
- Tenacity
- Titans
- Unbroken
- Vanguard

### Community and Place

- Bridge City
- Capital Crew
- City Limits
- Coastline
- Crossroads
- District United
- Foothills
- Harbour Lights
- Heartland
- Hometown
- Lakeside
- Metro United
- North End
- Parkside
- Prairie Crew
- River City
- Southside
- Trailhead
- Valley United
- West Ridge

### Sky, Weather, and Space

- Aurora
- Blue Sky
- Eclipse
- Fireballs
- Horizon
- Lightning
- Meteors
- Moonshot
- Northern Lights
- Orbit
- Pulsars
- Skybound
- Solar
- Starfall
- Stormfront
- Thunder
- Thunderbolts
- Twisters
- Updraft
- Zenith

### Teamwork and Purpose

- Alliance
- Collective
- Crew
- Elevate
- First Unit
- Foundation
- Full Circle
- Impact
- Link
- One Team
- Pathfinders
- Rally
- Rise
- Side by Side
- Standard
- Together
- Trailblazers
- Union
- United
- Wayfinders

## Build a More Distinctive Name

Generic names are easier to remember but harder to own online. Add a truthful local or program identifier:

- **Place + identity:** Calgary Northstar, River City Rush, Lakeside United
- **Direction + identity:** West Ridge Velocity, North End Forge
- **Club + identity:** Summit Basketball Club, Foothills Soccer Alliance
- **Age group + identity:** Parkside U12 Sparks, Metro 15U Vanguard

Do not add a place you do not represent. Community trust matters more than sounding regional.

## The Team Name Checklist

### 1. Athletes Can Say and Spell It

Ask several athletes to hear the name once and write it down. If everyone spells it differently, registration searches, social handles, and word-of-mouth referrals will be harder.

### 2. It Works Across Ages

A name that delights six-year-olds may embarrass teenagers. If the program will grow with the athletes, choose an identity that can mature with them.

### 3. It Is Respectful

Avoid names, mascots, imagery, gestures, or chants that appropriate cultures, reduce people to stereotypes, glorify harm, or create a hostile environment. Consult the people affected rather than relying only on the founders' intent.

### 4. It Is Distinct in Your Region and Sport

Search the full name with the city, sport, province or state, and nearby communities. Check tournament listings, governing-body directories, social platforms, and map results. Similar names cause registration, payment, and schedule mistakes.

### 5. The Digital Identity Is Available

Check a practical domain, social handles, and email format. Exact matches are ideal, but clarity matters more than forcing an unusual spelling.

### 6. The Name Can Be Used Legally

A web search is not a trademark clearance. Search the relevant corporate-name and trademark databases, then obtain professional advice when the club will invest meaningfully in the brand. In Canada, start with the [Canadian Trademarks Database](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks). In the United States, start with the [USPTO Trademark Search](https://tmsearch.uspto.gov/).

### 7. The Logo Does Not Have to Explain It

Choose the name before the logo. A strong identity should still work in plain text on a schedule or score sheet. The logo can add character later.

## A Simple Team Naming Process

1. Ask athletes, coaches, and families for ideas within clear guidelines.
2. Shortlist five names that pass the respect and regional search checks.
3. Test each name in a sentence: "Welcome to the River City Rush U14 team."
4. Check domains, social handles, corporate names, and trademarks.
5. Let the intended athlete group provide input without turning the decision into an unlimited popularity contest.
6. Approve the final name through the club or organization's documented process.
7. Record the exact spelling, capitalization, colours, and permitted short form.

## Frequently Asked Questions

### Should a youth team name include the city?

Including the city or community improves local recognition and search clarity, especially for clubs that recruit regionally. It is optional for a single recreational team but useful for a lasting organization.

### Should every age group use the same club name?

Usually yes. A consistent club identity makes registration, uniforms, sponsorship, and public schedules easier to understand. Age groups can use a division label or secondary nickname when the governing body permits it.

### Can we use a professional team's name or logo?

Do not assume a professional, college, school, or existing club identity is free to use. Names, logos, uniform designs, and other brand elements may be protected. Choose an original identity and check applicable trademark and league rules before ordering uniforms.`,
  },
};
