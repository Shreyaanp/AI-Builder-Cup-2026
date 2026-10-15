"""Fictional neighbourhood catalogues. Pins are approximate; no place lookup is performed."""

from dataclasses import dataclass
from typing import Any

from app.merchant import BusinessFields, DayHours, ProductFields
from app.money import to_minor
from app.product_units import known_unit


@dataclass(frozen=True)
class DemoShop:
    id: str
    fields: BusinessFields
    products: list[ProductFields]
    city: str = "singapore"


def item(
    name: str, cents: int, unit: str = "item", available: bool = True, category: str = ""
) -> ProductFields:
    # Keep the six original catalogues, normalising their legacy free-text selling units.
    unit = known_unit(unit) or {"pair": "set", "loaf": "piece", "whole cake": "piece"}.get(
        unit, "item"
    )
    return ProductFields(name=name, price=cents, unit=unit, available=available, category=category)


def shop(bid: str, products: list[ProductFields], **fields: Any) -> DemoShop:
    city = fields.pop("city", "singapore")
    fields.setdefault("currency", "SGD")
    fields["name"] += " (Demo)"
    fields["pin_label"] = fields.get("pin_label", "Approximate pin") + " · Demo"
    fields["pin_demo"] = True
    # Existing Singapore hours differ by shop; use their stated opening and closing times.
    if "hours" in fields:
        opening, closing = fields["hours"].replace("–", "-").split("-")
        fields["weekly_hours"] = [
            DayHours.model_validate({"day": d, "open": opening, "close": closing})
            for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        ]
    fields.setdefault("custom_facts", []).append(
        {
            "key": "demo_data",
            "label": "Demo data",
            "value": "Fictional shop, menu, sales and customer activity for this prototype.",
        }
    )
    for product in products:
        if not product.category:
            product.category = "Drinks" if product.unit == "cup" else fields["category"]
    return DemoShop(bid, BusinessFields(demo=True, **fields), products, city)


