import { useLocale } from '../../../state/hooks'
import type { Locale } from '../../../i18n/locales'

/** What a shop-less first run says, and the tour's last tip. Loaded with the first-run card and the tour, not with Today. */
export type FirstRunCopy = {
  /** First run, no shop yet: one heading and one card. */
  firstTitle: string
  firstBody: string
  typeName: string
  seeDemo: string
  justSay: string
  /** The tour's last card teaches the other path too. */
  tourTip: string
}

const copy: Record<Locale, FirstRunCopy> = {
  en: {
    firstTitle: 'Let’s put your shop online',
    firstBody: 'Take a photo of your shop board or menu.',
    typeName: 'Type your shop name',
    seeDemo: 'Or see a demo shop first',
    justSay: 'Or just say: “Sharma Tea, Indiranagar”',
    tourTip: 'Tip: you can also just ask the coach.',
  },
  'zh-Hans': {
    firstTitle: '让你的店上线吧',
    firstBody: '拍一张店招或菜单的照片。',
    typeName: '输入店名',
    seeDemo: '或者先看看示范店',
    justSay: '或者直接说：“陈记咖啡，牛车水”',
    tourTip: '提示：你也可以直接问教练。',
  },
  ms: {
    firstTitle: 'Mari bawa kedai anda ke dalam talian',
    firstBody: 'Ambil gambar papan kedai atau menu anda.',
    typeName: 'Taip nama kedai',
    seeDemo: 'Atau lihat kedai demo dahulu',
    justSay: 'Atau sebut saja: “Kedai Kopi Ali, Kampung Baru”',
    tourTip: 'Petua: anda juga boleh terus tanya jurulatih.',
  },
  ta: {
    firstTitle: 'உங்கள் கடையை ஆன்லைனில் கொண்டு வருவோம்',
    firstBody: 'உங்கள் கடை பலகை அல்லது மெனுவை புகைப்படம் எடுங்கள்.',
    typeName: 'கடையின் பெயரை எழுதுங்கள்',
    seeDemo: 'அல்லது முதலில் டெமோ கடையைப் பாருங்கள்',
    justSay: 'அல்லது சொல்லுங்கள்: “முருகன் டீ கடை, மயிலாப்பூர்”',
    tourTip: 'குறிப்பு: கோச்சிடம் நேரடியாகவும் கேட்கலாம்.',
  },
  ja: {
    firstTitle: 'お店をオンラインに出しましょう',
    firstBody: '店の看板かメニューを撮影してください。',
    typeName: '店名を入力',
    seeDemo: 'または、まずデモ店を見る',
    justSay: '話すだけでも大丈夫：「さくら茶屋、浅草」',
    tourTip: 'ヒント：コーチに直接聞くこともできます。',
  },
  ko: {
    firstTitle: '가게를 온라인에 올려 봐요',
    firstBody: '가게 간판이나 메뉴 사진을 찍어 주세요.',
    typeName: '가게 이름 입력',
    seeDemo: '또는 데모 가게 먼저 보기',
    justSay: '또는 이렇게 말해 보세요: “하나분식, 망원동”',
    tourTip: '팁: 코치에게 바로 물어봐도 돼요.',
  },
  id: {
    firstTitle: 'Ayo bawa toko Anda online',
    firstBody: 'Foto papan toko atau menu Anda.',
    typeName: 'Ketik nama toko',
    seeDemo: 'Atau lihat toko demo dulu',
    justSay: 'Atau cukup ucapkan: “Warung Bu Sri, Menteng”',
    tourTip: 'Tips: Anda juga bisa langsung tanya pelatih.',
  },
  th: {
    firstTitle: 'มาพาร้านของคุณขึ้นออนไลน์กัน',
    firstBody: 'ถ่ายรูปป้ายร้านหรือเมนูของคุณ',
    typeName: 'พิมพ์ชื่อร้าน',
    seeDemo: 'หรือดูร้านตัวอย่างก่อน',
    justSay: 'หรือพูดว่า: “ร้านป้าแดง สุขุมวิท”',
    tourTip: 'เคล็ดลับ: ถามโค้ชได้เลยเช่นกัน',
  },
  vi: {
    firstTitle: 'Cùng đưa cửa hàng của bạn lên mạng',
    firstBody: 'Chụp ảnh bảng hiệu hoặc thực đơn của quán.',
    typeName: 'Nhập tên cửa hàng',
    seeDemo: 'Hoặc xem cửa hàng mẫu trước',
    justSay: 'Hoặc chỉ cần nói: “Quán Cô Lan, Quận 1”',
    tourTip: 'Mẹo: bạn cũng có thể hỏi thẳng trợ lý.',
  },
  fil: {
    firstTitle: 'Ilagay natin online ang tindahan mo',
    firstBody: 'Kunan ng litrato ang karatula o menu ng tindahan mo.',
    typeName: 'I-type ang pangalan ng tindahan',
    seeDemo: 'O tingnan muna ang demo na tindahan',
    justSay: 'O sabihin lang: “Aling Nena Store, Quiapo”',
    tourTip: 'Tip: puwede mo ring diretsong tanungin ang coach.',
  },
  hi: {
    firstTitle: 'चलिए, आपकी दुकान ऑनलाइन लाएँ',
    firstBody: 'अपनी दुकान के बोर्ड या मेन्यू की फ़ोटो लें।',
    typeName: 'दुकान का नाम लिखें',
    seeDemo: 'या पहले डेमो दुकान देखें',
    justSay: 'या बस बोलिए: “शर्मा टी, इंदिरानगर”',
    tourTip: 'सुझाव: आप कोच से सीधे भी पूछ सकते हैं।',
  },
  bn: {
    firstTitle: 'চলুন, আপনার দোকান অনলাইনে আনি',
    firstBody: 'দোকানের বোর্ড বা মেনুর ছবি তুলুন।',
    typeName: 'দোকানের নাম লিখুন',
    seeDemo: 'অথবা আগে ডেমো দোকান দেখুন',
    justSay: 'অথবা শুধু বলুন: “শর্মা টি, ইন্দিরানগর”',
    tourTip: 'পরামর্শ: আপনি কোচকে সরাসরিও জিজ্ঞেস করতে পারেন।',
  },
  te: {
    firstTitle: 'మీ దుకాణాన్ని ఆన్‌లైన్‌లోకి తెద్దాం',
    firstBody: 'మీ దుకాణం బోర్డు లేదా మెనూ ఫోటో తీయండి.',
    typeName: 'దుకాణం పేరు రాయండి',
    seeDemo: 'లేదా ముందుగా డెమో దుకాణం చూడండి',
    justSay: 'లేదా ఇలా చెప్పండి: “శర్మ టీ, ఇందిరానగర్”',
    tourTip: 'చిట్కా: మీరు కోచ్‌ని నేరుగా కూడా అడగవచ్చు.',
  },
  mr: {
    firstTitle: 'चला, तुमचे दुकान ऑनलाइन आणूया',
    firstBody: 'दुकानाच्या फलकाचा किंवा मेन्यूचा फोटो काढा.',
    typeName: 'दुकानाचे नाव लिहा',
    seeDemo: 'किंवा आधी डेमो दुकान पाहा',
    justSay: 'किंवा फक्त म्हणा: “शर्मा टी, इंदिरानगर”',
    tourTip: 'टीप: तुम्ही कोचला थेट विचारूही शकता.',
  },
  kn: {
    firstTitle: 'ನಿಮ್ಮ ಅಂಗಡಿಯನ್ನು ಆನ್‌ಲೈನ್‌ಗೆ ತರೋಣ',
    firstBody: 'ನಿಮ್ಮ ಅಂಗಡಿಯ ಬೋರ್ಡ್ ಅಥವಾ ಮೆನುವಿನ ಫೋಟೋ ತೆಗೆಯಿರಿ.',
    typeName: 'ಅಂಗಡಿಯ ಹೆಸರು ಬರೆಯಿರಿ',
    seeDemo: 'ಅಥವಾ ಮೊದಲು ಡೆಮೊ ಅಂಗಡಿ ನೋಡಿ',
    justSay: 'ಅಥವಾ ಹೀಗೆ ಹೇಳಿ: “ಶರ್ಮಾ ಟೀ, ಇಂದಿರಾನಗರ”',
    tourTip: 'ಸಲಹೆ: ನೀವು ಕೋಚ್‌ಗೆ ನೇರವಾಗಿಯೂ ಕೇಳಬಹುದು.',
  },
}

export function firstRunCopyFor(locale: Locale): FirstRunCopy {
  return copy[locale]
}

export function useFirstRunCopy(): FirstRunCopy {
  return firstRunCopyFor(useLocale())
}
