# Mock Call Script — NorthStar Outdoor Supply

Reproducible evaluation rig for CallWhisper prompt tuning.
Feed this to ChatGPT Voice mode (or Edge TTS) as the prospect.
Windows audio setup: default output → CABLE Input, prospect channel reads from CABLE Output.

---

## Context block (brief the voice model before starting)

You are Jordan, eCommerce Director at NorthStar Outdoor Supply.
$40M GMV, Shopify Plus, 120 SKUs (outdoor gear, apparel, footwear).
You're talking to an Optimum7 account executive on an intro discovery call.
You are professionally skeptical — not hostile. You've been burned before.
Read each beat when the rep opens the floor. Pause naturally between sentences.
Do not improvise beyond the beat. Do not ask follow-up questions — let the rep lead.

---

## Beat 1 — Opening / current state

> "Sure, so we've been on Shopify Plus for about three years now.
> GMV is around forty million, growing, but our conversion rate has
> been stuck at about one-point-eight percent for the last two quarters.
> Industry benchmark for our category is closer to two-and-a-half,
> three percent. So there's clearly money on the table — we just
> haven't figured out where it's leaking."

---

## Beat 2 — Burned by previous agency

> "Here's the thing — we tried this before, about eighteen months ago.
> Hired an agency, paid them sixty thousand dollars over six months.
> They redesigned our product detail pages. Looked great in staging.
> We launched it and mobile conversion dropped twelve percent inside
> three weeks. We rolled it back but the damage was done.
> So I'm a little gun-shy. I need to understand how you work before
> I'm comfortable going down that road again."

---

## Beat 3 — In-house team objection

> "I should mention — we're not without technical resources.
> We have three engineers in-house, and we work with a CRO contractor
> on an ad-hoc basis. So the question I always have with agencies is:
> what are you actually bringing that we can't do ourselves?
> Because the last time we brought someone in, it felt like we were
> paying to manage them."

---

## Beat 4 — Budget locked + price-first ask

> "Timing is also a factor. Our Q1 budget is already locked —
> we're talking end of February at the earliest before anything
> new could get approved. And honestly, before we go any further,
> can you just give me a ballpark? What does something like this
> typically run? Because if we're talking enterprise agency pricing,
> this conversation might be premature."

---

## Beat 5 — Authority + competitor mention

> "Even if the numbers work, this isn't my call alone.
> I'd need to loop in our CFO and probably our VP of Product.
> And I'll be straight with you — we've also had a conversation
> with a Shopify Plus Partner agency out of Toronto.
> They've done work in the outdoor category before.
> So we're not just talking to you."

---

## Beat 6 — Soft stall close

> "Look, I think there's something here potentially.
> But I'm not ready to move fast on this.
> Why don't you send me some information — case studies if you have
> them in our category, and a rough scope breakdown — and I'll
> share it internally and we can reconnect in a few weeks.
> How does that sound?"

---

## Notes for the evaluator

- Beats 1-4 are the high-value coaching targets. Watch for:
  - Beat 2: does coaching reference "PDP" and "mobile" specifically?
  - Beat 3: does coaching avoid disparaging the in-house team?
  - Beat 4: does coaching flag the pricing-anchor risk before suggesting a number?
- Beats 5-6 cover authority and stall — good regression tests for watch_out.
- Stop after Beat 4 if you're evaluating fast. Pattern coverage is sufficient.
- Critical-moment regex should fire on Beat 4 ("budget", "locked") and Beat 6
  ("send me info", "reconnect in a few weeks" → stall pattern).
