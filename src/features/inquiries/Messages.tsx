import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Divider, Stack, Typography } from '@mui/material'
import type { components } from '../../api/generated'
import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { useWorkspace } from '../v1/workspaceContext'

const en = {
  title: 'Messages',
  empty: 'No customer messages yet.',
  loading: 'Loading messages…',
  reload: 'Reload messages',
  failed: 'Could not load or update messages. Please try again.',
  done: 'Done',
  markDone: 'Mark as done',
  unnamed: 'Customer',
  pending: 'Pending · no reply sent',
  hint: 'Latest 100 messages. Marking done only changes your private inbox; it does not reply or accept an order.',
}
const translations: Record<Exclude<Locale, 'en'>, typeof en> = {
  'zh-Hans': {
    title: '顾客留言',
    empty: '还没有顾客留言。',
    loading: '正在加载留言…',
    reload: '重新加载留言',
    failed: '无法加载或更新留言，请重试。',
    done: '已处理',
    markDone: '标为已处理',
    unnamed: '顾客',
    pending: '待处理 · 尚未回复',
    hint: '显示最近 100 条留言。标为已处理只会改变你的私人收件箱，不会回复顾客或接受订单。',
  },
  ms: {
    title: 'Mesej',
    empty: 'Belum ada mesej pelanggan.',
    loading: 'Memuatkan mesej…',
    reload: 'Muat semula mesej',
    failed: 'Tidak dapat memuatkan atau mengemas kini mesej. Sila cuba lagi.',
    done: 'Selesai',
    markDone: 'Tandakan selesai',
    unnamed: 'Pelanggan',
    pending: 'Belum selesai · belum dibalas',
    hint: '100 mesej terkini. Menandakan selesai hanya mengubah peti masuk peribadi anda; ia tidak membalas atau menerima pesanan.',
  },
  ta: {
    title: 'செய்திகள்',
    empty: 'இன்னும் வாடிக்கையாளர் செய்திகள் இல்லை.',
    loading: 'செய்திகளை ஏற்றுகிறது…',
    reload: 'செய்திகளை மீண்டும் ஏற்று',
    failed: 'செய்திகளை ஏற்றவோ புதுப்பிக்கவோ முடியவில்லை. மீண்டும் முயலுங்கள்.',
    done: 'முடிந்தது',
    markDone: 'முடிந்ததாகக் குறி',
    unnamed: 'வாடிக்கையாளர்',
    pending: 'நிலுவையில் · பதில் அனுப்பப்படவில்லை',
    hint: 'சமீபத்திய 100 செய்திகள். முடிந்ததாகக் குறிப்பது உங்கள் தனிப்பட்ட இன்பாக்ஸை மட்டுமே மாற்றும்; அது பதிலளிக்காது, ஆர்டரை ஏற்காது.',
  },
  ja: {
    title: 'メッセージ',
    empty: 'お客様からのメッセージはまだありません。',
    loading: 'メッセージを読み込んでいます…',
    reload: 'メッセージを再読み込み',
    failed: 'メッセージを読み込めないか、更新できませんでした。もう一度お試しください。',
    done: '対応済み',
    markDone: '対応済みにする',
    unnamed: 'お客様',
    pending: '未対応 · まだ返信していません',
    hint: '最新 100 件を表示しています。対応済みにしても非公開の受信箱が変わるだけで、返信や注文の受付は行われません。',
  },
  ko: {
    title: '메시지',
    empty: '아직 손님 메시지가 없어요.',
    loading: '메시지를 불러오는 중…',
    reload: '메시지 새로고침',
    failed: '메시지를 불러오거나 업데이트하지 못했어요. 다시 시도해 주세요.',
    done: '처리됨',
    markDone: '처리 완료로 표시',
    unnamed: '손님',
    pending: '대기 중 · 아직 답장하지 않았어요',
    hint: '최근 메시지 100개예요. 처리 완료로 표시해도 비공개 받은편지함만 바뀌고, 답장하거나 주문을 받지는 않아요.',
  },
  id: {
    title: 'Pesan',
    empty: 'Belum ada pesan pelanggan.',
    loading: 'Memuat pesan…',
    reload: 'Muat ulang pesan',
    failed: 'Tidak dapat memuat atau memperbarui pesan. Silakan coba lagi.',
    done: 'Selesai',
    markDone: 'Tandai selesai',
    unnamed: 'Pelanggan',
    pending: 'Menunggu · belum dibalas',
    hint: '100 pesan terbaru. Menandai selesai hanya mengubah kotak masuk pribadi Anda; tidak membalas atau menerima pesanan.',
  },
  th: {
    title: 'ข้อความ',
    empty: 'ยังไม่มีข้อความจากลูกค้า',
    loading: 'กำลังโหลดข้อความ…',
    reload: 'โหลดข้อความใหม่',
    failed: 'โหลดหรืออัปเดตข้อความไม่สำเร็จ กรุณาลองใหม่',
    done: 'เสร็จแล้ว',
    markDone: 'ทำเครื่องหมายว่าเสร็จ',
    unnamed: 'ลูกค้า',
    pending: 'รอดำเนินการ · ยังไม่ได้ตอบกลับ',
    hint: 'แสดง 100 ข้อความล่าสุด การทำเครื่องหมายว่าเสร็จจะเปลี่ยนเฉพาะกล่องข้อความส่วนตัวของคุณ ไม่ได้ตอบกลับหรือรับออร์เดอร์',
  },
  vi: {
    title: 'Tin nhắn',
    empty: 'Chưa có tin nhắn nào từ khách.',
    loading: 'Đang tải tin nhắn…',
    reload: 'Tải lại tin nhắn',
    failed: 'Không tải hoặc cập nhật được tin nhắn. Vui lòng thử lại.',
    done: 'Đã xong',
    markDone: 'Đánh dấu đã xong',
    unnamed: 'Khách hàng',
    pending: 'Đang chờ · chưa trả lời',
    hint: '100 tin nhắn gần nhất. Đánh dấu đã xong chỉ thay đổi hộp thư riêng của bạn; không trả lời khách hay nhận đơn.',
  },
  fil: {
    title: 'Mga mensahe',
    empty: 'Wala pang mensahe mula sa customer.',
    loading: 'Nilo-load ang mga mensahe…',
    reload: 'I-reload ang mga mensahe',
    failed: 'Hindi ma-load o ma-update ang mga mensahe. Subukang muli.',
    done: 'Tapos na',
    markDone: 'Markahang tapos',
    unnamed: 'Customer',
    pending: 'Nakabinbin · wala pang sagot',
    hint: 'Pinakabagong 100 mensahe. Ang pagmamarka na tapos ay nagbabago lang sa iyong pribadong inbox; hindi ito sumasagot o tumatanggap ng order.',
  },
}
type Inquiry = components['schemas']['Inquiry']

