"""Onboarding eval (paid, not CI): does the coach understand ~40 very different businesses?

Owner, 17 Oct 04:45: "if it is not smart there is no point". A self-cleaning helmet station was
asked "is it halal?". This plays an owner for each business through the app's own text coach
(`/api/v1/coach/stream`, new-shop mode) on live Gemini, answering whatever the coach asks, and
checks:

- ZERO irrelevant questions: never menu, prices, payment, delivery, halal, vegetarian or meat
  in onboarding; nothing from the business's own "never" list (e.g. food questions for a helmet
  station); every question outside the core five (name, what, where, hours, photo) is graded by
  a Gemini judge for THIS business, and at most two such extras per conversation.
- the business kind the coach understood (product / service / food / mixed, from the draft's
  profile) is right in >= 95% of the businesses;
- every stop word ("bas", "ho gaya", "band karo", "that's all", "stop", "bye") ends the
  conversation (end_conversation) with a goodbye and no question, also in the middle.

  GOOGLE_CLOUD_PROJECT=... uv run python -m scripts.onboarding_eval --only 1-8 --out a.json
  uv run python -m scripts.onboarding_eval --report a.json b.json ... > ../docs/qa/onboarding-eval.md
Uses the caller's gcloud application-default credentials (SMOKE_TEXT_MODEL, gemini-3.5-flash).
Any failure becomes a test case (backend/tests/test_business_understanding.py).
"""

# ruff: noqa: E501
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.settings import Settings

START = {"hi": "नमस्ते! मैं अपनी दुकान जोड़ना चाहता हूँ।", "en": "Hello! I want to add my shop."}
MAX_TURNS = 9

# Never asked in onboarding, whatever the business (Hindi, English, Hinglish).
FORBIDDEN = re.compile(
    r"menu|मेन्यू|मेनू|price|pricing|दाम|कीमत|रेट|\brate\b|कितने (?:का|की|के|रुपये)|"
    r"payment|pay\b|upi|cash|भुगतान|पेमेंट|deliver|डिलीवरी|होम डिलीवरी|"
    r"halal|हलाल|vegetarian|\bveg\b|शाकाहारी|non.?veg|नॉन.?वेज|meat|मांस|egg|अंडा",
    re.I,
)
FOOD_QUESTION = re.compile(
    r"food|khana|खाना|dish|डिश|cuisine|spicy|तीखा|मसाल|taste|स्वाद|allergen|snack|नाश्ता",
    re.I,
)
# The core five; anything else is an "extra" question.
CORE: dict[str, re.Pattern[str]] = {
    "name": re.compile(r"नाम|name|कहलाती|क्या कहते|called", re.I),
    "category": re.compile(
        r"क्या बेच|क्या मिलता|क्या बिकता|किस (?:चीज़|चीज|तरह|प्रकार)|कैसी दुकान|क्या काम|"
        r"क्या करते|क्या सेवा|what do you (?:sell|offer|do)|what kind|what (?:sort|type)|"
        r"kya bech|kya kaam|customers come|ग्राहक क्यों|ग्राहक किस|परोसते|क्या खाने|(?:सुविधाएँ|सेवाएँ|सुविधाएं|सेवाएं)[^?]*मिलत|खरीदने आते|\bserve\b|come to (?:your shop|you) (?:to|for)|buy or do|what (?:\w+ ){0,4}do you offer|"
        r"or is it something else|या कुछ और",
        re.I,
    ),
    "location": re.compile(
        r"कहाँ|कहां|पता\b|लोकेशन|जगह|इलाक|लैंडमार्क|गली|दुकान पर (?:ही )?(?:मौजूद )?(?:हैं|हो)|अभी दुकान|dukaa?n par|kahaa?n|based|where|"
        r"location|area|address|landmark|at the shop|are you at |right now|located",
        re.I,
    ),
    "hours": re.compile(
        r"कब (?:से|तक)?\s*खुल|कितने बजे|खुलने|खुलती|बंद होती|बंद करते|समय|घंटे|टाइम|hours|"
        r"timing|open|close|छुट्टी|बजे|holiday|day off",
        re.I,
    ),
    "photo": re.compile(r"फ़ोटो|फोटो|तस्वीर|photo|picture", re.I),
    "face": re.compile(r"चेहरा|चेहरे|face|verify|पहचान", re.I),
}
# Romanized Hindi in a Hindi conversation (the reply must be Devanagari).
ROMANIZED = re.compile(r"\b(?:kya|aap|aapki|apni|hain|dukaa?n|kitne|bataiye|theek)\b", re.I)
STOP_WORDS = ["bas", "ho gaya", "band karo", "that's all", "stop", "bye", "बस", "हो गया"]


