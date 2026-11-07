"""Two authored, fictional neighbourhoods. No place lookup or model call is needed."""

from .demo_catalogue import DemoShop, item, shop
from .merchant import Understanding
from .money import to_minor
from .product_source import SERVED_UNITS, source_of
from .region import profile
from .vendor_profile import allowed_facts, infer_profile

_INDIA = profile("IN")
_SINGAPORE = profile("SG")
CENTRES = {
    "bengaluru": (12.9718, 77.6412, _INDIA.currency, _INDIA.timezone, "Indiranagar, Bengaluru"),
    "singapore": (
        1.3052,
        103.9045,
        _SINGAPORE.currency,
        _SINGAPORE.timezone,
        "Katong, Singapore",
    ),
}


def local_shop(
    city: str,
    slug: str,
    name: str,
    category: str,
    story: str,
    hours: str,
    menu: list[tuple[str, float, str, str]],
    index: int,
) -> DemoShop:
    lat, lng, currency, zone, area = CENTRES[city]
    profile = infer_profile(category, story)
    allowed = allowed_facts({"profile": profile.model_dump()})
    products = [item(n, to_minor(p, currency), u, category=category) for n, p, u, _ in menu]
    # Made or bought is set on every tour item (OB-239): only bought stock is ever reordered,
    # so the tour never shows "Order Bread" at a bakery or a supplier for a tailor's hem.
    for product, (*_, made_or_bought) in zip(products, menu, strict=True):
        product.source = "made" if made_or_bought == "made" else "bought"
    if category == "Bakery":
        for product in products:
            product.category = (
                "Bread" if any(w in product.name.lower() for w in ("bread", "loaf")) else "Bakes"
            )
    if index == 0:
        products[4].stock = 6  # A busy chai stall keeps several days of tea dust on hand.
    # A concrete, actionable low-stock row on Today (OB-239): a supply the shop buys (a cable,
    # a stem, rice) carries "Order"; else something it makes by the piece carries "Make more".
    # Never a service or a cup of chai. The last other item is sold out.
    kept = {4} if index == 0 else set()
    rows = [
        (p, source_of(p.model_dump(), category)) for n, p in enumerate(products) if n not in kept
    ]
    low = next((p for p, found in rows if found == "bought"), None) or next(
        (p for p, found in rows if found == "made" and p.unit not in SERVED_UNITS), None
    )
    if low:
        low.stock = 4
    next(
        p for n, p in reversed(list(enumerate(products))) if n not in kept and p is not low
    ).available = False
    return shop(
        f"demo-story-{city}-{slug}",
        city=city,
        name=name,
        category=category,
        profile=profile,
        description=story,
        location=f"{index + 1} Demo Lane, {area} (fictional address)",
        lat=lat + (index // 3 - 1) * 0.003,
        lng=lng + (index % 3 - 1) * 0.003,
        pin_label=f"{area} · approximate demo pin",
        currency=currency,
        timezone=zone,
        hours=hours,
        payment_methods=["cash", "UPI" if currency == "INR" else "paynow"],
        delivery="none" if "delivery" in allowed else None,
        vegetarian_options=True
        if "vegetarian_options" in allowed and category == "Home kitchen"
        else None,
        locally_made=(category in {"Tea stall", "Kopitiam", "Bakery", "Home kitchen", "Florist"})
        if "locally_made" in allowed
        else None,
        busy_hours="07:30–09:30" if index == 0 else "17:00–19:00",
        reward_text={
            "Tailor": "Free button repair",
            "Mobile repair": "Free port clean",
            "Phone repair": "Free port clean",
            "Florist": "A free stem",
            "Helmet cleaning": "A free visor wipe",
            "Grocery / Kirana": "A free cloth bag",
            "Bakery": "A free bun",
            "Home kitchen": "A free chapati set",
            "Hawker stall": "A free teh",
        }.get(category, "A free chai" if currency == "INR" else "A free kopi"),
        stamps_needed=8,
        understanding=Understanding(
            focus="less_waste" if index == 0 else "more_customers",
            regulars="Morning commuters and neighbours on their way home",
        ),
        custom_facts=[
            *(
                [
                    {
                        "key": "demo_verified",
                        "label": "Demo badge",
                        "value": "Simulated badge; no identity or business check was performed.",
                    }
                ]
                if index == 0
                else []
            ),
            {"key": "story", "label": "Why go", "value": story},
            {
                "key": "languages",
                "label": "Languages",
                "value": "Hindi, English"
                if currency == "INR"
                else "English, Mandarin, Malay, Tamil",
            },
        ],
        products=products,
    )


def catalogue() -> list[DemoShop]:
    india: list[tuple[str, str, str, str, str, list[tuple[str, float, str, str]]]] = [
        (
            "chai",
            "Lantern Chai Corner",
            "Tea stall",
            "Ginger chai brewed in small pots; bun maska warmed to order.",
            "06:30–21:00",
            [
                ("Masala chai", 20, "cup", "made"),
                ("Ginger chai", 25, "cup", "made"),
                ("Bun maska", 35, "piece", "made"),
                ("Samosa", 20, "piece", "made"),
                ("Tea dust", 320, "kg", "bought"),
                ("Ragi biscuit", 15, "piece", "made"),
            ],
        ),
        (
            "bakery",
            "Butter Window Bakery",
            "Bakery",
            "Vegetarian-only puffs leave the oven at four; ask for the warm tray.",
            "07:00–21:00",
            [
                ("Vegetable puff", 35, "piece", "made"),
                ("Butter croissant", 95, "piece", "made"),
                ("Milk bread", 55, "piece", "made"),
                ("Coconut bun", 30, "piece", "made"),
                ("Khari biscuits", 80, "pack", "made"),
                ("Plum cake", 140, "slice", "made"),
            ],
        ),
        (
            "tailor",
            "Needle Courtyard",
            "Tailor",
            "Trouser hems ready the same evening; fittings by appointment.",
            "10:00–20:00",
            [
                ("Trouser hemming", 150, "service", "made"),
                ("Zip replacement", 180, "service", "made"),
                ("Shirt fitting", 250, "service", "made"),
                ("Kurta stitching", 850, "service", "made"),
                ("Button repair", 40, "service", "made"),
                ("Curtain shortening", 200, "service", "made"),
            ],
        ),
        (
            "phone",
            "Pocket Fix Workshop",
            "Mobile repair",
            "A written quote before every repair; data stays on your phone.",
            "10:00–21:00",
            [
                ("Screen replacement", 1800, "service", "made"),
                ("Battery replacement", 950, "service", "made"),
                ("Charging port clean", 150, "service", "made"),
                ("Screen protector", 180, "piece", "bought"),
                ("USB-C cable", 250, "piece", "bought"),
                ("Speaker repair", 650, "service", "made"),
            ],
        ),
        (
            "flowers",
            "Petal Pocket",
            "Florist",
            "Jasmine strings tied each morning; paper-wrapped bouquets on request.",
            "07:00–20:30",
            [
                ("Jasmine string", 40, "piece", "made"),
                ("Marigold garland", 120, "piece", "made"),
                ("Rose bouquet", 450, "bunch", "made"),
                ("Sunflower", 80, "piece", "bought"),
                ("Orchid bunch", 650, "bunch", "made"),
                ("Festival flower basket", 300, "item", "made"),
            ],
        ),
        (
            "helmet",
            "Fresh Helmet Stop",
            "Helmet cleaning",
            "Self-service helmet cleaning beside the cycle stand; a ten-minute stop.",
            "08:00–22:00",
            [
                ("Helmet clean", 79, "service", "made"),
                ("Deep liner clean", 149, "service", "made"),
                ("Visor polish", 49, "service", "made"),
                ("Two helmet cleans", 139, "set", "made"),
                ("Helmet liner", 199, "piece", "bought"),
                ("Rain cover", 99, "piece", "bought"),
            ],
        ),
        (
            "kitchen",
            "Tiffin Window",
            "Home kitchen",
            "Twenty vegetarian-only lunch boxes cooked each morning; order before ten.",
            "08:00–20:00",
            [
                ("Vegetarian thali", 120, "plate", "made"),
                ("Lemon rice", 70, "plate", "made"),
                ("Chapati set", 40, "set", "made"),
                ("Curd rice", 65, "plate", "made"),
                ("Dal", 50, "pack", "made"),
                ("Weekend biryani", 150, "plate", "made"),
            ],
        ),
        (
            "kirana",
            "Little Lantern Kirana",
            "Grocery / Kirana",
            "Bring a container for rice and lentils; small quantities welcome.",
            "07:00–22:00",
            [
                ("Sona masoori rice", 65, "kg", "bought"),
                ("Toor dal", 155, "kg", "bought"),
                ("Atta", 58, "kg", "bought"),
                ("Tea leaves", 140, "pack", "bought"),
                ("Milk", 28, "pack", "bought"),
                ("Jaggery", 85, "pack", "bought"),
            ],
        ),
    ]
    singapore: list[tuple[str, str, str, str, str, list[tuple[str, float, str, str]]]] = [
        (
            "kopi",
            "Sunny Side Kopitiam",
            "Kopitiam",
            "Kopi ground at dawn, kaya toast grilled when you order.",
            "06:30–20:00",
            [
                ("Kopi", 1.7, "cup", "made"),
                ("Kopi O", 1.5, "cup", "made"),
                ("Kaya toast set", 5.2, "set", "made"),
                ("Soft-boiled eggs", 1.8, "set", "made"),
                ("Kopi powder", 18, "kg", "bought"),
                ("Curry puff", 1.8, "piece", "made"),
            ],
        ),
        (
            "hawker",
            "Serai Sunrise Kitchen",
            "Hawker stall",
            "Small-batch coconut rice and house sambal, ready for the lunch queue.",
            "07:00–20:00",
            [
                ("Nasi lemak", 3.5, "plate", "made"),
                ("Chicken wing set", 5.5, "plate", "made"),
                ("Otah", 1.5, "piece", "made"),
                ("Teh tarik", 1.6, "cup", "made"),
                ("Sambal egg", 1.2, "piece", "made"),
                ("Rendang set", 6.5, "plate", "made"),
            ],
        ),
        (
            "flowers",
            "Petal Studio Katong",
            "Florist",
            "Seasonal stems wrapped in reused paper; small bunches welcome.",
            "09:00–20:00",
            [
                ("Small bouquet", 28, "bunch", "made"),
                ("Sunflower", 6, "piece", "bought"),
                ("Orchid pot", 38, "item", "bought"),
                ("Rose trio", 15, "bunch", "made"),
                ("Dried flower jar", 22, "item", "made"),
                ("Graduation bouquet", 55, "bunch", "made"),
            ],
        ),
        (
            "bakery",
            "Crumb & Courtyard",
            "Bakery",
            "Vegetarian-only bakes; pandan chiffon and sourdough sliced to order.",
            "07:00–21:00",
            [
                ("Butter croissant", 4.5, "piece", "made"),
                ("Pandan chiffon", 3.8, "slice", "made"),
                ("Sourdough loaf", 12, "piece", "made"),
                ("Kaya bun", 2.8, "piece", "made"),
                ("Kouign-amann", 5.2, "piece", "made"),
                ("Earl Grey cake", 58, "piece", "made"),
            ],
        ),
        (
            "phone",
            "Pocket Circuit Repair",
            "Phone repair",
            "Upfront repair quotes and a bench you can watch from the counter.",
            "10:00–21:00",
            [
                ("Screen replacement", 98, "service", "made"),
                ("Battery replacement", 48, "service", "made"),
                ("Port clean", 12, "service", "made"),
                ("Screen protector", 10, "piece", "bought"),
                ("USB-C cable", 12, "piece", "bought"),
                ("Speaker repair", 38, "service", "made"),
            ],
        ),
    ]
    return [
        local_shop(city, slug, name, kind, story, hours, menu, index)
        for city, specs in (("bengaluru", india), ("singapore", singapore))
        for index, (slug, name, kind, story, hours, menu) in enumerate(specs)
    ]


TOUR_SHOPS = catalogue()
