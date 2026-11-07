"""Food and drink words the offline /demo coach accepts as a new menu item ("add vada pav for
25"). An allowlist, not a denylist: "add rent for 5000" or "add a table for 4" names no food, so
the demo offers its examples instead of a wrong "New item" card."""

from __future__ import annotations

# Common Indian and Singapore shop foods and drinks: the last word of a new item's name.
FOOD = frozenset(
    """
    chai tea kopi teh coffee cappuccino latte espresso mocha milo horlicks bournvita lassi
    chaas buttermilk milk milkshake shake juice lemonade nimbu soda sharbat sherbet falooda
    kulfi cream sundae smoothie water coconut neer mor kahwa kadha thandai
    jaljeera rasna cola sugarcane barley chendol cendol bandung tarik halia
    samosa kachori pakora pakoda bhaji bajji bonda vada wada pav paav bun maska toast sandwich
    misal usal bhel panipuri golgappa dabeli ragda pattice sevpuri dahipuri
    puff roll wrap frankie kathi momo dumpling cutlet tikki chop
    idli dosa dosai uttapam uthappam appam upma poha pongal pesarattu paniyaram puttu idiyappam
    paratha parotta prata roti chapati phulka naan kulcha puri poori bhatura thepla dhokla
    khandvi khakhra fafda jalebi gathiya chakli murukku mixture chivda chiwda namkeen bhujia
    sev chana chole rajma dal daal sambar sambhar rasam curry sabzi sabji bhaji korma kurma
    masala gravy raita salad chutney pickle achar papad
    rice biryani pulao pulav khichdi khichri curd dahi bisibelebath
    thali meal combo tiffin
    noodles noodle maggi pasta manchurian hakka chowmein chopsuey
    mee mihun bihun kway teow laksa nasi lemak goreng rendang satay murtabak
    char siew siu bao pau dimsum siomai wonton kaya kueh kuih popiah rojak otah
    chicken mutton fish prawn egg eggs omelette omelet bhurji keema paneer tofu
    burger pizza fries nachos chips wafer wafers popcorn
    biscuit cookie cookies rusk khari nankhatai cake pastry brownie muffin cupcake donut
    doughnut croissant bread loaf
    laddu ladoo barfi burfi peda halwa kheer payasam gulab jamun rasgulla rasmalai sandesh
    mysorepak soan papdi chikki gajak modak basundi shrikhand rabri
    paan supari
    banana apple mango orange papaya watermelon guava grapes fruit fruits
    flour atta maida besan sooji rava sugar salt oil ghee butter cheese jam honey
    """.split()
)

# Words that describe an item but are not one ("cutting chai", "filter coffee", "kanda bhaji").
QUALIFIERS = frozenset(
    """
    cutting filter medu pani masala ginger elaichi cardamom adrak tulsi lemon iced ice cold hot
    plain special sweet salted spicy mint pudina green black white red brown milky strong light
    kanda aloo batata onion potato paneer veg vegetable vegetarian egg chicken mutton fish
    butter cheese ghee chocolate vanilla strawberry mango rose kesar saffron badam almond pista
    dry fruit honey jaggery gur mini jumbo small medium large regular family full double
    single fresh homemade desi bombay mumbai mysore madras rava set mixed mix
    tandoori spring fried steamed roasted boiled grilled baked crispy soft
    """.split()
)

# Units a food item can be sold by; "per hour" or "per service" is not a menu item.
FOOD_UNITS = frozenset(
    ("cup", "plate", "piece", "glass", "kg", "g", "litre", "ml", "pack", "dozen")
)

# A quantity in the name ("add five samosas for 100") is a pack price, not a unit price.
NUMBER_WORDS = frozenset(
    "two three four five six seven eight nine ten eleven twelve dozen half couple few several "
    "pair".split()
)


def singular(word: str) -> str:
    """The singular a food lexicon or saved menu name uses ("samosas" -> "samosa")."""
    for end in ("es", "s"):
        if word.endswith(end) and len(word) > len(end) + 2:
            stem = word[: -len(end)]
            if stem in FOOD or stem in QUALIFIERS:
                return stem
    if word.endswith("s") and len(word) > 3 and not word.endswith("ss"):
        return word[:-1]
    return word


def is_food(name: str) -> bool:
    """True when every word is food or a describing word, and the last one is a food."""
    words = [w if w in FOOD or w in QUALIFIERS else singular(w) for w in name.casefold().split()]
    return bool(words) and words[-1] in FOOD and all(w in FOOD or w in QUALIFIERS for w in words)
