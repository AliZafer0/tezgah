# Geliştirme rehberi

Tezgâh'ın altyapısı: galeri, proje keşfi, derleme, önizleme güvenliği ve yeni proje ekleme. Projelerin kendileri için ana [README](../README.md)'ye bak.

CSS animasyonları, yaratıcı kodlama denemeleri, küçük JavaScript araçları ve 3D sahneler için tek repolu proje merkezi. Galeri (`apps/hub`) projeleri `projects/` klasöründen kendiliğinden bulur. Her projeyi galerinin içinde önizleyebilir ya da kendi adresinde açabilirsin.

## Klasör yapısı

```
tezgah/
  apps/hub/              Galeri: Vite + Three.js, Türkçe arayüz
    index.html
    src/                 galeri, önizleme odası, 3D sahne (src/scene/)
    vite.config.js
  projects/
    _template/           yeni proje şablonu (galeride görünmez)
    <proje>/             her deney kendi klasöründe + playground.json
  scripts/
    server.mjs           geliştirme ve üretim sunucusu
    build.mjs            üretim derlemesi (dist/)
    create-project.mjs   yeni proje komutu
    check.mjs            metadata doğrulaması
    lib/                 keşif, doğrulama, güvenli yol çözümleme
  tests/                 birim testleri ve tarayıcı testi (tests/e2e/)
  deploy/apache/         örnek Apache yapılandırması (statik yayın)
  docs/                  bu rehber
  package.json, package-lock.json, .gitignore
```

## Kurulum ve çalıştırma

- Runtime: **Node.js 22 veya üstü** (geliştirme Node 24.15 ile yapıldı)
- Paket yöneticisi: **npm** (npm workspaces, kilit dosyası `package-lock.json`)

```bash
git clone https://github.com/AliZafer0/tezgah.git
cd tezgah
npm install
npm run dev            # http://127.0.0.1:4780/
```

Sunucu varsayılan olarak yalnızca `127.0.0.1:4780` üzerinde dinler. Değiştirmek için `PORT=4790 npm run dev` ya da `HOST=... PORT=... npm run dev`. `.env` dosyası okunmaz; ayar yalnızca bu iki ortam değişkenidir, bu yüzden `.env.example` yoktur.

Geliştirme sunucusunu dışarıya açma; yayın için aşağıdaki statik düzen kullanılır.

## Yayın

`npm run build` her şeyi `dist/` klasörüne derler; sonuç tamamen statiktir ve herhangi bir statik barındırmada çalışır. Sürekli çalışan bir Node süreci gerekmez.

- Örnek Apache yapılandırması: `deploy/apache/tezgah.conf`. Güvenlik başlıkları geliştirme sunucusuyla aynıdır; arama motorlarına `noindex` gönderir.
- **Yeni proje ya da değişiklik yayına `npm run build` ile çıkar.** Geliştirmedeki canlı keşif yayında yoktur; derleme yalnızca geçerli projelerin yayınlanabilir dosyalarını `dist/` içine kopyalar.
- Projelerin önizlemede düzgün yalıtılması için `/projects/` altındaki `Content-Security-Policy: sandbox …` başlığını koru (aşağıya bak).
- Canlı örnek: https://py.execore.cloud/

## Yeni proje oluşturma

```bash
npm run create:project -- binary-rose
npm run create:project -- binary-rose --title "İkili Gül"
```

Komut:
- slug'ı doğrular (küçük harf, rakam, tek tire; 2–64 karakter),
- yalnızca `projects/<slug>/` oluşturur, dizin dışına çıkan adları reddeder,
- aynı adda klasör ya da aynı slug'ı kullanan başka bir proje varsa hiçbir dosyaya dokunmadan durur,
- şablondan `index.html`, `style.css`, `script.js` ve `playground.json` üretir,
- projenin galeri doğrulamasından geçtiğini kontrol eder, klasörü ve adresini yazdırır.

`npm run dev` açıkken yeni proje galeride sayfa yenilemeden görünür. Proje dosyalarını kaydettiğinde açık önizleme kendiliğinden yeniden yüklenir.

## Metadata: `playground.json`

```json
{
  "title": "İkili Gül",
  "slug": "binary-rose",
  "description": "0 ve 1 karakterlerinden çizilmiş, CSS ile açan bir gül.",
  "tags": ["css", "ascii", "animasyon"],
  "status": "draft",
  "cover": "cover.webp",
  "entry": "index.html",
  "type": "static",
  "accent": "#a9dcff",
  "permissions": [],
  "created": "2026-10-21"
}
```

