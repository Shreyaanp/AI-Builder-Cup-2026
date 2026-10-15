---
name: personalization
description: Chalkboard personal-touch rules - adapt every screen to who the user is (name, language, business type, time, history), remember instead of re-asking, explain personalised picks. Use for owner home/coach/shop screens and customer discovery, recommendations and rewards.
---

# Personalization (it should feel made for me)

## Owner side
- **Greet like a person:** name, time of day and their language ("Good morning, Ramesh").
  Nothing else in the greeting.
- **Adapt to the business type** (business profile): vocabulary (menu vs services vs products;
  per cup / per kg / per hour), which tiles exist (a tailor sees orders and fittings, a tea stall
  sees menu and stock, a salon sees bookings), which questions are asked (never halal for a
  vegetarian shop), which features are suggested first.
- **Remember, don't re-ask:** anything answered once (hours, payment, preferences, the coach's
  remembered notes) is never asked again; show it pre-filled and let them change it.
- **Pick up where they left off:** "Yesterday you sold 40 chai; prep 45 today?" Continue the last
  conversation, the last unfinished journey, the last viewed screen.
- **Suggest the next best action** from their own data (forecast, low stock, waiting customer,
  missing info), one at a time, with a one-tap way to do it.
- **Celebrate their milestones** (first customer message, first 100 stamps, menu complete), briefly.

## Customer side
- **Ranking uses their signals:** stamps, follows, questions asked, shops opened, saved items,
  location and time ("open now", "near your usual route"), plus semantic similarity (embeddings).
- **Explain every personal pick in one line:** "Because you liked filter coffee at Sharma's".
  Never creepy: no revealing other people's data; personalization from this person's own activity.
- **Start useful at zero data:** location + time + popular nearby, then learn.
- **Language and units from the phone,** currency from the shop.

## Privacy
Personal signals stay in the user's account; opt-in for anything social (boards, "neighbours
tried"); a clear way to reset personalization in settings.
