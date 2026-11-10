"""The Buy stock screen's taps, answered with no model call: Find a supplier, then Order.

The app sends both as fixed sentences (sourcing/copy.ts lowMessage and chooseDraft, growCopy.ts
needMessage), in the owner's language, so ordering still works when the coach model is down. The
sentences are matched exactly: anything an owner types differently goes to the model.
"""

import re
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from google.adk.events import Event

from .contracts import StreamEvent
from .coordinator import MerchantContext, find_suppliers, prepare_order
from .numbers import read_number
from .region import shop_currency
from .sourcing import OrderItem
from .supplier_compare import in_supplier_unit

if TYPE_CHECKING:
    from .instant import InstantResult

# How each language's two search sentences start and end, around what the owner needs.
SEARCH_SENTENCES: dict[str, tuple[tuple[str, str], tuple[str, str]]] = {
    "en": (("My ", " is running low. Find suppliers."), ("I need ", ". Find suppliers.")),
    "zh": (("我的", "快用完了，帮我找供应商。"), ("我需要", "，帮我找供应商。")),
    "ms": (("", " saya hampir habis. Cari pembekal."), ("Saya perlukan ", ". Cari pembekal.")),
    "id": (("", " saya hampir habis. Carikan pemasok."), ("Saya butuh ", ". Carikan pemasok.")),
    "ja": (("", "が残りわずかです。仕入れ先を探して。"), ("", "が必要です。仕入れ先を探して。")),
    "ko": (
        ("", "이(가) 떨어져 가요. 공급업체를 찾아 주세요."),
        ("", "이(가) 필요해요. 공급업체를 찾아 주세요."),
    ),
    "th": (
        ("", "ของฉันใกล้หมดแล้ว ช่วยหาผู้จำหน่ายให้หน่อย"),
        ("ฉันต้องการ ", " ช่วยหาผู้จำหน่ายให้หน่อย"),
    ),
    "vi": (
        ("", " của tôi sắp hết. Tìm nhà cung cấp giúp tôi."),
        ("Tôi cần ", ". Tìm nhà cung cấp giúp tôi."),
    ),
    "fil": (
        ("Paubos na ang ", " ko. Hanapan mo ako ng supplier."),
        ("Kailangan ko ng ", ". Hanapan mo ako ng supplier."),
    ),
    "ta": (
        ("என் ", " குறைவாக உள்ளது. விநியோகஸ்தர்களைத் தேடுங்கள்."),
        ("எனக்கு ", " வேண்டும். விநியோகஸ்தர்களைத் தேடுங்கள்."),
    ),
    "hi": (("मेरा ", " कम हो रहा है। सप्लायर खोजें।"), ("मुझे ", " चाहिए। सप्लायर खोजें।")),
    "bn": (("আমার ", " কমে আসছে। সরবরাহকারী খুঁজুন।"), ("আমার ", " দরকার। সরবরাহকারী খুঁজুন।")),
    "te": (("నా ", " తగ్గిపోతోంది. సరఫరాదారులు వెతకండి."), ("నాకు ", " కావాలి. సరఫరాదారులు వెతకండి.")),
    "mr": (("माझे ", " कमी होत आहे. पुरवठादार शोधा."), ("मला ", " हवे आहे. पुरवठादार शोधा.")),
    "kn": (
        ("ನನ್ನ ", " ಕಡಿಮೆಯಾಗುತ್ತಿದೆ. ಪೂರೈಕೆದಾರರನ್ನು ಹುಡುಕಿ."),
        ("ನನಗೆ ", " ಬೇಕು. ಪೂರೈಕೆದಾರರನ್ನು ಹುಡುಕಿ."),
    ),
}
SEARCHES = tuple(
    (re.compile(rf"^{re.escape(start)}(?P<what>.{{1,100}}?){re.escape(end)}$", re.I), language)
    for language, sentences in SEARCH_SENTENCES.items()
    for start, end in sentences
)
# The vendor list's Order. Locales without their own sentence use the English one.
ORDERS = (
    (re.compile(r"^Order from number (?P<rank>\d+): (?P<what>.+)$", re.I), ""),
    (re.compile(r"^नंबर (?P<rank>\d+) से ऑर्डर: (?P<what>.+)$"), "hi"),
    (re.compile(r"^নম্বর (?P<rank>\d+) থেকে অর্ডার: (?P<what>.+)$"), "bn"),
    (re.compile(r"^నంబర్ (?P<rank>\d+) నుంచి ఆర్డర్: (?P<what>.+)$"), "te"),
    (re.compile(r"^क्रमांक (?P<rank>\d+) कडून ऑर्डर: (?P<what>.+)$"), "mr"),
    (re.compile(r"^ಸಂಖ್ಯೆ (?P<rank>\d+)ರಿಂದ ಆರ್ಡರ್: (?P<what>.+)$"), "kn"),
)
# (Suppliers found, none found, order ready to send.)
REPLIES: dict[str, tuple[str, str, str]] = {
    "en": (
        "Here are suppliers near you for {item}. Pick one to prepare an order.",
        "I found no supplier near you for {item}. Try another name for it.",
        "Your order to {supplier} is ready below. Nothing goes until you tap Send.",
    ),
    "zh": (
        "这是您附近的{item}供应商。选一家来准备订货。",
        "附近没有找到{item}的供应商。换个名称试试。",
        "给{supplier}的订货单已在下方准备好。点“发送”之前不会发出。",
    ),
    "ms": (
        "Ini pembekal {item} berdekatan. Pilih satu untuk sediakan pesanan.",
        "Tiada pembekal {item} berdekatan. Cuba nama lain.",
        "Pesanan kepada {supplier} sudah sedia di bawah. Tiada apa-apa dihantar sehingga anda "
        "tekan Hantar.",
    ),
    "id": (
        "Ini pemasok {item} terdekat. Pilih satu untuk menyiapkan pesanan.",
        "Tidak ada pemasok {item} di dekat Anda. Coba nama lain.",
        "Pesanan ke {supplier} sudah siap di bawah. Tidak ada yang terkirim sampai Anda ketuk "
        "Kirim.",
    ),
    "ja": (
        "近くの{item}の仕入れ先です。1つ選ぶと発注を準備します。",
        "近くに{item}の仕入れ先が見つかりませんでした。別の名前でお試しください。",
        "{supplier}への発注を下に用意しました。「送信」を押すまで何も送られません。",
    ),
    "ko": (
        "근처 {item} 공급업체입니다. 하나를 고르면 주문을 준비해 드려요.",
        "근처에서 {item} 공급업체를 찾지 못했어요. 다른 이름으로 해 보세요.",
        "{supplier} 주문을 아래에 준비했어요. 보내기를 누르기 전에는 아무것도 전송되지 않아요.",
    ),
    "th": (
        "นี่คือผู้จำหน่าย{item}ใกล้คุณ เลือกหนึ่งรายเพื่อเตรียมคำสั่งซื้อ",
        "ไม่พบผู้จำหน่าย{item}ใกล้คุณ ลองใช้ชื่ออื่น",
        "คำสั่งซื้อถึง {supplier} พร้อมแล้วด้านล่าง จะไม่มีอะไรถูกส่งจนกว่าคุณจะแตะส่ง",
    ),
    "vi": (
        "Đây là các nhà cung cấp {item} gần bạn. Chọn một nơi để chuẩn bị đơn.",
        "Không tìm thấy nhà cung cấp {item} gần bạn. Hãy thử tên khác.",
        "Đơn gửi {supplier} đã sẵn sàng bên dưới. Không có gì được gửi cho đến khi bạn nhấn Gửi.",
    ),
    "fil": (
        "Ito ang mga supplier ng {item} malapit sa iyo. Pumili ng isa para ihanda ang order.",
        "Walang supplier ng {item} malapit sa iyo. Subukan ang ibang pangalan.",
        "Handa na sa ibaba ang order kay {supplier}. Walang maipapadala hangga’t hindi mo "
        "pinipindot ang Ipadala.",
    ),
    "ta": (
        "உங்கள் அருகிலுள்ள {item} விநியோகஸ்தர்கள் இதோ. ஆர்டரைத் தயாரிக்க ஒருவரைத் தேர்ந்தெடுங்கள்.",
        "அருகில் {item} விநியோகஸ்தர் யாரும் கிடைக்கவில்லை. வேறு பெயரை முயற்சிக்கவும்.",
        "{supplier}க்கான ஆர்டர் கீழே தயாராக உள்ளது. அனுப்பு என்பதைத் தட்டும் வரை எதுவும் அனுப்பப்படாது.",
    ),
    "hi": (
        "{item} के लिए आपके पास के सप्लायर। ऑर्डर बनाने के लिए एक चुनें।",
        "{item} के लिए पास में कोई सप्लायर नहीं मिला। कोई दूसरा नाम आज़माएँ।",
        "{supplier} को भेजने का ऑर्डर नीचे तैयार है। भेजें दबाने तक कुछ नहीं जाएगा।",
    ),
    "bn": (
        "আপনার কাছাকাছি {item}-এর সরবরাহকারী। অর্ডার তৈরি করতে একজনকে বাছুন।",
        "কাছাকাছি {item}-এর কোনো সরবরাহকারী পাওয়া যায়নি। অন্য নাম দিয়ে দেখুন।",
        "{supplier}-কে পাঠানোর অর্ডার নিচে তৈরি। পাঠান না চাপা পর্যন্ত কিছু যাবে না।",
    ),
    "te": (
        "మీ దగ్గరలోని {item} సరఫరాదారులు ఇవిగో. ఆర్డర్ సిద్ధం చేయడానికి ఒకరిని ఎంచుకోండి.",
        "దగ్గరలో {item} సరఫరాదారు దొరకలేదు. వేరే పేరుతో ప్రయత్నించండి.",
        "{supplier}కు ఆర్డర్ కింద సిద్ధంగా ఉంది. పంపండి నొక్కే వరకు ఏదీ పంపరు.",
    ),
    "mr": (
        "तुमच्या जवळचे {item} पुरवठादार. ऑर्डर तयार करण्यासाठी एक निवडा.",
        "जवळ {item} साठी पुरवठादार मिळाला नाही. दुसरे नाव वापरून पहा.",
        "{supplier} साठी ऑर्डर खाली तयार आहे. पाठवा दाबेपर्यंत काही जाणार नाही.",
    ),
    "kn": (
        "ನಿಮ್ಮ ಹತ್ತಿರದ {item} ಪೂರೈಕೆದಾರರು ಇಲ್ಲಿದ್ದಾರೆ. ಆರ್ಡರ್ ಸಿದ್ಧಪಡಿಸಲು ಒಬ್ಬರನ್ನು ಆರಿಸಿ.",
        "ಹತ್ತಿರದಲ್ಲಿ {item} ಪೂರೈಕೆದಾರರು ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಹೆಸರನ್ನು ಪ್ರಯತ್ನಿಸಿ.",
        "{supplier}ಗೆ ಆರ್ಡರ್ ಕೆಳಗೆ ಸಿದ್ಧವಾಗಿದೆ. ಕಳುಹಿಸಿ ಒತ್ತುವವರೆಗೆ ಏನೂ ಹೋಗುವುದಿಲ್ಲ.",
    ),
}
UNITS = (
    r"kg|g|l|litre|liter|litres|liters|ml|pack|packs|dozen|piece|pieces|crate|crates"
    r"|लीटर|किलो|ग्राम"
)
# "20 kg flour" or "20 milk" from the screen's amount box. Brackets mean more than one amount
# ("2 crates (24 packets) milk"), which stays in the words.
AMOUNT = re.compile(
    rf"^(?P<qty>\d[\d.,]*)\s*(?:(?P<unit>{UNITS})\s+)?(?P<item>[^\s()\d][^()]*)$", re.I
)
SPOKEN_UNITS = {"लीटर": "litre", "किलो": "kg", "ग्राम": "g"}
SAID_AMOUNT = re.compile(r"^(?P<qty>\d[\d.,]*)\s*(?P<unit>\S*)$")