@dataclass
class Business:
    key: str
    lang: str
    name: str
    intro: str
    kind: str
    place: str
    hours: str = ""
    clarify: str = ""
    never: str = ""  # business-specific irrelevant topics (regex)
    one_sentence: bool = False
    stop_early: bool = False


def b(*args: Any, **kwargs: Any) -> Business:
    return Business(*args, **kwargs)


NOT_FOOD = FOOD_QUESTION.pattern
BUSINESSES: list[Business] = [
    b(
        "helmet",
        "hi",
        "क्लीन हेलमेट पॉइंट",
        "हमारा सेल्फ-क्लीनिंग हेलमेट स्टेशन है, मशीन में हेलमेट दो मिनट में साफ़ और सैनिटाइज़ हो जाता है।",
        "service",
        "एमजी रोड मेट्रो के पास",
        never=NOT_FOOD,
    ),
    b(
        "helmet-en",
        "en",
        "Clean Helmet Point",
        "It's a self-cleaning helmet station. Riders put their helmet in the machine and it gets cleaned and sanitised in two minutes.",
        "service",
        "near MG Road metro",
        never=NOT_FOOD,
        one_sentence=True,
    ),
    b(
        "tailor",
        "hi",
        "राजू टेलर्स",
        "हम सिलाई का काम करते हैं, कपड़े सिलते हैं और ऑल्टरेशन भी।",
        "service",
        "लाजपत नगर मार्केट में",
        "सुबह 10 से रात 8",
        never=NOT_FOOD,
    ),
    b(
        "mobile-repair",
        "hi",
        "पटेल मोबाइल रिपेयर",
        "मोबाइल रिपेयर करते हैं, स्क्रीन, बैटरी सब बदलते हैं।",
        "service",
        "अंधेरी स्टेशन के पास",
        never=NOT_FOOD,
    ),
    b(
        "tuition",
        "en",
        "Bright Minds Tuition",
        "We run a tuition centre for class 6 to 10, maths and science.",
        "service",
        "Sector 15 market, Noida",
        "4 pm to 8 pm, Sunday closed",
        never=NOT_FOOD,
    ),
    b(
        "flowers",
        "hi",
        "गुलाब फूल भंडार",
        "फूल बेचते हैं, माला, गुलदस्ते, शादी की सजावट के फूल।",
        "product",
        "मंदिर के सामने, करोल बाग",
        never=NOT_FOOD,
    ),
    b(
        "tea",
        "hi",
        "लक्ष्मी टी स्टॉल",
        "लक्ष्मी टी स्टॉल, चाय और समोसा, इंदिरानगर मेट्रो के पास।",
        "food",
        "इंदिरानगर मेट्रो के पास",
        one_sentence=True,
    ),
    b(
        "pharmacy",
        "en",
        "Shree Medicals",
        "It's a pharmacy, medicines and basic health products.",
        "product",
        "opposite City Hospital, Jayanagar",
        "8 am to 11 pm",
        never=NOT_FOOD,
    ),
    b(
        "laundry",
        "hi",
        "साफ़ धुलाई",
        "कपड़े धोने और प्रेस करने का काम है, ड्राई क्लीन भी।",
        "service",
        "मालवीय नगर",
        never=NOT_FOOD,
        stop_early=True,
    ),
    b(
        "pet-grooming",
        "en",
        "Happy Paws Grooming",
        "We do pet grooming, baths, haircuts and nail trimming for dogs and cats.",
        "service",
        "Koramangala 5th block",
        never=NOT_FOOD,
    ),
    b(
        "bike-repair",
        "hi",
        "सिंह बाइक वर्क्स",
        "बाइक रिपेयर और सर्विसिंग करते हैं।",
        "service",
        "बस स्टैंड के पास, रोहतक",
        "सुबह 9 से शाम 7, मंगलवार बंद",
        never=NOT_FOOD,
    ),
    b(
        "parlour",
        "hi",
        "सुंदर ब्यूटी पार्लर",
        "ब्यूटी पार्लर है, थ्रेडिंग, फेशियल, मेहंदी, ब्राइडल मेकअप।",
        "service",
        "राजौरी गार्डन",
        never=NOT_FOOD,
    ),
    b(
        "photocopy",
        "en",
        "Quick Xerox",
        "Photocopy shop, printouts, lamination and spiral binding.",
        "service",
        "near Delhi University north campus",
        never=NOT_FOOD,
        stop_early=True,
    ),
    b(
        "home-bakery",
        "en",
        "Ammu's Home Bakes",
        "I run a home bakery, cakes and cookies on order.",
        "food",
        "HSR Layout",
        "orders 10 am to 7 pm",
    ),
    b(
        "yoga",
        "hi",
        "शांति योग क्लास",
        "योग क्लास चलाते हैं, सुबह और शाम के बैच।",
        "service",
        "पार्क के पास, विकास नगर",
        never=NOT_FOOD,
    ),
    b(
        "chai-recharge",
        "hi",
        "मुन्ना टी एंड रिचार्ज",
        "चाय भी बेचते हैं और मोबाइल रिचार्ज भी करते हैं।",
        "mixed",
        "रेलवे स्टेशन के बाहर",
    ),
    b(
        "vague",
        "hi",
        "शर्मा जनरल स्टोर",
        "कुछ भी बेचते हैं, सब कुछ।",
        "product",
        "गांधी चौक",
        clarify="घर का राशन, साबुन, बिस्किट, रोज़ का सामान बेचते हैं।",
    ),
    b(
        "vague-en",
        "en",
        "Kumar Store",
        "We sell everything, all sorts.",
        "product",
        "near the bus depot, Mysore",
        clarify="Daily needs: rice, oil, soap, biscuits.",
        stop_early=True,
    ),
    b(
        "kirana",
        "hi",
        "गुप्ता किराना",
        "किराना की दुकान है, राशन का सामान।",
        "product",
        "करोल बाग",
        "सुबह 7 से रात 10",
        never=NOT_FOOD,
    ),
    b("sweets", "hi", "शर्मा स्वीट्स", "मिठाई और नमकीन बेचते हैं।", "food", "चांदनी चौक"),
    b("vegetables", "hi", "हरी भरी सब्ज़ी", "सब्ज़ी और फल बेचता हूँ।", "product", "मालवीय नगर मार्केट"),
    b(
        "electrician",
        "en",
        "Ravi Electricals",
        "I'm an electrician, wiring, fan and switch repairs, house calls.",
        "service",
        "Whitefield",
        never=NOT_FOOD,
    ),
    b(
        "hardware",
        "en",
        "Jain Hardware",
        "Hardware store: paints, pipes, tools, sanitary fittings.",
        "product",
        "Industrial area phase 2",
        never=NOT_FOOD,
    ),
    b(
        "clothes",
        "hi",
        "फैशन पॉइंट",
        "रेडीमेड कपड़े बेचते हैं, जींस, कुर्ते, बच्चों के कपड़े।",
        "product",
        "सदर बाज़ार",
        never=NOT_FOOD,
    ),
    b(
        "dhaba",
        "hi",
        "पंजाबी ढाबा",
        "ढाबा है, दाल मखनी, बटर चिकन, तंदूरी रोटी।",
        "food",
        "हाईवे पर, करनाल",
    ),
    b(
        "cobbler",
        "hi",
        "रामू जूता मरम्मत",
        "जूते-चप्पल की मरम्मत और पॉलिश करता हूँ।",
        "service",
        "बस अड्डे के पास",
        never=NOT_FOOD,
    ),
    b(
        "stationery",
        "en",
        "Vidya Stationers",
        "Stationery and books, school supplies, gift wrapping.",
        "product",
        "near St. Mary's school",
        never=NOT_FOOD,
    ),
    b(
        "driving-school",
        "en",
        "Safe Drive School",
        "We are a driving school, car driving lessons and licence help.",
        "service",
        "Baner road, Pune",
        never=NOT_FOOD,
    ),
    b("juice", "hi", "फ्रेश जूस कॉर्नर", "ताज़ा जूस और शेक बेचते हैं।", "food", "कॉलेज गेट के सामने"),
    b(
        "carwash",
        "en",
        "Sparkle Car Wash",
        "Car and bike washing, interior cleaning, polishing.",
        "service",
        "Outer ring road, Marathahalli",
        never=NOT_FOOD,
    ),
    b(
        "gym",
        "hi",
        "पावर जिम",
        "जिम है, वेट ट्रेनिंग और कार्डियो, पर्सनल ट्रेनर भी।",
        "service",
        "सेक्टर 22",
        never=NOT_FOOD,
    ),
    b(
        "jewellery",
        "hi",
        "लक्ष्मी ज्वैलर्स",
        "सोने-चांदी के गहने बेचते हैं, मरम्मत भी करते हैं।",
        "mixed",  # sells and repairs
        "जौहरी बाज़ार, जयपुर",
        never=NOT_FOOD,
    ),
    b(
        "tiffin",
        "en",
        "Maa ki Rasoi Tiffin",
        "Home-style tiffin service, lunch and dinner for office people.",
        "food",
        "Andheri East",
    ),
    b(
        "mehendi",
        "hi",
        "रीना मेहंदी आर्ट",
        "शादी और त्योहार के लिए मेहंदी लगाती हूँ, घर पर भी आती हूँ।",
        "service",
        "लक्ष्मी नगर",
        never=NOT_FOOD,
    ),
    b(
        "toys",
        "en",
        "Toy Town",
        "Toy shop, kids toys, board games, school bags.",
        "product",
        "Phoenix mall road",
        never=NOT_FOOD,
    ),
    b(
        "plumber",
        "hi",
        "शर्मा प्लंबिंग",
        "प्लंबर हूँ, नल, पाइप, टंकी का काम घर पर आकर करता हूँ।",
        "service",
        "द्वारका सेक्टर 7",
        never=NOT_FOOD,
    ),
    b(
        "pan-recharge",
        "hi",
        "बबलू पान भंडार",
        "पान, सिगरेट, कोल्ड ड्रिंक और मोबाइल रिचार्ज।",
        "mixed",
        "चौराहे पर, लखनऊ",
    ),
    b(
        "cyber-cafe",
        "en",
        "Net Zone",
        "Cyber cafe: internet, online forms, printing, scanning.",
        "service",
        "near the post office, Indore",
        never=NOT_FOOD,
    ),
    b(
        "meat",
        "en",
        "Fresh Cuts",
        "We sell fresh chicken and mutton, cut to order.",
        "food",
        "Frazer Town",
    ),
    b(
        "pottery",
        "hi",
        "कुम्हार कला",
        "मिट्टी के बर्तन, दीये और गमले खुद बनाकर बेचते हैं।",
        "product",
        "हौज़ खास गांव",
        never=NOT_FOOD,
    ),
]


