"""One reader for numbers that arrive as text: photo readings (Gemini, Document AI) and menus.

The app reads what the owner types with the same rules (`src/features/closeday/parseNumber.ts`):
"1,000" and "1,00,000" are a thousand and a lakh; "2,5" is two and a half only where the comma
is the decimal mark; a lone mark that could go either way ("1,5" in a rupee shop) is not guessed.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal, InvalidOperation
from typing import Literal

from .money import exponent

Kind = Literal["money", "quantity"]
QUANTITY_DECIMALS = 3

# Currencies whose home writes 2,5 and 1.000 (the comma is the decimal mark).
DECIMAL_COMMA = {
    *("IDR", "VND", "EUR", "BRL", "ARS", "CLP", "COP", "PYG", "UYU", "TRY", "RUB", "UAH"),
    *("DKK", "NOK", "SEK", "ISK", "PLN", "CZK", "HUF", "RON", "BGN", "RSD", "BAM", "MKD"),
}

NUMBER = re.compile(r"-?\d+(?:[.,]\d+)*")


def read_number(value: object, currency: str | None = None, kind: Kind = "money") -> float | None:
    """A number from a reading, or ``None`` when it is missing or could be read two ways.

    ``currency`` names the shop's convention. Without it (a menu photo with no shop yet) a
    lone comma before three digits is a thousands mark and before other digits a decimal.
    Money keeps the currency's minor digits (extra zeros are fine: "840.00"); quantities up
    to three decimals (0.125 kg).
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        given = float(value)
        return given if math.isfinite(given) else None
    match = NUMBER.search(str(value or ""))
    if not match:
        return None
    text = match.group(0)
    sign, text = ("-", text[1:]) if text.startswith("-") else ("", text)
    comma, dot = "," in text, "." in text
    if comma and dot:
        # Both marks: the last one is the decimal, the other groups ("1,000.50", "1.000,50").
        decimal = "," if text.rfind(",") > text.rfind(".") else "."
        group = "." if decimal == "," else ","
        head, _, tail = text.rpartition(decimal)
        if decimal in head:
            return None
        digits = f"{head.replace(group, '')}.{tail}"
    elif comma or dot:
        mark = "," if comma else "."
        parts = text.split(mark)
        decimal_mark = "," if currency and currency.upper() in DECIMAL_COMMA else "."
        if len(parts) > 2:
            # Repeated marks only group: 1,00,000 · 1.000.000. "0.125" never groups.
            digits = "".join(parts)
        elif len(parts[1]) == 3 and mark != decimal_mark and parts[0].lstrip("0"):
            digits = "".join(parts)  # "1,000" in a rupee shop, "15.000" in a rupiah shop
        elif mark == decimal_mark or currency is None or mark == ".":
            # The shop's decimal mark, or the plain-digits answer the model is asked for.
            digits = f"{parts[0]}.{parts[1]}"
        else:
            return None  # "1,5" in a rupee shop: one and a half, or fifteen?
    else:
        digits = text
    try:
        number = Decimal(sign + digits)
    except InvalidOperation:
        return None
    places = QUANTITY_DECIMALS if kind == "quantity" else exponent(currency) if currency else None
    try:
        if places is not None and number != number.quantize(Decimal(1).scaleb(-places)):
            return None  # more decimals than a price or a count can carry: not guessed
    except InvalidOperation:
        return None
    result = float(number)
    return result if math.isfinite(result) else None
