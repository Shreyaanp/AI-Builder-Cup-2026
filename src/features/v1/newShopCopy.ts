import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

type FlowCopy = {
  back: string
  title: string
  steps: [string, string, string, string]
  prompts: [string, string, string]
  next: string
  open: string
  ready: string
  photos: string
  tour: string
  current: string
  near: (area: string) => string
}

const copy: Record<Locale, FlowCopy> = {
  en: {
    back: 'Back', title: 'Let’s open your shop',
    steps: ['Show us your shop', 'Tell us more', 'Where is it?', 'Review'],
    prompts: ['What do you sell? Show me a photo, or tell me.', 'What else should customers know? You can tell me about your menu, hours or payments.', 'Where can customers find you? Use your location, or tell me an address.'],
    next: 'Continue', open: 'Open my shop', ready: 'Your shop is ready',
    photos: 'Add photos', tour: 'Take the tour', current: 'Your current location', near: (area) => `Near ${area}`,
  },
  hi: {
    back: 'वापस', title: 'आइए आपकी दुकान खोलें', steps: ['अपनी दुकान दिखाएँ', 'और बताएँ', 'दुकान कहाँ है?', 'समीक्षा'],
    prompts: ['आप क्या बेचते हैं? फ़ोटो दिखाएँ या बताएँ।', 'ग्राहकों को और क्या जानना चाहिए? मेन्यू, समय या भुगतान के बारे में बताएँ।', 'ग्राहक आपको कहाँ ढूँढें? लोकेशन इस्तेमाल करें या पता बताएँ।'],
    next: 'आगे बढ़ें', open: 'मेरी दुकान खोलें', ready: 'आपकी दुकान तैयार है', photos: 'फ़ोटो जोड़ें', tour: 'सैर करें', current: 'आपकी वर्तमान जगह', near: (area) => `${area} के पास`,
  },
  bn: {
    back: 'ফিরুন', title: 'চলুন আপনার দোকান খুলি', steps: ['আপনার দোকান দেখান', 'আরও বলুন', 'দোকান কোথায়?', 'পর্যালোচনা'],
    prompts: ['আপনি কী বিক্রি করেন? ছবি দেখান বা বলুন।', 'গ্রাহকদের আর কী জানা দরকার? মেনু, সময় বা পেমেন্ট সম্পর্কে বলুন।', 'গ্রাহকরা আপনাকে কোথায় পাবেন? লোকেশন ব্যবহার করুন বা ঠিকানা বলুন।'],
    next: 'এগিয়ে যান', open: 'আমার দোকান খুলুন', ready: 'আপনার দোকান প্রস্তুত', photos: 'ছবি যোগ করুন', tour: 'ঘুরে দেখুন', current: 'আপনার বর্তমান অবস্থান', near: (area) => `${area}-এর কাছে`,
  },
  te: {
    back: 'వెనక్కి', title: 'మీ దుకాణాన్ని తెరుద్దాం', steps: ['మీ దుకాణాన్ని చూపండి', 'మరింత చెప్పండి', 'ఎక్కడ ఉంది?', 'సమీక్ష'],
    prompts: ['మీరు ఏమి అమ్ముతారు? ఫోటో చూపండి లేదా చెప్పండి.', 'కస్టమర్లకు ఇంకా ఏమి తెలియాలి? మెనూ, వేళలు లేదా చెల్లింపుల గురించి చెప్పండి.', 'కస్టమర్లు మిమ్మల్ని ఎక్కడ కనుగొనగలరు? లొకేషన్ వాడండి లేదా చిరునామా చెప్పండి.'],
    next: 'కొనసాగించండి', open: 'నా దుకాణాన్ని తెరవండి', ready: 'మీ దుకాణం సిద్ధంగా ఉంది', photos: 'ఫోటోలు జోడించండి', tour: 'టూర్ చూడండి', current: 'మీ ప్రస్తుత స్థానం', near: (area) => `${area} సమీపంలో`,
  },
  mr: {
    back: 'मागे', title: 'चला तुमचे दुकान उघडूया', steps: ['तुमचे दुकान दाखवा', 'आणखी सांगा', 'ते कुठे आहे?', 'आढावा'],
    prompts: ['तुम्ही काय विकता? फोटो दाखवा किंवा सांगा.', 'ग्राहकांना आणखी काय माहिती हवी? मेनू, वेळा किंवा पेमेंटबद्दल सांगा.', 'ग्राहक तुम्हाला कुठे शोधतील? स्थान वापरा किंवा पत्ता सांगा.'],
    next: 'पुढे चला', open: 'माझे दुकान उघडा', ready: 'तुमचे दुकान तयार आहे', photos: 'फोटो जोडा', tour: 'फेरफटका घ्या', current: 'तुमचे सध्याचे स्थान', near: (area) => `${area} जवळ`,
  },
  kn: {
    back: 'ಹಿಂದೆ', title: 'ನಿಮ್ಮ ಅಂಗಡಿಯನ್ನು ತೆರೆಯೋಣ', steps: ['ನಿಮ್ಮ ಅಂಗಡಿ ತೋರಿಸಿ', 'ಇನ್ನಷ್ಟು ಹೇಳಿ', 'ಅದು ಎಲ್ಲಿದೆ?', 'ಪರಿಶೀಲನೆ'],
    prompts: ['ನೀವು ಏನು ಮಾರುತ್ತೀರಿ? ಫೋಟೋ ತೋರಿಸಿ ಅಥವಾ ಹೇಳಿ.', 'ಗ್ರಾಹಕರಿಗೆ ಇನ್ನೇನು ತಿಳಿಯಬೇಕು? ಮೆನು, ಸಮಯ ಅಥವಾ ಪಾವತಿಗಳ ಬಗ್ಗೆ ಹೇಳಿ.', 'ಗ್ರಾಹಕರು ನಿಮ್ಮನ್ನು ಎಲ್ಲಿ ಹುಡುಕಬಹುದು? ಸ್ಥಳ ಬಳಸಿ ಅಥವಾ ವಿಳಾಸ ಹೇಳಿ.'],
    next: 'ಮುಂದುವರಿಸಿ', open: 'ನನ್ನ ಅಂಗಡಿ ತೆರೆಯಿರಿ', ready: 'ನಿಮ್ಮ ಅಂಗಡಿ ಸಿದ್ಧವಾಗಿದೆ', photos: 'ಫೋಟೋಗಳನ್ನು ಸೇರಿಸಿ', tour: 'ಪ್ರವಾಸ ಮಾಡಿ', current: 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸ್ಥಳ', near: (area) => `${area} ಬಳಿ`,
  },
  'zh-Hans': {
    back: '返回', title: '一起开启你的店铺', steps: ['展示你的店铺', '再多介绍一点', '店铺在哪里？', '确认预览'],
    prompts: ['你卖什么？给我看张照片，或告诉我。', '顾客还需要知道什么？可以介绍菜单、营业时间或付款方式。', '顾客在哪里能找到你？使用当前位置，或告诉我地址。'],
    next: '继续', open: '开启我的店铺', ready: '你的店铺已准备好', photos: '添加照片', tour: '查看导览', current: '你当前的位置', near: (area) => `${area}附近`,
  },
  ms: {
    back: 'Kembali', title: 'Mari buka kedai anda', steps: ['Tunjukkan kedai anda', 'Ceritakan lagi', 'Di mana?', 'Semak'],
    prompts: ['Apa yang anda jual? Tunjukkan gambar atau beritahu saya.', 'Apa lagi pelanggan perlu tahu? Ceritakan menu, waktu atau pembayaran.', 'Di mana pelanggan boleh menemui anda? Gunakan lokasi atau beritahu alamat.'],
    next: 'Teruskan', open: 'Buka kedai saya', ready: 'Kedai anda sudah sedia', photos: 'Tambah gambar', tour: 'Ikuti lawatan', current: 'Lokasi semasa anda', near: (area) => `Berhampiran ${area}`,
  },
  ta: {
    back: 'பின்செல்', title: 'உங்கள் கடையைத் திறப்போம்', steps: ['கடையைக் காட்டுங்கள்', 'மேலும் சொல்லுங்கள்', 'எங்கே உள்ளது?', 'சரிபார்ப்பு'],
    prompts: ['என்ன விற்கிறீர்கள்? படம் காட்டுங்கள் அல்லது சொல்லுங்கள்.', 'வாடிக்கையாளர்கள் வேறு என்ன அறிய வேண்டும்? பட்டியல், நேரம் அல்லது பணம் செலுத்துவது பற்றி சொல்லுங்கள்.', 'வாடிக்கையாளர்கள் உங்களை எங்கே காணலாம்? இருப்பிடத்தைப் பயன்படுத்துங்கள் அல்லது முகவரியைச் சொல்லுங்கள்.'],
    next: 'தொடரவும்', open: 'என் கடையைத் திற', ready: 'உங்கள் கடை தயார்', photos: 'படங்களைச் சேர்க்க', tour: 'சுற்றிப்பார்க்க', current: 'உங்கள் தற்போதைய இருப்பிடம்', near: (area) => `${area} அருகில்`,
  },
  ja: {
    back: '戻る', title: 'あなたのお店を始めましょう', steps: ['お店を見せてください', 'もっと教えてください', '場所はどこですか？', '確認'],
    prompts: ['何を販売していますか？写真を見せるか、教えてください。', 'お客様に伝えたいことはありますか？メニュー、営業時間、支払い方法などを教えてください。', 'お店はどこにありますか？現在地を使うか、住所を教えてください。'],
    next: '次へ', open: 'お店を開く', ready: 'お店の準備ができました', photos: '写真を追加', tour: 'ツアーを見る', current: '現在地', near: (area) => `${area}の近く`,
  },
  ko: {
    back: '뒤로', title: '가게를 열어 볼까요', steps: ['가게를 보여 주세요', '더 알려 주세요', '어디에 있나요?', '검토'],
    prompts: ['무엇을 판매하시나요? 사진을 보여 주거나 알려 주세요.', '손님이 더 알아야 할 것이 있나요? 메뉴, 영업시간, 결제 방법을 알려 주세요.', '손님이 어디로 찾아가면 되나요? 현재 위치를 사용하거나 주소를 알려 주세요.'],
    next: '계속', open: '내 가게 열기', ready: '가게가 준비됐어요', photos: '사진 추가', tour: '둘러보기', current: '현재 위치', near: (area) => `${area} 근처`,
  },
  id: {
    back: 'Kembali', title: 'Mari buka toko Anda', steps: ['Tunjukkan toko Anda', 'Ceritakan lebih lanjut', 'Di mana lokasinya?', 'Tinjau'],
    prompts: ['Apa yang Anda jual? Tunjukkan foto atau ceritakan.', 'Apa lagi yang perlu diketahui pelanggan? Ceritakan menu, jam buka, atau pembayaran.', 'Di mana pelanggan bisa menemukan Anda? Gunakan lokasi atau berikan alamat.'],
    next: 'Lanjutkan', open: 'Buka toko saya', ready: 'Toko Anda sudah siap', photos: 'Tambah foto', tour: 'Ikuti tur', current: 'Lokasi Anda saat ini', near: (area) => `Dekat ${area}`,
  },
  th: {
    back: 'ย้อนกลับ', title: 'มาเปิดร้านของคุณกัน', steps: ['ให้เราดูร้านของคุณ', 'เล่าเพิ่มเติม', 'ร้านอยู่ที่ไหน?', 'ตรวจสอบ'],
    prompts: ['คุณขายอะไร? ส่งรูปหรือเล่าให้ฟังได้เลย', 'ลูกค้าควรรู้อะไรอีกบ้าง? บอกเมนู เวลาเปิด หรือวิธีชำระเงิน', 'ลูกค้าจะหาร้านคุณได้ที่ไหน? ใช้ตำแหน่งปัจจุบันหรือบอกที่อยู่'],
    next: 'ดำเนินการต่อ', open: 'เปิดร้านของฉัน', ready: 'ร้านของคุณพร้อมแล้ว', photos: 'เพิ่มรูปภาพ', tour: 'ชมการแนะนำ', current: 'ตำแหน่งปัจจุบันของคุณ', near: (area) => `ใกล้ ${area}`,
  },
  vi: {
    back: 'Quay lại', title: 'Cùng mở cửa hàng của bạn', steps: ['Cho xem cửa hàng', 'Kể thêm cho tôi', 'Cửa hàng ở đâu?', 'Xem lại'],
    prompts: ['Bạn bán gì? Cho tôi xem ảnh hoặc kể cho tôi.', 'Khách hàng cần biết gì nữa? Hãy kể về thực đơn, giờ mở cửa hoặc thanh toán.', 'Khách có thể tìm bạn ở đâu? Dùng vị trí hoặc cho tôi địa chỉ.'],
    next: 'Tiếp tục', open: 'Mở cửa hàng của tôi', ready: 'Cửa hàng của bạn đã sẵn sàng', photos: 'Thêm ảnh', tour: 'Xem hướng dẫn', current: 'Vị trí hiện tại của bạn', near: (area) => `Gần ${area}`,
  },
  fil: {
    back: 'Bumalik', title: 'Buksan natin ang iyong tindahan', steps: ['Ipakita ang tindahan', 'Magkuwento pa', 'Nasaan ito?', 'Suriin'],
    prompts: ['Ano ang ibinebenta mo? Magpakita ng larawan o sabihin sa akin.', 'Ano pa ang dapat malaman ng mga customer? Ikuwento ang menu, oras o pagbabayad.', 'Saan ka mahahanap ng mga customer? Gamitin ang lokasyon o sabihin ang address.'],
    next: 'Magpatuloy', open: 'Buksan ang tindahan ko', ready: 'Handa na ang tindahan mo', photos: 'Magdagdag ng mga larawan', tour: 'Sumali sa tour', current: 'Kasalukuyan mong lokasyon', near: (area) => `Malapit sa ${area}`,
  },
}

export function useNewShopCopy() {
  return copy[useLocale()]
}