@dataclass
class Outcome:
    key: str
    lang: str
    expected_kind: str
    kind: str = ""
    kind_ok: bool = False
    questions: list[dict[str, Any]] = field(default_factory=list)
    irrelevant: list[str] = field(default_factory=list)
    extras: int = 0
    repeats: list[str] = field(default_factory=list)
    romanized: list[str] = field(default_factory=list)
    stop_word: str = ""
    ended: bool = False
    goodbye: str = ""
    error: str = ""
    seconds: float = 0.0

    def ok(self) -> bool:
        return (
            not self.error
            and not self.irrelevant
            and self.extras <= 2
            and self.ended
            and not self.repeats
            and not self.romanized
        )


def events_of(text: str) -> list[dict[str, Any]]:
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


# "(जैसे: कपड़ों की सिलाई या कुछ और?" belongs to the question before it (its examples).
EXAMPLE = re.compile(
    r"^\(?\s*(?:जैसे|e\.?g\.?|for example|like\b|या\b|or\b)|or something else|या कुछ और", re.I
)


def questions_in(reply: str) -> list[str]:
    questions: list[str] = []
    for sentence in re.findall(r"[^.!?।？]*[?？]", reply):
        sentence = sentence.strip()
        if not sentence:
            continue
        if questions and EXAMPLE.search(sentence):
            questions[-1] = f"{questions[-1]} {sentence}"
        else:
            questions.append(sentence)
    return questions