| Alan | Zorunlu | Açıklama |
| --- | --- | --- |
| `title` | evet | Başlık, en fazla 80 karakter |
| `slug` | evet | Benzersiz; adres `/projects/<slug>/`. Klasör adıyla aynı olması önerilir ama şart değildir |
| `description` | evet | Kısa açıklama, en fazla 240 karakter |
| `status` | evet | `draft` (taslak) veya `ready` (hazır). Taslaklar galeride kesik çizgili "Taslak" rozetiyle görünür |
| `tags` | hayır | Etiket listesi (küçük harfe çevrilir, en fazla 8 gösterilir) |
| `cover` | hayır | Proje içindeki görsel (svg, png, jpg, webp, avif, gif). Yoksa ya da bulunamazsa projeye özgü renkli bir glif kapağı çizilir |
| `entry` | hayır | Giriş HTML dosyası, varsayılan `index.html` |
| `type` | hayır | `static` (varsayılan) veya `build` (aşağıya bak) |
| `build.output` | `build` için evet | Derleme çıktısı klasörü, ör. `dist` |
| `accent` | hayır | `#rrggbb`; kapak ve 3D sahne rengi. Yoksa slug'dan türetilir |
| `permissions` | hayır | Önizleme iframe'ine verilecek ek izinler (aşağıya bak) |
| `created` | hayır | `YYYY-AA-GG`; galeride yeniden eskiye sıralama için |

Doğrulama kuralları:
- Eksik zorunlu alan, geçersiz JSON, bulunamayan giriş dosyası ve yinelenen slug **hata**dır: o proje galeriye alınmaz, diğerleri etkilenmez. Geliştirmede galeri bu klasörleri sarı bir panelde nedenleriyle listeler.
- Bulunamayan kapak, geçersiz `accent` ve bilinmeyen alanlar **uyarı**dır: proje görünür.
- `_` veya `.` ile başlayan klasörler (`_template` dahil), `node_modules` ve `.tmp`, `.bak`, `.old`, `~` ile biten geçici klasörler keşfe dahil edilmez. Sembolik bağlantı olan proje klasörleri kabul edilmez.

Hepsini terminalden denetlemek için: `npm run check`.

## Basit statik projeler

Derleme gerekmez. `projects/<slug>/` içindeki HTML, CSS, JS ve asset dosyaları olduğu gibi `/projects/<slug>/` altından sunulur; göreli yollar (`style.css`, `assets/x.png`, `./js/app.js`) hem önizlemede hem doğrudan açışta çalışır. `/projects/<slug>` adresi sondaki `/` ile yönlendirilir ki göreli yollar doğru klasöre çözülsün.

Yalnızca yayınlanması amaçlanan dosyalar sunulur:
- izinli uzantılar: html, css, js/mjs, json, map, txt, md, wasm, shader dosyaları (glsl/vert/frag/wgsl), csv, görseller, yazı tipleri, ses/video ve 3D model dosyaları;
- her zaman kapalı: nokta ile başlayan her dosya ve klasör (`.env`, `.git` …), `node_modules`, `playground.json`, `package.json` ve kilit dosyaları, `*.config.js` / `tsconfig*.json`, `env.*` dosyaları;
- yol çözümlemesi `..`, mutlak yol, ters bölü ve null bayt içeren adresleri reddeder; dosyanın gerçek yolu (sembolik bağlantı dahil) proje klasörünün dışına çıkıyorsa 404 döner.

Repo kökü, `scripts/`, `tests/` ve galeri kaynak dosyaları web üzerinden sunulmaz. Geliştirmede Vite yalnızca `apps/hub` ve `node_modules` içinden dosya sunabilir.

## Kendi derlemesi olan projeler

Bağımlılığı veya derleme adımı olan bir proje npm workspace olarak eklenir:

1. Proje klasörüne bir `package.json` koy (`"private": true`, bir `build` betiği ile). Kök `package.json` içindeki `"workspaces": ["projects/*"]` onu kendiliğinden kapsar.
2. Bağımlılıkları kökten kur: `npm install <paket> -w projects/<klasör>`. Tek kilit dosyası kökteki `package-lock.json`'dur.
3. `playground.json` içine `"type": "build"` ve `"build": { "output": "dist" }` yaz; `entry` çıktı klasörüne göre yazılır.
4. Göreli asset yolları kullan (Vite için `base: './'`).
5. `npm run build:projects` tüm derlemeli projeleri derler; geliştirme sunucusu çıktı klasörünü sunar. Çıktı yoksa galeri bunu sorun panelinde söyler. Projenin kendi dev sunucusunu ayrı bir portta çalıştırmak da mümkündür; galeri yalnızca çıktıyı gösterir.

`npm run build` derlemeli projeleri de otomatik derler.

## Önizleme, izinler ve güven sınırı

Bu alan **yalnızca kendi güvendiğin projeler** içindir; dışarıdan kod yükleme sistemi yoktur. Yine de projeler galeriden ve birbirinden yalıtılır:

