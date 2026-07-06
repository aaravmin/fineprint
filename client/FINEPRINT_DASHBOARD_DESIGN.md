# FinePrint Dashboard Design Direction

What an intuitive, low-wordiness LL97 dashboard looks like, given our scope. This is a direction document, not a rewrite of the roadmap. It says how the surface should behave so a building owner can type an address and understand their fine and their fix without reading a wall of text.

---

## The problem in one line

The value we sell is "address in, fine and fix out." The current surface makes the owner read a lot of text to get there. There are two wordiness problems and one clarity problem.

1. Getting to the fine number takes too much reading.
2. Understanding how each piece of infrastructure maps to the fine, and what investment moves it, takes too much reading.
3. The agentic ticketing is opaque. "An agent picked up this ticket" describes our plumbing, not the owner's building.

Everything below runs through one idea. Answer first. Detail underneath. Machinery last.

---

## The one principle

Show the answer first. Reveal the detail only when asked. Keep the machinery out of sight unless it earns its place.

This is progressive disclosure, the oldest reliable fix for a crowded interface. Nielsen named it in 1995. Show the essential thing first, reveal complexity on demand, and the interface stops overwhelming people. Modern dashboard guidance says the same thing. Draw the eye to the single most important metric first, then let people drill in for the rest.

There is also a strong recent argument that AI products over-show their reasoning. One designer who builds for finance and compliance describes inverting the hierarchy so outcomes come first and reasoning sits underneath, reachable on demand. Once a user trusts the tool, the trust scaffolding should shrink, not grow. That is exactly our situation. The owner hired us for a number and a plan, not to watch software think.

---

## The spine. Three questions, three layers

Given our scope, the whole product answers three questions in order.

1. **What do I owe.** The fine.
2. **Why do I owe it.** Which systems drive the fine.
3. **What do I do about it.** The plan, and the invest-and-reduce interaction.

Treat these as three layers of one screen, not three pages of a report. The owner should get question 1 answered before reading anything about question 2. Each layer is one click deep from the one above it. Nobody should have to read the "why" to see the "what."

---

## Layer 1. What do I owe

This is the headline. Make it a single big number with one plain sentence above it, and nothing else fighting for attention.

**Lead with the number.** One large figure. One sentence in plain English above it that frames what the number means. Example wording. "Your building is on track to owe about $240,000 in LL97 penalties in 2030." That sentence carries the article and fine basis in human terms, which A7 already requires as a display rule. Say it the way a person would, not the way the statute reads.

**State the basis as a plain sentence, not a lecture.** For Article 320, something like "You are charged $268 for every ton you go over your cap, so cutting emissions cuts the fine." For Article 321, "Your risk is a flat penalty for not finishing the required upgrades by the deadline." One sentence. The number is meaningless without it, so it goes right next to the number and nowhere else.

**Show the 2030 cliff as a small sparkline, not a table.** A tiny line that steps up at 2030 tells the story faster than a per-period grid. The grid can live one click down.

**Make confidence a quiet badge.** "Estimate" or "Verified" as a small tag on the number. Not a paragraph about data provenance. Clicking it opens the detail.

**Collapse everything else.** BIN, BBL, coefficients, occupancy split, the whole provenance trail. All of it goes behind one control that says something like "See how we calculated this." The owner who wants to file needs the BIN, so keep it reachable, but do not lead with it.

The test for this layer. A stranger lands on the page, reads one sentence and one number, and knows what they owe and roughly why. Everything else is optional depth.

---

## Layer 2. Why do I owe it

This is your core vision, the part where "this piece of my infrastructure relates to this, and it contributes this much to the fine." There is a standard, well-understood way to show precisely this, and we should adopt its logic.

**The contribution view.** Show each system as a bar. Sort the bars so the biggest driver of the fine is first. The owner sees, in one glance, that the gas boiler is most of the problem and the windows are a small part of it. This is the "why" made visual. A number in isolation means little. A number shown as a share of the whole tells the owner where to look.

