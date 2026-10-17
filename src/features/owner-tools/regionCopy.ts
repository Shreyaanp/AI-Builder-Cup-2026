import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'

/** Payments copy that depends on the shop's region (PayNow in Singapore; region.ts). */
export const english = {
  paynowHint:
    'Customers scan it with any Singapore bank app. Chalkboard never handles money or confirms payment.',
  paynowId: 'PayNow mobile or UEN',
  invalidPaynow: 'Use +65 and 8 digits, or your UEN.',
  saveQr: 'Save QR',
  noPaymentLink: 'Payment QR codes work for shops in India (UPI) and Singapore (PayNow).',
  amountIn: 'Amount ({symbol})',
  invalidAmountIn: 'Enter {min}–{max} with up to 2 decimals.',
}
export type RegionCopy = typeof english
const keys = Object.keys(english) as (keyof RegionCopy)[]

// Each row follows the English key order.
const rows: Record<Exclude<Locale, 'en'>, string[]> = {
  'zh-Hans': [
    '顾客可用任何新加坡银行应用扫码。Chalkboard 不经手款项，也不确认付款。',
    'PayNow 手机号或 UEN',
    '请输入 +65 加 8 位数字，或您的 UEN。',
    '保存二维码',
    '付款二维码适用于印度（UPI）和新加坡（PayNow）的店铺。',
    '金额（{symbol}）',
    '请输入 {min}–{max}，最多 2 位小数。',
  ],
  ms: [
    'Pelanggan imbas dengan mana-mana aplikasi bank Singapura. Chalkboard tidak mengendalikan wang atau mengesahkan bayaran.',
    'Nombor mudah alih PayNow atau UEN',
    'Gunakan +65 dan 8 digit, atau UEN anda.',
    'Simpan QR',
    'Kod QR bayaran untuk kedai di India (UPI) dan Singapura (PayNow).',
    'Jumlah ({symbol})',
    'Masukkan {min}–{max}, hingga 2 tempat perpuluhan.',
  ],
  ta: [
    'வாடிக்கையாளர்கள் எந்த சிங்கப்பூர் வங்கிச் செயலியிலும் இதை ஸ்கேன் செய்யலாம். Chalkboard பணத்தைக் கையாளாது அல்லது பணம் வந்ததை உறுதிசெய்யாது.',
    'PayNow கைபேசி எண் அல்லது UEN',
    '+65 உடன் 8 இலக்கங்கள் அல்லது உங்கள் UEN இடுங்கள்.',
    'QR ஐச் சேமி',
    'பணம் செலுத்தும் QR இந்தியா (UPI), சிங்கப்பூர் (PayNow) கடைகளுக்கு மட்டும்.',
    'தொகை ({symbol})',
    '{min}–{max} இடுங்கள்; அதிகபட்சம் 2 தசம இடங்கள்.',
  ],
  ja: [
    'お客様はシンガポールの銀行アプリで読み取れます。Chalkboard はお金を扱わず、支払いも確認しません。',
    'PayNow の携帯番号または UEN',
    '+65 と 8 桁の番号、または UEN を入力してください。',
    'QR を保存',
    '支払い QR はインド（UPI）とシンガポール（PayNow）のお店で使えます。',
    '金額（{symbol}）',
    '{min}〜{max} を小数点以下 2 桁までで入力してください。',
  ],
  ko: [
    '고객은 싱가포르 은행 앱으로 스캔할 수 있어요. Chalkboard는 돈을 다루거나 결제를 확인하지 않아요.',
    'PayNow 휴대폰 번호 또는 UEN',
    '+65와 8자리 숫자, 또는 UEN을 입력하세요.',
    'QR 저장',
    '결제 QR은 인도(UPI)와 싱가포르(PayNow) 매장에서 쓸 수 있어요.',
    '금액 ({symbol})',
    '{min}–{max}, 소수점 2자리까지 입력하세요.',
  ],
  id: [
    'Pelanggan memindainya dengan aplikasi bank Singapura mana pun. Chalkboard tidak mengelola uang atau mengonfirmasi pembayaran.',
    'Nomor ponsel PayNow atau UEN',
    'Gunakan +65 dan 8 digit, atau UEN Anda.',
    'Simpan QR',
    'Kode QR pembayaran untuk toko di India (UPI) dan Singapura (PayNow).',
    'Jumlah ({symbol})',
    'Masukkan {min}–{max}, maksimal 2 desimal.',
  ],
  th: [
    'ลูกค้าสแกนได้ด้วยแอปธนาคารสิงคโปร์ใดก็ได้ Chalkboard ไม่รับเงินหรือยืนยันการชำระ',
    'เบอร์มือถือ PayNow หรือ UEN',
    'ใช้ +65 ตามด้วยเลข 8 หลัก หรือ UEN ของคุณ',
    'บันทึก QR',
    'QR ชำระเงินใช้ได้กับร้านในอินเดีย (UPI) และสิงคโปร์ (PayNow)',
    'จำนวนเงิน ({symbol})',
    'ใส่ {min}–{max} ทศนิยมไม่เกิน 2 ตำแหน่ง',
  ],
  vi: [
    'Khách quét bằng bất kỳ ứng dụng ngân hàng Singapore nào. Chalkboard không giữ tiền hay xác nhận thanh toán.',
    'Số điện thoại PayNow hoặc UEN',
    'Dùng +65 và 8 chữ số, hoặc UEN của bạn.',
    'Lưu mã QR',
    'Mã QR thanh toán dành cho cửa hàng ở Ấn Độ (UPI) và Singapore (PayNow).',
    'Số tiền ({symbol})',
    'Nhập {min}–{max}, tối đa 2 chữ số thập phân.',
  ],
  fil: [
    'Masa-scan ito ng customer gamit ang kahit anong bank app sa Singapore. Hindi humahawak ng pera o nagkukumpirma ng bayad ang Chalkboard.',
    'PayNow mobile o UEN',
    'Gamitin ang +65 at 8 digit, o ang iyong UEN.',
    'I-save ang QR',
    'Para sa mga tindahan sa India (UPI) at Singapore (PayNow) ang payment QR.',
    'Halaga ({symbol})',
    'Ilagay ang {min}–{max}, hanggang 2 decimal.',
  ],
  hi: [
    'ग्राहक इसे सिंगापुर के किसी भी बैंक ऐप से स्कैन कर सकते हैं। Chalkboard पैसे नहीं संभालता और भुगतान की पुष्टि नहीं करता।',
    'PayNow मोबाइल नंबर या UEN',
    '+65 और 8 अंक, या अपना UEN लिखें।',
    'QR सहेजें',
    'भुगतान QR भारत (UPI) और सिंगापुर (PayNow) की दुकानों के लिए है।',
    'राशि ({symbol})',
    '{min}–{max} लिखें, दशमलव के बाद अधिकतम 2 अंक।',
  ],
  bn: [
    'গ্রাহকেরা যেকোনো সিঙ্গাপুরের ব্যাংক অ্যাপ দিয়ে এটি স্ক্যান করতে পারেন। Chalkboard টাকা লেনদেন করে না বা পেমেন্ট নিশ্চিত করে না।',
    'PayNow মোবাইল নম্বর বা UEN',
    '+65 ও ৮টি সংখ্যা, বা আপনার UEN লিখুন।',
    'QR সংরক্ষণ করুন',
    'পেমেন্ট QR ভারত (UPI) ও সিঙ্গাপুরের (PayNow) দোকানের জন্য।',
    'পরিমাণ ({symbol})',
    '{min}–{max} লিখুন, দশমিকের পরে সর্বোচ্চ ২ অঙ্ক।',
  ],
  te: [
    'కస్టమర్లు ఏ సింగపూర్ బ్యాంక్ యాప్‌తోనైనా దీన్ని స్కాన్ చేయవచ్చు. Chalkboard డబ్బును నిర్వహించదు, చెల్లింపును నిర్ధారించదు.',
    'PayNow మొబైల్ నంబర్ లేదా UEN',
    '+65 మరియు 8 అంకెలు, లేదా మీ UEN ఇవ్వండి.',
    'QR సేవ్ చేయండి',
    'చెల్లింపు QR భారత్ (UPI), సింగపూర్ (PayNow) దుకాణాలకు మాత్రమే.',
    'మొత్తం ({symbol})',
    '{min}–{max} ఇవ్వండి, గరిష్ఠంగా 2 దశాంశ స్థానాలు.',
  ],
  mr: [
    'ग्राहक कोणत्याही सिंगापूर बँक ॲपने हा स्कॅन करू शकतात. Chalkboard पैसे हाताळत नाही किंवा पेमेंटची खात्री करत नाही.',
    'PayNow मोबाइल नंबर किंवा UEN',
    '+65 आणि 8 अंक, किंवा तुमचा UEN लिहा.',
    'QR जतन करा',
    'पेमेंट QR भारत (UPI) आणि सिंगापूर (PayNow) मधील दुकानांसाठी आहे.',
    'रक्कम ({symbol})',
    '{min}–{max} लिहा, दशांशानंतर जास्तीत जास्त 2 अंक.',
  ],
  kn: [
    'ಗ್ರಾಹಕರು ಯಾವುದೇ ಸಿಂಗಾಪುರ್ ಬ್ಯಾಂಕ್ ಆ್ಯಪ್‌ನಿಂದ ಇದನ್ನು ಸ್ಕ್ಯಾನ್ ಮಾಡಬಹುದು. Chalkboard ಹಣವನ್ನು ನಿರ್ವಹಿಸುವುದಿಲ್ಲ ಅಥವಾ ಪಾವತಿಯನ್ನು ದೃಢೀಕರಿಸುವುದಿಲ್ಲ.',
    'PayNow ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಅಥವಾ UEN',
    '+65 ಮತ್ತು 8 ಅಂಕಿಗಳು, ಅಥವಾ ನಿಮ್ಮ UEN ನಮೂದಿಸಿ.',
    'QR ಉಳಿಸಿ',
    'ಪಾವತಿ QR ಭಾರತ (UPI) ಮತ್ತು ಸಿಂಗಾಪುರ (PayNow) ಅಂಗಡಿಗಳಿಗೆ ಮಾತ್ರ.',
    'ಮೊತ್ತ ({symbol})',
    '{min}–{max} ನಮೂದಿಸಿ, ಗರಿಷ್ಠ 2 ದಶಮಾಂಶ ಸ್ಥಾನಗಳು.',
  ],
}

export const regionTranslations = Object.fromEntries(
  Object.entries(rows).map(([locale, cells]) => {
    if (cells.length !== keys.length) throw new Error(`Region payments copy count: ${locale}`)
    return [locale, Object.fromEntries(keys.map((key, index) => [key, cells[index]]))]
  }),
) as Record<Exclude<Locale, 'en'>, RegionCopy>
export const regionCopy = (locale: Locale): RegionCopy =>
  locale === 'en' ? english : regionTranslations[locale]
export const useRegionCopy = () => regionCopy(useLocale())
