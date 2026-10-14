"""Draft category suggestions for items; the owner still reviews the proposal.

Every item added by photo, import or the coach gets a category. A stated menu section wins;
otherwise a keyword guess (any of the APAC languages the app speaks), falling back to "other"
so nothing lands uncategorised.
"""

import re

RULES = (
    (
        "drinks",
        r"\b(kopi|teh|tea|coffee|juice|latte|cappuccino|espresso|mocha|americano|soda|water|"
        r"milk|chai|milo|bandung|sirap|lassi|smoothie|shake|beer|wine|cola|coke|lemonade|"
        r"bubble tea|boba|cocoa|matcha|drink|drinks|beverage|beverages)\b|"
        r"咖啡|茶|奶|汁|饮|ジュース|コーヒー|お茶|커피|차|음료|น้ำ|ชา|กาแฟ|nước|trà|cà phê|"
        r"காபி|தேநீர்|பானம்",
    ),
    (
        "desserts",
        r"\b(cake|cakes|ice cream|dessert|desserts|pudding|cookie|cookies|pastry|pastries|"
        r"tart|tarts|kueh|kuih|chendol|cendol|ice kacang|waffle|brownie|donut|doughnut|"
        r"ondeh|muffin|mochi|sweet|sweets|halwa|payasam)\b|"
        r"蛋糕|甜|糕|ケーキ|デザート|케이크|디저트|ขนม|bánh ngọt|chè|இனிப்பு",
    ),
    (
        "food",
        r"\b(toast|rice|noodle|noodles|egg|eggs|sandwich|soup|bread|bento|laksa|nasi|mee|mie|"
        r"puff|prata|roti|satay|chicken|fish|pork|beef|mutton|lamb|prawn|curry|dumpling|"
        r"dumplings|bun|buns|pau|bao|burger|pizza|pasta|salad|fries|wrap|porridge|congee|"
        r"briyani|biryani|dosa|thosai|idli|pho|banh mi|fried|goreng|meal|set meal|lunch|"
        r"breakfast|dinner|croissant|bagel)\b|"
        r"饭|飯|麵|面|粥|包|鸡|雞|鱼|魚|肉|パン|ご飯|ラーメン|밥|면|국|ข้าว|ก๋วยเตี๋ยว|"
        r"phở|cơm|bún|சோறு|உணவு|தோசை",
    ),
    (
        "services",
        r"\b(cut|haircut|trim|repair|repairs|massage|lesson|lessons|class|classes|consultation|"
        r"installation|install|cleaning|wash|service|services|alteration|delivery fee|"
        r"manicure|pedicure|facial|tuition)\b|理发|修理|服务|수리|서비스|บริการ|dịch vụ|சேவை",
    ),
)


def suggest_category(name: str, stated: str = "") -> str:
    if stated.strip():
        return stated.strip()[:80]
    for category, pattern in RULES:
        if re.search(pattern, name, re.I):
            return category
    return "other"