def _unit(said: str | None) -> str:
    return SPOKEN_UNITS.get(said or "", (said or "").lower())


def _quantity(ctx: MerchantContext, text: str) -> float | None:
    """The app's one number reader: "1,000 kg" is a thousand, as on every screen (#701)."""
    fields = ctx.store.context(ctx.uid, ctx.business_id)["business"]["fields"]
    return read_number(text, shop_currency(fields), "quantity")


async def supplier_search(ctx: MerchantContext, message: str) -> "InstantResult | None":
    from .instant import InstantResult, SavedTool

    for pattern, language in SEARCHES:
        found = pattern.match(message)
        if not found:
            continue
        what = found["what"].strip()
        amount = AMOUNT.match(what)
        # An amount the reader cannot be sure of stays in the words, never guessed.
        qty = _quantity(ctx, amount["qty"]) if amount else None
        item = (amount["item"] if amount and qty else what).strip()
        if not item:
            return None
        unit = _unit(amount["unit"]) if amount and qty else ""
        result = await find_suppliers(item, qty, unit)
        events = [StreamEvent(kind="sourcing", data={"stage": "searching", "item": item[:80]})]
        status = result.get("status")
        if status == "found":
            card = ctx.cards.get(str(result.get("card_id")))
            if not card:
                return None
            events.append(StreamEvent(kind="suppliers", data=card[1]))
            reply = REPLIES[language][0]
        elif status == "none_found":
            reply = REPLIES[language][1]
        else:
            return None
        # Saved like the model's own call, so the next turn can name a supplier from this list.
        tool = SavedTool("find_suppliers", {"item": item, "quantity": qty, "unit": unit}, result)
        return InstantResult("find_suppliers", reply.format(item=item), events, tool)
    return None