# Where a service goes to its customers (house calls): a question of its own, not the shop's pin.
SERVICE_AREA = re.compile(r"house call|home visit|visit|घर (?:पर|जा)|किन इलाकों", re.I)


def topic(question: str) -> str:
    if SERVICE_AREA.search(question) and not CORE["photo"].search(question):
        return "extra"
    for key in ("photo", "face", "hours", "location", "name", "category"):
        if CORE[key].search(question):
            return key
    return "extra"


class Judge:
    """Gemini grades each question outside the core five for THIS business."""

    def __init__(self, settings: Settings) -> None:
        from google import genai

        self.model = settings.google_text_model
        self.client = genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )

    def relevant(
        self, business: Business, question: str, so_far: str, reply: str
    ) -> tuple[bool, str]:
        from google.genai import types

        prompt = (
            "A small business owner is listing their business in an app. During the short"
            " onboarding the assistant may only ask what is clearly relevant to THIS business."
            f"\nWhat the business really is (the assistant only knew what the owner had said"
            f" by then): {business.intro}"
            f"\nWhat the owner had said when the question came: {so_far or '(nothing yet)'}"
            "\nA question about something the owner had NOT said yet is not a repeat."
            f"\nThe assistant's whole reply (context): {reply}"
            f"\nQuestion asked: {question}\n"
            'Answer JSON {"relevant": true|false, "reason": "..."}: false when the question'
            " assumes a different kind of business (e.g. food questions to a repair shop),"
            " is about menu, prices, payment, delivery, halal or vegetarian, or would make"
            " the owner feel misunderstood."
        )
        for _ in range(3):
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema={
                        "type": "object",
                        "properties": {
                            "relevant": {"type": "boolean"},
                            "reason": {"type": "string"},
                        },
                        "required": ["relevant", "reason"],
                    },
                    temperature=0.0,
                    max_output_tokens=600,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            try:
                data = json.loads(response.text or "")
                return bool(data["relevant"]), str(data.get("reason", ""))[:200]
            except (ValueError, KeyError, TypeError):
                continue
        # Never a pass by default: an unjudged question counts against the coach.
        return False, "judge gave no verdict"


