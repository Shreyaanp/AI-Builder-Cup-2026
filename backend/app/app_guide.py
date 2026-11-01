"""The maintained feature list behind "how do I…?" answers, for owners and customers.

One entry per feature: what it does, how to do it by voice, and where it lives in the app. It is
the one shared map for both paths (simplify batch 2): the coach answers app questions from this
list only (explain_app), the instant router answers the most common ones without a model call,
and the owner screens show each feature's chat phrase ("Or just ask: …") from its JSON export
(src/features/v1/appGuide.json, written by `python -m scripts.export_app_guide`). Update an entry
whenever a feature or a screen label changes; test_app_guide_paths.py checks every `path`
against the labels the owner can see.
"""

import re
from dataclasses import dataclass
from typing import Literal

Audience = Literal["owner", "customer"]

# The owner's bottom tabs (there is no "Today" tab: Today is the top of Coach).
TABS = ("Coach", "Shop", "Grow", "You")
# What an owner sees on each tab, by its English label: tiles and rows (src/features/v1/*). A
# service shop's Menu tile reads "Services". tests/two-paths.spec.ts taps each one in the demo.
TAB_LABELS: dict[str, frozenset[str]] = {
    "Coach": frozenset(),
    "Shop": frozenset(
        {
            "Menu",
            "Services",
            "Sold out today",
            "Shop details",
            "Photos",
            "Messages",
            "Customer page",
            "Link your billing app",
        }
    ),
    "Grow": frozenset(
        {
            "Prep plan",
            "Plan tomorrow",
            "Close the day",
            "Orders",
            "Purchase orders",
            "Supply chain",
            "Rescue deals",
            "Asked nearby",
            "Payments & rides",
            "Get on Google",
            "Stamps & perks",
            "Your week",
            "Weekly recap",
        }
    ),
    "You": frozenset(
        {"Remind me", "Language", "Your shops", "Privacy & your data", "Talk to your coach"}
    ),
}
# Named controls inside a tile's sheet or page, one level down.
INNER_LABELS: dict[tuple[str, str], frozenset[str]] = {
    ("Shop", "Menu"): frozenset({"Add product"}),
    ("Shop", "Services"): frozenset({"Add product"}),
    ("Shop", "Shop details"): frozenset({"Closed today"}),
    ("Shop", "Messages"): frozenset({"Reply language"}),
    ("Grow", "Orders"): frozenset({"Find a supplier"}),
    ("Grow", "Payments & rides"): frozenset({"Send a rider"}),
    ("You", "Privacy & your data"): frozenset(
        {"What Chalkboard knows about your shop", "Verify it’s you"}
    ),
}


@dataclass(frozen=True)
class Feature:
    id: str
    audience: Audience
    title: str
    what: str
    say: str
    # Owner: tab, then a label on that tab, then a control inside it (TAB_LABELS, INNER_LABELS).
    path: tuple[str, ...]
    words: tuple[str, ...]
    # One short phrase to type or say, shown on screen as "Or just ask: …" (English and Hindi).
    ask: str = ""
    ask_hi: str = ""
    # The open_screen target that shows this feature, when there is one.
    screen: str = ""

    @property
    def where(self) -> str:
        return " → ".join(self.path)


