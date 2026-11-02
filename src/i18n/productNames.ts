/**
 * Display seeded product names in the selected UI language without changing stored names.
 * In the public demo every item in the Indian sample shops, chains and their suppliers has a
 * Hindi name (OB-74, OB-248). Everywhere else an owner's items show as they typed them, even
 * when one happens to be called "Milk bread" too.
 */
// [Hindi name, feminine]: the gender picks "खत्म होगी" or "खत्म होगा".
const HINDI: Record<string, readonly [string, boolean]> = {
  'AA batteries': ['AA बैटरी', true],
  'Aloo tikki': ['आलू टिक्की', true],
  'Arabica-chicory blend': ['अरेबिका-चिकोरी मिश्रण', false],
  Atta: ['आटा', false],
  'Banana bread': ['केले की ब्रेड', true],
  Bananas: ['केले', false],
  'Battery replacement': ['बैटरी बदलाई', true],
  'Bhel puri': ['भेल पूरी', true],
  Biscuits: ['बिस्कुट', false],
  'Bun maska': ['बन मस्का', false],
  'Butter croissant': ['बटर क्रोसाँ', false],
  'Button repair': ['बटन मरम्मत', true],
  'Chapati set': ['चपाती सेट', false],
  'Charging port clean': ['चार्जिंग पोर्ट सफ़ाई', true],
  'Chocolate cake': ['चॉकलेट केक', false],
  'Chole kulche': ['छोले कुल्चे', false],
  'Coconut bun': ['नारियल बन', false],
  Curd: ['दही', false],
  'Curd rice': ['दही चावल', false],
  'Curtain shortening': ['पर्दा छोटा करना', false],
  'Cutting chai': ['कटिंग चाय', true],
  'Dahi bhalla': ['दही भल्ला', false],
  Dal: ['दाल', true],
  'Deep liner clean': ['लाइनर की गहरी सफ़ाई', true],
  'Desk arrangement': ['मेज़ के फूलों की सजावट', true],
  'Detergent powder': ['डिटर्जेंट पाउडर', false],
  'Door hinge': ['दरवाज़े का कब्ज़ा', false],
  'Evaporated milk': ['गाढ़ा दूध', false],
  'Extension board': ['एक्सटेंशन बोर्ड', false],
  'Festival flower basket': ['त्योहार की फूलों की टोकरी', true],
  'Filter coffee': ['फ़िल्टर कॉफ़ी', true],
  'Gift wrapping': ['गिफ़्ट पैकिंग', true],
  'Ginger chai': ['अदरक चाय', true],
  'Helmet clean': ['हेलमेट सफ़ाई', true],
  'Helmet liner': ['हेलमेट लाइनर', false],
  'Idli breakfast': ['इडली नाश्ता', false],
  'Instant noodles': ['इंस्टेंट नूडल्स', false],
  'Insulation tape': ['इंसुलेशन टेप', false],
  Jaggery: ['गुड़', false],
  Jaljeera: ['जलजीरा', false],
  'Jasmine flowers': ['चमेली के फूल', false],
  'Jasmine string': ['चमेली का गजरा', false],
  'Khari biscuits': ['खारी बिस्कुट', false],
  'Kurta stitching': ['कुर्ता सिलाई', true],
  'LED bulb 9W': ['एलईडी बल्ब 9 वॉट', false],
  'Lemon rice': ['नींबू चावल', false],
  'Lime soda': ['नींबू सोडा', false],
  'Marigold garland': ['गेंदे की माला', true],
  'Masala chai': ['मसाला चाय', true],
  'Masala dosa': ['मसाला डोसा', false],
  Milk: ['दूध', false],
  'Milk bread': ['दूध ब्रेड', true],
  'Misal pav': ['मिसल पाव', false],
  'Multigrain loaf': ['मल्टीग्रेन ब्रेड', true],
  'Nimbu pani': ['नींबू पानी', false],
  'Orchid bunch': ['ऑर्किड का गुच्छा', false],
  'PVC adhesive': ['पीवीसी गोंद', false],
  'Paneer kathi roll': ['पनीर काठी रोल', false],
  'Paneer roll': ['पनीर रोल', false],
  'Papdi chaat': ['पापड़ी चाट', true],
  'Paper cups (50)': ['कागज़ के कप (50)', false],
  'Pav bhaji': ['पाव भाजी', true],
  'Plum cake': ['प्लम केक', false],
  'Ragi biscuit': ['रागी बिस्कुट', false],
  'Ragi cookie': ['रागी कुकी', true],
  'Rain cover': ['बारिश कवर', false],
  'Refined oil': ['रिफ़ाइंड तेल', false],
  'Rose bouquet': ['गुलाब का गुलदस्ता', false],
  'Sabudana vada': ['साबूदाना वड़ा', false],
  Samosa: ['समोसा', false],
  'Screen protector': ['स्क्रीन गार्ड', false],
  'Screen replacement': ['स्क्रीन बदलाई', true],
  'Screwdriver set': ['पेचकस सेट', false],
  'Sev puri': ['सेव पूरी', true],
  'Shirt fitting': ['शर्ट फ़िटिंग', true],
  'Sliced bread': ['स्लाइस ब्रेड', true],
  'Sona masoori rice': ['सोना मसूरी चावल', false],
  'Speaker repair': ['स्पीकर मरम्मत', true],
  Sugar: ['चीनी', true],
  Sunflower: ['सूरजमुखी', false],
  'Sunflower bunch': ['सूरजमुखी का गुच्छा', false],
  'Sunflower oil': ['सूरजमुखी तेल', false],
  'Sweet lassi': ['मीठी लस्सी', true],
  'Tea dust': ['चाय पत्ती', true],
  'Tea leaves': ['चाय की पत्तियाँ', true],
  'Tea powder': ['चाय पाउडर', false],
  'Toor dal': ['तूर दाल', true],
  Toothpaste: ['टूथपेस्ट', false],
  'Trouser hemming': ['पतलून की तुरपाई', true],
  'Two helmet cleans': ['दो हेलमेट की सफ़ाई', true],
  'USB-C cable': ['यूएसबी-सी केबल', false],
  'Vada pav': ['वड़ा पाव', false],
  'Vegetable puff': ['वेज पफ़', false],
  'Vegetable sandwich': ['वेज सैंडविच', false],
  'Vegetarian thali': ['शाकाहारी थाली', true],
  'Visor polish': ['वाइज़र पॉलिश', true],
  'Wall hooks': ['दीवार के हुक', false],
  'Weekend biryani': ['वीकेंड बिरयानी', true],
  'Zip replacement': ['ज़िप बदलाई', true],
}

let sampleShops = false
/** The public demo calls this as it loads; leaving it reloads the page. */
export function nameSampleShops() {
  sampleShops = true
}

const hindi = (locale: string, name: string) =>
  locale.toLowerCase().startsWith('hi') && (sampleShops || name === 'Tea dust')

export function productName(name: string, locale: string): string {
  return hindi(locale, name) ? (HINDI[name]?.[0] ?? name) : name
}

/** Hindi grammar for "runs out": true when the item's Hindi name is feminine (चाय पत्ती). */
export function productFeminine(name: string, locale: string): boolean {
  return hindi(locale, name) && Boolean(HINDI[name]?.[1])
}
