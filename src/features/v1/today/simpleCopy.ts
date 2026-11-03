import { useLocale } from '../../../state/hooks'
import type { Locale } from '../../../i18n/locales'

/** Coach Today, the first-run card and the top bar's one menu (simplify batch 5). */
export type SimpleCopy = {
  /** Composer hint once a shop exists: what the box is for. */
  askPlaceholder: string
  /** Opens every example sentence (the coach guide). */
  whatCanIAsk: string
  /** The top bar's one ⋯ button on Coach. */
  moreOptions: string
  /** Its sheet: a new chat and past chats. */
  startAgain: string
  /** First run, no shop yet: one heading and one card. */
  firstTitle: string
  firstBody: string
  typeName: string
  seeDemo: string
  justSay: string
  /** The tour's last card teaches the other path too. */
  tourTip: string
  /** Two short chips under Today; each sends a full sentence to the coach. */
  chipMake: string
  chipMenu: string
}

const copy: Record<Locale, SimpleCopy> = {
  en: {
    askPlaceholder: 'Ask or say anything…',
    whatCanIAsk: 'What can I ask?',
    moreOptions: 'More options',
    startAgain: 'Start again',
    firstTitle: 'Let’s put your shop online',
    firstBody: 'Take a photo of your shop board or menu.',
    typeName: 'Type your shop name',
    seeDemo: 'Or see a demo shop first',
    justSay: 'Or just say: “Sharma Tea, Indiranagar”',
    tourTip: 'Tip: you can also just ask the coach.',
    chipMake: 'How much to make?',
    chipMenu: 'Change my menu',
  },
  'zh-Hans': {
    askPlaceholder: '随便问或说点什么…',
    whatCanIAsk: '我可以问什么？',
    moreOptions: '更多选项',
    startAgain: '重新开始',
    firstTitle: '让你的店上线吧',
    firstBody: '拍一张店招或菜单的照片。',
    typeName: '输入店名',
    seeDemo: '或者先看看示范店',
    justSay: '或者直接说：“陈记咖啡，牛车水”',
    tourTip: '提示：你也可以直接问教练。',
    chipMake: '该做多少？',
    chipMenu: '改菜单',
  },
  ms: {
    askPlaceholder: 'Tanya atau sebut apa saja…',
    whatCanIAsk: 'Apa yang boleh saya tanya?',
    moreOptions: 'Lagi pilihan',
    startAgain: 'Mula semula',
    firstTitle: 'Mari bawa kedai anda ke dalam talian',
    firstBody: 'Ambil gambar papan kedai atau menu anda.',
    typeName: 'Taip nama kedai',
    seeDemo: 'Atau lihat kedai demo dahulu',
    justSay: 'Atau sebut saja: “Kedai Kopi Ali, Kampung Baru”',
    tourTip: 'Petua: anda juga boleh terus tanya jurulatih.',
    chipMake: 'Berapa nak buat?',
    chipMenu: 'Tukar menu',
  },
  ta: {
    askPlaceholder: 'எதையும் கேளுங்கள் அல்லது சொல்லுங்கள்…',
    whatCanIAsk: 'நான் என்ன கேட்கலாம்?',
    moreOptions: 'மேலும் விருப்பங்கள்',
    startAgain: 'மீண்டும் தொடங்கு',
    firstTitle: 'உங்கள் கடையை ஆன்லைனில் கொண்டு வருவோம்',
    firstBody: 'உங்கள் கடை பலகை அல்லது மெனுவை புகைப்படம் எடுங்கள்.',
    typeName: 'கடையின் பெயரை எழுதுங்கள்',
    seeDemo: 'அல்லது முதலில் டெமோ கடையைப் பாருங்கள்',
    justSay: 'அல்லது சொல்லுங்கள்: “முருகன் டீ கடை, மயிலாப்பூர்”',
    tourTip: 'குறிப்பு: கோச்சிடம் நேரடியாகவும் கேட்கலாம்.',
    chipMake: 'எவ்வளவு செய்வது?',
    chipMenu: 'மெனுவை மாற்று',
  },
  ja: {
    askPlaceholder: '何でも聞いたり話したりできます…',
    whatCanIAsk: '何を聞けますか？',
    moreOptions: 'その他',
    startAgain: 'はじめからやり直す',
    firstTitle: 'お店をオンラインに出しましょう',
    firstBody: '店の看板かメニューを撮影してください。',
    typeName: '店名を入力',
    seeDemo: 'または、まずデモ店を見る',
    justSay: '話すだけでも大丈夫：「さくら茶屋、浅草」',
    tourTip: 'ヒント：コーチに直接聞くこともできます。',
    chipMake: 'どれだけ作る？',
    chipMenu: 'メニューを変える',
  },
  ko: {
    askPlaceholder: '무엇이든 묻거나 말해 보세요…',
    whatCanIAsk: '무엇을 물어볼 수 있나요?',
    moreOptions: '더보기',
    startAgain: '다시 시작',
    firstTitle: '가게를 온라인에 올려 봐요',
    firstBody: '가게 간판이나 메뉴 사진을 찍어 주세요.',
    typeName: '가게 이름 입력',
    seeDemo: '또는 데모 가게 먼저 보기',
    justSay: '또는 이렇게 말해 보세요: “하나분식, 망원동”',
    tourTip: '팁: 코치에게 바로 물어봐도 돼요.',
    chipMake: '얼마나 만들까?',
    chipMenu: '메뉴 바꾸기',
  },
  id: {
    askPlaceholder: 'Tanya atau ucapkan apa saja…',
    whatCanIAsk: 'Apa yang bisa saya tanyakan?',
    moreOptions: 'Opsi lain',
    startAgain: 'Mulai lagi',
    firstTitle: 'Ayo bawa toko Anda online',
    firstBody: 'Foto papan toko atau menu Anda.',
    typeName: 'Ketik nama toko',
    seeDemo: 'Atau lihat toko demo dulu',
    justSay: 'Atau cukup ucapkan: “Warung Bu Sri, Menteng”',
    tourTip: 'Tips: Anda juga bisa langsung tanya pelatih.',
    chipMake: 'Berapa yang dibuat?',
    chipMenu: 'Ubah menu',
  },
  th: {
    askPlaceholder: 'ถามหรือพูดอะไรก็ได้…',
    whatCanIAsk: 'ถามอะไรได้บ้าง?',
    moreOptions: 'ตัวเลือกเพิ่มเติม',
    startAgain: 'เริ่มใหม่',
    firstTitle: 'มาพาร้านของคุณขึ้นออนไลน์กัน',
    firstBody: 'ถ่ายรูปป้ายร้านหรือเมนูของคุณ',
    typeName: 'พิมพ์ชื่อร้าน',
    seeDemo: 'หรือดูร้านตัวอย่างก่อน',
    justSay: 'หรือพูดว่า: “ร้านป้าแดง สุขุมวิท”',
    tourTip: 'เคล็ดลับ: ถามโค้ชได้เลยเช่นกัน',
    chipMake: 'ทำเท่าไหร่ดี?',
    chipMenu: 'แก้เมนู',
  },
  vi: {
    askPlaceholder: 'Hỏi hoặc nói bất cứ điều gì…',
    whatCanIAsk: 'Tôi có thể hỏi gì?',
    moreOptions: 'Tùy chọn khác',
    startAgain: 'Bắt đầu lại',
    firstTitle: 'Cùng đưa cửa hàng của bạn lên mạng',
    firstBody: 'Chụp ảnh bảng hiệu hoặc thực đơn của quán.',
    typeName: 'Nhập tên cửa hàng',
    seeDemo: 'Hoặc xem cửa hàng mẫu trước',
    justSay: 'Hoặc chỉ cần nói: “Quán Cô Lan, Quận 1”',
    tourTip: 'Mẹo: bạn cũng có thể hỏi thẳng trợ lý.',
    chipMake: 'Làm bao nhiêu?',
    chipMenu: 'Đổi thực đơn',
  },
  fil: {
    askPlaceholder: 'Magtanong o magsabi ng kahit ano…',
    whatCanIAsk: 'Ano ang puwede kong itanong?',
    moreOptions: 'Iba pang opsyon',
    startAgain: 'Magsimula ulit',
    firstTitle: 'Ilagay natin online ang tindahan mo',
    firstBody: 'Kunan ng litrato ang karatula o menu ng tindahan mo.',
    typeName: 'I-type ang pangalan ng tindahan',
    seeDemo: 'O tingnan muna ang demo na tindahan',
    justSay: 'O sabihin lang: “Aling Nena Store, Quiapo”',
    tourTip: 'Tip: puwede mo ring diretsong tanungin ang coach.',
    chipMake: 'Ilan ang gagawin?',
    chipMenu: 'Baguhin ang menu',
  },
  hi: {
    askPlaceholder: 'कुछ भी पूछें या बोलें…',
    whatCanIAsk: 'क्या-क्या पूछ सकते हैं?',
    moreOptions: 'और विकल्प',
    startAgain: 'फिर से शुरू करें',
    firstTitle: 'चलिए, आपकी दुकान ऑनलाइन लाएँ',
    firstBody: 'अपनी दुकान के बोर्ड या मेन्यू की फ़ोटो लें।',
    typeName: 'दुकान का नाम लिखें',
    seeDemo: 'या पहले डेमो दुकान देखें',
    justSay: 'या बस बोलिए: “शर्मा टी, इंदिरानगर”',
    tourTip: 'सुझाव: आप कोच से सीधे भी पूछ सकते हैं।',
    chipMake: 'कितना बनाना है?',
    chipMenu: 'मेन्यू बदलें',
  },
  bn: {
    askPlaceholder: 'যা খুশি জিজ্ঞেস করুন বা বলুন…',
    whatCanIAsk: 'কী কী জিজ্ঞেস করা যায়?',
    moreOptions: 'আরও বিকল্প',
    startAgain: 'আবার শুরু করুন',
    firstTitle: 'চলুন, আপনার দোকান অনলাইনে আনি',
    firstBody: 'দোকানের বোর্ড বা মেনুর ছবি তুলুন।',
    typeName: 'দোকানের নাম লিখুন',
    seeDemo: 'অথবা আগে ডেমো দোকান দেখুন',
    justSay: 'অথবা শুধু বলুন: “শর্মা টি, ইন্দিরানগর”',
    tourTip: 'পরামর্শ: আপনি কোচকে সরাসরিও জিজ্ঞেস করতে পারেন।',
    chipMake: 'কতটা বানাব?',
    chipMenu: 'মেনু বদলান',
  },
  te: {
    askPlaceholder: 'ఏదైనా అడగండి లేదా చెప్పండి…',
    whatCanIAsk: 'ఏమేమి అడగవచ్చు?',
    moreOptions: 'మరిన్ని ఎంపికలు',
    startAgain: 'మళ్లీ మొదలుపెట్టండి',
    firstTitle: 'మీ దుకాణాన్ని ఆన్‌లైన్‌లోకి తెద్దాం',
    firstBody: 'మీ దుకాణం బోర్డు లేదా మెనూ ఫోటో తీయండి.',
    typeName: 'దుకాణం పేరు రాయండి',
    seeDemo: 'లేదా ముందుగా డెమో దుకాణం చూడండి',
    justSay: 'లేదా ఇలా చెప్పండి: “శర్మ టీ, ఇందిరానగర్”',
    tourTip: 'చిట్కా: మీరు కోచ్‌ని నేరుగా కూడా అడగవచ్చు.',
    chipMake: 'ఎంత తయారు చేయాలి?',
    chipMenu: 'మెనూ మార్చండి',
  },
  mr: {
    askPlaceholder: 'काहीही विचारा किंवा बोला…',
    whatCanIAsk: 'काय काय विचारता येईल?',
    moreOptions: 'आणखी पर्याय',
    startAgain: 'पुन्हा सुरू करा',
    firstTitle: 'चला, तुमचे दुकान ऑनलाइन आणूया',
    firstBody: 'दुकानाच्या फलकाचा किंवा मेन्यूचा फोटो काढा.',
    typeName: 'दुकानाचे नाव लिहा',
    seeDemo: 'किंवा आधी डेमो दुकान पाहा',
    justSay: 'किंवा फक्त म्हणा: “शर्मा टी, इंदिरानगर”',
    tourTip: 'टीप: तुम्ही कोचला थेट विचारूही शकता.',
    chipMake: 'किती बनवायचे?',
    chipMenu: 'मेन्यू बदला',
  },
  kn: {
    askPlaceholder: 'ಏನನ್ನಾದರೂ ಕೇಳಿ ಅಥವಾ ಹೇಳಿ…',
    whatCanIAsk: 'ಏನೇನು ಕೇಳಬಹುದು?',
    moreOptions: 'ಇನ್ನಷ್ಟು ಆಯ್ಕೆಗಳು',
    startAgain: 'ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ',
    firstTitle: 'ನಿಮ್ಮ ಅಂಗಡಿಯನ್ನು ಆನ್‌ಲೈನ್‌ಗೆ ತರೋಣ',
    firstBody: 'ನಿಮ್ಮ ಅಂಗಡಿಯ ಬೋರ್ಡ್ ಅಥವಾ ಮೆನುವಿನ ಫೋಟೋ ತೆಗೆಯಿರಿ.',
    typeName: 'ಅಂಗಡಿಯ ಹೆಸರು ಬರೆಯಿರಿ',
    seeDemo: 'ಅಥವಾ ಮೊದಲು ಡೆಮೊ ಅಂಗಡಿ ನೋಡಿ',
    justSay: 'ಅಥವಾ ಹೀಗೆ ಹೇಳಿ: “ಶರ್ಮಾ ಟೀ, ಇಂದಿರಾನಗರ”',
    tourTip: 'ಸಲಹೆ: ನೀವು ಕೋಚ್‌ಗೆ ನೇರವಾಗಿಯೂ ಕೇಳಬಹುದು.',
    chipMake: 'ಎಷ್ಟು ಮಾಡಬೇಕು?',
    chipMenu: 'ಮೆನು ಬದಲಿಸಿ',
  },
}

export function simpleCopyFor(locale: Locale): SimpleCopy {
  return copy[locale]
}

export function useSimpleCopy(): SimpleCopy {
  return simpleCopyFor(useLocale())
}
