"""The maintained feature list behind "how do I…?" answers, for owners and customers.

One entry per feature: what it does, how to do it by voice, and where it lives in the app. The
coach answers app questions from this list only (explain_app), and the instant router answers
the most common ones without a model call. Update an entry whenever a feature changes.
"""

import re
from dataclasses import dataclass
from typing import Literal

Audience = Literal["owner", "customer"]


@dataclass(frozen=True)
class Feature:
    id: str
    audience: Audience
    title: str
    what: str
    say: str
    where: str
    words: tuple[str, ...]


FEATURES: tuple[Feature, ...] = (
    Feature(
        "today",
        "owner",
        "Today",
        "Your daily shop totals and up to three things that need you, on the Coach tab.",
        '"Show Today".',
        "Coach; Shop is your page, Grow holds tools and You holds settings.",
        ("today", "daily", "priorities", "tabs", "navigation"),
    ),
    Feature(
        "games",
        "owner",
        "Stamps and perks",
        "Choose rewards for customer visits; customer games live in their passport.",
        '"Show perks" or "Free chai after 8 visits".',
        "Grow: Stamps & perks. Changes need your review.",
        ("games", "perks", "scratch", "sets", "streak", "co-op", "reward"),
    ),
    Feature(
        "payments",
        "owner",
        "Payments & rides",
        "Make a UPI payment link or QR to share, or open a ride app for a delivery; the app "
        "never handles money or books a rider.",
        '"Payment link for 250 rupees" or "Open payments".',
        "Grow: Payments & rides.",
        ("payment", "pay", "upi", "link", "qr", "rider", "ride", "delivery"),
    ),
    Feature(
        "supply",
        "owner",
        "Purchase orders",
        "Draft a reorder from the forecast and keep supplier rules; each order is sent only "
        "after you confirm it.",
        '"Reorder milk for tomorrow" or "Show purchase orders".',
        "Grow: Purchase orders.",
        ("purchase", "order", "reorder", "supplier", "restock"),
    ),
    Feature(
        "playbook",
        "owner",
        "What Chalkboard knows",
        "Your goals, the numbers that matter, what to watch and your regulars, which shape "
        "Today and Grow. Edit or remove anything.",
        '"What do you know about my shop?".',
        "You: Your data and privacy.",
        ("playbook", "know", "goals", "regulars", "learned", "remember"),
    ),
    Feature(
        "connect",
        "owner",
        "Connect your system",
        "Import your menu or sales from a POS or ERP file; you check the mapped columns first.",
        '"Connect my POS".',
        "Shop: Connect your system.",
        ("connect", "pos", "erp", "petpooja", "tally", "shopify", "import"),
    ),
    Feature(
        "customer_games",
        "customer",
        "Passport games",
        "Verified visits can earn scratch cards, collection sets, streaks and co-op progress.",
        '"Show my stamps".',
        "Passport. Open each game's rules for eligibility and rewards.",
        ("games", "scratch", "sets", "streak", "co-op", "passport"),
    ),
    Feature(
        "add_menu",
        "owner",
        "Add your menu",
        "Snap a photo of your menu or price board and the coach reads every item and price.",
        '"Add these to the menu" with a photo, or "Add masala chai 15 rupees a cup".',
        "Coach: the photo button next to the message box.",
        ("menu", "item", "items", "add", "product", "products", "photo", "price board"),
    ),
    Feature(
        "price_change",
        "owner",
        "Change a price",
        "Tell the coach the new price; you check old → new and confirm.",
        '"Samosa is 20 now".',
        "Coach, or Shop → Menu.",
        ("price", "prices", "cost", "change", "rate"),
    ),
    Feature(
        "sold_out",
        "owner",
        "Sold out or back in stock",
        "Mark an item sold out so customers don't make a wasted trip, and back when it returns.",
        '"Samosa is sold out" or "Samosa is back".',
        "Coach, or Shop → Sold out.",
        ("sold", "out", "stock", "finished", "available", "back"),
    ),
    Feature(
        "hours",
        "owner",
        "Opening hours and closed today",
        "Set your weekly hours, or close just for today; customers see open or closed.",
        '"We open 7 to 9 every day", "Closed on Sundays", "We are closed today".',
        "Coach, or Shop → Details.",
        ("hours", "open", "close", "closed", "timing", "timings", "today", "holiday"),
    ),
    Feature(
        "share",
        "owner",
        "Share your page and QR",
        "Turn on your customer page, then share the link or print the QR for the counter.",
        '"Share my page" or "Show my QR code".',
        "Shop → Customer page.",
        ("share", "qr", "link", "page", "customers", "customer page", "poster"),
    ),
    Feature(
        "messages",
        "owner",
        "Reply to customers",
        "Customers ask questions on your page; the coach drafts a reply and you tap Send.",
        '"Any customer questions?" then "Tell her we deliver after 6".',
        "Coach chip, or Shop → Messages.",
        ("message", "messages", "reply", "question", "questions", "customer", "inbox"),
    ),
    Feature(
        "close_day",
        "owner",
        "Close the day",
        "Photograph today's sales notebook or bill book; the coach reads it and saves your sales.",
        '"Close the day".',
        "Grow → Close the day.",
        ("close the day", "sales", "notebook", "day end", "end of day", "today's sales"),
    ),
    Feature(
        "rescue",
        "owner",
        "Rescue leftovers",
        "Offer leftovers at 20, 30 or 50% off until closing; nearby customers can hold them.",
        '"Rescue 6 croissants at 30% off until 8 pm".',
        "Coach.",
        ("rescue", "leftover", "leftovers", "discount", "waste", "deal"),
    ),
    Feature(
        "forecast",
        "owner",
        "How much to prepare",
        "A forecast per item from your sales (based on your recent weeks).",
        '"How much chai should I make tomorrow?"',
        "Coach, or Grow → Prep plan and Plan tomorrow.",
        ("forecast", "prepare", "prep", "tomorrow", "demand", "how much", "plan"),
    ),
    Feature(
        "insights",
        "owner",
        "How business is going",
        "Top sellers, slow movers and this week against last week, with 2-3 next steps.",
        '"How is business this week?"',
        "Coach.",
        ("business", "going", "insights", "grow", "analyse", "analyze", "week", "summary"),
    ),
    Feature(
        "suppliers",
        "owner",
        "Order supplies",
        "Find suppliers near you, prepare an order request and tap Send.",
        '"My flour is running low" or "I need 20 kg flour by tomorrow".',
        "Coach, and Grow → Orders.",
        ("supplier", "suppliers", "order", "flour", "restock", "running low", "buy"),
    ),
    Feature(
        "import_sales",
        "owner",
        "Connect your POS or sales file",
        "Upload a POS or Excel export (Petpooja, Tally, Square…); the coach maps the columns once.",
        '"Connect my POS" or "Import my sales".',
        "Coach: the attach button → Document.",
        ("pos", "import", "excel", "csv", "tally", "petpooja", "export", "connect", "billing"),
    ),
    Feature(
        "google",
        "owner",
        "Get on Google",
        "A guided checklist; you finish on Google's own pages (we cannot publish for you).",
        '"How do I get on Google?" or "What is my next Google step?"',
        "Grow tab.",
        ("google", "maps", "listing", "business profile", "search"),
    ),
    Feature(
        "stamps",
        "owner",
        "Stamp card and perks",
        "Choose a reward and how many visits earn it; customers collect stamps by scanning.",
        '"Set a stamp card: free chai after 8 visits".',
        "Coach, or Shop → Details → Stamp card.",
        ("stamp", "stamps", "loyalty", "reward", "perk", "perks", "card", "regulars"),
    ),
    Feature(
        "photos",
        "owner",
        "Shop photos",
        "Add photos of your shop or food for your customer page; remove any time.",
        '"Add a shop photo".',
        "Coach photo button, or Shop → Details → Photos.",
        ("photo", "photos", "picture", "gallery", "image", "remove photo"),
    ),
    Feature(
        "memory",
        "owner",
        "Teach the coach",
        "Tell the coach lasting facts; it remembers and you can delete notes any time.",
        '"Remember: we are closed every Monday".',
        "Coach; notes under You.",
        ("remember", "memory", "note", "notes", "learn", "teach"),
    ),
    Feature(
        "privacy",
        "owner",
        "Your data and deleting it",
        "See what is stored, download it, or delete your account data. Always asks to confirm.",
        '"Delete my data" opens the page; you confirm there.',
        "You tab.",
        ("privacy", "delete", "data", "erase", "account", "remove my"),
    ),
    Feature(
        "face_check",
        "owner",
        "Optional face check",
        "An optional duplicate-owner check; it never proves identity or ownership.",
        '"Register me" or "Verify me".',
        "You tab.",
        ("face", "verify", "register", "registration", "selfie"),
    ),
    Feature(
        "find",
        "customer",
        "Find food and shops nearby",
        "Ask in your own words; results come from shops' own menus and Google.",
        '"Cheap vegetarian breakfast near me".',
        "Home: the ask box or the mic.",
        ("find", "near", "nearby", "search", "where", "food", "shop", "open now"),
    ),
    Feature(
        "follow",
        "customer",
        "Follow a shop",
        "Follow a shop to see its updates and deals first.",
        '"Follow Asha Bakery".',
        "The shop's page → Follow.",
        ("follow", "favourite", "favorite", "updates"),
    ),
    Feature(
        "ask_owner",
        "customer",
        "Ask the owner",
        "Send the shop a question; facts it has listed are answered at once.",
        '"Ask Asha Bakery if they have eggless cake".',
        "The shop's page → Ask.",
        ("ask", "owner", "question", "message", "chat"),
    ),
    Feature(
        "directions",
        "customer",
        "Directions",
        "Opens walking directions to the shop in Google Maps.",
        '"Directions to Asha Bakery".',
        "The shop's page → Directions.",
        ("directions", "route", "how to get", "way", "navigate", "walk"),
    ),
    Feature(
        "my_stamps",
        "customer",
        "My stamps",
        "Your stamp cards and rewards from every shop you visit.",
        '"Show my stamps".',
        "Passport.",
        ("stamps", "stamp", "passport", "rewards", "card", "points"),
    ),
)