def answer_for(business: Business, asked: str, said: dict[str, int]) -> str:
    hi = business.lang == "hi"
    said[asked] = said.get(asked, 0) + 1
    if asked == "name":
        return business.name
    if asked == "category":
        if said[asked] > 1 and business.clarify:
            return business.clarify
        return business.intro
    if asked == "location":
        return (
            f"नहीं, अभी दुकान पर नहीं हूँ। {business.place}।"
            if hi
            else f"No, I'm not at the shop now. It's {business.place}."
        )
    if asked == "hours":
        return business.hours or ("पता नहीं, अभी तय नहीं है।" if hi else "Not sure yet.")
    if asked == "photo":
        return "बाद में।" if hi else "Later."
    if asked == "face":
        return "नहीं, अभी नहीं।" if hi else "No, not now."
    return "पता नहीं।" if hi else "I'm not sure."


def run_one(client: TestClient, business: Business, judge: Judge, stop_word: str) -> Outcome:
    outcome = Outcome(business.key, business.lang, business.kind, stop_word=stop_word)
    started = time.monotonic()
    sid: str | None = None
    draft: dict[str, Any] | None = None
    said: dict[str, int] = {}
    answered: set[str] = set()
    owner_so_far: list[str] = []

    def turn(message: str) -> tuple[str, list[dict[str, Any]]]:
        nonlocal sid, draft
        owner_so_far.append(message)
        body = {
            "message": message,
            "language": business.lang,
            "new_shop": True,
            "session_id": sid,
            "new_shop_draft": draft,
        }
        response = client.post("/api/v1/coach/stream", json=body, timeout=90)
        events = events_of(response.text)
        for _ in range(2):
            if not any(
                e["kind"] == "error" and e.get("code") in {"PROVIDER_ERROR", "TURN_TIMEOUT"}
                for e in events
            ):
                break
            # Vertex quota (429) even after the app's own retries: wait, then send it again.
            time.sleep(45)
            response = client.post("/api/v1/coach/stream", json=body, timeout=90)
            events = events_of(response.text)
        if not events:
            raise RuntimeError(f"no events ({response.status_code}): {response.text[:200]}")
        sid = sid or events[0].get("session_id")
        for event in events:
            if event["kind"] == "draft":
                draft = event["data"]
            if event["kind"] == "error":
                raise RuntimeError(f"coach error: {event}")
        reply = next((e.get("text") or "" for e in reversed(events) if e["kind"] == "reply"), "")
        if not reply:
            reply = "".join(e.get("text") or "" for e in events if e["kind"] == "delta")
        if business.lang == "hi" and ROMANIZED.search(reply):
            # One language, its own script: never "kya aap abhi apni dukan par hain?".
            outcome.romanized.append(reply[:200])
        return reply, events

    try:
        reply, _ = turn(START[business.lang])
        first = (
            f"{business.name}, {business.intro} {business.place}" if business.one_sentence else None
        )
        for index in range(MAX_TURNS):
            asked = questions_in(reply)
            topics = [topic(q) for q in asked]
            for question, kind in zip(asked, topics, strict=True):
                record = {"turn": index, "question": question, "topic": kind}
                # "What do you offer, hair salon or fresh meat?" to "Fresh Cuts" asks what the
                # business is (the core); the business's own never-list still applies to it.
                bad = (FORBIDDEN.search(question) if kind != "category" else None) or (
                    business.never and re.search(business.never, question, re.I)
                )
                if bad:
                    outcome.irrelevant.append(f"{question} (forbidden: {bad.group(0)})")
                if kind == "extra":
                    outcome.extras += 1
                    relevant, reason = judge.relevant(
                        business, question, " / ".join(owner_so_far), reply
                    )
                    record["judge"] = {"relevant": relevant, "reason": reason}
                    if not relevant:
                        outcome.irrelevant.append(f"{question} (judge: {reason})")
                # "करोल बाग में कोई लैंडमार्क?" builds on the place the owner gave: a follow-up.
                follow_up = (
                    kind == "location" and business.place.split(",")[0].split()[0] in question
                )
                if kind in answered and kind in {"name", "location"} and not follow_up:
                    outcome.repeats.append(question)
                outcome.questions.append(record)
            if business.stop_early and index == 2 or not asked:
                break
            # The owner answers the core question of the reply (not a trailing clarifier).
            main = next((t for t in reversed(topics) if t != "extra"), topics[-1])
            if main == "face":
                break
            message = first if first and index == 0 else answer_for(business, main, said)
            if main in {"name", "location"}:
                answered.add(main)
            reply, _ = turn(message)
        reply, events = turn(stop_word)
        outcome.goodbye = reply[:300]
        outcome.ended = any(
            e["kind"] == "action" and (e.get("data") or {}).get("target") == "end_conversation"
            for e in events
        ) and not questions_in(reply)
        understood = (draft or {}).get("understanding") or {}
        outcome.kind = str(understood.get("kind", ""))
        # A vague owner ("we sell everything") who stopped before saying more: "unknown" is the
        # honest kind, never a guess.
        vague = bool(business.clarify) and said.get("category", 0) < 2
        outcome.kind_ok = outcome.kind == business.kind or (vague and outcome.kind == "unknown")
    except Exception as error:  # a failed run is a result
        outcome.error = repr(error)[:300]
    outcome.seconds = round(time.monotonic() - started, 1)
    return outcome


