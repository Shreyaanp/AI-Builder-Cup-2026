from app.money import exponent, to_major, to_minor


def test_every_currency_keeps_its_own_minor_unit() -> None:
    assert (exponent("SGD"), exponent("INR"), exponent("EUR")) == (2, 2, 2)
    assert (exponent("JPY"), exponent("PYG"), exponent("rwf")) == (0, 0, 0)
    assert (exponent("KWD"), exponent("OMR")) == (3, 3)
    assert to_minor(12.5, "INR") == 1250
    assert to_minor(1.25, "KWD") == 1250
    assert to_minor(500, "JPY") == 500
    assert to_major(1250, "KWD") == 1.25