- Önizleme iframe'i `sandbox="allow-scripts"` ile açılır. `allow-same-origin` **hiçbir zaman** verilmez: aynı origin üzerinde `allow-scripts` ile birlikte verildiğinde proje kendi sandbox'ını kaldırabilir. Proje bu yüzden opak (`null`) bir origin'de çalışır; galerinin DOM'una, çerezlerine ve depolamasına erişemez.
- Sunucu her proje yanıtına `Content-Security-Policy: sandbox allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads` gönderir. Böylece proje **doğrudan adresinden açıldığında da** aynı opak origin'de çalışır; önizlemede çalışan şey doğrudan açışta da aynı şekilde çalışır. Önizlemede iframe kısıtları ile bu başlığın kesişimi geçerlidir.
- Sonuç: projelerde `localStorage`, `sessionStorage`, IndexedDB ve çerezler kullanılamaz (erişim hata verir). Durumu bellekte tut ya da URL'de taşı.
- Opak origin'den yapılan modül betiği, `fetch` ve yazı tipi istekleri CORS ister; proje dosyaları bu yüzden `Access-Control-Allow-Origin: *` ile sunulur (zaten herkese açık statik dosyalardır).
- Varsayılan iframe izinleri yalnızca betik çalıştırmadır. Gerekirse `permissions` ile açılır: `fullscreen`, `pointer-lock`, `autoplay`, `camera`, `microphone`, `accelerometer`, `gyroscope`, `clipboard-write`. Kamera/mikrofon gibi izinler opak origin'de tarayıcıya göre kısıtlı kalabilir; bu durumda projeyi yeni sekmede aç.
- Galeri kendi sayfasında `X-Frame-Options: DENY`, üretimde ayrıca sıkı bir CSP kullanır; projeler yalnızca aynı siteden çerçevelenebilir (`frame-ancestors 'self'`).
- Önizlemedeki "390 px" ve "768 px" seçenekleri yalnızca çerçeve genişliğini değiştirir. Dokunma, piksel oranı ve mobil tarayıcı davranışı taklit edilmez; gerçek cihaz testi yerine geçmez.

## Galeri ve 3D sahne

- Arama başlık ve açıklamada çalışır (Türkçe karakter ve büyük/küçük harf duyarsız); etiketler birden fazla seçilebilir. `/` tuşu aramaya gider, `Esc` önizlemeyi kapatır, tarayıcının geri tuşu önizlemeden galeriye döner. Önizleme adresi paylaşılabilir: `/#/onizleme/<slug>`.
- 3D sahne (Three.js) galeri çizildikten sonra tembel yüklenir. Kartın üzerine gelmek veya klavyeyle odaklanmak çekirdeğin rengini ve parçacık biçimini o projeye göre değiştirir.
- Cihaza göre piksel oranı ve parçacık sayısı sınırlanır, yavaş cihazlarda çalışma anında düşürülür. Sekme gizliyken, sahne ekran dışındayken ve önizleme açıkken çizim durur.
- WebGL yoksa ya da başlatılamazsa aynı kimlikte statik bir SVG görünümü kalır (`/?static` ile zorlanabilir).
- `prefers-reduced-motion` açıkken kamera ve işaretçi tepkisi, parçacık titreşimi ve sürekli çizim kapanır; sahne yalnızca durum değişince bir kare çizer. Sahnede ayrıca "Hareketi durdur" düğmesi vardır.

## Tek Git reposu

Tezgâh tek bir Git reposudur. Projeler ayrı repo veya submodule değildir; alt klasörlerde `.git` oluşturma. `node_modules/`, `dist/`, proje derleme çıktıları, önbellekler, loglar ve `.env*` dosyaları `.gitignore` ile dışlanır; kaynak kod, `playground.json` dosyaları, kaynak asset'ler ve `package-lock.json` takip edilir.

## Derleme ve doğrulama komutları

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu, canlı keşif ve önizleme yenileme |
| `npm run build` | Derlemeli projeleri derler, galeriyi `dist/` içine derler, geçerli projelerin yalnızca yayınlanabilir dosyalarını `dist/projects/<slug>/` içine kopyalar, `dist/projects.json` yazar. `-- --strict` metadata hatasında başarısız olur |
| `npm run build:projects` | Yalnızca `"type": "build"` projeleri derler |
| `npm start` | `dist/` çıktısını aynı güvenlik kurallarıyla sunar |
| `npm run check` | Tüm metadata'yı doğrular; hata varsa çıkış kodu 1 |
| `npm test` | Birim testleri: slug/metadata doğrulaması, keşif, yol güvenliği, proje oluşturma |
| `npm run test:e2e` | Tarayıcı testi (çalışan `npm run dev` ister). `CHROME_PATH=/yol/chrome npm run test:e2e` işlev turu; `-- --webgl` 3D sahne turu. Geçici `zz-e2e-*` projeleri oluşturur ve sonunda siler |

Tarayıcı testi `playwright-core` kullanır ve tarayıcı indirmez; `CHROME_PATH` ile mevcut bir Chromium göster. Sandbox'sız çalışmak zorunda olan ortamlarda `E2E_NO_SANDBOX=1`. Ekran görüntüsü için `E2E_SHOTS=/klasör`.