def saved_searches(history: Sequence[Event]) -> list[dict[str, Any]]:
    """Every supplier list in this conversation, newest first, from the model or the screen."""
    found = []
    for event in reversed(history):
        for part in (event.content.parts if event.content else None) or []:
            response = part.function_response
            if response and response.name == "find_suppliers" and response.response:
                if response.response.get("status") == "found":
                    found.append(dict(response.response))
    return found


def _line_amount(
    ctx: MerchantContext, wanted: str, search: dict[str, Any], card: dict[str, Any]
) -> tuple[float, str]:
    """The amount in the tap's words, in the supplier's unit, and a note for the supplier. An
    amount that can't be read or converted is never guessed: the draft is one of the supplier's
    unit, which the card shows before Send, and the note carries the owner's own words."""
    item = str(search.get("item") or "")
    head = wanted[: -len(item)].strip()
    if not head and not re.search(r"\d", item):
        return 1.0, ""
    said = SAID_AMOUNT.match(head)
    quantity = _quantity(ctx, said["qty"]) if said else None
    converted = (
        in_supplier_unit(quantity, _unit(said["unit"]), card["item"], bool(card.get("demo")))
        if said and quantity
        else None
    )
    if converted and round(converted, 3) and converted <= 100_000:
        return round(converted, 3), ""
    return 1.0, wanted