**The cost-to-cut view (a marginal abatement cost curve, in plain clothes).** The retrofit world already has the exact chart for "which fix gives the most fine reduction per dollar." It is the marginal abatement cost curve. Each measure is a bar. The width is how much it cuts. The height is the cost per ton cut. Measures that save money over their life sit below the line. Sorted cheapest first, it reads as a staircase, and the owner sees the best-value fixes on the left without doing any math. We do not have to call it a MAC curve. We just have to use its shape, because it answers "biggest bang for the buck" at a glance.

**The interaction that ties it together.** Click a system in the contribution view. Its slice of the fine highlights, and the measure that addresses it surfaces with one line. "Your gas boiler drives about 60 percent of your overage. Switching to heat pumps removes most of it." That single click is the whole "this relates to this, and here is what to do" story, with no paragraph to read.

The test for this layer. The owner points at the largest bar and immediately understands it is the thing costing them the most, and what one change would fix it.

---

## Layer 3. What do I do about it

This is the invest-and-reduce interaction. Your roadmap already scopes it as B4. Frame it as direct manipulation, not a form.

**Show the recommended plan already loaded.** Before the owner touches anything, show one recommended bundle with an answer attached. "Spend about $180,000, remove about $210,000 of your 2030 fine, pay back in about 4 years." An answer on arrival beats a blank slider.

**Drag to explore, watch the fine move.** The owner drags investment up or down and the fine number moves in real time. Keep the "do nothing" baseline visible next to the active number the whole time, so the owner always sees what they avoid.

**Three numbers while dragging, not twelve.** Money in. Fine removed. Payback. That is what a person tracks while moving a slider. Capex breakdowns, incentive matching, and per-measure detail belong one layer down, not on the dial.

**Let them save and compare a couple of scenarios.** Owners want to weigh "cheapest to compliance" against "best long-term value." Two or three saved scenarios is plenty. More than that becomes its own wordiness problem.

The test for this layer. The owner moves one control and sees the fine shrink, with no reading required to understand the trade.

---

## The agentic ticketing question, answered directly

You asked whether it is even necessary to show the agent activity, and if so whether we are showing it well. Direct answers below.

**Mostly, hide it.** The owner hired the tool for an answer, not to watch agents work. "An agent picked up this ticket" is our architecture leaking onto the screen. It is internal plumbing. The word "ticket" is our word, not theirs. A building owner does not think in tickets and queues.

**Why the current display fails.** It narrates our process instead of their result. It uses our vocabulary. It shows motion without meaning. The owner sees something happening and cannot tell what it means for their building or their money. That is the opposite of intuitive.

**What to show instead.**

- **Lead with the outcome, framed as a recommendation.** Replace the ticket with a plain result. "Replace your gas boiler with heat pumps. Removes about $210,000 of your fine. Costs about $180,000. Pays back in about 4 years." That is the thing the owner wanted. The agent produced it. The owner does not need to see the agent to trust the output, they need to see the output framed clearly.

- **Rename the concept for the user.** Internally it can stay a ticket. On screen it is a "recommendation" or an "action." Keep engineering language in the code and human language on the surface.

- **Put the reasoning behind a quiet control.** A small "Why this?" that expands to the short reasoning and the source data. Most owners will never open it. The ones who do get the full picture. This is explainability on demand, and it is how tools like Linear surface AI suggestions without interrupting anyone. Summary first, detail on request, raw data last.

- **Show confidence and source, not a running activity log.** A small confidence tag and a link to the underlying record does more for trust than a live feed of agent steps. Reveal what the recommendation is based on, not every move the system made to get there.

**When showing the work is actually worth it.** Two cases only.

1. **A real wait.** If the analysis genuinely takes time, do not show a spinner that says "Working." Show a short plain-language checklist of what is done, what is in progress, and what is next. "Pulled your building data. Calculating your fine. Modeling your fixes." A meaningful checklist beats a vague spinner because it tells the owner where things stand. Take it down once the answer is ready.