def pick(spec: str) -> list[int]:
    chosen: list[int] = []
    for part in spec.split(","):
        low, _, high = part.partition("-")
        chosen += list(range(int(low), int(high or low) + 1))
    return chosen


def evaluate(chosen: list[int], out: str = "") -> list[Outcome]:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
        settings = Settings(
            _env_file=None,
            app_env="test",
            v1_enabled=True,
            coach_mode="gemini",
            gemini_backend="vertex",
            google_cloud_project=os.environ["GOOGLE_CLOUD_PROJECT"],
            google_text_model=os.getenv("SMOKE_TEXT_MODEL", "gemini-3.5-flash"),
            google_live_model=os.getenv("SMOKE_LIVE_MODEL", "gemini-3.8-live"),
            auth_mode="local",
            session_backend="sqlite",
            merchant_backend="sqlite",
            moderation_mode="fixture",
            media_bucket="",
            context_cache_enabled=False,
            merchant_database=str(Path(folder) / "merchant.sqlite3"),
            recall_path=str(Path(folder) / "recall"),
        )
        app = create_app(settings, InMemorySessionService())
        judge = Judge(settings)
        outcomes = []
        # One client (one event loop for the app's async Gemini clients); each business is a
        # fresh local owner (new cookies).
        with TestClient(app, headers={"origin": "http://127.0.0.1:3200"}) as client:
            for index in chosen:
                business = BUSINESSES[index - 1]
                client.cookies.clear()
                client.get("/api/v1/bootstrap")
                version = client.get("/api/v1/me").json()["legal_version"]
                client.post(
                    "/api/v1/consent", json={"version": version, "terms": True, "privacy": True}
                )
                stop_word = STOP_WORDS[(index - 1) % len(STOP_WORDS)]
                outcome = run_one(client, business, judge, stop_word)
                print(
                    f"{index:2}. {business.key:16} {'PASS' if outcome.ok() else 'FAIL'}"
                    f" kind={outcome.kind or '-'}({'ok' if outcome.kind_ok else 'want ' + business.kind})"
                    f" questions={len(outcome.questions)} extras={outcome.extras}"
                    f" irrelevant={len(outcome.irrelevant)} ended={outcome.ended}"
                    f" {outcome.seconds}s {outcome.error}",
                    flush=True,
                )
                outcomes.append(outcome)
                if out:
                    # Saved after every business: a batch cut short keeps what it finished.
                    Path(out).write_text(
                        json.dumps([asdict(o) for o in outcomes], ensure_ascii=False, indent=1),
                        "utf-8",
                    )
        return outcomes


