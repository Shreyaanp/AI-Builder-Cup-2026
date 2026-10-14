import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

const en = {
  weeklyHours: 'Weekly hours',
  setWeeklyHours: 'Set hours by weekday',
  differentHours: 'Different hours on some days',
  closed: 'Closed',
  opens: 'Opens',
  closes: 'Closes',
  overnight: 'Closing before opening means the next day.',
  category: 'Category',
  uncategorised: 'Uncategorised',
  categories: {
    drinks: 'Drinks',
    food: 'Food',
    desserts: 'Desserts',
    services: 'Services',
    other: 'Other',
  },
}

type Copy = typeof en
const translations: Record<Locale, Copy> = {
  en,
  'zh-Hans': {
    differentHours: '部分日期的营业时间不同',
    weeklyHours: '每周营业时间',
    setWeeklyHours: '按星期设置时间',
    closed: '休息',
    opens: '开门',
    closes: '关门',
    overnight: '关门时间早于开门时间表示次日关门。',
    category: '分类',
    uncategorised: '未分类',
    categories: { drinks: '饮品', food: '食品', desserts: '甜点', services: '服务', other: '其他' },
  },
  ms: {
    differentHours: 'Waktu berbeza pada sesetengah hari',
    weeklyHours: 'Waktu mingguan',
    setWeeklyHours: 'Tetapkan waktu mengikut hari',
    closed: 'Tutup',
    opens: 'Buka',
    closes: 'Tutup',
    overnight: 'Waktu tutup sebelum buka bermaksud hari berikutnya.',
    category: 'Kategori',
    uncategorised: 'Tanpa kategori',
    categories: {
      drinks: 'Minuman',
      food: 'Makanan',
      desserts: 'Pencuci mulut',
      services: 'Perkhidmatan',
      other: 'Lain-lain',
    },
  },
  ta: {
    differentHours: 'சில நாட்களில் வேறு நேரங்கள்',
    weeklyHours: 'வார நேரங்கள்',
    setWeeklyHours: 'வார நாளின்படி நேரம் அமைக்கவும்',
    closed: 'மூடப்பட்டது',
    opens: 'திறப்பு',
    closes: 'மூடல்',
    overnight: 'திறப்புக்கு முன் மூடல் நேரம் இருந்தால் அது அடுத்த நாள்.',
    category: 'வகை',
    uncategorised: 'வகைப்படுத்தப்படாதவை',
    categories: {
      drinks: 'பானங்கள்',
      food: 'உணவு',
      desserts: 'இனிப்புகள்',
      services: 'சேவைகள்',
      other: 'மற்றவை',
    },
  },
  ja: {
    differentHours: '一部の曜日で営業時間が異なる',
    weeklyHours: '曜日別営業時間',
    setWeeklyHours: '曜日ごとに時間を設定',
    closed: '休業',
    opens: '開店',
    closes: '閉店',
    overnight: '閉店時刻が開店時刻より早い場合は翌日の閉店です。',
    category: 'カテゴリ',
    uncategorised: '未分類',
    categories: {
      drinks: '飲み物',
      food: '食べ物',
      desserts: 'デザート',
      services: 'サービス',
      other: 'その他',
    },
  },
  ko: {
    differentHours: '일부 요일은 다른 영업시간',
    weeklyHours: '요일별 영업시간',
    setWeeklyHours: '요일별 시간 설정',
    closed: '휴무',
    opens: '개점',
    closes: '폐점',
    overnight: '폐점 시간이 개점 시간보다 이르면 다음 날에 닫아요.',
    category: '카테고리',
    uncategorised: '미분류',
    categories: {
      drinks: '음료',
      food: '음식',
      desserts: '디저트',
      services: '서비스',
      other: '기타',
    },
  },
  id: {
    differentHours: 'Jam berbeda pada beberapa hari',
    weeklyHours: 'Jam mingguan',
    setWeeklyHours: 'Atur jam per hari',
    closed: 'Tutup',
    opens: 'Buka',
    closes: 'Tutup',
    overnight: 'Jam tutup sebelum buka berarti hari berikutnya.',
    category: 'Kategori',
    uncategorised: 'Tanpa kategori',
    categories: {
      drinks: 'Minuman',
      food: 'Makanan',
      desserts: 'Pencuci mulut',
      services: 'Layanan',
      other: 'Lainnya',
    },
  },
  th: {
    differentHours: 'บางวันมีเวลาเปิดปิดต่างกัน',
    weeklyHours: 'เวลาประจำสัปดาห์',
    setWeeklyHours: 'ตั้งเวลาตามวัน',
    closed: 'ปิด',
    opens: 'เปิด',
    closes: 'ปิด',
    overnight: 'เวลาปิดก่อนเวลาเปิดหมายถึงปิดในวันถัดไป',
    category: 'หมวดหมู่',
    uncategorised: 'ยังไม่จัดหมวดหมู่',
    categories: {
      drinks: 'เครื่องดื่ม',
      food: 'อาหาร',
      desserts: 'ของหวาน',
      services: 'บริการ',
      other: 'อื่น ๆ',
    },
  },
  vi: {
    differentHours: 'Giờ khác nhau vào một số ngày',
    weeklyHours: 'Giờ theo tuần',
    setWeeklyHours: 'Đặt giờ theo ngày',
    closed: 'Đóng cửa',
    opens: 'Mở cửa',
    closes: 'Đóng cửa',
    overnight: 'Giờ đóng trước giờ mở nghĩa là đóng vào ngày hôm sau.',
    category: 'Danh mục',
    uncategorised: 'Chưa phân loại',
    categories: {
      drinks: 'Đồ uống',
      food: 'Đồ ăn',
      desserts: 'Món tráng miệng',
      services: 'Dịch vụ',
      other: 'Khác',
    },
  },
  fil: {
    differentHours: 'Ibang oras sa ilang araw',
    weeklyHours: 'Oras bawat linggo',
    setWeeklyHours: 'Itakda ang oras bawat araw',
    closed: 'Sarado',
    opens: 'Bukas',
    closes: 'Sara',
    overnight: 'Kung mas maaga ang pagsara kaysa pagbukas, sa susunod na araw ito.',
    category: 'Kategorya',
    uncategorised: 'Walang kategorya',
    categories: {
      drinks: 'Inumin',
      food: 'Pagkain',
      desserts: 'Panghimagas',
      services: 'Serbisyo',
      other: 'Iba pa',
    },
  },
}

export function useShopCopy(): Copy {
  return translations[useLocale()]
}

export function categoryLabel(category: string, copy: Copy): string {
  const key = category.toLowerCase()
  return Object.hasOwn(copy.categories, key)
    ? copy.categories[key as keyof Copy['categories']]
    : category || copy.uncategorised
}
