import type { Locale } from '../../i18n/locales'

/** A sales report can also fill the item list: the owner says which they want from this file. */
export type FillCopy = { question: string; sales: string; items: string; itemsHint: string }

export const fillCopy: Record<Locale, FillCopy> = {
  en: {
    question: 'What should this file fill?',
    sales: 'My sales',
    items: 'My item list',
    itemsHint: 'Each price is the amount ÷ the quantity. You check every item before it saves.',
  },
  'zh-Hans': {
    question: '这个文件要填入什么？',
    sales: '我的销售',
    items: '我的商品清单',
    itemsHint: '价格按金额 ÷ 数量计算。保存前您会逐项确认。',
  },
  ms: {
    question: 'Fail ini untuk mengisi apa?',
    sales: 'Jualan saya',
    items: 'Senarai item saya',
    itemsHint: 'Setiap harga ialah amaun ÷ kuantiti. Anda semak setiap item sebelum disimpan.',
  },
  ta: {
    question: 'இந்தக் கோப்பு எதை நிரப்ப வேண்டும்?',
    sales: 'என் விற்பனை',
    items: 'என் பொருள் பட்டியல்',
    itemsHint: 'விலை = தொகை ÷ அளவு. சேமிக்கும் முன் ஒவ்வொரு பொருளையும் சரிபார்க்கலாம்.',
  },
  ja: {
    question: 'このファイルで何を入力しますか？',
    sales: '売上',
    items: '品目リスト',
    itemsHint: '価格は金額 ÷ 数量です。保存前にすべて確認できます。',
  },
  ko: {
    question: '이 파일로 무엇을 채울까요?',
    sales: '내 매출',
    items: '내 품목 목록',
    itemsHint: '가격은 금액 ÷ 수량이에요. 저장 전에 모두 확인할 수 있어요.',
  },
  id: {
    question: 'File ini untuk mengisi apa?',
    sales: 'Penjualan saya',
    items: 'Daftar barang saya',
    itemsHint: 'Harga = jumlah ÷ kuantitas. Anda periksa semua barang sebelum disimpan.',
  },
  th: {
    question: 'ไฟล์นี้จะใช้กรอกอะไร',
    sales: 'ยอดขายของฉัน',
    items: 'รายการสินค้าของฉัน',
    itemsHint: 'ราคาคือยอดเงิน ÷ จำนวน คุณตรวจสอบทุกรายการก่อนบันทึก',
  },
  vi: {
    question: 'Tệp này dùng để điền gì?',
    sales: 'Doanh thu của tôi',
    items: 'Danh sách món của tôi',
    itemsHint: 'Giá = số tiền ÷ số lượng. Bạn kiểm tra từng món trước khi lưu.',
  },
  fil: {
    question: 'Ano ang pupunuin ng file na ito?',
    sales: 'Benta ko',
    items: 'Listahan ng items ko',
    itemsHint: 'Ang presyo ay halaga ÷ dami. Iche-check mo ang bawat item bago i-save.',
  },
  hi: {
    question: 'यह फ़ाइल क्या भरे?',
    sales: 'मेरी बिक्री',
    items: 'मेरे सामान की सूची',
    itemsHint: 'हर दाम = रकम ÷ मात्रा। सहेजने से पहले आप हर सामान देख लेंगे।',
  },
  bn: {
    question: 'এই ফাইল কী পূরণ করবে?',
    sales: 'আমার বিক্রি',
    items: 'আমার পণ্যের তালিকা',
    itemsHint: 'প্রতিটি দাম = টাকা ÷ পরিমাণ। সংরক্ষণের আগে আপনি প্রতিটি পণ্য দেখবেন।',
  },
  te: {
    question: 'ఈ ఫైల్ దేన్ని నింపాలి?',
    sales: 'నా అమ్మకాలు',
    items: 'నా వస్తువుల జాబితా',
    itemsHint: 'ధర = మొత్తం ÷ పరిమాణం. సేవ్ చేసే ముందు ప్రతి వస్తువును మీరు చూస్తారు.',
  },
  mr: {
    question: 'ही फाइल काय भरेल?',
    sales: 'माझी विक्री',
    items: 'माझी वस्तूंची यादी',
    itemsHint: 'प्रत्येक किंमत = रक्कम ÷ प्रमाण. जतन करण्यापूर्वी तुम्ही प्रत्येक वस्तू तपासाल.',
  },
  kn: {
    question: 'ಈ ಫೈಲ್ ಏನನ್ನು ತುಂಬಬೇಕು?',
    sales: 'ನನ್ನ ಮಾರಾಟ',
    items: 'ನನ್ನ ವಸ್ತುಗಳ ಪಟ್ಟಿ',
    itemsHint: 'ಬೆಲೆ = ಮೊತ್ತ ÷ ಪ್ರಮಾಣ. ಉಳಿಸುವ ಮೊದಲು ಪ್ರತಿ ವಸ್ತುವನ್ನು ನೋಡುತ್ತೀರಿ.',
  },
}