def report(outcomes: list[dict[str, Any]]) -> str:
    total = len(outcomes)
    irrelevant = sum(len(o["irrelevant"]) for o in outcomes)
    kind_ok = sum(1 for o in outcomes if o["kind_ok"])
    ended = sum(1 for o in outcomes if o["ended"])
    errors = sum(1 for o in outcomes if o["error"])
    questions = sum(len(o["questions"]) for o in outcomes)
    extras = sum(o["extras"] for o in outcomes)
    lines = [
        "# Onboarding eval: does the coach understand the business?",
        "",
        "Re-run: `GOOGLE_CLOUD_PROJECT=<project> uv run python -m scripts.onboarding_eval"
        " --only 1-8 --out a.json` (in batches), then `--report a.json b.json ...`.",
        "Live text coach (`/api/v1/coach/stream`, new-shop mode) on"
        f" {os.getenv('SMOKE_TEXT_MODEL', 'gemini-3.5-flash')}; a scripted owner answers whatever"
        " is asked; a Gemini judge grades every question outside the core five.",
        "",
        "| Pass bar | Result |",
        "| --- | --- |",
        f"| Zero irrelevant questions | {irrelevant} irrelevant of {questions} questions"
        f" ({extras} extras) {'PASS' if irrelevant == 0 else 'FAIL'} |",
        f"| >= 95% correct kind | {kind_ok}/{total} = {100 * kind_ok / max(total, 1):.0f}%"
        f" {'PASS' if kind_ok >= 0.95 * total else 'FAIL'} |",
        f"| Every stop word ends the conversation | {ended}/{total}"
        f" {'PASS' if ended == total else 'FAIL'} |",
        f"| Runs without errors | {total - errors}/{total} |",
        "",
        "| # | Business | Lang | Kind (want) | Questions asked | Extras | Stop word | Ended |"
        " Result |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for index, o in enumerate(outcomes, 1):
        asked = "; ".join(f"{q['topic']}: {q['question']}" for q in o["questions"])
        result = (
            "PASS"
            if not o["error"]
            and not o["irrelevant"]
            and o["extras"] <= 2
            and o["ended"]
            and not o["repeats"]
            and not o.get("romanized")
            else "FAIL"
        )
        lines.append(
            f"| {index} | {o['key']} | {o['lang']} | {o['kind'] or '-'} ({o['expected_kind']})"
            f" | {asked.replace('|', '/')} | {o['extras']} | {o['stop_word']} |"
            f" {'yes' if o['ended'] else 'no'} | {result} |"
        )
    problems = [
        (o["key"], issue)
        for o in outcomes
        for issue in [
            *o["irrelevant"],
            *(f"repeated: {r}" for r in o["repeats"]),
            *(f"romanized Hindi: {r}" for r in o.get("romanized", [])),
        ]
        + ([f"error: {o['error']}"] if o["error"] else [])
        + ([] if o["kind_ok"] else [f"kind {o['kind'] or '-'}, want {o['expected_kind']}"])
        + ([] if o["ended"] else [f"'{o['stop_word']}' did not end: {o['goodbye']}"])
    ]
    lines += ["", "## Findings", ""]
    lines += [f"- {key}: {issue}" for key, issue in problems] or ["- None."]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default=f"1-{len(BUSINESSES)}")
    parser.add_argument("--out", default="")
    parser.add_argument("--report", nargs="*")
    args = parser.parse_args()
    if args.report:
        outcomes = [o for path in args.report for o in json.loads(Path(path).read_text("utf-8"))]
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        print(report(outcomes), end="")
        return 0
    outcomes = evaluate(pick(args.only), args.out)
    return 0 if all(o.ok() for o in outcomes) else 1


if __name__ == "__main__":
    sys.exit(main())
