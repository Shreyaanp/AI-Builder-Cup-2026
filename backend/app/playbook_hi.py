"""Hindi words for the offline playbook fixture (app/playbook.py).

Live Gemini writes the playbook in the owner's language. Offline (and when the model fails) the
deterministic fixture is used; a Hindi owner reads it in Hindi, not English. Owner words (shop
category, area, menu items, regulars) stay as the owner wrote them.
"""

# ruff: noqa: E501 - one line per translation reads best

from __future__ import annotations

HINDI: dict[str, str] = {
    # Tea stall
    "Cups sold each day show your real rhythm.": "रोज़ बिके कप आपकी असली रफ़्तार दिखाते हैं।",
    "Rush hours decide when to boil and prep.": "भीड़ का समय तय करता है कि कब उबालें और तैयारी करें।",
    "Regulars coming back is the heart of a stall.": "नियमित ग्राहकों का लौटना ही स्टॉल की जान है।",
    "Morning and evening tea rush": "सुबह और शाम की चाय की भीड़",
    "Milk, tea leaves and sugar running low": "दूध, चाय पत्ती और चीनी कम होना",
    "Rainy and cold days bring more tea orders": "बारिश और ठंड के दिनों में चाय ज़्यादा बिकती है",
    "Know how many cups to prepare before the rush.": "भीड़ से पहले जानें कि कितने कप तैयार करने हैं।",
    "A stamp card keeps regulars coming back.": "स्टैम्प कार्ड से नियमित ग्राहक लौटते रहते हैं।",
    "Let people nearby find your stall.": "आस-पास के लोग आपका स्टॉल ढूँढ सकें।",
    "Office and shop workers on a tea break": "चाय के ब्रेक पर दफ़्तर और दुकानों के कर्मचारी",
    "Students and passers-by": "विद्यार्थी और राहगीर",
    "Never run out of milk during the rush": "भीड़ के समय दूध कभी खत्म न हो",
    "Keep the regulars happy": "नियमित ग्राहकों को खुश रखें",
    # Bakery
    "Bakes sold show what to make tomorrow.": "बिके बेकरी सामान से पता चलता है कि कल क्या बनाएँ।",
    "Unsold bakes at closing are money lost.": "बंद होने तक न बिका सामान पैसे का नुकसान है।",
    "Custom order questions are future sales.": "खास ऑर्डर के सवाल आगे की बिक्री हैं।",
    "Flour, butter and eggs": "आटा, मक्खन और अंडे",
    "Festival and birthday cake orders": "त्योहार और जन्मदिन के केक ऑर्डर",
    "Sell end-of-day bakes instead of throwing them away.": "दिन के आखिर का सामान फेंकने के बजाय बेचें।",
    "Bake closer to what will sell.": "उतना ही बनाएँ जितना बिकेगा।",
    "Record leftovers to learn your real demand.": "बचा सामान लिखें, ताकि असली मांग पता चले।",
    "Families ordering birthday cakes": "जन्मदिन के केक मँगाने वाले परिवार",
    "Morning bread buyers": "सुबह ब्रेड खरीदने वाले",
    "Bake close to demand": "मांग के हिसाब से बनाएँ",
    "Say yes to custom orders early": "खास ऑर्डर जल्दी स्वीकार करें",
    # Snacks
    "Plates sold show your best snacks.": "बिकी प्लेटें आपके सबसे अच्छे नाश्ते दिखाती हैं।",
    "Evening rush decides when to fry fresh.": "शाम की भीड़ तय करती है कि कब ताज़ा तलें।",
    "Daily takings show good and slow days.": "रोज़ की कमाई अच्छे और धीमे दिन दिखाती है।",
    "Evening snack rush": "शाम के नाश्ते की भीड़",
    "Oil, flour and fillings": "तेल, आटा और भरावन",
    "Prepare the right amount before the rush.": "भीड़ से पहले सही मात्रा तैयार करें।",
    "Sell leftovers before closing.": "बंद होने से पहले बचा सामान बेचें।",
    "Show up when people search for snacks nearby.": "लोग पास में नाश्ता ढूँढें तो आप दिखें।",
    "Evening snack crowd": "शाम को नाश्ता करने वाले",
    "Students and office workers": "विद्यार्थी और दफ़्तर के कर्मचारी",
    "Fresh stock before the evening rush": "शाम की भीड़ से पहले ताज़ा माल",
    "Cut end-of-day leftovers": "दिन के आखिर में बचा सामान घटाएँ",
    # Restaurant
    "Dishes sold show what to cook more of.": "बिके व्यंजन बताते हैं कि क्या ज़्यादा पकाएँ।",
    "Customer questions show what people want to know.": "ग्राहकों के सवाल बताते हैं कि लोग क्या जानना चाहते हैं।",
    "Lunch and dinner rush": "दोपहर और रात के खाने की भीड़",
    "Rice, vegetables and main ingredients": "चावल, सब्ज़ियाँ और मुख्य सामग्री",
    "Festival and family-gathering demand": "त्योहार और पारिवारिक दावतों की मांग",
    "Cook closer to what will sell.": "उतना ही पकाएँ जितना बिकेगा।",
    "Order supplies before you run short.": "कमी होने से पहले सामान मँगाएँ।",
    "See your week in one page.": "पूरा हफ़्ता एक पेज पर देखें।",
    "Lunch crowd from nearby offices": "पास के दफ़्तरों से दोपहर के खाने वाले",
    "Families at dinner": "रात के खाने पर परिवार",
    "Plan cooking for the lunch rush": "दोपहर की भीड़ के लिए खाना पकाने की योजना बनाएँ",
    "Answer customer questions quickly": "ग्राहकों के सवालों का जल्दी जवाब दें",
    # Butcher
    "Daily takings by weight sold.": "बिके वज़न के हिसाब से रोज़ की कमाई।",
    "Popular cuts running out lose customers.": "पसंदीदा कट खत्म होने से ग्राहक जाते हैं।",
    "Weekend mornings are usually busiest.": "आम तौर पर सप्ताहांत की सुबह सबसे ज़्यादा भीड़ होती है।",
    "Popular cuts": "पसंदीदा कट",
    "Festival and weekend demand": "त्योहार और सप्ताहांत की मांग",
    "Order stock from suppliers in time.": "सप्लायर से समय पर माल मँगाएँ।",
    "Know how much to keep ready.": "जानें कि कितना तैयार रखना है।",
    "Let people nearby find your shop.": "आस-पास के लोग आपकी दुकान ढूँढ सकें।",
    "Families buying for the week": "हफ़्ते भर का सामान खरीदने वाले परिवार",
    "Restaurants buying in bulk": "थोक में खरीदने वाले रेस्टोरेंट",
    "Keep popular cuts in stock": "पसंदीदा कट स्टॉक में रखें",
    "Plan for festival demand": "त्योहार की मांग की तैयारी करें",
    # Any shop
    "What sells shows what to prepare.": "जो बिकता है, वही बताता है कि क्या तैयार करें।",
    "Customer questions show what people want.": "ग्राहकों के सवाल बताते हैं कि लोग क्या चाहते हैं।",
    "Your best sellers": "आपके सबसे ज़्यादा बिकने वाले सामान",
    "Your busiest hours": "आपकी सबसे ज़्यादा भीड़ के घंटे",
    "Prepare closer to demand.": "मांग के हिसाब से तैयारी करें।",
    "Help people nearby find you.": "आस-पास के लोग आपको ढूँढ सकें।",
    "A stamp card brings people back.": "स्टैम्प कार्ड से लोग दोबारा आते हैं।",
    "Regular neighbourhood customers": "मोहल्ले के नियमित ग्राहक",
    "Learn what sells best": "जानें कि सबसे ज़्यादा क्या बिकता है",
    "Keep regulars coming back": "नियमित ग्राहकों को लौटाते रहें",
    # Tailor
    "Orders due this week set your workload.": "इस हफ़्ते के ऑर्डर आपका काम तय करते हैं।",
    "Fittings booked keep work on time.": "तय फ़िटिंग से काम समय पर होता है।",
    "Questions about prices and timing are new orders.": "दाम और समय के सवाल नए ऑर्डर हैं।",
    "Wedding and festival season rush": "शादी और त्योहारों के मौसम की भीड़",
    "Orders close to their due date": "जिन ऑर्डर की तारीख पास है",
    "Share your price list with customers.": "ग्राहकों के साथ अपनी रेट लिस्ट साझा करें।",
    "Bring regular customers back.": "नियमित ग्राहकों को वापस लाएँ।",
    "Families before weddings and festivals": "शादियों और त्योहारों से पहले परिवार",
    "Office workers needing alterations": "कपड़े ठीक करवाने वाले दफ़्तर के कर्मचारी",
    "Deliver every order on time": "हर ऑर्डर समय पर दें",
    "Plan for the festival rush": "त्योहार की भीड़ की तैयारी करें",
    # Salon
    "Bookings show how full your days are.": "बुकिंग बताती हैं कि आपके दिन कितने भरे हैं।",
    "Clients coming back is what grows a salon.": "ग्राहकों के लौटने से ही सैलून बढ़ता है।",
    "Busy hours decide staff time.": "भीड़ के घंटे स्टाफ़ का समय तय करते हैं।",
    "Weekend appointments": "सप्ताहांत की बुकिंग",
    "Wedding and festival season": "शादी और त्योहारों का मौसम",
    "Hair and skin products": "बाल और त्वचा के उत्पाद",
    "Reward regular clients.": "नियमित ग्राहकों को इनाम दें।",
    "Be found when people search nearby.": "लोग पास में ढूँढें तो आप दिखें।",
    "Share your services and prices.": "अपनी सेवाएँ और दाम साझा करें।",
    "Regular clients": "नियमित ग्राहक",
    "Wedding and party bookings": "शादी और पार्टी की बुकिंग",
    "Fill quiet weekday slots": "हफ़्ते के खाली समय भरें",
    "Keep regular clients coming back": "नियमित ग्राहकों को लौटाते रहें",
    # Retail
    "Popular items running out lose sales.": "पसंदीदा सामान खत्म होने से बिक्री जाती है।",
    "Questions show what people look for.": "सवाल बताते हैं कि लोग क्या ढूँढ रहे हैं।",
    "Fast-moving items": "जल्दी बिकने वाला सामान",
    "Festival season demand": "त्योहारों के मौसम की मांग",
    "Restock from suppliers in time.": "सप्लायर से समय पर दोबारा माल भरें।",
    "Neighbourhood regulars": "मोहल्ले के नियमित ग्राहक",
    "Walk-in shoppers": "सीधे दुकान पर आने वाले ग्राहक",
    "Keep fast movers in stock": "जल्दी बिकने वाला सामान स्टॉक में रखें",
    "Answer stock questions quickly": "स्टॉक के सवालों का जल्दी जवाब दें",
    # Grocer
    "Staples running out send customers elsewhere.": "रोज़ का सामान खत्म हो तो ग्राहक दूसरी जगह जाते हैं।",
    "Delivery questions are orders waiting.": "डिलीवरी के सवाल इंतज़ार कर रहे ऑर्डर हैं।",
    "Daily staples: milk, rice, oil": "रोज़ का सामान: दूध, चावल, तेल",
    "Festival shopping weeks": "त्योहारों की खरीदारी के हफ़्ते",
    "Restock staples before they run out.": "रोज़ का सामान खत्म होने से पहले भरें।",
    "Share your list for home delivery orders.": "होम डिलीवरी ऑर्डर के लिए अपनी सूची साझा करें।",
    "Households nearby": "पास के घर",
    "Home delivery customers": "होम डिलीवरी वाले ग्राहक",
    "Never run out of staples": "रोज़ का सामान कभी खत्म न हो",
    "Grow home delivery orders": "होम डिलीवरी ऑर्डर बढ़ाएँ",
    # Services
    "Jobs booked set your week.": "बुक हुए काम आपका हफ़्ता तय करते हैं।",
    "Enquiries are future jobs.": "पूछताछ आगे के काम हैं।",
    "Repeat customers and referrals grow the business.": "लौटते ग्राहक और सिफ़ारिशें काम बढ़ाती हैं।",
    "Jobs waiting for a reply": "जवाब का इंतज़ार कर रहे काम",
    "Homes in your service area": "आपके सेवा क्षेत्र के घर",
    "Reply to every enquiry the same day": "हर पूछताछ का उसी दिन जवाब दें",
    # Owner focus
    "Bring in more customers": "ज़्यादा ग्राहक लाएँ",
    "Waste less stock": "कम माल बर्बाद करें",
    "Save time every day": "रोज़ समय बचाएँ",
    "More customers start with being easy to find.": "ज़्यादा ग्राहक तभी आते हैं जब आपको ढूँढना आसान हो।",
    "Sell what is left before closing instead of wasting it.": "बचा माल बर्बाद करने के बजाय बंद होने से पहले बेचें।",
    "Bring in your sales once; the app does the counting.": "अपनी बिक्री एक बार जोड़ें; गिनती ऐप करेगा।",
    # Added by the shop's state
    "Leftovers at closing show what to make less of.": "बंद होने पर बचा माल बताता है कि क्या कम बनाएँ।",
    "Bring in past sales so the numbers mean something.": "पुरानी बिक्री जोड़ें, ताकि आँकड़ों का मतलब निकले।",
    "A photo of your price board fills the menu in one go.": "रेट बोर्ड की एक फ़ोटो से पूरा मेन्यू भर जाता है।",
    "Reply to customer questions quickly": "ग्राहकों के सवालों का जल्दी जवाब दें",
}

# "<English prefix><owner words>" lines: the prefix is translated, the owner's words stay.
PREFIXES = {
    "Best sellers: ": "सबसे ज़्यादा बिकने वाले: ",
    "Rush hours: ": "भीड़ का समय: ",
    "Regulars: ": "नियमित ग्राहक: ",
}


def hindi(text: str) -> str:
    """The Hindi line for an offline fixture line; owner words and unknown lines unchanged."""
    if text in HINDI:
        return HINDI[text]
    for prefix, local in PREFIXES.items():
        if text.startswith(prefix):
            return local + text[len(prefix) :]
    return text


def summary(category: str, location: str) -> str:
    """'A Cafe shop in Indiranagar.' in Hindi, with the owner's own words."""
    shop = f"{category} की दुकान" if category else "एक दुकान"
    return f"{location} में {shop}।" if location else f"{shop}।"