FEATURES: tuple[Feature, ...] = (
    Feature(
        "today",
        "owner",
        "Today",
        "Your daily shop totals and up to three things that need you, at the top of Coach. "
        "Shop is your page, Grow holds tools and You holds settings.",
        '"Show Today".',
        ("Coach",),
        ("today", "daily", "priorities", "tabs", "navigation"),
        "What should I do today?",
        "आज क्या करना है?",
        "today",
    ),
    Feature(
        "details",
        "owner",
        "Shop name, kind and phone",
        "Change your shop's name, kind, address or phone; you check old → new and confirm.",
        '"Change my phone number to …".',
        ("Shop", "Shop details"),
        ("name", "phone", "number", "address", "kind", "rename"),
        "Change my phone number",
        "मेरा फ़ोन नंबर बदलो",
        "details",
    ),
    Feature(
        "games",
        "owner",
        "Stamps and perks",
        "Choose rewards for customer visits; customer games live in their passport.",
        '"Show perks" or "Free chai after 8 visits".',
        ("Grow", "Stamps & perks"),
        ("games", "perks", "scratch", "sets", "streak", "co-op", "reward"),
        "Show my perks",
        "मेरे इनाम दिखाओ",
        "games",
    ),
    Feature(
        "payments",
        "owner",
        "Payments & rides",
        "Make a UPI payment link or QR to share; the app never handles money.",
        '"Payment link for 250 rupees" or "Open payments".',
        ("Grow", "Payments & rides"),
        ("payment", "pay", "upi", "link", "qr"),
        "Make a payment link for 250",
        "250 का पेमेंट लिंक बनाओ",
        "payments",
    ),
    Feature(
        "rider",
        "owner",
        "Send a rider",
        "Open a ride app with your shop as pickup and the customer's address as drop; the "
        "app never books or pays the rider.",
        '"Send a rider".',
        ("Grow", "Payments & rides", "Send a rider"),
        ("rider", "ride", "delivery", "deliver", "courier", "rapido", "grab"),
        "Send a rider",
        "राइडर बुलाओ",
        "rider",
    ),
    Feature(
        "supply",
        "owner",
        "Purchase orders",
        "Draft a reorder from the forecast and keep supplier rules; each order is sent only "
        "after you confirm it.",
        '"Reorder milk for tomorrow" or "Show purchase orders".',
        ("Grow", "Purchase orders"),
        ("purchase", "order", "reorder", "restock"),
        "Reorder tea dust",
        "चायपत्ती फिर से मँगाओ",
        "supply",
    ),
    Feature(
        "deliveries",
        "owner",
        "Deliveries on the way",
        "What your suppliers confirmed, what is on the way and what you received.",
        '"What\'s coming today?".',
        ("Grow", "Supply chain"),
        ("coming", "deliveries", "delivered", "received", "arriving", "on the way"),
        "What's coming today?",
        "आज क्या आने वाला है?",
        "supply",
    ),
    Feature(
        "playbook",
        "owner",
        "What Chalkboard knows",
        "Your goals, the numbers that matter, what to watch and your regulars, which shape "
        "Today and Grow. Edit or remove anything.",
        '"What do you know about my shop?".',
        ("You", "Privacy & your data", "What Chalkboard knows about your shop"),
        ("playbook", "know", "goals", "regulars", "learned"),
        "What do you know about my shop?",
        "तुम मेरी दुकान के बारे में क्या जानते हो?",
        "playbook",
    ),
    Feature(
        "connect",
        "owner",
        "Link your billing app",
        "Import your menu or sales from a billing app file; you check the mapped columns first.",
        '"Connect my Petpooja".',
        ("Shop", "Link your billing app"),
        ("connect", "erp", "petpooja", "shopify", "system"),
        "Connect my Petpooja",
        "मेरा Petpooja जोड़ो",
        "connect",
    ),
    Feature(
        "customer_games",
        "customer",
        "Passport games",
        "Verified visits can earn scratch cards, collection sets, streaks and co-op progress.",
        '"Show my stamps".',
        ("Passport",),
        ("games", "scratch", "sets", "streak", "co-op", "passport"),
    ),
    Feature(
        "add_menu",
        "owner",
        "Add your menu",
        "Snap a photo of your menu or price board and the coach reads every item and price, "
        "or add one item at a time.",
        '"Add these to the menu" with a photo, or "Add masala chai 15 rupees a cup".',
        ("Shop", "Menu", "Add product"),
        ("menu", "item", "items", "add", "product", "products", "photo", "price board"),
        "Add cutting chai for 15 rupees",
        "कटिंग चाय 15 रुपये जोड़ो",
        "menu",
    ),
    Feature(
        "price_change",
        "owner",
        "Change a price",
        "Tell the coach the new price, or tap the price on the menu; you check old → new and "
        "confirm.",
        '"Samosa is 20 now".',
        ("Shop", "Menu"),
        ("price", "prices", "cost", "change", "rate"),
        "Samosa is 20 now",
        "समोसा अब 20 का",
        "menu",
    ),
    Feature(
        "sold_out",
        "owner",
        "Sold out or back in stock",
        "Mark an item sold out so customers don't make a wasted trip, and back when it returns.",
        '"Samosa is sold out" or "Samosa is back".',
        ("Shop", "Sold out today"),
        ("sold", "out", "stock", "finished", "available", "back"),
        "Samosa is sold out",
        "समोसा ख़त्म",
        "sold_out",
    ),
    Feature(
        "hours",
        "owner",
        "Opening hours",
        "Set your weekly hours; customers see open or closed.",
        '"We open 7 to 9 every day" or "Closed on Sundays".',
        ("Shop", "Shop details"),
        ("hours", "open", "close", "closed", "timing", "timings", "sundays", "holiday"),
        "We open 7 to 9",
        "हम 7 से 9 खुले हैं",
        "details",
    ),
    Feature(
        "closed_today",
        "owner",
        "Closed today",
        "Close just for today; customers see the shop closed until tomorrow and your weekly "
        "hours stay the same.",
        '"We are closed today" or "We are open again today".',
        ("Shop", "Shop details", "Closed today"),
        ("closed today", "close today", "shut today", "not open today", "open again"),
        "We are closed today",
        "आज दुकान बंद है",
        "details",
    ),
    Feature(
        "share",
        "owner",
        "Share your page and QR",
        "Turn on your customer page, then share the link or print the QR for the counter.",
        '"Share my page" or "Show my QR code".',
        ("Shop", "Customer page"),
        ("share", "qr", "link", "page", "customers", "customer page", "poster"),
        "Share my page",
        "मेरा पेज भेजो",
        "share",
    ),
    Feature(
        "messages",
        "owner",
        "Reply to customers",
        "Customers ask questions on your page; the coach drafts a reply and you tap Send.",
        '"Any customer questions?" then "Tell her we deliver after 6".',
        ("Shop", "Messages"),
        ("message", "messages", "reply", "question", "questions", "customer", "inbox"),
        "Any customer questions?",
        "ग्राहकों ने क्या पूछा?",
        "messages",
    ),
    Feature(
        "reply_language",
        "owner",
        "Reply language",
        "Choose the language the app and the coach use with you; replies to customers still "
        "follow the customer's own language.",
        '"Reply in Hindi" or "English mein bolo".',
        ("Shop", "Messages", "Reply language"),
        ("language", "hindi", "english", "tamil", "speak", "mein bolo"),
        "Reply in Hindi",
        "हिंदी में जवाब दो",
        "messages",
    ),
    Feature(
        "close_day",
        "owner",
        "Close the day",
        "Photograph today's sales notebook or bill book; the coach reads it and saves your sales.",
        '"Close the day".',
        ("Grow", "Close the day"),
        ("close the day", "sales", "notebook", "day end", "end of day", "today's sales"),
        "Close the day",
        "आज का हिसाब",
        "close_day",
    ),
    Feature(
        "rescue",
        "owner",
        "Rescue leftovers",
        "Offer leftovers at 20, 30 or 50% off until closing; nearby customers can hold them.",
        '"Rescue 6 croissants at 30% off until 8 pm".',
        ("Grow", "Rescue deals"),
        ("rescue", "leftover", "leftovers", "discount", "waste", "deal"),
        "6 bun maska 30% off till 8",
        "6 बन मस्का 8 बजे तक 30% छूट",
        "grow",
    ),
    Feature(
        "radar",
        "owner",
        "Nearby demand",
        "What people near your shop asked for that no shop here lists, once 5 different people "
        "asked. Add one to your menu if it fits.",
        '"What are people nearby asking for?".',
        ("Grow", "Asked nearby"),
        ("nearby", "asking", "asked", "demand", "people near", "want"),
        "What are people nearby asking for?",
        "आस-पास लोग क्या माँग रहे हैं?",
        "radar",
    ),
    Feature(
        "forecast",
        "owner",
        "How much to prepare",
        "A count per item for tomorrow, based on your last weeks of sales.",
        '"How much chai should I make tomorrow?"',
        ("Grow", "Prep plan"),
        ("forecast", "prepare", "prep", "tomorrow", "how much", "plan"),
        "How much chai tomorrow?",
        "कल कितनी चाय बनाऊँ?",
        "plan",
    ),
    Feature(
        "insights",
        "owner",
        "How business is going",
        "Top sellers, slow movers and this week against last week, with 2-3 next steps.",
        '"How is business this week?"',
        ("Grow", "Your week"),
        ("business", "going", "insights", "analyse", "analyze", "week", "summary"),
        "How was business this week?",
        "इस हफ़्ते बिक्री कैसी रही?",
        "grow",
    ),
    Feature(
        "suppliers",
        "owner",
        "Order supplies",
        "Find suppliers near you, prepare an order request and tap Send.",
        '"My flour is running low" or "I need 20 kg flour by tomorrow".',
        ("Grow", "Orders", "Find a supplier"),
        ("supplier", "suppliers", "flour", "running low", "buy"),
        "My milk is running low",
        "दूध ख़त्म होने वाला है",
        "grow",
    ),
    Feature(
        "import_sales",
        "owner",
        "Connect your POS or sales file",
        "Upload a POS or Excel export (Petpooja, Tally, Square…); the coach maps the columns once.",
        '"Connect my POS" or "Import my sales".',
        ("Shop", "Link your billing app"),
        ("pos", "import", "excel", "csv", "tally", "export", "billing"),
        "Import my sales",
        "मेरी बिक्री इम्पोर्ट करो",
        "connect",
    ),
    Feature(
        "google",
        "owner",
        "Get on Google",
        "A guided checklist; you finish on Google's own pages (we cannot publish for you).",
        '"How do I get on Google?" or "What is my next Google step?"',
        ("Grow", "Get on Google"),
        ("google", "maps", "listing", "business profile", "search"),
        "How do I get on Google?",
        "Google पर कैसे आऊँ?",
        "google",
    ),
    Feature(
        "stamps",
        "owner",
        "Stamp card and perks",
        "Choose a reward and how many visits earn it; customers collect stamps by scanning.",
        '"Set a stamp card: free chai after 8 visits".',
        ("Grow", "Stamps & perks"),
        ("stamp", "stamps", "loyalty", "reward", "perk", "perks", "card", "regulars"),
        "Free chai after 8 visits",
        "8 बार आने पर एक चाय मुफ़्त",
        "stamps",
    ),
    Feature(
        "photos",
        "owner",
        "Shop photos",
        "Add photos of your shop or food for your customer page; remove any time.",
        '"Add a shop photo".',
        ("Shop", "Photos"),
        ("photo", "photos", "picture", "gallery", "image", "remove photo"),
        "Add a shop photo",
        "दुकान की फ़ोटो जोड़ो",
        "photo",
    ),
    Feature(
        "icon",
        "owner",
        "Shop icon",
        "Make a square icon from your shop's name, or use one of your photos.",
        '"Make my icon".',
        ("Shop", "Shop details"),
        ("icon", "logo"),
        "Make my icon",
        "मेरा आइकन बनाओ",
        "icon",
    ),
    Feature(
        "memory",
        "owner",
        "Teach the coach",
        "Tell the coach lasting facts; it remembers and you can delete notes any time.",
        '"Remember: we are closed every Monday".',
        ("Shop", "Shop details"),
        ("remember", "memory", "note", "notes", "learn", "teach"),
        "Remember: closed on Mondays",
        "याद रखो: सोमवार को बंद",
        "details",
    ),
    Feature(
        "reminders",
        "owner",
        "Reminders",
        "A short reminder on your phone in the morning and evening, only when something needs "
        "you. Turn it on or off any time.",
        '"Remind me every morning".',
        ("You", "Remind me"),
        ("remind", "reminder", "reminders", "notification", "notifications", "alert"),
        "Remind me every morning",
        "मुझे हर सुबह याद दिलाओ",
        "reminders",
    ),
    Feature(
        "shops",
        "owner",
        "More shops",
        "Add another shop or switch between your shops; each has its own menu and coach.",
        '"Add another shop".',
        ("You", "Your shops"),
        ("another shop", "second shop", "switch shop", "shops"),
        "Add another shop",
        "एक और दुकान जोड़ो",
        "you",
    ),
    Feature(
        "privacy",
        "owner",
        "Your data and deleting it",
        "See what is stored, download it, or delete your account data. Always asks to confirm.",
        '"Delete my data" opens the page; you confirm there.',
        ("You", "Privacy & your data"),
        ("privacy", "delete", "data", "erase", "account", "remove my"),
        "Delete my data",
        "मेरा डेटा मिटाओ",
        "privacy",
    ),
    Feature(
        "face_check",
        "owner",
        "Optional face check",
        "An optional duplicate-owner check; it never proves identity or ownership.",
        '"Register me" or "Verify me".',
        ("You", "Privacy & your data", "Verify it’s you"),
        ("face", "verify", "register", "registration", "selfie"),
        "Verify me",
        "मेरा चेहरा जाँचो",
        "trust",
    ),
    Feature(
        "help",
        "owner",
        "What the coach can do",
        "Ask anything about your shop in your own words, or open the guide with examples.",
        '"What can you do?".',
        ("You", "Talk to your coach"),
        ("help", "examples", "guide", "tour"),
        "What can you do?",
        "तुम क्या कर सकते हो?",
        "you",
    ),
    Feature(
        "find",
        "customer",
        "Find food and shops nearby",
        "Ask in your own words; results come from shops' own menus and Google.",
        '"Cheap vegetarian breakfast near me".',
        ("Home: the ask box or the mic",),
        ("find", "near", "nearby", "search", "where", "food", "shop", "open now"),
    ),
    Feature(
        "follow",
        "customer",
        "Follow a shop",
        "Follow a shop to see its updates and deals first.",
        '"Follow Asha Bakery".',
        ("The shop's page", "Follow"),
        ("follow", "favourite", "favorite", "updates"),
    ),
    Feature(
        "ask_owner",
        "customer",
        "Ask the owner",
        "Send the shop a question; facts it has listed are answered at once.",
        '"Ask Asha Bakery if they have eggless cake".',
        ("The shop's page", "Ask"),
        ("ask", "owner", "question", "message", "chat"),
    ),
    Feature(
        "directions",
        "customer",
        "Directions",
        "Opens walking directions to the shop in Google Maps.",
        '"Directions to Asha Bakery".',
        ("The shop's page", "Directions"),
        ("directions", "route", "how to get", "way", "navigate", "walk"),
    ),
    Feature(
        "my_stamps",
        "customer",
        "My stamps",
        "Your stamp cards and rewards from every shop you visit.",
        '"Show my stamps".',
        ("Passport",),
        ("stamps", "stamp", "passport", "rewards", "card", "points"),
    ),
)
BY_ID = {feature.id: feature for feature in FEATURES}

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


