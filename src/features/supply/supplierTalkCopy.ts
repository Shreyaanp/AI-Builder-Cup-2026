import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

/** The demo supplier's side of the conversation (OB-248). Written here, so no AI is involved. */
const en = {
  heading: (name: string) => `Chat with ${name}`,
  waiting: (name: string) => `Waiting for ${name} to reply…`,
  ask: (list: string, day: string) =>
    day ? `Please send ${list} by ${day}.` : `Please send ${list}.`,
  yes: (list: string, day: string) =>
    day ? `Yes, confirmed: ${list}. It reaches you ${day}.` : `Yes, confirmed: ${list}.`,
  short: (now: string, item: string, later: string, day: string) =>
    `I have only ${now} ${item} today. The other ${later} comes ${day}. Is that OK?`,
  dearer: (item: string, now: string, was: string, unit: string) =>
    `${item} has gone up: ${now} a ${unit} now, it was ${was}. Is that OK?`,
  okay: 'OK, go ahead.',
  onWay: (day: string) =>
    day ? `Your order is on the way. It reaches you ${day}.` : 'Your order is on the way.',
  gotIt: 'The goods came, thank you.',
  bill: (total: string) => `Here is the bill: ${total}. Thank you!`,
}

type SupplierTalkCopy = typeof en

