import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Clock, Leaf, MapPin, Phone, RefreshCw } from 'lucide-react'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { systemLocale, type Locale } from '../../i18n/locales'
import { loadScriptFont } from '../../i18n/fonts'
import { formatPrice } from '../v1/format'
import type { ShopFacts } from '../v1/api'
import { shape } from '../../design/theme'
import { CustomerInquiry, CustomerQuestions } from './CustomerQuestions'
import { customerEnglish, whatsappUrl, type CustomerCopy } from './customerCopy'
import { customerTranslations } from './customerLocales'

interface PublicShopData {
  id: string
  name: string
  category: string
  location: string
  hours: string
  phone: string
  /** ISO 4217 code the shop's prices are stored in. */
  currency?: string
  products: { name: string; price: number; unit: string; available: boolean }[]
  /** Owner-confirmed customer facts; absent keys are simply not listed. */
  facts?: ShopFacts
}

const PAYMENT_BRANDS = { paynow: 'PayNow', grabpay: 'GrabPay', nets: 'NETS' } as const
const DELIVERY_BRANDS = { grab: 'Grab', foodpanda: 'foodpanda' } as const

/** Small, plain chips for what customers ask most (halal, payment, delivery…). */
function factChips(facts: ShopFacts, t: CustomerCopy): string[] {
  const chips: string[] = []
  if (facts.halal === 'yes') chips.push(t.factHalal)
  if (facts.halal === 'muslim_owned') chips.push(t.factMuslimOwned)
  if (facts.halal === 'no') chips.push(t.factNotHalal)
  if (facts.vegetarian_options) chips.push(t.factVegetarian)
  if (facts.delivery === 'none') chips.push(t.factNoDelivery)
  else if (facts.delivery === 'grab' || facts.delivery === 'foodpanda')
    chips.push(t.factDeliveryVia.replace('{name}', DELIVERY_BRANDS[facts.delivery]))
  else if (facts.delivery) chips.push(t.factDelivery)
  if (facts.preorders)
    chips.push(
      facts.preorder_lead_time
        ? t.factPreordersLead.replace('{lead}', facts.preorder_lead_time)
        : t.factPreorders,
    )
  for (const method of facts.payment_methods ?? [])
    chips.push(
      method === 'cash'
        ? t.factCash
        : method === 'card'
          ? t.factCard
          : method === 'other'
            ? t.factOtherPayment
            : PAYMENT_BRANDS[method],
    )
  if (facts.busy_hours) chips.push(t.factBusy.replace('{hours}', facts.busy_hours))
  return chips
}

/** English source; customer-page translations override keys (missing keys fall back). */
const en = {
  ...customerEnglish,
  menu: 'Menu & prices',
  soldOut: 'Sold out',
  available: 'Available',
  directions: 'Directions',
  call: 'Call',
  refresh: 'Refresh',
  updated: 'Updated just now',
  missing: 'This shop page isn’t available.',
  missingBody: 'The owner may have stopped sharing it.',
  footer:
    'Prepared by the shop owner with Chalkboard · independent prototype, not a Google product',
  loading: 'Loading shop…',
  empty: 'The owner hasn’t added prices yet.',
  error: 'We couldn’t load this shop right now.',
  errorBody: 'Check your connection and try again.',
  retry: 'Try again',
  stale: 'Couldn’t refresh — showing the last menu we loaded.',
}

