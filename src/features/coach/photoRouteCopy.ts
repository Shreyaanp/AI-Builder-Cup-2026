import type { Locale } from '../../i18n/locales'

/** What a chat photo can be; each kind goes to one existing action. */
export type PhotoRoute = 'shop_photo' | 'menu' | 'product' | 'receipt' | 'till'
export const PHOTO_ROUTES: PhotoRoute[] = ['shop_photo', 'menu', 'product', 'receipt', 'till']

const en = {
  // "Looks like: Menu. Is that right?" — the picked kind is named, the chips below correct it.
  looks: (kind: string) => `Looks like: ${kind}. Is that right?`,
  unsure: 'I couldn’t tell what this photo shows. Is it your shop front, a menu, or a product?',
  notNow: 'Not now',
  group: 'What is this photo?',
  kinds: {
    shop_photo: 'Shop photo',
    menu: 'Menu',
    product: 'Product',
    receipt: 'Receipt',
    till: 'Till report',
  } satisfies Record<PhotoRoute, string>,
}
export type PhotoRouteCopy = typeof en

const other: Partial<Record<Locale, PhotoRouteCopy>> = {
  'zh-Hans': {
    looks: (kind) => `看起来是：${kind}。对吗？`,
    unsure: '我不确定这张照片是什么。照片已保留在这里。它是什么？',
    notNow: '以后再说',
    group: '这张照片是什么？',
    kinds: {
      shop_photo: '店铺照片',
      menu: '菜单',
      product: '商品',
      receipt: '收据',
      till: '收银报表',
    },
  },
  ms: {
    looks: (kind) => `Nampak seperti: ${kind}. Betulkah?`,
    unsure: 'Saya tidak pasti gambar ini apa. Ia disimpan di sini. Apakah ini?',
    notNow: 'Bukan sekarang',
    group: 'Apakah gambar ini?',
    kinds: {
      shop_photo: 'Gambar kedai',
      menu: 'Menu',
      product: 'Produk',
      receipt: 'Resit',
      till: 'Laporan daftar tunai',
    },
  },
  ta: {
    looks: (kind) => `இது போல் தெரிகிறது: ${kind}. சரியா?`,
    unsure: 'இந்தப் படம் என்ன என்று எனக்குத் தெரியவில்லை. படம் இங்கேயே இருக்கிறது. இது என்ன?',
    notNow: 'இப்போது வேண்டாம்',
    group: 'இந்தப் படம் என்ன?',
    kinds: {
      shop_photo: 'கடைப் படம்',
      menu: 'மெனு',
      product: 'பொருள்',
      receipt: 'ரசீது',
      till: 'கல்லா அறிக்கை',
    },
  },
  ja: {
    looks: (kind) => `「${kind}」のようです。合っていますか？`,
    unsure: 'この写真が何か分かりません。写真はここに残してあります。何の写真ですか？',
    notNow: '今はしない',
    group: 'これは何の写真ですか？',
    kinds: {
      shop_photo: 'お店の写真',
      menu: 'メニュー',
      product: '商品',
      receipt: 'レシート',
      till: 'レジ締めレポート',
    },
  },
  ko: {
    looks: (kind) => `‘${kind}’ 같아요. 맞나요?`,
    unsure: '이 사진이 무엇인지 잘 모르겠어요. 사진은 여기에 남아 있어요. 무엇인가요?',
    notNow: '나중에',
    group: '이 사진은 무엇인가요?',
    kinds: {
      shop_photo: '가게 사진',
      menu: '메뉴',
      product: '상품',
      receipt: '영수증',
      till: '정산 리포트',
    },
  },
  id: {
    looks: (kind) => `Sepertinya: ${kind}. Benar?`,
    unsure: 'Saya tidak yakin foto ini apa. Foto tetap tersimpan di sini. Ini apa?',
    notNow: 'Nanti saja',
    group: 'Foto apa ini?',
    kinds: {
      shop_photo: 'Foto toko',
      menu: 'Menu',
      product: 'Produk',
      receipt: 'Struk',
      till: 'Laporan kasir',
    },
  },
  th: {
    looks: (kind) => `ดูเหมือนเป็น: ${kind} ถูกไหม?`,
    unsure: 'ไม่แน่ใจว่ารูปนี้คืออะไร รูปยังเก็บไว้ที่นี่ นี่คืออะไร?',
    notNow: 'ไว้ทีหลัง',
    group: 'รูปนี้คืออะไร?',
    kinds: {
      shop_photo: 'รูปร้าน',
      menu: 'เมนู',
      product: 'สินค้า',
      receipt: 'ใบเสร็จ',
      till: 'รายงานแคชเชียร์',
    },
  },
  vi: {
    looks: (kind) => `Có vẻ là: ${kind}. Đúng không?`,
    unsure: 'Tôi không chắc ảnh này là gì. Ảnh vẫn được giữ ở đây. Đây là gì?',
    notNow: 'Để sau',
    group: 'Ảnh này là gì?',
    kinds: {
      shop_photo: 'Ảnh cửa hàng',
      menu: 'Thực đơn',
      product: 'Sản phẩm',
      receipt: 'Biên lai',
      till: 'Báo cáo quầy thu ngân',
    },
  },
  fil: {
    looks: (kind) => `Mukhang: ${kind}. Tama ba?`,
    unsure: 'Hindi ako sigurado kung ano ang litratong ito. Nandito pa rin ito. Ano ito?',
    notNow: 'Hindi muna',
    group: 'Ano ang litratong ito?',
    kinds: {
      shop_photo: 'Litrato ng tindahan',
      menu: 'Menu',
      product: 'Produkto',
      receipt: 'Resibo',
      till: 'Ulat ng kaha',
    },
  },
  hi: {
    looks: (kind) => `ऐसा लगता है: ${kind}। क्या यह सही है?`,
    unsure: 'मुझे पक्का नहीं पता कि यह फ़ोटो क्या है। फ़ोटो यहीं रखी है। यह क्या है?',
    notNow: 'अभी नहीं',
    group: 'यह फ़ोटो क्या है?',
    kinds: {
      shop_photo: 'दुकान की फ़ोटो',
      menu: 'मेन्यू',
      product: 'प्रोडक्ट',
      receipt: 'रसीद',
      till: 'गल्ले की रिपोर्ट',
    },
  },
  bn: {
    looks: (kind) => `মনে হচ্ছে: ${kind}। ঠিক আছে?`,
    unsure: 'এই ছবিটা কী, আমি নিশ্চিত নই। ছবিটা এখানেই আছে। এটা কী?',
    notNow: 'এখন নয়',
    group: 'এই ছবিটা কী?',
    kinds: {
      shop_photo: 'দোকানের ছবি',
      menu: 'মেনু',
      product: 'পণ্য',
      receipt: 'রসিদ',
      till: 'ক্যাশের রিপোর্ট',
    },
  },
  te: {
    looks: (kind) => `ఇలా అనిపిస్తోంది: ${kind}. సరైనదేనా?`,
    unsure: 'ఈ ఫోటో ఏమిటో నాకు ఖచ్చితంగా తెలియదు. ఫోటో ఇక్కడే ఉంది. ఇది ఏమిటి?',
    notNow: 'ఇప్పుడు కాదు',
    group: 'ఈ ఫోటో ఏమిటి?',
    kinds: {
      shop_photo: 'షాప్ ఫోటో',
      menu: 'మెనూ',
      product: 'ఉత్పత్తి',
      receipt: 'రసీదు',
      till: 'గల్లా నివేదిక',
    },
  },
  mr: {
    looks: (kind) => `असे दिसते: ${kind}. बरोबर आहे का?`,
    unsure: 'हा फोटो काय आहे ते मला नक्की माहीत नाही. फोटो इथेच आहे. हे काय आहे?',
    notNow: 'आता नको',
    group: 'हा फोटो काय आहे?',
    kinds: {
      shop_photo: 'दुकानाचा फोटो',
      menu: 'मेनू',
      product: 'उत्पादन',
      receipt: 'पावती',
      till: 'गल्ल्याचा अहवाल',
    },
  },
  kn: {
    looks: (kind) => `ಹೀಗೆ ಕಾಣುತ್ತದೆ: ${kind}. ಸರಿಯೇ?`,
    unsure: 'ಈ ಫೋಟೋ ಏನೆಂದು ನನಗೆ ಖಚಿತವಿಲ್ಲ. ಫೋಟೋ ಇಲ್ಲೇ ಇದೆ. ಇದು ಏನು?',
    notNow: 'ಈಗ ಬೇಡ',
    group: 'ಈ ಫೋಟೋ ಏನು?',
    kinds: {
      shop_photo: 'ಅಂಗಡಿ ಫೋಟೋ',
      menu: 'ಮೆನು',
      product: 'ಉತ್ಪನ್ನ',
      receipt: 'ರಸೀದಿ',
      till: 'ಗಲ್ಲಾ ವರದಿ',
    },
  },
}
export const photoRouteCopy = (locale: Locale): PhotoRouteCopy => other[locale] ?? en

export function isPhotoRoute(value: unknown): value is PhotoRoute {
  return PHOTO_ROUTES.includes(value as PhotoRoute)
}