const copies: Partial<Record<Locale, SupplierTalkCopy>> = {
  hi: {
    heading: (name) => `${name} से बात`,
    waiting: (name) => `${name} के जवाब का इंतज़ार…`,
    ask: (list, day) => (day ? `कृपया ${list} ${day} तक भेज दीजिए।` : `कृपया ${list} भेज दीजिए।`),
    yes: (list, day) =>
      day ? `जी, पक्का है: ${list}। ${day} तक पहुँच जाएगा।` : `जी, पक्का है: ${list}।`,
    short: (now, item, later, day) =>
      `आज मेरे पास सिर्फ़ ${now} ${item} है। बाकी ${later} ${day} को आएगा। ठीक है?`,
    dearer: (item, now, was, unit) =>
      `${item} का दाम बढ़ गया है: अब ${now} प्रति ${unit}, पहले ${was} था। ठीक है?`,
    okay: 'ठीक है, भेज दीजिए।',
    onWay: (day) =>
      day ? `आपका ऑर्डर निकल चुका है। ${day} तक पहुँचेगा।` : 'आपका ऑर्डर निकल चुका है।',
    gotIt: 'सामान मिल गया, धन्यवाद।',
    bill: (total) => `यह रहा बिल: ${total}। धन्यवाद!`,
  },
  bn: {
    heading: (name) => `${name}-এর সঙ্গে কথা`,
    waiting: (name) => `${name}-এর উত্তরের অপেক্ষায়…`,
    ask: (list, day) => (day ? `${day}-এর মধ্যে ${list} পাঠান।` : `${list} পাঠান।`),
    yes: (list, day) => (day ? `হ্যাঁ, পাকা: ${list}। ${day} পৌঁছাবে।` : `হ্যাঁ, পাকা: ${list}।`),
    short: (now, item, later, day) =>
      `আজ শুধু ${now} ${item} আছে। বাকি ${later} ${day} আসবে। ঠিক আছে?`,
    dearer: (item, now, was, unit) =>
      `${item}-এর দাম বেড়েছে: এখন প্রতি ${unit} ${now}, আগে ছিল ${was}। ঠিক আছে?`,
    okay: 'ঠিক আছে, পাঠান।',
    onWay: (day) => (day ? `আপনার অর্ডার পথে। ${day} পৌঁছাবে।` : 'আপনার অর্ডার পথে।'),
    gotIt: 'মাল পেয়েছি, ধন্যবাদ।',
    bill: (total) => `এই নিন বিল: ${total}। ধন্যবাদ!`,
  },
  te: {
    heading: (name) => `${name}తో మాట`,
    waiting: (name) => `${name} జవాబు కోసం ఎదురుచూస్తున్నాం…`,
    ask: (list, day) => (day ? `దయచేసి ${day} లోపు ${list} పంపండి.` : `దయచేసి ${list} పంపండి.`),
    yes: (list, day) => (day ? `సరే, ఖాయం: ${list}. ${day} చేరుతుంది.` : `సరే, ఖాయం: ${list}.`),
    short: (now, item, later, day) =>
      `ఈరోజు ${now} ${item} మాత్రమే ఉంది. మిగతా ${later} ${day} వస్తుంది. సరేనా?`,
    dearer: (item, now, was, unit) =>
      `${item} ధర పెరిగింది: ఇప్పుడు ఒక ${unit} ${now}, ముందు ${was}. సరేనా?`,
    okay: 'సరే, పంపండి.',
    onWay: (day) => (day ? `మీ ఆర్డర్ దారిలో ఉంది. ${day} చేరుతుంది.` : 'మీ ఆర్డర్ దారిలో ఉంది.'),
    gotIt: 'సరుకు అందింది, ధన్యవాదాలు.',
    bill: (total) => `ఇదిగో బిల్లు: ${total}. ధన్యవాదాలు!`,
  },
  mr: {
    heading: (name) => `${name} शी बोलणे`,
    waiting: (name) => `${name} च्या उत्तराची वाट पाहत आहोत…`,
    ask: (list, day) => (day ? `कृपया ${day} पर्यंत ${list} पाठवा.` : `कृपया ${list} पाठवा.`),
    yes: (list, day) =>
      day ? `हो, नक्की: ${list}. ${day} पर्यंत पोहोचेल.` : `हो, नक्की: ${list}.`,
    short: (now, item, later, day) =>
      `आज फक्त ${now} ${item} आहे. बाकी ${later} ${day} ला येईल. चालेल का?`,
    dearer: (item, now, was, unit) =>
      `${item} चा भाव वाढला आहे: आता प्रति ${unit} ${now}, आधी ${was} होता. चालेल का?`,
    okay: 'ठीक आहे, पाठवा.',
    onWay: (day) =>
      day ? `तुमची ऑर्डर निघाली आहे. ${day} पर्यंत पोहोचेल.` : 'तुमची ऑर्डर निघाली आहे.',
    gotIt: 'माल मिळाला, धन्यवाद.',
    bill: (total) => `हे घ्या बिल: ${total}. धन्यवाद!`,
  },
  kn: {
    heading: (name) => `${name} ಜೊತೆ ಮಾತು`,
    waiting: (name) => `${name} ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದ್ದೇವೆ…`,
    ask: (list, day) =>
      day ? `ದಯವಿಟ್ಟು ${day} ಒಳಗೆ ${list} ಕಳುಹಿಸಿ.` : `ದಯವಿಟ್ಟು ${list} ಕಳುಹಿಸಿ.`,
    yes: (list, day) => (day ? `ಹೌದು, ಖಚಿತ: ${list}. ${day} ತಲುಪುತ್ತದೆ.` : `ಹೌದು, ಖಚಿತ: ${list}.`),
    short: (now, item, later, day) =>
      `ಇಂದು ${now} ${item} ಮಾತ್ರ ಇದೆ. ಉಳಿದ ${later} ${day} ಬರುತ್ತದೆ. ಸರಿಯೇ?`,
    dearer: (item, now, was, unit) =>
      `${item} ಬೆಲೆ ಏರಿದೆ: ಈಗ ಒಂದು ${unit} ${now}, ಮೊದಲು ${was} ಇತ್ತು. ಸರಿಯೇ?`,
    okay: 'ಸರಿ, ಕಳುಹಿಸಿ.',
    onWay: (day) =>
      day ? `ನಿಮ್ಮ ಆರ್ಡರ್ ದಾರಿಯಲ್ಲಿದೆ. ${day} ತಲುಪುತ್ತದೆ.` : 'ನಿಮ್ಮ ಆರ್ಡರ್ ದಾರಿಯಲ್ಲಿದೆ.',
    gotIt: 'ಸರಕು ಬಂತು, ಧನ್ಯವಾದಗಳು.',
    bill: (total) => `ಇಗೋ ಬಿಲ್: ${total}. ಧನ್ಯವಾದಗಳು!`,
  },
  ta: {
    heading: (name) => `${name} உடன் உரையாடல்`,
    waiting: (name) => `${name} பதிலுக்காகக் காத்திருக்கிறோம்…`,
    ask: (list, day) =>
      day ? `தயவுசெய்து ${day} க்குள் ${list} அனுப்புங்கள்.` : `தயவுசெய்து ${list} அனுப்புங்கள்.`,
    yes: (list, day) =>
      day ? `ஆம், உறுதி: ${list}. ${day} வந்து சேரும்.` : `ஆம், உறுதி: ${list}.`,
    short: (now, item, later, day) =>
      `இன்று ${now} ${item} மட்டுமே உள்ளது. மீதி ${later} ${day} வரும். சரியா?`,
    dearer: (item, now, was, unit) =>
      `${item} விலை கூடியுள்ளது: இப்போது ஒரு ${unit} ${now}, முன்பு ${was}. சரியா?`,
    okay: 'சரி, அனுப்புங்கள்.',
    onWay: (day) =>
      day
        ? `உங்கள் ஆர்டர் வந்துகொண்டிருக்கிறது. ${day} சேரும்.`
        : 'உங்கள் ஆர்டர் வந்துகொண்டிருக்கிறது.',
    gotIt: 'பொருள் வந்தது, நன்றி.',
    bill: (total) => `இதோ பில்: ${total}. நன்றி!`,
  },
  ms: {
    heading: (name) => `Berbual dengan ${name}`,
    waiting: (name) => `Menunggu jawapan ${name}…`,
    ask: (list, day) => (day ? `Tolong hantar ${list} sebelum ${day}.` : `Tolong hantar ${list}.`),
    yes: (list, day) => (day ? `Ya, disahkan: ${list}. Sampai ${day}.` : `Ya, disahkan: ${list}.`),
    short: (now, item, later, day) =>
      `Hari ini ada ${now} ${item} sahaja. Baki ${later} sampai ${day}. Boleh?`,
    dearer: (item, now, was, unit) =>
      `Harga ${item} naik: kini ${now} setiap ${unit}, dahulu ${was}. Boleh?`,
    okay: 'Baik, teruskan.',
    onWay: (day) =>
      day ? `Pesanan anda dalam perjalanan. Sampai ${day}.` : 'Pesanan anda dalam perjalanan.',
    gotIt: 'Barang sudah sampai, terima kasih.',
    bill: (total) => `Ini bilnya: ${total}. Terima kasih!`,
  },
  id: {
    heading: (name) => `Obrolan dengan ${name}`,
    waiting: (name) => `Menunggu balasan ${name}…`,
    ask: (list, day) => (day ? `Tolong kirim ${list} sebelum ${day}.` : `Tolong kirim ${list}.`),
    yes: (list, day) =>
      day ? `Ya, dikonfirmasi: ${list}. Sampai ${day}.` : `Ya, dikonfirmasi: ${list}.`,
    short: (now, item, later, day) =>
      `Hari ini hanya ada ${now} ${item}. Sisanya ${later} datang ${day}. Boleh?`,
    dearer: (item, now, was, unit) =>
      `Harga ${item} naik: sekarang ${now} per ${unit}, sebelumnya ${was}. Boleh?`,
    okay: 'Baik, lanjutkan.',
    onWay: (day) =>
      day ? `Pesanan Anda sedang dikirim. Sampai ${day}.` : 'Pesanan Anda sedang dikirim.',
    gotIt: 'Barang sudah sampai, terima kasih.',
    bill: (total) => `Ini tagihannya: ${total}. Terima kasih!`,
  },
  th: {
    heading: (name) => `คุยกับ ${name}`,
    waiting: (name) => `กำลังรอ ${name} ตอบ…`,
    ask: (list, day) => (day ? `รบกวนส่ง ${list} ภายใน ${day}` : `รบกวนส่ง ${list}`),
    yes: (list, day) => (day ? `ได้เลย ยืนยัน: ${list} ถึง ${day}` : `ได้เลย ยืนยัน: ${list}`),
    short: (now, item, later, day) =>
      `วันนี้มี ${item} แค่ ${now} ส่วนที่เหลือ ${later} มาถึง ${day} โอเคไหม`,
    dearer: (item, now, was, unit) =>
      `${item} ราคาขึ้น: ตอนนี้ ${now} ต่อ${unit} จากเดิม ${was} โอเคไหม`,
    okay: 'โอเค ส่งได้เลย',
    onWay: (day) => (day ? `ออเดอร์ของคุณกำลังไป ถึง ${day}` : 'ออเดอร์ของคุณกำลังไป'),
    gotIt: 'ได้รับของแล้ว ขอบคุณ',
    bill: (total) => `นี่คือบิล: ${total} ขอบคุณ`,
  },
  vi: {
    heading: (name) => `Trò chuyện với ${name}`,
    waiting: (name) => `Đang chờ ${name} trả lời…`,
    ask: (list, day) => (day ? `Vui lòng gửi ${list} trước ${day}.` : `Vui lòng gửi ${list}.`),
    yes: (list, day) =>
      day ? `Vâng, xác nhận: ${list}. Đến nơi ${day}.` : `Vâng, xác nhận: ${list}.`,
    short: (now, item, later, day) =>
      `Hôm nay chỉ có ${now} ${item}. Còn ${later} sẽ đến ${day}. Được không ạ?`,
    dearer: (item, now, was, unit) =>
      `${item} đã tăng giá: giờ ${now} một ${unit}, trước là ${was}. Được không ạ?`,
    okay: 'Được, cứ gửi đi.',
    onWay: (day) =>
      day ? `Đơn của bạn đang trên đường. Đến nơi ${day}.` : 'Đơn của bạn đang trên đường.',
    gotIt: 'Đã nhận hàng, cảm ơn.',
    bill: (total) => `Đây là hóa đơn: ${total}. Cảm ơn!`,
  },
  fil: {
    heading: (name) => `Usapan kay ${name}`,
    waiting: (name) => `Hinihintay ang sagot ni ${name}…`,
    ask: (list, day) =>
      day ? `Pakipadala ang ${list} bago ang ${day}.` : `Pakipadala ang ${list}.`,
    yes: (list, day) =>
      day ? `Opo, kumpirmado: ${list}. Darating sa ${day}.` : `Opo, kumpirmado: ${list}.`,
    short: (now, item, later, day) =>
      `${now} ${item} lang ang meron ngayon. Ang natitirang ${later} ay darating sa ${day}. Ayos lang ba?`,
    dearer: (item, now, was, unit) =>
      `Tumaas ang ${item}: ${now} na bawat ${unit}, dati ay ${was}. Ayos lang ba?`,
    okay: 'Sige, ituloy na.',
    onWay: (day) =>
      day ? `Paparating na ang order mo. Darating sa ${day}.` : 'Paparating na ang order mo.',
    gotIt: 'Dumating na ang paninda, salamat.',
    bill: (total) => `Narito ang bill: ${total}. Salamat!`,
  },
  ja: {
    heading: (name) => `${name}とのやり取り`,
    waiting: (name) => `${name}の返信を待っています…`,
    ask: (list, day) => (day ? `${list}を${day}までにお願いします。` : `${list}をお願いします。`),
    yes: (list, day) =>
      day ? `承知しました：${list}。${day}に届きます。` : `承知しました：${list}。`,
    short: (now, item, later, day) =>
      `今日は${item}が${now}しかありません。残り${later}は${day}に届きます。よろしいですか？`,
    dearer: (item, now, was, unit) =>
      `${item}が値上がりしました：今は1${unit}${now}、以前は${was}です。よろしいですか？`,
    okay: 'はい、お願いします。',
    onWay: (day) => (day ? `ご注文は配送中です。${day}に届きます。` : 'ご注文は配送中です。'),
    gotIt: '商品が届きました。ありがとうございます。',
    bill: (total) => `請求書です：${total}。ありがとうございます！`,
  },
  ko: {
    heading: (name) => `${name}와(과) 대화`,
    waiting: (name) => `${name}의 답장을 기다리는 중…`,
    ask: (list, day) => (day ? `${day}까지 ${list} 보내 주세요.` : `${list} 보내 주세요.`),
    yes: (list, day) =>
      day ? `네, 확인했습니다: ${list}. ${day}에 도착합니다.` : `네, 확인했습니다: ${list}.`,
    short: (now, item, later, day) =>
      `오늘은 ${item} ${now}만 있습니다. 나머지 ${later}은(는) ${day}에 옵니다. 괜찮으신가요?`,
    dearer: (item, now, was, unit) =>
      `${item} 가격이 올랐습니다: 지금 ${unit}당 ${now}, 이전 ${was}. 괜찮으신가요?`,
    okay: '네, 진행해 주세요.',
    onWay: (day) => (day ? `주문이 배송 중입니다. ${day}에 도착합니다.` : '주문이 배송 중입니다.'),
    gotIt: '물건 잘 받았습니다. 감사합니다.',
    bill: (total) => `청구서입니다: ${total}. 감사합니다!`,
  },
  'zh-Hans': {
    heading: (name) => `与${name}的对话`,
    waiting: (name) => `正在等待${name}回复…`,
    ask: (list, day) => (day ? `请在${day}前送${list}。` : `请送${list}。`),
    yes: (list, day) => (day ? `好的，已确认：${list}。${day}送到。` : `好的，已确认：${list}。`),
    short: (now, item, later, day) => `今天${item}只有${now}。其余${later}将于${day}送到。可以吗？`,
    dearer: (item, now, was, unit) => `${item}涨价了：现在每${unit}${now}，之前是${was}。可以吗？`,
    okay: '好的，请发货。',
    onWay: (day) => (day ? `您的订单正在配送中，${day}送到。` : '您的订单正在配送中。'),
    gotIt: '货已收到，谢谢。',
    bill: (total) => `这是账单：${total}。谢谢！`,
  },
}

export function useSupplierTalkCopy(): SupplierTalkCopy {
  return copies[useLocale()] ?? en
}