/** Native customer-page translations per locale (filled per language; English fallback). */
// Customer Q&A/contact keys come from customerLocales.ts.
const publicTranslations: Record<Locale, Omit<typeof en, keyof CustomerCopy>> = {
  en,
  'zh-Hans': {
    menu: '菜单与价格',
    soldOut: '售罄',
    available: '有货',
    directions: '路线',
    call: '致电',
    refresh: '刷新',
    updated: '刚刚更新',
    missing: '此店铺页面无法访问。',
    missingBody: '店主可能已停止分享。',
    footer: '店主使用 Chalkboard 准备 · 独立原型，非 Google 产品',
    loading: '正在加载店铺…',
    empty: '店主尚未添加价格。',
    error: '暂时无法加载店铺。',
    errorBody: '请检查网络后重试。',
    retry: '重试',
    stale: '刷新失败，显示上次加载的菜单。',
  },
  ms: {
    menu: 'Menu & harga',
    soldOut: 'Habis',
    available: 'Tersedia',
    directions: 'Arah',
    call: 'Telefon',
    refresh: 'Muat semula',
    updated: 'Baru dikemas kini',
    missing: 'Halaman kedai ini tidak tersedia.',
    missingBody: 'Pemilik mungkin berhenti berkongsi.',
    footer: 'Disediakan pemilik dengan Chalkboard · prototaip bebas, bukan produk Google',
    loading: 'Memuatkan kedai…',
    empty: 'Pemilik belum tambah harga.',
    error: 'Kedai tidak dapat dimuatkan sekarang.',
    errorBody: 'Semak sambungan dan cuba lagi.',
    retry: 'Cuba lagi',
    stale: 'Gagal muat semula — menu terakhir dipaparkan.',
  },
  ta: {
    menu: 'உணவுப் பட்டியலும் விலைகளும்',
    soldOut: 'விற்றுத் தீர்ந்தது',
    available: 'கிடைக்கும்',
    directions: 'வழி',
    call: 'அழைக்கவும்',
    refresh: 'புதுப்பிக்கவும்',
    updated: 'இப்போதுதான் புதுப்பிக்கப்பட்டது',
    missing: 'இந்தக் கடைப் பக்கம் கிடைக்கவில்லை.',
    missingBody: 'உரிமையாளர் பகிர்வை நிறுத்தியிருக்கலாம்.',
    footer:
      'Chalkboard மூலம் கடை உரிமையாளர் தயாரித்தது · சுயாதீன முன்மாதிரி, Google தயாரிப்பு அல்ல',
    loading: 'கடையை ஏற்றுகிறோம்…',
    empty: 'உரிமையாளர் இன்னும் விலைகளைச் சேர்க்கவில்லை.',
    error: 'இப்போது கடையை ஏற்ற முடியவில்லை.',
    errorBody: 'இணைப்பைச் சரிபார்த்து மீண்டும் முயலுங்கள்.',
    retry: 'மீண்டும் முயலுங்கள்',
    stale: 'புதுப்பிக்க முடியவில்லை — முன்பு ஏற்றிய உணவுப் பட்டியலைக் காட்டுகிறோம்.',
  },
  ja: {
    menu: 'メニューと価格',
    soldOut: '売り切れ',
    available: '販売中',
    directions: '道案内',
    call: '電話する',
    refresh: '更新',
    updated: 'たった今更新',
    missing: 'このお店のページは利用できません。',
    missingBody: 'オーナーが共有を停止した可能性があります。',
    footer: 'オーナーが Chalkboard で作成・独立した試作アプリであり Google 製品ではありません',
    loading: 'お店を読み込んでいます…',
    empty: '価格はまだ追加されていません。',
    error: '今はお店を読み込めません。',
    errorBody: '接続を確認して再試行してください。',
    retry: '再試行',
    stale: '更新できませんでした。前回のメニューを表示しています。',
  },
  ko: {
    menu: '메뉴와 가격',
    soldOut: '품절',
    available: '판매 중',
    directions: '길찾기',
    call: '전화',
    refresh: '새로고침',
    updated: '방금 업데이트했어요',
    missing: '이 가게 페이지를 볼 수 없어요.',
    missingBody: '점주가 공유를 중단했을 수 있어요.',
    footer: '점주가 Chalkboard로 작성 · 독립 시제품이며 Google 제품이 아니에요',
    loading: '가게를 불러오고 있어요…',
    empty: '점주가 아직 가격을 추가하지 않았어요.',
    error: '지금 가게를 불러올 수 없어요.',
    errorBody: '연결을 확인하고 다시 시도해 주세요.',
    retry: '다시 시도',
    stale: '새로고침하지 못해 마지막으로 불러온 메뉴를 보여 드려요.',
  },
  id: {
    menu: 'Menu & harga',
    soldOut: 'Habis',
    available: 'Tersedia',
    directions: 'Rute',
    call: 'Telepon',
    refresh: 'Muat ulang',
    updated: 'Baru diperbarui',
    missing: 'Halaman toko ini tidak tersedia.',
    missingBody: 'Pemilik mungkin menghentikan berbagi.',
    footer: 'Disiapkan pemilik dengan Chalkboard · prototipe independen, bukan produk Google',
    loading: 'Memuat toko…',
    empty: 'Pemilik belum menambahkan harga.',
    error: 'Toko belum dapat dimuat saat ini.',
    errorBody: 'Periksa koneksi dan coba lagi.',
    retry: 'Coba lagi',
    stale: 'Gagal memuat ulang — menampilkan menu terakhir.',
  },
  th: {
    menu: 'เมนูและราคา',
    soldOut: 'หมดแล้ว',
    available: 'มีสินค้า',
    directions: 'เส้นทาง',
    call: 'โทร',
    refresh: 'รีเฟรช',
    updated: 'เพิ่งอัปเดต',
    missing: 'ไม่พบหน้าร้านนี้',
    missingBody: 'เจ้าของอาจหยุดแชร์แล้ว',
    footer: 'เจ้าของจัดทำด้วย Chalkboard · แอปต้นแบบอิสระ ไม่ใช่ผลิตภัณฑ์ Google',
    loading: 'กำลังโหลดร้าน…',
    empty: 'เจ้าของยังไม่เพิ่มราคา',
    error: 'ตอนนี้โหลดร้านไม่ได้',
    errorBody: 'ตรวจการเชื่อมต่อแล้วลองอีกครั้ง',
    retry: 'ลองอีกครั้ง',
    stale: 'รีเฟรชไม่ได้ แสดงเมนูที่โหลดครั้งล่าสุด',
  },
  vi: {
    menu: 'Thực đơn và giá',
    soldOut: 'Hết hàng',
    available: 'Còn bán',
    directions: 'Đường đi',
    call: 'Gọi',
    refresh: 'Làm mới',
    updated: 'Vừa cập nhật',
    missing: 'Trang cửa hàng này không khả dụng.',
    missingBody: 'Chủ cửa hàng có thể đã ngừng chia sẻ.',
    footer:
      'Chủ cửa hàng chuẩn bị bằng Chalkboard · bản thử nghiệm độc lập, không phải sản phẩm Google',
    loading: 'Đang tải cửa hàng…',
    empty: 'Chủ cửa hàng chưa thêm giá.',
    error: 'Hiện chưa tải được cửa hàng.',
    errorBody: 'Kiểm tra kết nối và thử lại.',
    retry: 'Thử lại',
    stale: 'Không làm mới được — đang hiển thị thực đơn đã tải lần trước.',
  },
  fil: {
    menu: 'Menu at presyo',
    soldOut: 'Ubos na',
    available: 'May stock',
    directions: 'Direksyon',
    call: 'Tumawag',
    refresh: 'I-refresh',
    updated: 'Kaka-update lang',
    missing: 'Hindi available ang pahina ng tindahan.',
    missingBody: 'Maaaring itinigil ng may-ari ang pag-share.',
    footer:
      'Inihanda ng may-ari gamit ang Chalkboard · hiwalay na prototype, hindi produkto ng Google',
    loading: 'Nilo-load ang tindahan…',
    empty: 'Wala pang inilalagay na presyo ang may-ari.',
    error: 'Hindi ma-load ang tindahan ngayon.',
    errorBody: 'Suriin ang koneksyon at subukan muli.',
    retry: 'Subukan muli',
    stale: 'Hindi ma-refresh — ipinapakita ang huling na-load na menu.',
  },
}

