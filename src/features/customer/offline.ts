import { useSyncExternalStore } from 'react'
import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'

/**
 * A-18: the customer app keeps working offline. Recently opened shops and the last Passport are
 * kept on this phone (cleared on sign-out with the other customer keys), and a screen that
 * needs the network says so inside the app, then recovers by itself when the phone is back
 * online. A-17: a server error never blames the customer's connection.
 */
type OfflineStrings = {
  offlineTitle: string
  offlineBody: string
  offlineKept: string
  failedTitle: string
  failedBody: string
  retry: string
  serverBusy: string
}

const copy: Record<Locale, OfflineStrings> = {
  en: {
    offlineTitle: 'You’re offline',
    offlineBody: 'This screen needs a connection. It opens by itself when you’re back online.',
    offlineKept: 'You’re offline. Showing what you saw last.',
    failedTitle: 'This screen didn’t open',
    failedBody: 'Something went wrong on our side. Try again in a moment.',
    retry: 'Try again',
    serverBusy: 'The shop assistant is busy right now. Try again in a moment.',
  },
  'zh-Hans': {
    offlineTitle: '你已离线',
    offlineBody: '此页面需要网络连接。恢复联网后会自动打开。',
    offlineKept: '你已离线，正在显示上次看到的内容。',
    failedTitle: '此页面未能打开',
    failedBody: '我们这边出了点问题，请稍后再试。',
    retry: '重试',
    serverBusy: '店铺助手现在很忙，请稍后再试。',
  },
  ms: {
    offlineTitle: 'Anda di luar talian',
    offlineBody:
      'Skrin ini perlukan sambungan. Ia akan dibuka sendiri apabila anda kembali dalam talian.',
    offlineKept: 'Anda di luar talian. Memaparkan apa yang anda lihat kali terakhir.',
    failedTitle: 'Skrin ini tidak dapat dibuka',
    failedBody: 'Ada masalah di pihak kami. Cuba lagi sebentar nanti.',
    retry: 'Cuba lagi',
    serverBusy: 'Pembantu kedai sedang sibuk. Cuba lagi sebentar nanti.',
  },
  ta: {
    offlineTitle: 'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள்',
    offlineBody: 'இந்தத் திரைக்கு இணைப்பு தேவை. மீண்டும் இணைந்ததும் தானாகத் திறக்கும்.',
    offlineKept: 'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள். கடைசியாகப் பார்த்ததைக் காட்டுகிறோம்.',
    failedTitle: 'இந்தத் திரை திறக்கவில்லை',
    failedBody: 'எங்கள் பக்கம் சிக்கல். சிறிது நேரத்தில் மீண்டும் முயலுங்கள்.',
    retry: 'மீண்டும் முயலுங்கள்',
    serverBusy: 'கடை உதவியாளர் இப்போது பிஸியாக உள்ளது. சிறிது நேரத்தில் மீண்டும் முயலுங்கள்.',
  },
  ja: {
    offlineTitle: 'オフラインです',
    offlineBody: 'この画面には接続が必要です。オンラインに戻ると自動で開きます。',
    offlineKept: 'オフラインです。前回見た内容を表示しています。',
    failedTitle: 'この画面を開けませんでした',
    failedBody: 'こちら側で問題が起きました。少ししてからもう一度お試しください。',
    retry: '再試行',
    serverBusy: 'お店のアシスタントが混み合っています。少ししてからもう一度お試しください。',
  },
  ko: {
    offlineTitle: '오프라인 상태예요',
    offlineBody: '이 화면은 연결이 필요해요. 다시 온라인이 되면 자동으로 열려요.',
    offlineKept: '오프라인 상태예요. 마지막으로 본 내용을 보여 드려요.',
    failedTitle: '이 화면을 열지 못했어요',
    failedBody: '저희 쪽에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    retry: '다시 시도',
    serverBusy: '가게 도우미가 지금 바빠요. 잠시 후 다시 시도해 주세요.',
  },
  id: {
    offlineTitle: 'Anda sedang offline',
    offlineBody: 'Layar ini perlu koneksi. Layar akan terbuka sendiri saat Anda online lagi.',
    offlineKept: 'Anda sedang offline. Menampilkan yang terakhir Anda lihat.',
    failedTitle: 'Layar ini tidak terbuka',
    failedBody: 'Ada masalah di pihak kami. Coba lagi sebentar lagi.',
    retry: 'Coba lagi',
    serverBusy: 'Asisten toko sedang sibuk. Coba lagi sebentar lagi.',
  },
  th: {
    offlineTitle: 'คุณออฟไลน์อยู่',
    offlineBody: 'หน้านี้ต้องใช้การเชื่อมต่อ จะเปิดเองเมื่อกลับมาออนไลน์',
    offlineKept: 'คุณออฟไลน์อยู่ กำลังแสดงสิ่งที่คุณเห็นล่าสุด',
    failedTitle: 'เปิดหน้านี้ไม่ได้',
    failedBody: 'เกิดปัญหาที่ฝั่งเรา ลองอีกครั้งในอีกสักครู่',
    retry: 'ลองอีกครั้ง',
    serverBusy: 'ผู้ช่วยของร้านไม่ว่างตอนนี้ ลองอีกครั้งในอีกสักครู่',
  },
  vi: {
    offlineTitle: 'Bạn đang ngoại tuyến',
    offlineBody: 'Màn hình này cần kết nối. Màn hình sẽ tự mở khi bạn trực tuyến lại.',
    offlineKept: 'Bạn đang ngoại tuyến. Đang hiển thị nội dung bạn xem lần trước.',
    failedTitle: 'Không mở được màn hình này',
    failedBody: 'Có lỗi từ phía chúng tôi. Hãy thử lại sau giây lát.',
    retry: 'Thử lại',
    serverBusy: 'Trợ lý của cửa hàng đang bận. Hãy thử lại sau giây lát.',
  },
  fil: {
    offlineTitle: 'Offline ka',
    offlineBody:
      'Kailangan ng koneksyon ang screen na ito. Kusa itong bubukas pag online ka na ulit.',
    offlineKept: 'Offline ka. Ipinapakita ang huli mong nakita.',
    failedTitle: 'Hindi nabuksan ang screen na ito',
    failedBody: 'May problema sa aming panig. Subukan ulit maya-maya.',
    retry: 'Subukan muli',
    serverBusy: 'Abala ang assistant ng tindahan ngayon. Subukan ulit maya-maya.',
  },
  hi: {
    offlineTitle: 'आप ऑफ़लाइन हैं',
    offlineBody: 'इस स्क्रीन के लिए कनेक्शन चाहिए। ऑनलाइन होते ही यह अपने आप खुलेगी।',
    offlineKept: 'आप ऑफ़लाइन हैं। पिछली बार देखा गया दिखा रहे हैं।',
    failedTitle: 'यह स्क्रीन नहीं खुली',
    failedBody: 'हमारी तरफ़ कुछ गड़बड़ हुई। थोड़ी देर में फिर कोशिश करें।',
    retry: 'फिर कोशिश करें',
    serverBusy: 'दुकान का सहायक अभी व्यस्त है। थोड़ी देर में फिर कोशिश करें।',
  },
  bn: {
    offlineTitle: 'আপনি অফলাইনে আছেন',
    offlineBody: 'এই স্ক্রিনের জন্য সংযোগ দরকার। আবার অনলাইন হলে নিজে থেকেই খুলবে।',
    offlineKept: 'আপনি অফলাইনে আছেন। শেষবার যা দেখেছিলেন তা দেখানো হচ্ছে।',
    failedTitle: 'এই স্ক্রিনটি খোলেনি',
    failedBody: 'আমাদের দিকে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।',
    retry: 'আবার চেষ্টা করুন',
    serverBusy: 'দোকানের সহকারী এখন ব্যস্ত। একটু পরে আবার চেষ্টা করুন।',
  },
  te: {
    offlineTitle: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు',
    offlineBody: 'ఈ స్క్రీన్‌కు కనెక్షన్ అవసరం. మళ్లీ ఆన్‌లైన్‌కి వచ్చాక అదే తెరుచుకుంటుంది.',
    offlineKept: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు. చివరిగా చూసింది చూపిస్తున్నాం.',
    failedTitle: 'ఈ స్క్రీన్ తెరుచుకోలేదు',
    failedBody: 'మా వైపు సమస్య వచ్చింది. కాసేపట్లో మళ్లీ ప్రయత్నించండి.',
    retry: 'మళ్లీ ప్రయత్నించండి',
    serverBusy: 'షాప్ సహాయకుడు ఇప్పుడు బిజీగా ఉన్నాడు. కాసేపట్లో మళ్లీ ప్రయత్నించండి.',
  },
  mr: {
    offlineTitle: 'तुम्ही ऑफलाइन आहात',
    offlineBody: 'या स्क्रीनला जोडणी लागते. पुन्हा ऑनलाइन आल्यावर ती आपोआप उघडेल.',
    offlineKept: 'तुम्ही ऑफलाइन आहात. शेवटचे पाहिलेले दाखवत आहोत.',
    failedTitle: 'ही स्क्रीन उघडली नाही',
    failedBody: 'आमच्या बाजूने अडचण आली. थोड्या वेळाने पुन्हा प्रयत्न करा.',
    retry: 'पुन्हा प्रयत्न करा',
    serverBusy: 'दुकानाचा सहाय्यक आत्ता व्यस्त आहे. थोड्या वेळाने पुन्हा प्रयत्न करा.',
  },
  kn: {
    offlineTitle: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ',
    offlineBody: 'ಈ ಪರದೆಗೆ ಸಂಪರ್ಕ ಬೇಕು. ಮತ್ತೆ ಆನ್‌ಲೈನ್ ಆದಾಗ ತಾನಾಗಿಯೇ ತೆರೆಯುತ್ತದೆ.',
    offlineKept: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ. ಕೊನೆಯದಾಗಿ ನೋಡಿದ್ದನ್ನು ತೋರಿಸುತ್ತಿದ್ದೇವೆ.',
    failedTitle: 'ಈ ಪರದೆ ತೆರೆಯಲಿಲ್ಲ',
    failedBody: 'ನಮ್ಮ ಕಡೆ ಸಮಸ್ಯೆ ಆಗಿದೆ. ಸ್ವಲ್ಪ ಹೊತ್ತಿನ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    serverBusy: 'ಅಂಗಡಿಯ ಸಹಾಯಕ ಈಗ ಬ್ಯುಸಿ ಇದೆ. ಸ್ವಲ್ಪ ಹೊತ್ತಿನ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
}

export function offlineCopy(locale: Locale): OfflineStrings {
  return copy[locale]
}

export function useOfflineCopy(): OfflineStrings {
  return copy[useLocale()]
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** The phone's connection as the browser reports it (true while unknown). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/** Run `again` each time the phone comes back online. */
export function whenOnline(again: () => void): () => void {
  window.addEventListener('online', again)
  return () => window.removeEventListener('online', again)
}

const SHOPS = 'chalkboard.customer.recentShops.v1'
const PASSPORT = 'chalkboard.customer.passportView.v1'
const MAX_SHOPS = 8

type KeptShop = { key: string; data: unknown }

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Optional: a full or blocked storage only loses the offline copy. */
  }
}

function keptShops(): KeptShop[] {
  const value = readJson(SHOPS)
  return Array.isArray(value)
    ? value.filter(
        (item): item is KeptShop =>
          !!item && typeof item === 'object' && typeof (item as KeptShop).key === 'string',
      )
    : []
}

/** Keep a public shop page the customer opened, for opening it again offline. */
export function keepShop(id: string, locale: string, data: unknown) {
  const key = `${id}|${locale}`
  writeJson(
    SHOPS,
    [{ key, data }, ...keptShops().filter((item) => item.key !== key)].slice(0, MAX_SHOPS),
  )
}

export function keptShop(id: string, locale: string): unknown {
  return keptShops().find((item) => item.key === `${id}|${locale}`)?.data ?? null
}

/** Keep the last Passport this phone showed, for this area. It is not keyed by account: every
 * customer key is cleared on sign-out (clearSession), so it is always this phone's own person. */
export function keepPassport(key: string, view: unknown) {
  writeJson(PASSPORT, { key, view })
}

export function keptPassport(key: string): unknown {
  const value = readJson(PASSPORT) as { key?: unknown; view?: unknown } | null
  return value && value.key === key ? (value.view ?? null) : null
}