def order_from_list(
    ctx: MerchantContext, message: str, history: Sequence[Event]
) -> "InstantResult | None":
    """The vendor list's Order: the order card to the supplier at that place on the list the tap
    came from. Nothing goes until the owner taps Send."""
    from .agent import ui_language
    from .instant import InstantResult, SavedTool

    for pattern, said_language in ORDERS:
        asked = pattern.match(message)
        if not asked:
            continue
        rank, wanted = int(asked["rank"]), asked["what"].strip()
        search = next(
            (
                found
                for found in saved_searches(history)
                if found.get("item") and wanted.casefold().endswith(str(found["item"]).casefold())
            ),
            None,
        )
        suppliers = (search or {}).get("suppliers") or []
        if not search or not 0 < rank <= len(suppliers):
            return None
        chosen = suppliers[rank - 1]
        unit = str(chosen["item"]["unit"])
        quantity, note = _line_amount(ctx, wanted, search, chosen)
        items = [OrderItem(name=chosen["item"]["name"], quantity=quantity, unit=unit)]
        drafted = prepare_order(chosen["id"], items, note)
        card = ctx.cards.get(str(drafted.get("card_id")))
        if drafted.get("status") != "needs_owner_tap" or not card:
            return None
        language = said_language or ui_language.get().split("-")[0].casefold()
        reply = REPLIES.get(language, REPLIES["en"])[2].format(supplier=chosen["name"])
        args = {
            "supplier_id": chosen["id"],
            "items": [line.model_dump() for line in items],
            "note": note,
        }
        return InstantResult(
            "prepare_order",
            reply,
            [StreamEvent(kind="order", data=card[1])],
            SavedTool("prepare_order", args, drafted),
        )
    return None