/** Customer-facing, read-only page for a shop the owner chose to share. No sign-in. */
export default function PublicShop({ id }: { id: string }) {
  const locale = systemLocale()
  const t = {
    ...en,
    ...publicTranslations[locale],
    ...(locale === 'en' ? {} : customerTranslations[locale]),
  }
  const roles = useTheme().material
  const [shop, setShop] = useState<PublicShopData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  // Data shown may be older than the last attempt when a refresh failed (network/server).
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    document.documentElement.lang = locale
    void loadScriptFont(locale)
  }, [locale])

  const fetchShop = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/v1/public/shops/${encodeURIComponent(id)}`, { signal }).then(async (response) => {
        // 404 = owner stopped sharing; anything else is a transient failure.
        if (response.status === 404) throw new Error('missing')
        if (!response.ok) throw new Error('error')
        return (await response.json()) as PublicShopData
      }),
    [id],
  )
  const apply = useCallback((data: PublicShopData) => {
    setShop(data)
    setStale(false)
    setState('ready')
  }, [])
  const failRefresh = useCallback((error: unknown) => {
    if (error instanceof Error && error.message === 'missing') {
      setShop(null)
      setState('missing')
    } else setStale(true)
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    void fetchShop(abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return
        setShop(data)
        setState('ready')
        document.title = `${data.name} · ${t.menu}`
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setState(error instanceof Error && error.message === 'missing' ? 'missing' : 'error')
      })
    // Customers returning to the tab see fresh availability.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchShop().then(apply).catch(failRefresh)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      abort.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchShop, t.menu, apply, failRefresh])

  if (state === 'loading')
    return (
      <Box role="status" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label={t.loading} />
      </Box>
    )
  if (state === 'error')
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', px: 3, pt: 12, textAlign: 'center' }}>
        <Typography component="h1" variant="headlineSmall">
          {t.error}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary">
          {t.errorBody}
        </Typography>
        <Button variant="contained" onClick={() => location.reload()} sx={{ alignSelf: 'center' }}>
          {t.retry}
        </Button>
      </Stack>
    )
  if (state === 'missing' || !shop)
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', px: 3, pt: 12, textAlign: 'center' }}>
        <Typography component="h1" variant="headlineSmall">
          {t.missing}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary">
          {t.missingBody}
        </Typography>
      </Stack>
    )

  const facts: { icon: ReactNode; text: string }[] = [
    shop.hours && { icon: <Clock size={20} />, text: shop.hours },
    shop.location && { icon: <MapPin size={20} />, text: shop.location },
    shop.phone && { icon: <Phone size={20} />, text: shop.phone },
  ].filter(Boolean) as { icon: ReactNode; text: string }[]
  const chips = factChips(shop.facts ?? {}, t)

  return (
    <Box
      component="main"
      sx={{
        maxWidth: 640,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: 'calc(24px + env(safe-area-inset-top))',
        pb: 'calc(32px + env(safe-area-inset-bottom))',
      }}
    >
      <Box
        sx={{
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
          borderRadius: `${shape.xl}px`,
          p: 3,
        }}
      >
        <Typography component="h1" variant="headlineMedium" sx={{ overflowWrap: 'anywhere' }}>
          {shop.name}
        </Typography>
        {shop.category && (
          <Typography variant="bodyLarge" sx={{ mt: 0.5 }}>
            {shop.category}
          </Typography>
        )}
        <Stack spacing={1} sx={{ mt: 2 }}>
          {facts.map((fact) => (
            <Stack key={fact.text} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box aria-hidden="true" sx={{ display: 'flex' }}>
                {fact.icon}
              </Box>
              <Typography variant="bodyMedium">{fact.text}</Typography>
            </Stack>
          ))}
        </Stack>
        {chips.length > 0 && (
          <Box
            component="ul"
            aria-label={t.factsLabel}
            sx={{ listStyle: 'none', m: 0, p: 0, mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}
          >
            {chips.map((chip) => (
              <Box
                component="li"
                key={chip}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderRadius: `${shape.sm}px`,
                  border: `1px solid ${roles.onPrimaryContainer}`,
                  typography: 'labelLarge',
                }}
              >
                {chip}
              </Box>
            ))}
          </Box>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 2.5, flexWrap: 'wrap', gap: 1 }}>
          {shop.location && (
            <Button
              variant="contained"
              startIcon={<MapPin size={18} />}
              href={
                'https://www.google.com/maps/search/?api=1&query=' +
                encodeURIComponent(`${shop.name} ${shop.location}`)
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.directions}
            </Button>
          )}
          {shop.phone && (
            <Button
              variant="outlined"
              startIcon={<Phone size={18} />}
              href={`tel:${shop.phone.replace(/[^\d+]/g, '')}`}
              sx={{ borderColor: roles.onPrimaryContainer, color: roles.onPrimaryContainer }}
            >
              {t.call}
            </Button>
          )}
          {shop.phone && (
            <Button
              variant="outlined"
              href={whatsappUrl(shop.phone, shop.name, t.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ borderColor: roles.onPrimaryContainer, color: roles.onPrimaryContainer }}
            >
              {t.whatsapp}
            </Button>
          )}
        </Stack>
      </Box>

      <Stack direction="row" sx={{ alignItems: 'center', mt: 4, mb: 1 }}>
        <Typography component="h2" variant="titleLarge" sx={{ flex: 1 }}>
          {t.menu}
        </Typography>
        <Button
          startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
          onClick={() => {
            setRefreshing(true)
            void fetchShop()
              .then(apply)
              .catch(failRefresh)
              .finally(() => setRefreshing(false))
          }}
        >
          {t.refresh}
        </Button>
      </Stack>
      {stale && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t.stale}
        </Alert>
      )}
      {shop.products.length === 0 ? (
        <Alert severity="info">{t.empty}</Alert>
      ) : (
        <List
          disablePadding
          sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px` }}
        >
          {shop.products.map((product, index) => (
            <Fragment key={product.name + product.unit}>
              {/* Sold-out rows use colour + strike-through + label, not opacity (contrast). */}
              <ListItem
                divider={index < shop.products.length - 1}
                sx={{ py: 1.5, flexWrap: 'wrap' }}
              >
                <ListItemText
                  primary={product.name}
                  secondary={product.available ? null : t.soldOut}
                  slotProps={{
                    primary: {
                      variant: 'bodyLarge',
                      sx: product.available ? undefined : { textDecoration: 'line-through' },
                    },
                    secondary: { variant: 'labelMedium', color: 'error' },
                  }}
                />
                <Typography variant="titleMedium" sx={{ whiteSpace: 'nowrap', ml: 2 }}>
                  {formatPrice(product.price, shop.currency ?? 'SGD')}
                  <Typography component="span" variant="bodyMedium" color="text.secondary">
                    {' '}
                    / {product.unit}
                  </Typography>
                </Typography>
                {shop.phone && (
                  <Button
                    href={whatsappUrl(shop.phone, shop.name, t.whatsappItemMessage, product.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ width: '100%', justifyContent: 'flex-start' }}
                  >
                    {t.whatsappItem.replace('{item}', product.name)}
                  </Button>
                )}
              </ListItem>
            </Fragment>
          ))}
        </List>
      )}
      {/* Public customer inputs stay local; neither uses the owner's coach/session. */}
      <CustomerQuestions
        key={`ask-${id}`}
        id={id}
        facts={stale ? '' : JSON.stringify(shop)}
        item={shop.products[0]?.name}
        currency={shop.currency ?? 'SGD'}
        copy={t}
      />
      <CustomerInquiry key={`contact-${id}`} id={id} copy={t} />
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 4, alignItems: 'center', color: 'text.secondary', justifyContent: 'center' }}
      >
        <Leaf size={14} aria-hidden="true" />
        <Typography variant="bodySmall" sx={{ textAlign: 'center' }}>
          {t.footer}
        </Typography>
      </Stack>
    </Box>
  )
}