HOW_TO = re.compile(
    r"^\s*(?:how\s+(?:do|can|should)\s+i|how\s+to|where\s+(?:do|can)\s+i|can\s+i|"
    r"what\s+can\s+(?:you|i|this app)|what\s+does\s+this\s+app|help\s+me\s+with)\b",
    re.I,
)


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9']+", text.casefold()))


def score(feature: Feature, question: str) -> float:
    lowered = question.casefold()
    words = _tokens(question)
    hits = 0.0
    for word in feature.words:
        if " " in word:
            hits += 2 if word in lowered else 0
        elif word in words:
            hits += 1
    title = _tokens(feature.title)
    return hits + 0.5 * len(title & words)


def lookup(question: str, audience: Audience = "owner", limit: int = 3) -> list[Feature]:
    ranked = sorted(
        (f for f in FEATURES if f.audience == audience),
        key=lambda f: score(f, question),
        reverse=True,
    )
    return [f for f in ranked[:limit] if score(f, question) > 0]


def as_dict(feature: Feature) -> dict[str, str]:
    return {
        "title": feature.title,
        "what": feature.what,
        "say": feature.say,
        "where": feature.where,
    }


def explain_app(question: str = "") -> dict[str, object]:
    """Answer questions about this app itself ("how do I share my page?", "what can you do?",
    "where is close the day?") from the maintained feature list. Answer only from what it
    returns: what the feature does, what to say to do it by voice, and where it is. With an
    empty question, it lists everything the owner can do."""
    matches = lookup(question) if question.strip() else []
    if matches:
        return {"features": [as_dict(f) for f in matches]}
    return {
        "features": [{"title": f.title, "say": f.say} for f in FEATURES if f.audience == "owner"],
        "instruction": "Name the 3-4 features most useful for this shop right now, not all.",
    }


def guide_reply(question: str, audience: Audience = "owner") -> str | None:
    """A one-feature answer for a clear "how do I…?" question, else None (the model decides)."""
    if not HOW_TO.search(question):
        return None
    matches = lookup(question, audience, limit=2)
    if not matches:
        return None
    best = matches[0]
    if len(matches) > 1 and score(matches[1], question) == score(best, question):
        return None
    return f"{best.title}: {best.what} Just say {best.say} Where: {best.where}"
