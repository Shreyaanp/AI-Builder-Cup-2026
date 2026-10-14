"""Currency handling: prices are stored as integers in each currency's minor unit.

Zero-decimal currencies (JPY, KRW, VND, IDR…) store whole units; most others store cents.
The frontend mirrors this table in `src/features/v1/format.ts` — keep them in sync.
"""

ZERO_DECIMAL = {
    *("JPY", "KRW", "VND", "IDR", "CLP", "ISK", "UGX", "XAF", "XOF"),
    *("BIF", "DJF", "GNF", "KMF", "PYG", "RWF", "VUV", "XPF"),
}
THREE_DECIMAL = {"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"}
# Only when the phone sends nothing usable; new shops normally get their owner's currency.
DEFAULT_CURRENCY = "SGD"


def exponent(currency: str) -> int:
    code = currency.upper()
    return 0 if code in ZERO_DECIMAL else 3 if code in THREE_DECIMAL else 2


def to_minor(amount: float, currency: str) -> int:
    """15.5 SGD -> 1550; 500 JPY -> 500."""
    return round(amount * 10 ** exponent(currency))


def to_major(minor: int, currency: str) -> float:
    return round(minor / 10 ** exponent(currency), exponent(currency))