def _plain(text: str) -> str:
    return " ".join(re.sub(r"[\s.!?।]+$", "", text.replace("’", "'")).casefold().split())


def by_ask(text: str) -> Feature | None:
    """The owner feature whose on-screen phrase ("Or just ask: …") is exactly this message."""
    said = _plain(text)
    return next(
        (f for f in FEATURES if f.ask and said in {_plain(f.ask), _plain(f.ask_hi)}),
        None,
    )


def where_line(feature_id: str) -> str:
    """The closing line of a coach answer: the same feature's screen path, from this map."""
    feature = BY_ID[feature_id]
    return f"You can also find this in {feature.where}."


def next_line(feature_id: str) -> str:
    """The demo's closing line: the same screen path, as the next thing to open."""
    return f"Next, open {BY_ID[feature_id].where}."


def as_dict(feature: Feature) -> dict[str, str]:
    return {
        "title": feature.title,
        "what": feature.what,
        "say": feature.say,
        "where": feature.where,
    }


def export() -> dict[str, object]:
    """The owner's half of the map for the screens (src/features/v1/appGuide.json)."""
    return {
        "tabs": list(TABS),
        "features": [
            {
                "id": f.id,
                "title": f.title,
                "path": list(f.path),
                "ask": f.ask,
                "ask_hi": f.ask_hi,
                "screen": f.screen,
            }
            for f in FEATURES
            if f.audience == "owner"
        ],
    }


def explain_app(question: str = "") -> dict[str, object]:
    """Answer questions about this app itself ("how do I share my page?", "what can you do?",
    "where is close the day?") from the maintained feature list. Answer only from what it
    returns: what the feature does, what to say to do it by voice, and where it is on screen
    (tab → tile → button). With an empty question, it lists everything the owner can do."""
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
    return f"{best.title}: {best.what} Just say {best.say} You can also find this in {best.where}."