# Major-unit prices below are converted with the app's currency rules, including JPY and IDR.
# Each tuple is (item, price, fixed unit, category). The last item is sold out.
MENUS: dict[str, list[tuple[str, int, str, str]]] = {
    "india-cafe": [
        ("Filter coffee", 60, "cup", "Drinks"),
        ("Masala chai", 35, "cup", "Drinks"),
        ("Lime soda", 70, "glass", "Drinks"),
        ("Idli breakfast", 90, "plate", "Breakfast"),
        ("Vegetable sandwich", 130, "piece", "Snacks"),
        ("Ragi cookie", 40, "piece", "Bakes"),
        ("Banana bread", 110, "slice", "Bakes"),
        ("Masala dosa", 120, "plate", "Breakfast"),
    ],
    "kirana": [
        ("Sona masoori rice", 65, "kg", "Staples"),
        ("Toor dal", 155, "kg", "Staples"),
        ("Atta", 58, "kg", "Staples"),
        ("Milk", 28, "pack", "Dairy"),
        ("Curd", 40, "pack", "Dairy"),
        ("Bananas", 70, "dozen", "Produce"),
        ("Tea leaves", 140, "pack", "Pantry"),
        ("Jaggery", 85, "pack", "Pantry"),
    ],
    "india-bakery": [
        ("Vegetable puff", 35, "piece", "Savoury"),
        ("Paneer roll", 65, "piece", "Savoury"),
        ("Milk bread", 55, "piece", "Bread"),
        ("Multigrain loaf", 120, "piece", "Bread"),
        ("Coconut bun", 30, "piece", "Buns"),
        ("Chocolate cake", 95, "slice", "Cakes"),
        ("Khari biscuits", 80, "pack", "Biscuits"),
        ("Plum cake", 140, "slice", "Cakes"),
    ],
    "tailor": [
        ("Trouser hemming", 150, "service", "Alterations"),
        ("Zip replacement", 180, "service", "Repairs"),
        ("Shirt fitting", 250, "service", "Alterations"),
        ("Kurta stitching", 850, "service", "Stitching"),
        ("Button repair", 40, "service", "Repairs"),
        ("Curtain shortening", 200, "piece", "Home"),
    ],
    "delhi-food": [
        ("Aloo tikki", 70, "plate", "Chaat"),
        ("Papdi chaat", 90, "plate", "Chaat"),
        ("Chole kulche", 100, "plate", "Meals"),
        ("Paneer kathi roll", 140, "piece", "Rolls"),
        ("Sweet lassi", 80, "glass", "Drinks"),
        ("Jaljeera", 40, "glass", "Drinks"),
        ("Samosa", 25, "piece", "Snacks"),
        ("Dahi bhalla", 95, "plate", "Chaat"),
    ],
    "mumbai-food": [
        ("Vada pav", 25, "piece", "Snacks"),
        ("Misal pav", 90, "plate", "Meals"),
        ("Pav bhaji", 130, "plate", "Meals"),
        ("Bhel puri", 60, "plate", "Chaat"),
        ("Sev puri", 65, "plate", "Chaat"),
        ("Cutting chai", 20, "cup", "Drinks"),
        ("Nimbu pani", 35, "glass", "Drinks"),
        ("Sabudana vada", 50, "plate", "Snacks"),
    ],
    "florist": [
        ("Marigold garland", 120, "piece", "Garlands"),
        ("Rose bouquet", 450, "set", "Bouquets"),
        ("Jasmine flowers", 80, "pack", "Flowers"),
        ("Desk arrangement", 650, "set", "Arrangements"),
        ("Gift wrapping", 60, "service", "Services"),
        ("Sunflower bunch", 350, "set", "Bouquets"),
    ],
    "hardware": [
        ("LED bulb 9W", 120, "piece", "Electrical"),
        ("Extension board", 450, "piece", "Electrical"),
        ("Insulation tape", 25, "piece", "Supplies"),
        ("Screwdriver set", 280, "set", "Tools"),
        ("Wall hooks", 60, "pack", "Fittings"),
        ("Door hinge", 85, "piece", "Fittings"),
        ("AA batteries", 90, "pack", "Electrical"),
        ("PVC adhesive", 110, "bottle", "Supplies"),
    ],
    "kl-cafe": [
        ("Kopi ais", 5, "glass", "Drinks"),
        ("Teh tarik", 4, "glass", "Drinks"),
        ("White coffee", 6, "cup", "Drinks"),
        ("Kaya toast", 6, "set", "Breakfast"),
        ("Nasi lemak", 9, "plate", "Meals"),
        ("Curry puff", 3, "piece", "Snacks"),
        ("Pandan cake", 7, "slice", "Bakes"),
        ("Roti bakar", 5, "set", "Breakfast"),
    ],
    "kl-bakery": [
        ("Coconut bun", 3, "piece", "Buns"),
        ("Butter croissant", 8, "piece", "Pastries"),
        ("Sourdough", 19, "piece", "Bread"),
        ("Pandan bun", 4, "piece", "Buns"),
        ("Banana cake", 7, "slice", "Cakes"),
        ("Egg tart", 4, "piece", "Pastries"),
    ],
    "kl-salon": [
        ("Haircut", 40, "service", "Cuts"),
        ("Wash and blow dry", 35, "service", "Styling"),
        ("Fringe trim", 15, "service", "Cuts"),
        ("Hair treatment", 65, "service", "Care"),
        ("Beard trim", 20, "service", "Grooming"),
        ("Event styling", 90, "service", "Styling"),
    ],
    "jakarta-food": [
        ("Nasi goreng", 28000, "plate", "Meals"),
        ("Mie goreng", 26000, "plate", "Meals"),
        ("Gado-gado", 24000, "plate", "Meals"),
        ("Tempe goreng", 12000, "portion", "Sides"),
        ("Es teh manis", 7000, "glass", "Drinks"),
        ("Es jeruk", 12000, "glass", "Drinks"),
        ("Bakwan", 5000, "piece", "Snacks"),
        ("Soto ayam", 30000, "bowl", "Meals"),
    ],
    "jakarta-cafe": [
        ("Kopi susu gula aren", 23000, "cup", "Coffee"),
        ("Americano", 22000, "cup", "Coffee"),
        ("Latte", 28000, "cup", "Coffee"),
        ("Iced chocolate", 26000, "glass", "Drinks"),
        ("Pisang bakar", 18000, "plate", "Snacks"),
        ("Roti bakar", 20000, "set", "Snacks"),
    ],
    "jakarta-grocery": [
        ("Rice", 16000, "kg", "Staples"),
        ("Cooking oil", 19000, "litre", "Pantry"),
        ("Eggs", 29000, "kg", "Fresh"),
        ("Tempe", 7000, "pack", "Fresh"),
        ("Instant noodles", 3500, "pack", "Pantry"),
        ("Jasmine tea", 9000, "box", "Drinks"),
        ("Sweet soy sauce", 18000, "bottle", "Pantry"),
        ("Bananas", 22000, "kg", "Produce"),
    ],
    "tokyo-cafe": [
        ("Hand drip coffee", 480, "cup", "Coffee"),
        ("Cafe latte", 550, "cup", "Coffee"),
        ("Matcha latte", 600, "cup", "Tea"),
        ("Hojicha", 400, "cup", "Tea"),
        ("Egg toast", 650, "set", "Toast"),
        ("Cheesecake", 520, "slice", "Cakes"),
    ],
    "tokyo-bakery": [
        ("Melon pan", 220, "piece", "Buns"),
        ("Anpan", 200, "piece", "Buns"),
        ("Shokupan", 420, "piece", "Bread"),
        ("Curry pan", 280, "piece", "Savoury"),
        ("Salt butter roll", 180, "piece", "Rolls"),
        ("Matcha scone", 300, "piece", "Scones"),
    ],
    "tokyo-florist": [
        ("Seasonal bouquet", 1800, "set", "Bouquets"),
        ("Single rose", 400, "piece", "Stems"),
        ("Mini plant", 900, "item", "Plants"),
        ("Dried flower bundle", 1200, "set", "Dried flowers"),
        ("Gift wrap", 200, "service", "Services"),
        ("Table arrangement", 2800, "set", "Arrangements"),
    ],
    "bangkok-food": [
        ("Pad krapao tofu", 65, "plate", "Meals"),
        ("Chicken rice", 60, "plate", "Meals"),
        ("Som tam", 55, "plate", "Salads"),
        ("Sticky rice", 15, "portion", "Sides"),
        ("Thai iced tea", 35, "glass", "Drinks"),
        ("Lemongrass tea", 30, "glass", "Drinks"),
        ("Mango sticky rice", 85, "plate", "Desserts"),
        ("Coconut pudding", 30, "box", "Desserts"),
    ],
    "bangkok-cafe": [
        ("Iced americano", 70, "cup", "Coffee"),
        ("Iced latte", 85, "cup", "Coffee"),
        ("Coconut coffee", 95, "cup", "Coffee"),
        ("Thai tea", 55, "glass", "Tea"),
        ("Banana toast", 90, "set", "Toast"),
        ("Butter cake", 65, "slice", "Cakes"),
    ],
    "bangkok-salon": [
        ("Haircut", 250, "service", "Cuts"),
        ("Wash and dry", 180, "service", "Styling"),
        ("Fringe trim", 100, "service", "Cuts"),
        ("Hair mask", 300, "service", "Care"),
        ("Beard trim", 120, "service", "Grooming"),
        ("Event styling", 500, "service", "Styling"),
    ],
}


