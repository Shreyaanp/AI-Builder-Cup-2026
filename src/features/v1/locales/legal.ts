import type { Locale } from '../../../i18n/locales'
import type { LegalCopy } from '../legal'

export const legalTranslations: Record<Exclude<Locale, 'en'>, LegalCopy> = {
  'zh-Hans': {
    TERMS: [
      {
        heading: 'Chalkboard 是什么',
        body: [
          'Chalkboard 是独立原型，帮助小企业店主准备和维护商家资料。它不是 Google 产品，也未获 Google 认可。',
          '不会向 Google 发布任何内容。准备好后，会提供清单和 Google 官方页面，Google 会另行验证您。',
        ],
      },
      {
        heading: '您的责任',
        body: [
          '只添加您拥有或获授权管理的商家，并提供真实资料。',
          '请勿上传人物、文件，或露骨、暴力、违法照片。照片会自动检查，被拒照片不会保存。',
        ],
      },
      {
        heading: '如何保存更改',
        body: [
          '助手只能建议更改。您亲自核对具体内容并确认后才会保存。',
          'AI 建议可能有误。确认前请核对价格、营业时间和电话。',
        ],
      },
      {
        heading: '原型限制',
        body: [
          '这是黑客松原型，可能更改、无法使用或停止服务。在法律允许的范围内，不提供保证。',
          '您随时可停止使用，并在隐私页删除所有数据。',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: '我们收集什么',
        body: [
          'Google 账户标识（保护工作区隐私）、您确认的商家资料、商品和价格、与助手的对话，以及通过审核的店铺照片。',
          '可选且须另行同意：用于检查一人是否注册多家店铺的加密人脸模板。镜头视频在内存中处理后丢弃。',
        ],
      },
      {
        heading: '使用目的',
        body: [
          '帮助准备和维护商家资料、记住对话，并防止欺诈性重复注册。我们不出售数据，也不用作广告。',
        ],
      },
      {
        heading: '处理地点',
        body: [
          '记录和获接受照片存储于 Google Cloud（asia-south1 区域）。AI 功能使用 Google Gemini 模型和 Google Cloud Vision，可能在其他国家的 Google 数据中心处理数据。Google 按我们的指示处理。',
        ],
      },
      {
        heading: '保存期限',
        body: [
          '保存至您删除为止。隐私页的“删除所有数据”会移除商家、商品、对话、记忆、照片和人脸数据。',
        ],
      },
      {
        heading: '您的权利',
        body: [
          '您可查看、更正和删除数据，随时撤回同意（不影响已完成的处理），并就隐私问题联系我们。',
          '隐私联系人：将在公开推出前公布',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      '此检查可选，绝不影响注册。',
      '短暂镜头拍摄会转换为人脸模板，以 CKKS 同态加密加密，仅以加密形式比对，查找一人注册多家店铺的情况。',
      '视频在内存中处理后丢弃。匹配绝不证明商家所有权，只会将个案提交人工审核。',
      '随时可在隐私页删除人脸数据。',
    ],
  },
  ms: {
    TERMS: [
      {
        heading: 'Apa itu Chalkboard',
        body: [
          'Chalkboard ialah prototaip bebas yang membantu pemilik perniagaan kecil menyediakan dan menyelenggara maklumat perniagaan. Ia bukan produk Google dan tidak disokong Google.',
          'Ia tidak menerbitkan apa-apa ke Google. Apabila sedia, anda diberi senarai semak dan halaman rasmi Google, yang mengesahkan anda secara berasingan.',
        ],
      },
      {
        heading: 'Tanggungjawab anda',
        body: [
          'Tambah hanya perniagaan milik anda atau yang anda dibenarkan urus, dan maklumat yang benar sahaja.',
          'Jangan muat naik foto orang, dokumen atau kandungan lucah, ganas atau menyalahi undang-undang. Foto disemak automatik; foto ditolak tidak disimpan.',
        ],
      },
      {
        heading: 'Cara perubahan disimpan',
        body: [
          'Pembantu hanya boleh mencadangkan perubahan. Tiada yang disimpan sehingga anda sendiri menyemak butiran tepat dan mengesahkannya.',
          'Cadangan AI mungkin salah. Semak harga, waktu dan nombor telefon sebelum sahkan.',
        ],
      },
      {
        heading: 'Had prototaip',
        body: [
          'Ini prototaip hackathon. Ia boleh berubah, tidak tersedia atau dihentikan, dan diberi tanpa jaminan setakat yang dibenarkan undang-undang.',
          'Anda boleh berhenti bila-bila masa dan padam semua data di tab Privasi.',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: 'Data yang dikumpul',
        body: [
          'Pengecam akaun Google (untuk privasi ruang kerja), butiran perniagaan, produk dan harga yang disahkan, perbualan dengan pembantu, serta foto kedai yang lulus semakan.',
          'Pilihan, hanya dengan persetujuan berasingan: templat wajah disulitkan untuk menyemak seorang mendaftar banyak kedai. Video kamera diproses dalam memori dan dibuang.',
        ],
      },
      {
        heading: 'Tujuan penggunaan',
        body: [
          'Untuk menyediakan dan menyelenggara maklumat perniagaan, mengingati perbualan dan mencegah pendaftaran pendua palsu. Data tidak dijual atau digunakan untuk iklan.',
        ],
      },
      {
        heading: 'Tempat pemprosesan',
        body: [
          'Rekod dan foto diterima disimpan di Google Cloud (wilayah asia-south1). Ciri AI menggunakan model Gemini Google dan Google Cloud Vision, yang mungkin memproses data di pusat data Google negara lain. Google memproses mengikut arahan kami.',
        ],
      },
      {
        heading: 'Tempoh penyimpanan',
        body: [
          'Sehingga anda padam. "Padam semua data saya" di tab Privasi membuang perniagaan, produk, perbualan, ingatan, foto dan data wajah.',
        ],
      },
      {
        heading: 'Hak anda',
        body: [
          'Anda boleh akses, betulkan dan padam data, tarik balik persetujuan bila-bila masa (tidak menjejaskan pemprosesan terdahulu), dan hubungi kami tentang privasi.',
          'Hubungan privasi: akan diterbitkan sebelum pelancaran awam',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      'Semakan ini pilihan dan tidak pernah menghalang pendaftaran.',
      'Rakaman kamera ringkas ditukar kepada templat wajah, disulitkan (penyulitan homomorfik CKKS) dan dibanding hanya dalam bentuk disulitkan untuk mengesan seorang mendaftar banyak kedai.',
      'Video diproses dalam memori dan dibuang. Padanan bukan bukti pemilikan perniagaan; hanya dihantar untuk semakan manusia.',
      'Padam data wajah bila-bila masa di tab Privasi.',
    ],
  },
  ta: {
    TERMS: [
      {
        heading: 'Chalkboard என்பது என்ன',
        body: [
          'Chalkboard சிறுதொழில் உரிமையாளர்கள் விவரங்களைத் தயார்செய்து பராமரிக்க உதவும் சுயாதீன முன்மாதிரி. இது Google தயாரிப்பு அல்ல; Google ஆதரவு பெற்றதுமல்ல.',
          'Google-இல் எதையும் வெளியிடாது. நீங்கள் தயாரானதும் பட்டியலும் Google அதிகாரப்பூர்வ பக்கமும் தரப்படும்; Google தனியாகச் சரிபார்க்கும்.',
        ],
      },
      {
        heading: 'உங்கள் பொறுப்புகள்',
        body: [
          'உங்களுக்குச் சொந்தமான அல்லது நிர்வகிக்க அனுமதி பெற்ற தொழில்களை மட்டும் சேர்த்து உண்மையான விவரங்களை மட்டும் வழங்குங்கள்.',
          'மனிதர்கள், ஆவணங்கள் அல்லது ஆபாசமான, வன்முறையான, சட்டவிரோதமான படங்களைப் பதிவேற்றாதீர்கள். படங்கள் தானாகச் சரிபார்க்கப்படும்; மறுக்கப்பட்டவை சேமிக்கப்படாது.',
        ],
      },
      {
        heading: 'மாற்றங்கள் சேமிக்கப்படும் விதம்',
        body: [
          'உதவியாளர் மாற்றங்களைப் பரிந்துரைக்க மட்டுமே முடியும். சரியான விவரங்களை நீங்களே பார்த்து உறுதிசெய்யும் வரை எதுவும் சேமிக்கப்படாது.',
          'AI பரிந்துரைகள் தவறாக இருக்கலாம். உறுதிசெய்யும் முன் விலைகள், நேரங்கள், தொலைபேசி எண்களைச் சரிபாருங்கள்.',
        ],
      },
      {
        heading: 'முன்மாதிரியின் வரம்புகள்',
        body: [
          'இது ஹேக்கத்தான் முன்மாதிரி. மாறலாம், கிடைக்காமல் போகலாம், நிறுத்தப்படலாம்; சட்டம் அனுமதிக்கும் அளவில் உத்தரவாதமின்றி வழங்கப்படுகிறது.',
          'எப்போது வேண்டுமானாலும் பயன்படுத்துவதை நிறுத்தி தனியுரிமைப் பகுதியில் அனைத்துத் தகவலையும் நீக்கலாம்.',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: 'சேகரிக்கும் தகவல்',
        body: [
          'பணியிடத்தைத் தனிப்பட்டதாக வைத்திருக்க Google கணக்கு அடையாளம், உறுதிசெய்த தொழில் விவரங்கள், பொருட்கள், விலைகள், உதவியாளருடன் உரையாடல்கள், ஆய்வில் ஏற்ற கடைப் படங்கள்.',
          'விருப்பமானது, தனி ஒப்புதல் இருந்தால் மட்டும்: ஒருவர் பல கடைகளைப் பதிவுசெய்கிறாரா என்பதைச் சோதிக்கும் மறையாக்கப்பட்ட முக மாதிரி. காணொளி நினைவகத்தில் செயலாக்கப்பட்டு நீக்கப்படும்.',
        ],
      },
      {
        heading: 'பயன்படுத்தும் நோக்கம்',
        body: [
          'தொழில் பதிவைத் தயார்செய்து பராமரிக்க, உரையாடலை நினைவில் வைத்திருக்க, மோசடியான இரட்டைப் பதிவுகளைத் தடுக்க. தகவலை விற்கவோ விளம்பரத்திற்குப் பயன்படுத்தவோ மாட்டோம்.',
        ],
      },
      {
        heading: 'செயலாக்கப்படும் இடம்',
        body: [
          'பதிவுகளும் ஏற்ற படங்களும் Google Cloud (asia-south1) பகுதியில் சேமிக்கப்படும். AI அம்சங்கள் Google Gemini மாதிரிகள், Google Cloud Vision பயன்படுத்தும்; பிற நாடுகளின் Google தரவு நிலையங்களில் செயலாக்கப்படலாம். Google எங்கள் அறிவுறுத்தலின்படி செயலாக்கும்.',
        ],
      },
      {
        heading: 'சேமிக்கும் காலம்',
        body: [
          'நீங்கள் நீக்கும் வரை. தனியுரிமைப் பகுதியில் "என் தகவல் அனைத்தையும் நீக்குங்கள்" என்பது தொழில்கள், பொருட்கள், உரையாடல்கள், நினைவுகள், படங்கள், முகத் தகவலை நீக்கும்.',
        ],
      },
      {
        heading: 'உங்கள் உரிமைகள்',
        body: [
          'தகவலை அணுகலாம், திருத்தலாம், நீக்கலாம்; எப்போது வேண்டுமானாலும் ஒப்புதலைத் திரும்பப் பெறலாம் (ஏற்கெனவே செய்த செயலாக்கம் பாதிக்கப்படாது); தனியுரிமைக் கவலைகளுக்கு எங்களைத் தொடர்புகொள்ளலாம்.',
          'தனியுரிமைத் தொடர்பு: பொதுவெளியீட்டுக்கு முன் அறிவிக்கப்படும்',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      'இந்தச் சோதனை விருப்பமானது; பதிவைத் தடுக்காது.',
      'குறுகிய கேமரா பதிவை முக மாதிரியாக்கி CKKS homomorphic encryption மூலம் மறையாக்கி, மறையாக்கிய வடிவில் மட்டும் ஒப்பிட்டு ஒருவர் பல கடைகள் பதிவுசெய்வதைக் கண்டறிவோம்.',
      'காணொளி நினைவகத்தில் செயலாக்கப்பட்டு நீக்கப்படும். பொருத்தம் தொழில் உரிமைக்கான சான்றல்ல; மனித ஆய்விற்கு மட்டும் அனுப்பப்படும்.',
      'தனியுரிமைப் பகுதியில் முகத் தகவலை எப்போது வேண்டுமானாலும் நீக்கலாம்.',
    ],
  },
  ja: {
    TERMS: [
      {
        heading: 'Chalkboard について',
        body: [
          'Chalkboard は小規模事業のオーナーがビジネス情報を準備・管理するための独立した試作アプリです。Google 製品ではなく、Google の推奨も受けていません。',
          'Google への公開は行いません。準備が整うとチェックリストと Google の公式ページを案内し、Google が別途確認を行います。',
        ],
      },
      {
        heading: 'あなたの責任',
        body: [
          '所有または管理権限のあるビジネスのみ追加し、正しい情報のみ入力してください。',
          '人物、書類、露骨な内容、暴力的または違法な内容の写真は送らないでください。写真は自動確認され、拒否された写真は保存されません。',
        ],
      },
      {
        heading: '変更の保存方法',
        body: [
          'アシスタントは変更を提案するだけです。正確な内容をあなた自身が確認して承認するまで保存されません。',
          'AI の提案には誤りがあり得ます。承認前に価格、営業時間、電話番号を確認してください。',
        ],
      },
      {
        heading: '試作版の制限',
        body: [
          'ハッカソンの試作版です。変更、利用停止、提供終了の可能性があり、法律で認められる範囲で保証なく提供します。',
          'いつでも利用をやめ、プライバシータブからすべてのデータを削除できます。',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: '収集する情報',
        body: [
          'ワークスペース保護のための Google アカウント識別子、確認済みのビジネス情報・商品・価格、アシスタントとの会話、審査を通過した店舗写真です。',
          '別途同意した場合のみ、複数店舗の重複登録を確認する暗号化した顔テンプレートを収集します。カメラ動画はメモリ内で処理後に破棄します。',
        ],
      },
      {
        heading: '利用目的',
        body: [
          'ビジネス情報の準備・管理、会話の記憶、不正な重複登録の防止に使います。データの販売や広告利用は行いません。',
        ],
      },
      {
        heading: '処理する場所',
        body: [
          '記録と承認された写真は Google Cloud の asia-south1 リージョンに保存します。AI は Google の Gemini モデルと Google Cloud Vision を使い、他国の Google データセンターで処理する場合があります。Google は私たちの指示に従って処理します。',
        ],
      },
      {
        heading: '保存期間',
        body: [
          '削除するまで保存します。プライバシータブの「すべてのデータを削除」で、ビジネス、商品、会話、記憶、写真、顔データを削除できます。',
        ],
      },
      {
        heading: 'あなたの権利',
        body: [
          'データの確認、修正、削除、いつでも同意の撤回ができます（既に行った処理には影響しません）。プライバシーの懸念についてお問い合わせいただけます。',
          'プライバシー窓口：一般公開前に掲載予定です',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      'この確認は任意で、登録を妨げることはありません。',
      '短いカメラ撮影から顔テンプレートを作り、CKKS 準同型暗号で暗号化します。暗号化した状態でのみ照合し、同じ人による多数の店舗登録を検出します。',
      '動画はメモリ内で処理後に破棄します。一致してもビジネスの所有権の証明にはならず、人による審査に送るだけです。',
      'プライバシータブからいつでも顔データを削除できます。',
    ],
  },
  ko: {
    TERMS: [
      {
        heading: 'Chalkboard 소개',
        body: [
          'Chalkboard는 소상공인이 업체 정보를 준비하고 관리하도록 돕는 독립 시제품이에요. Google 제품이 아니며 Google의 보증을 받지 않았어요.',
          'Google에 어떤 내용도 게시하지 않아요. 준비되면 체크리스트와 Google 공식 페이지를 안내하며 Google이 별도로 인증해요.',
        ],
      },
      {
        heading: '사용자의 책임',
        body: [
          '소유하거나 관리 권한이 있는 업체만 추가하고 사실인 정보만 입력해 주세요.',
          '사람, 문서, 노골적이거나 폭력적 또는 불법인 사진을 올리지 마세요. 사진은 자동 검사하며 거절한 사진은 보관하지 않아요.',
        ],
      },
      {
        heading: '변경을 저장하는 방법',
        body: [
          '도우미는 변경을 제안만 할 수 있어요. 정확한 내용을 직접 검토하고 확인하기 전에는 저장하지 않아요.',
          'AI 제안은 틀릴 수 있어요. 확인 전에 가격, 영업시간, 전화번호를 점검해 주세요.',
        ],
      },
      {
        heading: '시제품의 한계',
        body: [
          '해커톤 시제품이에요. 변경되거나 이용할 수 없거나 중단될 수 있으며 법이 허용하는 범위에서 보증 없이 제공해요.',
          '언제든 이용을 중단하고 개인정보 탭에서 모든 데이터를 삭제할 수 있어요.',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: '수집하는 정보',
        body: [
          '작업 공간 보호를 위한 Google 계정 식별자, 확인한 업체 정보·상품·가격, 도우미와의 대화, 검사를 통과한 가게 사진이에요.',
          '별도로 동의할 때만 한 사람이 여러 가게를 등록하는지 확인하는 암호화된 얼굴 템플릿을 수집해요. 영상은 메모리에서 처리한 뒤 폐기해요.',
        ],
      },
      {
        heading: '이용 목적',
        body: [
          '업체 정보를 준비·관리하고 대화를 기억하며 부정한 중복 등록을 막는 데 사용해요. 데이터를 팔거나 광고에 사용하지 않아요.',
        ],
      },
      {
        heading: '처리 장소',
        body: [
          '기록과 승인된 사진은 Google Cloud의 asia-south1 리전에 저장해요. AI 기능은 Google Gemini 모델과 Google Cloud Vision을 사용하며 다른 국가의 Google 데이터 센터에서 처리할 수 있어요. Google은 저희 지시에 따라 처리해요.',
        ],
      },
      {
        heading: '보관 기간',
        body: [
          "삭제할 때까지 보관해요. 개인정보 탭의 '내 데이터 모두 삭제'는 업체, 상품, 대화, 기억, 사진, 얼굴 데이터를 삭제해요.",
        ],
      },
      {
        heading: '사용자의 권리',
        body: [
          '데이터에 접근하고 수정·삭제하며 언제든 동의를 철회할 수 있어요. 이미 완료된 처리에는 영향이 없어요. 개인정보 관련 우려는 저희에게 문의할 수 있어요.',
          '개인정보 문의처는 정식 공개 전에 안내해요',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      '선택 사항인 확인이며 등록을 막지 않아요.',
      '짧은 카메라 촬영을 얼굴 템플릿으로 만들고 CKKS 동형 암호로 암호화해요. 암호화 상태에서만 비교해 한 사람이 여러 가게를 등록하는지 확인해요.',
      '영상은 메모리에서 처리 후 폐기해요. 일치는 업체 소유권의 증거가 아니며 사람의 검토로 보내는 역할만 해요.',
      '개인정보 탭에서 언제든 얼굴 데이터를 삭제할 수 있어요.',
    ],
  },
  id: {
    TERMS: [
      {
        heading: 'Tentang Chalkboard',
        body: [
          'Chalkboard adalah prototipe independen yang membantu pemilik usaha kecil menyiapkan dan mengelola informasi bisnis. Bukan produk Google dan tidak didukung Google.',
          'Tidak memublikasikan apa pun ke Google. Saat siap, Anda mendapat daftar periksa dan halaman resmi Google untuk verifikasi terpisah.',
        ],
      },
      {
        heading: 'Tanggung jawab Anda',
        body: [
          'Tambahkan hanya bisnis yang Anda miliki atau berwenang kelola, serta informasi yang benar.',
          'Jangan unggah foto orang, dokumen, atau konten eksplisit, kekerasan, atau ilegal. Foto diperiksa otomatis dan yang ditolak tidak disimpan.',
        ],
      },
      {
        heading: 'Cara perubahan disimpan',
        body: [
          'Asisten hanya dapat menyarankan perubahan. Tidak disimpan sampai Anda sendiri meninjau detail persisnya dan mengonfirmasi.',
          'Saran AI bisa salah. Periksa harga, jam, dan nomor telepon sebelum konfirmasi.',
        ],
      },
      {
        heading: 'Batasan prototipe',
        body: [
          'Ini prototipe hackathon. Dapat berubah, tidak tersedia, atau dihentikan, dan diberikan tanpa jaminan sejauh diizinkan hukum.',
          'Anda dapat berhenti kapan saja dan menghapus semua data di tab Privasi.',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: 'Data yang dikumpulkan',
        body: [
          'Pengenal akun Google untuk menjaga ruang kerja pribadi, info bisnis, produk dan harga yang dikonfirmasi, percakapan dengan asisten, serta foto toko yang lolos moderasi.',
          'Opsional, hanya dengan persetujuan terpisah: templat wajah terenkripsi untuk memeriksa pendaftaran banyak toko oleh satu orang. Video diproses dalam memori lalu dibuang.',
        ],
      },
      {
        heading: 'Tujuan penggunaan',
        body: [
          'Untuk menyiapkan dan mengelola info bisnis, mengingat percakapan, dan mencegah pendaftaran ganda curang. Kami tidak menjual data atau memakainya untuk iklan.',
        ],
      },
      {
        heading: 'Tempat pemrosesan',
        body: [
          'Catatan dan foto yang diterima disimpan di Google Cloud (region asia-south1). Fitur AI memakai model Gemini Google dan Google Cloud Vision, yang dapat memproses data di pusat data Google di negara lain. Google memproses sesuai instruksi kami.',
        ],
      },
      {
        heading: 'Lama penyimpanan',
        body: [
          'Sampai Anda menghapusnya. "Hapus semua data saya" di tab Privasi menghapus bisnis, produk, percakapan, memori, foto, dan data wajah.',
        ],
      },
      {
        heading: 'Hak Anda',
        body: [
          'Anda dapat mengakses, memperbaiki, menghapus data, menarik persetujuan kapan saja tanpa memengaruhi pemrosesan yang sudah dilakukan, serta menghubungi kami tentang privasi.',
          'Kontak privasi: akan diumumkan sebelum peluncuran publik',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      'Pemeriksaan ini opsional dan tidak menghalangi pendaftaran.',
      'Rekaman kamera singkat diubah menjadi templat wajah, dienkripsi dengan enkripsi homomorfik CKKS, dan dibandingkan hanya dalam bentuk terenkripsi untuk mendeteksi satu orang mendaftarkan banyak toko.',
      'Video diproses dalam memori lalu dibuang. Kecocokan bukan bukti kepemilikan bisnis; hanya meneruskan kasus untuk tinjauan manusia.',
      'Hapus data wajah kapan saja di tab Privasi.',
    ],
  },
  th: {
    TERMS: [
      {
        heading: 'Chalkboard คืออะไร',
        body: [
          'Chalkboard เป็นแอปต้นแบบอิสระที่ช่วยเจ้าของธุรกิจขนาดเล็กเตรียมและดูแลข้อมูลธุรกิจ ไม่ใช่ผลิตภัณฑ์ Google และไม่ได้รับการรับรองจาก Google',
          'ไม่เผยแพร่สิ่งใดไป Google เมื่อพร้อมจะให้รายการตรวจและหน้าทางการของ Google ซึ่งยืนยันคุณแยกต่างหาก',
        ],
      },
      {
        heading: 'ความรับผิดชอบของคุณ',
        body: [
          'เพิ่มเฉพาะธุรกิจที่คุณเป็นเจ้าของหรือได้รับอนุญาตให้จัดการ และข้อมูลที่เป็นจริงเท่านั้น',
          'ห้ามอัปโหลดรูปคน เอกสาร หรือเนื้อหาล่อแหลม รุนแรง หรือผิดกฎหมาย รูปตรวจอัตโนมัติและรูปที่ปฏิเสธจะไม่ถูกเก็บ',
        ],
      },
      {
        heading: 'บันทึกการเปลี่ยนแปลงอย่างไร',
        body: [
          'ผู้ช่วยเสนอการเปลี่ยนแปลงได้เท่านั้น จะไม่บันทึกจนกว่าคุณจะตรวจข้อมูลที่แน่นอนและยืนยันด้วยตนเอง',
          'คำแนะนำ AI อาจผิด ตรวจราคา เวลา และเบอร์โทรก่อนยืนยัน',
        ],
      },
      {
        heading: 'ข้อจำกัดต้นแบบ',
        body: [
          'เป็นต้นแบบแฮกกาธอน อาจเปลี่ยน ใช้ไม่ได้ หรือเลิกให้บริการ และให้โดยไม่มีการรับประกันเท่าที่กฎหมายอนุญาต',
          'หยุดใช้ได้ทุกเมื่อ และลบข้อมูลทั้งหมดในแท็บความเป็นส่วนตัว',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: 'ข้อมูลที่เก็บ',
        body: [
          'ตัวระบุบัญชี Google เพื่อรักษาพื้นที่ส่วนตัว ข้อมูลธุรกิจ สินค้าและราคาที่คุณยืนยัน บทสนทนากับผู้ช่วย และรูปร้านที่ผ่านการตรวจ',
          'เป็นทางเลือกเมื่อยินยอมแยกต่างหากเท่านั้น: แม่แบบใบหน้าที่เข้ารหัสเพื่อตรวจคนเดียวลงทะเบียนหลายร้าน วิดีโอกล้องประมวลผลในหน่วยความจำแล้วทิ้ง',
        ],
      },
      {
        heading: 'เหตุผลที่ใช้',
        body: [
          'เพื่อเตรียมและดูแลข้อมูลธุรกิจ จำบทสนทนา และป้องกันการลงทะเบียนซ้ำที่ทุจริต ไม่ขายข้อมูลหรือใช้โฆษณา',
        ],
      },
      {
        heading: 'สถานที่ประมวลผล',
        body: [
          'บันทึกและรูปที่ยอมรับเก็บบน Google Cloud ภูมิภาค asia-south1 ฟีเจอร์ AI ใช้โมเดล Gemini ของ Google และ Google Cloud Vision ซึ่งอาจประมวลผลในศูนย์ข้อมูล Google ประเทศอื่น โดย Google ทำตามคำสั่งของเรา',
        ],
      },
      {
        heading: 'ระยะเวลาเก็บ',
        body: [
          'เก็บจนกว่าคุณจะลบ "ลบข้อมูลทั้งหมด" ในแท็บความเป็นส่วนตัวจะลบธุรกิจ สินค้า บทสนทนา ความจำ รูป และข้อมูลใบหน้า',
        ],
      },
      {
        heading: 'สิทธิ์ของคุณ',
        body: [
          'คุณเข้าถึง แก้ไข ลบข้อมูล ถอนความยินยอมได้ทุกเมื่อโดยไม่กระทบการประมวลผลที่ทำแล้ว และติดต่อเราเรื่องความเป็นส่วนตัวได้',
          'ช่องทางติดต่อความเป็นส่วนตัว: จะประกาศก่อนเปิดสาธารณะ',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      'การตรวจนี้เป็นทางเลือกและไม่ขัดขวางการลงทะเบียน',
      'แปลงภาพกล้องสั้น ๆ เป็นแม่แบบใบหน้า เข้ารหัสแบบ CKKS homomorphic encryption และเทียบเฉพาะรูปเข้ารหัสเพื่อตรวจคนเดียวลงทะเบียนหลายร้าน',
      'วิดีโอประมวลผลในหน่วยความจำแล้วทิ้ง การตรงกันไม่ใช่หลักฐานการเป็นเจ้าของธุรกิจ เพียงส่งให้คนตรวจ',
      'ลบข้อมูลใบหน้าได้ทุกเมื่อในแท็บความเป็นส่วนตัว',
    ],
  },
  vi: {
    TERMS: [
      {
        heading: 'Chalkboard là gì',
        body: [
          'Chalkboard là bản thử nghiệm độc lập giúp chủ doanh nghiệp nhỏ chuẩn bị và duy trì thông tin. Không phải sản phẩm Google và không được Google bảo chứng.',
          'Không đăng gì lên Google. Khi sẵn sàng, bạn nhận danh sách kiểm tra và trang chính thức để Google xác minh riêng.',
        ],
      },
      {
        heading: 'Trách nhiệm của bạn',
        body: [
          'Chỉ thêm doanh nghiệp bạn sở hữu hoặc được phép quản lý, cùng thông tin đúng sự thật.',
          'Không tải ảnh người, tài liệu hoặc nội dung khiêu dâm, bạo lực hay bất hợp pháp. Ảnh được kiểm tra tự động; ảnh bị từ chối không được lưu.',
        ],
      },
      {
        heading: 'Cách lưu thay đổi',
        body: [
          'Trợ lý chỉ đề xuất thay đổi. Chỉ lưu sau khi bạn tự kiểm tra nội dung chính xác và xác nhận.',
          'Đề xuất AI có thể sai. Kiểm tra giá, giờ và số điện thoại trước khi xác nhận.',
        ],
      },
      {
        heading: 'Giới hạn bản thử nghiệm',
        body: [
          'Đây là bản thử nghiệm hackathon. Có thể thay đổi, không khả dụng hoặc ngừng cung cấp, không bảo đảm trong phạm vi luật cho phép.',
          'Bạn có thể ngừng dùng bất cứ lúc nào và xóa tất cả trong mục Quyền riêng tư.',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: 'Thông tin thu thập',
        body: [
          'Mã định danh tài khoản Google để giữ không gian riêng, thông tin doanh nghiệp, sản phẩm và giá đã xác nhận, trò chuyện và ảnh cửa hàng qua kiểm duyệt.',
          'Tùy chọn, chỉ khi đồng ý riêng: mẫu khuôn mặt mã hóa để kiểm tra một người đăng ký nhiều cửa hàng. Video xử lý trong bộ nhớ rồi hủy.',
        ],
      },
      {
        heading: 'Mục đích sử dụng',
        body: [
          'Để chuẩn bị và duy trì thông tin, nhớ cuộc trò chuyện và ngăn đăng ký trùng gian lận. Không bán dữ liệu hay dùng cho quảng cáo.',
        ],
      },
      {
        heading: 'Nơi xử lý',
        body: [
          'Hồ sơ và ảnh được nhận lưu trên Google Cloud (vùng asia-south1). AI dùng mô hình Gemini của Google và Google Cloud Vision, có thể xử lý tại trung tâm dữ liệu Google ở nước khác. Google xử lý theo chỉ dẫn của chúng tôi.',
        ],
      },
      {
        heading: 'Thời gian lưu',
        body: [
          'Cho đến khi bạn xóa. "Xóa toàn bộ dữ liệu" trong mục Quyền riêng tư xóa doanh nghiệp, sản phẩm, trò chuyện, bộ nhớ, ảnh và dữ liệu khuôn mặt.',
        ],
      },
      {
        heading: 'Quyền của bạn',
        body: [
          'Bạn có thể truy cập, sửa, xóa dữ liệu, rút đồng ý bất cứ lúc nào (không ảnh hưởng xử lý đã thực hiện), và liên hệ về vấn đề riêng tư.',
          'Liên hệ quyền riêng tư: công bố trước khi ra mắt công khai',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      'Kiểm tra này tùy chọn và không chặn đăng ký.',
      'Chuyển đoạn quay ngắn thành mẫu khuôn mặt, mã hóa đồng cấu CKKS và chỉ so sánh dạng mã hóa để phát hiện một người đăng ký nhiều cửa hàng.',
      'Video xử lý trong bộ nhớ rồi hủy. Kết quả khớp không chứng minh sở hữu; chỉ chuyển vụ việc cho người xét duyệt.',
      'Xóa dữ liệu khuôn mặt bất cứ lúc nào trong mục Quyền riêng tư.',
    ],
  },
  fil: {
    TERMS: [
      {
        heading: 'Ano ang Chalkboard',
        body: [
          'Ang Chalkboard ay hiwalay na prototype na tumutulong sa maliliit na negosyante na ihanda at ayusin ang impormasyon. Hindi ito produkto o ineendorso ng Google.',
          'Wala itong ipo-post sa Google. Kapag handa na, bibigyan ka ng checklist at opisyal na pahina kung saan hiwalay kang ibeberipika ng Google.',
        ],
      },
      {
        heading: 'Mga pananagutan mo',
        body: [
          'Idagdag lang ang negosyong pag-aari mo o may pahintulot kang pamahalaan, at totoong impormasyon lang.',
          'Huwag mag-upload ng tao, dokumento, o malaswa, marahas o ilegal na larawan. Awtomatikong sinusuri ang litrato at hindi itinatago ang tinanggihan.',
        ],
      },
      {
        heading: 'Paano ise-save ang pagbabago',
        body: [
          'Mungkahi lang ang magagawa ng assistant. Walang ise-save hanggang ikaw mismo ang sumuri at magkumpirma ng eksaktong detalye.',
          'Puwedeng mali ang mungkahi ng AI. Suriin ang presyo, oras at numero bago kumpirmahin.',
        ],
      },
      {
        heading: 'Mga limitasyon ng prototype',
        body: [
          'Prototype ito para sa hackathon. Maaari itong magbago, hindi magamit o itigil, at walang garantiya sa lawak na pinapayagan ng batas.',
          'Puwede mong itigil anumang oras at burahin ang lahat ng data sa tab na Privacy.',
        ],
      },
    ],
    PRIVACY: [
      {
        heading: 'Mga kinokolekta namin',
        body: [
          'Google account identifier para sa pribadong workspace, kinumpirmang detalye, produkto at presyo, usapan sa assistant, at litrato na pumasa sa pagsusuri.',
          'Opsyonal, kung hiwalay kang pumayag: naka-encrypt na face template para suriin ang isang taong nagrehistro ng maraming tindahan. Sa memorya lang pinoproseso ang video at itinatapon.',
        ],
      },
      {
        heading: 'Bakit namin ginagamit',
        body: [
          'Para ihanda at ayusin ang impormasyon, tandaan ang usapan at pigilan ang mapanlinlang na dobleng pagrehistro. Hindi namin ibebenta o gagamitin sa ads ang data.',
        ],
      },
      {
        heading: 'Saan pinoproseso',
        body: [
          'Nasa Google Cloud (asia-south1) ang mga tala at tinanggap na litrato. Gumagamit ang AI ng Google Gemini at Google Cloud Vision na maaaring magproseso sa Google data center sa ibang bansa. Sinusunod ng Google ang mga tagubilin namin.',
        ],
      },
      {
        heading: 'Gaano katagal itinatago',
        body: [
          'Hanggang burahin mo. Aalisin ng "Burahin lahat ng data ko" sa Privacy ang negosyo, produkto, usapan, memorya, litrato at data ng mukha.',
        ],
      },
      {
        heading: 'Mga karapatan mo',
        body: [
          'Puwede mong tingnan, itama at burahin ang data, bawiin ang pahintulot anumang oras (hindi maaapektuhan ang natapos na pagproseso), at kontakin kami tungkol sa privacy.',
          'Contact sa privacy: ilalathala bago ang pampublikong paglulunsad',
        ],
      },
    ],
    BIOMETRIC_NOTICE: [
      'Opsyonal ito at hindi haharang sa pagrehistro.',
      'Gagawing face template ang maikling kuha, ie-encrypt gamit ang CKKS homomorphic encryption, at ihahambing lang habang naka-encrypt para makita ang isang taong nagrehistro ng maraming tindahan.',
      'Sa memorya pinoproseso at itinatapon ang video. Hindi patunay ng pagmamay-ari ang match; ipapasa lang ito para suriin ng tao.',
      'Puwede mong burahin ang data ng mukha anumang oras sa Privacy.',
    ],
  },
}
