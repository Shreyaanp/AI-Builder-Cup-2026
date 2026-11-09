import type { Locale } from '../../i18n/locales'

/**
 * On an owner's real shop a made-up supplier says "Sample": it must never pass as real, but the
 * word "Demo" there made owners ask whether their own shop was a demo (Ahmed and Priya, 8 Nov).
 */
export const sampleWord: Record<Locale, string> = {
  en: 'Sample',
  'zh-Hans': '示例',
  ms: 'Contoh',
  ta: 'மாதிரி',
  ja: 'サンプル',
  ko: '예시',
  id: 'Contoh',
  th: 'ตัวอย่าง',
  vi: 'Mẫu',
  fil: 'Halimbawa',
  hi: 'नमूना',
  bn: 'নমুনা',
  te: 'నమూనా',
  mr: 'नमुना',
  kn: 'ಮಾದರಿ',
}

/** The same supplier's note, on a real shop. */
export const sampleSupplierNote: Record<Locale, string> = {
  en: 'Sample supplier: nothing here is really sent.',
  'zh-Hans': '示例供应商：这里的内容不会真的发出。',
  ms: 'Pembekal contoh: tiada apa-apa di sini dihantar sebenarnya.',
  ta: 'மாதிரி சப்ளையர்: இங்கே எதுவும் உண்மையில் அனுப்பப்படாது.',
  ja: 'サンプルの仕入れ先です。実際には何も送信されません。',
  ko: '예시 공급업체: 여기서는 실제로 아무것도 보내지 않아요.',
  id: 'Pemasok contoh: tidak ada yang benar-benar terkirim di sini.',
  th: 'ซัพพลายเออร์ตัวอย่าง: ไม่มีการส่งจริงจากที่นี่',
  vi: 'Nhà cung cấp mẫu: không có gì ở đây được gửi thật.',
  fil: 'Halimbawang supplier: walang talagang ipinapadala rito.',
  hi: 'नमूना सप्लायर: यहाँ से सच में कुछ नहीं भेजा जाता।',
  bn: 'নমুনা সরবরাহকারী: এখান থেকে সত্যি কিছু পাঠানো হয় না।',
  te: 'నమూనా సరఫరాదారు: ఇక్కడి నుంచి నిజంగా ఏమీ పంపబడదు.',
  mr: 'नमुना पुरवठादार: इथून प्रत्यक्षात काहीही पाठवले जात नाही.',
  kn: 'ಮಾದರಿ ಪೂರೈಕೆದಾರ: ಇಲ್ಲಿಂದ ನಿಜವಾಗಿ ಏನೂ ಕಳುಹಿಸುವುದಿಲ್ಲ.',
}