def neighbourhood(
    city: str,
    area: str,
    lat: float,
    lng: float,
    currency: str,
    timezone: str,
    payments: list[str],
    delivery: str,
    shops: list[tuple[str, str, str, str]],
) -> list[DemoShop]:
    result = []
    for index, (slug, name, category, menu) in enumerate(shops):
        products = [
            item(n, to_minor(price, currency), unit, i != len(MENUS[menu]) - 1, group)
            for i, (n, price, unit, group) in enumerate(MENUS[menu])
        ]
        result.append(
            shop(
                f"demo-{city}-{slug}",
                products,
                city=city,
                name=name,
                category=category,
                location=f"{11 + index} Imaginary Courtyard, {area} (fictional demo address)",
                lat=lat + index * 0.0012,
                lng=lng + index * 0.001,
                pin_label=f"Near {area} (approximate)",
                timezone=timezone,
                currency=currency,
                hours="09:00–20:00",
                # Deliberately invalid local numbers: samples must never reach a real person.
                phone={
                    "INR": "+91 00000 00000",
                    "MYR": "+60 00 000 0000",
                    "IDR": "+62 000 0000 0000",
                    "JPY": "+81 00 0000 0000",
                    "THB": "+66 00 000 0000",
                }[currency],
                payment_methods=payments,
                delivery="own"
                if category in {"Tailor", "Hardware", "Florist"}
                else "none"
                if category == "Salon"
                else delivery,
                delivery_note="Demo option only; no ordering or delivery service connected",
                # Every other demo shop makes its own goods, so each city shows the badge.
                locally_made=index % 2 == 0,
                preorders=True,
                preorder_lead_time="Ask one day ahead (demo)",
                busy_hours="12:00–14:00",
                custom_facts=[
                    {"key": "pickup", "label": "Collection", "value": "Counter pickup (demo)"},
                    {"key": "access", "label": "Access", "value": "Ground floor entrance (demo)"},
                ],
            )
        )
    return result