2. **A real filing.** When an action touches an actual USPTO-style submission, here a DOB NOW filing or anything irreversible, that is exactly where you slow down and show the work. Preview the exact thing that will happen, let the owner review and confirm, and never auto-submit. This matches your own human-in-the-loop-on-filings rule. High-stakes actions earn friction. Low-stakes analysis does not.

The rule underneath all of this. Process display is a cost you pay for a reason. Pay it during real waits and before irreversible actions. Do not pay it to narrate routine analysis.

---

## What the first screen looks like, concretely

One address bar. The owner types an address and nothing else. No BIN, no BBL, no login.

Then one screen, top to bottom.

- One sentence and one big number. What you owe and why, in plain English.
- One row of bars. Which systems drive the fine, biggest first.
- One recommended action, framed as a result with money and payback attached.
- One button. "Reduce my fine," which opens the invest-and-reduce layer.

Everything else, the BIN and BBL, the provenance, the per-period schedule, the confidence detail, the agent reasoning, sits one click away behind quiet controls. The owner who wants depth can always reach it. The owner who wants an answer never has to.

---

## Design rules to apply across the product

- One question per screen. What, then why, then what to do. Never force the owner to read one to get the previous one.
- Lead with the number, not the method. The figure comes first, the calculation comes on request.
- One plain sentence before any figure. If a number appears without a human sentence framing it, it is not ready to ship.
- Name systems by what they are. "Your gas boiler," not a system code. "Your windows," not an envelope class.
- Reserve process display for real waits and real filings. Everywhere else, show the result and hide the machinery.
- Two reading levels minimum. A glance level and a detail level. Add a third raw level only where a power user needs it.
- Keep our words out of the owner's view. Ticket, agent, queue, BIN, coefficient. These are ours. Translate or hide them.
- Show the "do nothing" baseline whenever you show a fix. The owner should always see what they avoid.

---

## Anti-patterns to avoid

- A table as a first impression. Grids are for depth, not for the opening view.
- Provenance shown inline. Source and confidence are one click down, not on the headline.
- An agent activity log as primary UI. It narrates our process and means nothing to the owner.
- A jargon number with no "so what." Every figure needs a sentence that says why it matters.
- A blank slider. Load the recommended plan first, then let the owner explore from an answer.

---

## Why this works, in one paragraph

The tool already computes the right things. The roadmap is thorough. The gap is that the surface exposes the thoroughness instead of the answer. Progressive disclosure fixes crowded interfaces by showing the essential thing first and revealing the rest on demand. The contribution view and the cost-to-cut curve turn "which system, how much, what if I invest" into something the owner reads in a glance instead of a paragraph. And the agent work, which is real and valuable under the hood, should mostly disappear from view, surfacing only as clean recommendations, with its reasoning one quiet click away and its full process shown only during genuine waits and before real filings. Answer first. Detail underneath. Machinery last.

---

## Sources

Research drawn on for this direction.

- Nielsen Norman Group and UXPin on progressive disclosure and dashboard design principles (uxpin.com).
- Interaction Design Foundation on progressive disclosure for dashboards and data visualization (ixdf.org).
- Cognitive load theory applied to enterprise dashboards (fegno.com).
- "Metric trees" and drill-down dashboard patterns (uxpilot.ai).
- Mantlr, "Designing for AI Agents: 10 UX Patterns" 2026, on explainability on demand, action preview, and activity feeds (mantlr.com).
- Onething Design on plain-language communication of AI actions (onething.design).
- Yilan Gao, "Your AI Agent Needs Less Transparency, Not More," on outcomes-first hierarchy in high-stakes tools (medium.com).
- Smashing Magazine on dynamic checklists over spinners for agentic waits (smashingmagazine.com).
- Verse, ChartPad, ClimateWorks, and Aligned Incentives on the marginal abatement cost curve as the standard cost-per-ton-reduced visualization (verse.inc, climateworkscentre.org, alignedincentives.com).
- Arcadis Net Zero Catalyst on interactive decarbonization roadmaps and marginal abatement cost per measure (arcadis.com).