export function Messages({ businessId }: { businessId: string }) {
  const locale = useLocale()
  const t = { ...en, ...(locale === 'en' ? {} : translations[locale]) }
  const { api } = useWorkspace()
  const [items, setItems] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const lifetime = useRef<AbortController | null>(null)
  const path = `/businesses/${encodeURIComponent(businessId)}/inquiries`
  const load = useCallback(
    (signal: AbortSignal) =>
      api<Inquiry[]>(path, { signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) })
        .then((result) => {
          if (!signal.aborted) {
            setItems(result)
            setError(false)
          }
        })
        .catch(() => {
          if (!signal.aborted) setError(true)
        })
        .finally(() => {
          if (!signal.aborted) setLoading(false)
        }),
    [api, path],
  )
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    void load(abort.signal)
    return () => abort.abort()
  }, [load])

  return (
    <Box component="section" aria-labelledby="messages-title">
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography id="messages-title" component="h2" variant="titleLarge" sx={{ flex: 1 }}>
          {t.title} ({items.filter((item) => !item.done).length})
        </Typography>
        <Button
          disabled={loading || busy !== null}
          onClick={() => {
            setLoading(true)
            setError(false)
            if (lifetime.current) void load(lifetime.current.signal)
          }}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {t.reload}
        </Button>
      </Stack>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
        {t.hint}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {t.failed}
        </Alert>
      )}
      <Box role="status" aria-live="polite">
        {loading && (
          <Typography variant="bodyMedium" sx={{ mt: 2 }}>
            {t.loading}
          </Typography>
        )}
      </Box>
      {!loading && !error && items.length === 0 && (
        <Typography variant="bodyMedium" sx={{ mt: 2 }}>
          {t.empty}
        </Typography>
      )}
      <Stack
        component="ul"
        divider={<Divider component="li" aria-hidden="true" />}
        sx={{ p: 0, listStyle: 'none' }}
      >
        {items.map((item) => (
          <Box component="li" key={item.id} sx={{ py: 2, overflowWrap: 'anywhere' }}>
            <Typography component="h3" variant="titleMedium">
              {item.name || t.unnamed}
            </Typography>
            <Typography variant="bodyMedium">{item.contact}</Typography>
            <Typography variant="bodySmall" color="text.secondary">
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(item.created * 1000),
              )}
            </Typography>
            <Typography variant="bodyLarge" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
              {item.message}
            </Typography>
            <Typography variant="labelMedium" color="text.secondary">
              {item.done ? t.done : t.pending}
            </Typography>
            {!item.done && (
              <Button
                disabled={busy !== null}
                sx={{ mt: 1 }}
                startIcon={busy === item.id ? <CircularProgress size={16} /> : undefined}
                onClick={async () => {
                  setBusy(item.id)
                  setError(false)
                  try {
                    const updated = await api<Inquiry>(
                      `${path}/${encodeURIComponent(item.id)}/done`,
                      { method: 'POST' },
                    )
                    setItems((current) =>
                      current.map((entry) => (entry.id === item.id ? updated : entry)),
                    )
                  } catch {
                    setError(true)
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                {t.markDone}
              </Button>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