INTERNATIONAL_SHOPS = [
    *neighbourhood(
        "bengaluru",
        "Indiranagar, Bengaluru",
        12.9718,
        77.6412,
        "INR",
        "Asia/Kolkata",
        ["cash", "UPI", "PhonePe"],
        "Swiggy",
        [
            ("indiranagar-coffee", "Courtyard Filter House", "Cafe", "india-cafe"),
            ("indiranagar-kirana", "Little Lantern Kirana", "Grocery / Kirana", "kirana"),
        ],
    ),
    *neighbourhood(
        "bengaluru",
        "Koramangala, Bengaluru",
        12.9352,
        77.6245,
        "INR",
        "Asia/Kolkata",
        ["cash", "UPI", "PhonePe"],
        "Zomato",
        [
            ("koramangala-bakery", "Butter Window Bakery", "Bakery", "india-bakery"),
            ("koramangala-tailor", "Needle Courtyard", "Tailor", "tailor"),
        ],
    ),
    *neighbourhood(
        "delhi",
        "Hauz Khas, Delhi",
        28.5494,
        77.2001,
        "INR",
        "Asia/Kolkata",
        ["cash", "UPI", "Paytm"],
        "Zomato",
        [
            ("chaat", "Tamarind Corner", "Street food", "delhi-food"),
            ("coffee", "Lake Lane Coffee", "Cafe", "india-cafe"),
            ("flowers", "Petal Pocket", "Florist", "florist"),
        ],
    ),
    *neighbourhood(
        "mumbai",
        "Bandra, Mumbai",
        19.0596,
        72.8295,
        "INR",
        "Asia/Kolkata",
        ["cash", "UPI", "PhonePe"],
        "Swiggy",
        [
            ("snacks", "Monsoon Snack Window", "Street food", "mumbai-food"),
            ("bakery", "Golden Crust Nook", "Bakery", "india-bakery"),
            ("hardware", "Small Fix Supply", "Hardware", "hardware"),
        ],
    ),
    *neighbourhood(
        "kuala-lumpur",
        "Bangsar, Kuala Lumpur",
        3.1302,
        101.6710,
        "MYR",
        "Asia/Kuala_Lumpur",
        ["cash", "DuitNow", "Touch 'n Go"],
        "GrabFood",
        [
            ("kopi", "Morning Fern Kopi", "Cafe", "kl-cafe"),
            ("bakery", "Pandan Window Bakes", "Bakery", "kl-bakery"),
            ("salon", "Comet Comb Studio", "Salon", "kl-salon"),
        ],
    ),
    *neighbourhood(
        "jakarta",
        "Kemang, Jakarta",
        -6.2604,
        106.8130,
        "IDR",
        "Asia/Jakarta",
        ["cash", "GoPay", "QRIS", "OVO"],
        "GoFood",
        [
            ("warung", "Warung Daun Kecil", "Street food", "jakarta-food"),
            ("kopi", "Kopi Jendela Senja", "Cafe", "jakarta-cafe"),
            ("grocery", "Toko Saku Harian", "Grocery", "jakarta-grocery"),
        ],
    ),
    *neighbourhood(
        "tokyo",
        "Shimokitazawa, Tokyo",
        35.6615,
        139.6669,
        "JPY",
        "Asia/Tokyo",
        ["cash", "PayPay", "Suica"],
        "Uber Eats",
        [
            ("coffee", "Pocket Vinyl Coffee", "Cafe", "tokyo-cafe"),
            ("bakery", "Komorebi Bread Window", "Bakery", "tokyo-bakery"),
            ("flowers", "Little Stem Atelier", "Florist", "tokyo-florist"),
        ],
    ),
    *neighbourhood(
        "bangkok",
        "Ari, Bangkok",
        13.7797,
        100.5447,
        "THB",
        "Asia/Bangkok",
        ["cash", "PromptPay", "TrueMoney"],
        "LINE MAN",
        [
            ("kitchen", "Baan Little Basil", "Street food", "bangkok-food"),
            ("coffee", "Cloud Cup Corner", "Cafe", "bangkok-cafe"),
            ("salon", "Mali Comb Studio", "Salon", "bangkok-salon"),
        ],
    ),
]
