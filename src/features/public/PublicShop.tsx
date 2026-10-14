import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { ArrowLeft, Leaf, MapPin, MessageCircle, Phone, RefreshCw } from 'lucide-react'
import { customerNavigate } from '../frontdoors/navigation'
import type { ReactNode } from 'react'
import { type Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { BrandSplash } from '../frontdoors/Splash'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { discoverCopy } from '../discover/strings'
import { loadScriptFont } from '../../i18n/fonts'
import { formatPrice } from '../v1/format'
import { factName } from '../v1/factNames'
import { Sheet } from '../v1/Sheet'
import type { ShopFacts } from '../v1/api'
import { en as ownerEnglish } from '../v1/strings'
import { translations as ownerTranslations } from '../v1/locales'
import { shape } from '../../design/theme'
import { ShopChat } from './ShopChat'
import { customerEnglish, whatsappUrl, type CustomerCopy } from './customerCopy'
import { customerTranslations } from './customerLocales'
import { BackInStock, BadgeRow, StampCard, StockReminder } from '../rewards/Rewards'
import { HoursList } from '../shop/Hours'
import type { DayHours } from '../shop/hoursModel'
import { CategoryGroups } from '../shop/CategoryGroups'
import { useShopCopy } from '../shop/strings'
import { unitLabel } from '../shop/units'

interface PublicShopData {
  id: string
  last_confirmed?: string | null
  timezone?: string
  name: string
  category: string
  location: string
  hours: string
  weekly_hours?: DayHours[]
  phone: string
  reward_text?: string
  stamps_needed?: number
  /** ISO 4217 code the shop's prices are stored in. */
  currency?: string
  products: { name: string; price: number; unit: string; available: boolean; category?: string }[]
  /** Owner-confirmed customer facts; absent keys are simply not listed. */
  facts?: ShopFacts
  open_now?: boolean | null
  /** A seeded sample shop; always labelled "Demo shop". */
  demo?: boolean
}

const PAYMENT_BRANDS = { paynow: 'PayNow', grabpay: 'GrabPay', nets: 'NETS' } as const
const DELIVERY_BRANDS = { grab: 'GrabFood', foodpanda: 'foodpanda' } as const

/** Small, plain chips for what customers ask most (halal, payment, delivery…). */
function factChips(facts: ShopFacts, t: CustomerCopy): string[] {
  const chips: string[] = []
  if (facts.halal === 'yes') chips.push(t.factHalal)
  if (facts.halal === 'muslim_owned') chips.push(t.factMuslimOwned)
  if (facts.halal === 'no') chips.push(t.factNotHalal)
  if (facts.vegetarian_options) chips.push(t.factVegetarian)
  if (facts.delivery === 'none') chips.push(t.factNoDelivery)
  else if (facts.delivery === 'own' || facts.delivery === 'other') chips.push(t.factDelivery)
  else if (facts.delivery)
    chips.push(t.factDeliveryVia.replace('{name}', factName(facts.delivery, DELIVERY_BRANDS)))
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
            : factName(method, PAYMENT_BRANDS),
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
  const locale = useLocale()
  const shopCopy = useShopCopy()
  const discovery = discoverCopy(locale)
  const freshnessCopy = locale === 'en' ? ownerEnglish : ownerTranslations[locale]
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
  const [chatOpen, setChatOpen] = useState(false)
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

  if (state === 'loading') return <BrandSplash />
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
        <Button
          component="a"
          href="/explore/"
          onClick={customerNavigate}
          variant="contained"
          startIcon={<ArrowLeft size={20} />}
          sx={{ alignSelf: 'center' }}
        >
          {t.back}
        </Button>
      </Stack>
    )

  const currency = shop.currency ?? 'SGD'
  const chips = [
    ...factChips(shop.facts ?? {}, t),
    // Type-specific facts the owner confirmed (e.g. a salon's walk-ins), label: value.
    ...(shop.facts?.custom_facts ?? []).map((fact) => `${fact.label}: ${fact.value}`),
  ]
  // Available items first; sold-out items stay listed (customers ask about them) but last.
  const menu = [...shop.products].sort((a, b) => Number(b.available) - Number(a.available))
  const openLabel = shop.open_now == null ? null : shop.open_now ? discovery.open : discovery.closed
  // Demo shops' numbers are fictional; never offer to call or message them.
  const phone = shop.demo ? '' : shop.phone
  const actions = [
    shop.location && {
      label: t.directions,
      icon: <MapPin size={20} />,
      href:
        'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(`${shop.name} ${shop.location}`),
    },
    phone && {
      label: t.call,
      icon: <Phone size={20} />,
      href: `tel:${phone.replace(/[^\d+]/g, '')}`,
    },
    phone && {
      label: t.whatsapp,
      icon: <MessageCircle size={20} />,
      href: whatsappUrl(phone, shop.name, t.whatsappMessage),
    },
  ].filter(Boolean) as { label: string; icon: ReactNode; href: string }[]

  return (
    <Box
      component="main"
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: 'calc(16px + env(safe-area-inset-top))',
        // Room for the pinned chat bar.
        pb: 'calc(104px + env(safe-area-inset-bottom))',
      }}
    >
      {/* Compact header: who, open or not, how to get there. The menu is the page. */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <IconButton component="a" href="/explore/" onClick={customerNavigate} aria-label={t.back}>
          <ArrowLeft size={20} />
        </IconButton>
        <Box
          sx={{
            width: 72,
            height: 72,
            flexShrink: 0,
            borderRadius: `${shape.lg}px`,
            overflow: 'hidden',
            bgcolor: roles.surfaceContainerHigh,
          }}
        >
          <PlaceImage id={id} category={shop.category} eager transition compact />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h1" variant="titleLarge" sx={{ overflowWrap: 'anywhere' }}>
            {shop.name}
          </Typography>
          {shop.demo && (
            <Chip
              label={t.demoShop}
              size="small"
              sx={{
                my: 0.5,
                bgcolor: roles.tertiaryContainer,
                color: roles.onTertiaryContainer,
                fontWeight: 600,
              }}
            />
          )}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {openLabel && (
              <Typography
                variant="labelLarge"
                sx={{
                  color: roles.onSurface,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: shop.open_now ? 'var(--customer-open)' : 'error.main',
                  }}
                />
                {openLabel}
              </Typography>
            )}
            {[shop.category, shop.hours].filter(Boolean).map((text) => (
              <Typography key={text} variant="bodyMedium" color="text.secondary" noWrap>
                · {text}
              </Typography>
            ))}
          </Stack>
        </Box>
      </Stack>
      {/* Sample shops say so in words, not only with a chip. */}
      {shop.demo && (
        <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1.5 }}>
          {t.demoShopNote}
        </Typography>
      )}
      {actions.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="outlined"
              size="small"
              startIcon={action.icon}
              href={action.href}
              target={action.href.startsWith('http') ? '_blank' : undefined}
              rel={action.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              sx={{ minHeight: 40, flex: { xs: 1, sm: 'none' } }}
            >
              {action.label}
            </Button>
          ))}
        </Stack>
      )}
      <Box sx={{ mt: 2 }}>
        <HoursList hours={shop.weekly_hours} />
      </Box>
      {shop.location && (
        <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1.5 }}>
          {shop.location}
        </Typography>
      )}
      <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5 }}>
        {shop.last_confirmed
          ? (() => {
              // "Today" in the shop's own timezone, so a late-night check reads correctly.
              const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: shop.timezone ?? 'Asia/Singapore',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).formatToParts(new Date())
              const part = (name: string) => parts.find((p) => p.type === name)?.value
              const today = `${part('year')}-${part('month')}-${part('day')}`
              const days = Math.max(
                0,
                Math.round((Date.parse(today) - Date.parse(shop.last_confirmed)) / 86_400_000),
              )
              return days === 0 ? freshnessCopy.updatedToday : freshnessCopy.updatedDays(days)
            })()
          : freshnessCopy.menuUnconfirmed}
      </Typography>{' '}
      {chips.length > 0 && (
        <Box
          component="ul"
          aria-label={t.factsLabel}
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            mt: 2,
            display: 'flex',
            gap: 1,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {chips.map((chip) => (
            <Box
              component="li"
              key={chip}
              sx={{
                flexShrink: 0,
                px: 1.5,
                py: 0.75,
                borderRadius: `${shape.sm}px`,
                bgcolor: roles.secondaryContainer,
                color: roles.onSecondaryContainer,
                typography: 'labelLarge',
                whiteSpace: 'nowrap',
              }}
            >
              {chip}
            </Box>
          ))}
        </Box>
      )}
      <StampCard
        shop={id}
        name={shop.name}
        timezone={shop.timezone ?? 'Asia/Singapore'}
        reward={shop.reward_text}
        needed={shop.stamps_needed ?? 8}
      />
      {!stale && <BackInStock shop={id} products={shop.products} />}
      {/* Menu: dense, aligned prices, readable at a glance. */}
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          mt: 3,
          py: 1,
          position: 'sticky',
          top: 'env(safe-area-inset-top)',
          zIndex: 1,
          bgcolor: 'background.default',
        }}
      >
        <Typography component="h2" variant="titleMedium" sx={{ flex: 1 }}>
          {t.menu}
          <Typography component="span" variant="bodyMedium" color="text.secondary">
            {' '}
            · {shop.products.length}
          </Typography>
        </Typography>
        <IconButton
          aria-label={t.refresh}
          onClick={() => {
            setRefreshing(true)
            void fetchShop()
              .then(apply)
              .catch(failRefresh)
              .finally(() => setRefreshing(false))
          }}
        >
          {refreshing ? <CircularProgress size={18} /> : <RefreshCw size={18} />}
        </IconButton>
      </Stack>
      {stale && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t.stale}
        </Alert>
      )}
      {shop.products.length === 0 ? (
        <Alert severity="info">{t.empty}</Alert>
      ) : (
        <CategoryGroups products={shop.products}>
          {(items) => (
            <List disablePadding>
              {items.map((product, index) => (
                <ListItem
                  key={product.name + product.unit}
                  divider={index < items.length - 1}
                  sx={{ py: 1.5, px: 2, gap: 2 }}
                >
                  <ListItemText
                    primary={product.name}
                    secondary={
                      product.available ? (
                        `/ ${unitLabel(product.unit, shopCopy)}`
                      ) : (
                        <StockReminder shop={id} name={product.name} unit={product.unit} />
                      )
                    }
                    slotProps={{
                      primary: {
                        variant: 'bodyLarge',
                        sx: product.available ? undefined : { color: 'text.secondary' },
                      },
                      secondary: { variant: 'bodySmall', component: 'div' },
                    }}
                  />
                  {product.available ? (
                    <Typography
                      variant="titleMedium"
                      sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {/* The phone's full locale (en-SG → $15.00), not just the UI language. */}
                      {formatPrice(product.price, currency)}
                    </Typography>
                  ) : (
                    // Sold out: label + muted text, not colour alone.
                    <Box
                      component="span"
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: `${shape.xs}px`,
                        bgcolor: roles.errorContainer,
                        color: roles.onErrorContainer,
                        typography: 'labelMedium',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.soldOut}
                    </Box>
                  )}
                </ListItem>
              ))}
            </List>
          )}
        </CategoryGroups>
      )}
      <BadgeRow shop={id} />
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 3, alignItems: 'center', color: 'text.secondary', justifyContent: 'center' }}
      >
        <Leaf size={14} aria-hidden="true" />
        <Typography variant="bodySmall" sx={{ textAlign: 'center' }}>
          {t.footer}
        </Typography>
      </Stack>
      {/* One way to reach the shop: instant answers first, the owner when needed. */}
      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          px: 2,
          pt: 1.5,
          pb: 'calc(12px + env(safe-area-inset-bottom))',
          bgcolor: roles.surfaceContainer,
          borderTop: `1px solid ${roles.outlineVariant}`,
          zIndex: 2,
        }}
      >
        <Button
          fullWidth
          variant="contained"
          size="large"
          startIcon={<MessageCircle size={20} />}
          onClick={() => setChatOpen(true)}
          sx={{ maxWidth: 720, mx: 'auto', display: 'flex', minHeight: 52 }}
        >
          {t.chatTitle}
        </Button>
      </Box>
      <Sheet
        keepMounted
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        titleId="shop-chat-title"
        title={t.chatTitle}
      >
        <Typography variant="bodyMedium" color="text.secondary">
          {t.chatIntro}
        </Typography>
        <ShopChat
          key={`chat-${id}`}
          id={id}
          facts={stale ? '' : JSON.stringify(shop)}
          item={menu[0]?.name}
          currency={currency}
          copy={t}
        />
      </Sheet>
    </Box>
  )
}
