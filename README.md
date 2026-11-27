<div align="center">

<img src="assets/logo.svg" width="96" height="96" alt="GravityPrism Logo" />

# GravityPrism

**Google Antigravity için özelleştirilmiş Obsidian Prism arayüz, tema ve üretkenlik paketi**

Koyu Grafit tema · Alt barda canlı `5h` / `7d` kota ve kompakt `c %` göstergesi · 7 animasyonlu Effort Slider · Cam yansımalı Gemini Spark · İkiz sohbet kartı & canlı ASCII arka plan · Tüm adımlarda inline Diff

[**Türkçe**](./README.md) · [**English**](./README.en.md) · [**简体中文**](./README.zh-CN.md) · [**Değişiklik Günlüğü (CHANGELOG)**](./CHANGELOG.md)

<p>
  <img src="https://img.shields.io/badge/GravityPrism-v1.2.0-2563eb?style=flat-square" alt="GravityPrism v1.2.0" />
  <img src="https://img.shields.io/badge/Base-Obsidian%20Prism%20v1.0.8--beta.3-0f172a?style=flat-square" alt="Base Version v1.0.8-beta.3" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-1e293b?style=flat-square" alt="Platform" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-2563eb?style=flat-square" alt="License: GPL-3.0" /></a>
  <a href="./NOTICE"><img src="https://img.shields.io/badge/Attribution-Required%20(NOTICE)-8b5cf6?style=flat-square" alt="Attribution Required" /></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/hero-dark.webp" />
  <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/hero-light.webp" />
  <img src="assets/screenshots/hero-dark.webp" width="100%" alt="GravityPrism arayüz önizlemesi" />
</picture>

<sub>Önizleme görselleri kaynak proje Obsidian Prism'e aittir.</sub>

</div>

> **Bağımsızlık Bildirimi**
>
> **Obsidian Prism is an independent open-source project and is not affiliated with or endorsed by Google LLC.**
> **GravityPrism** ([`RMvdesi/obsidian-prism`](https://github.com/RMvdesi/obsidian-prism) temel alınarak özelleştirilmiştir) bağımsız bir açık kaynak projedir; Google LLC ile herhangi bir resmi bağı, sponsorluğu veya onayı yoktur.

---

## GravityPrism Özelleştirmeleri

Bu depo, [`RMvdesi/obsidian-prism`](https://github.com/RMvdesi/obsidian-prism) `v1.0.8-beta.3` tabanı üzerine aşağıdaki özelleştirmeleri ekler:

1. **Varsayılan İngilizce Arayüz ([`config.example.json`](./config.example.json)):**
   - Varsayılan eklenti dili `en`, zorunlu Çince arayüz çevirisi (`hostLocalization`) ise `off` olarak ayarlandı.
2. **Koyu Grafit Obsidian Paleti ([`style.css`](./style.css)):**
   - Orijinal zift siyahı tonlar daha okunabilir **Koyu Grafit** paletine yükseltildi:
     - Sol kenar çubuğu (`--sidebar`): `#121318`
     - Ana arka plan (`--background` / `--shell`): `#16171D`
     - İçerik alanı (`--content`): `#191B22`
     - Kartlar / kutular (`--card` / `--muted`): `#21232C`
     - Mesaj balonları & ikincil yüzeyler: `#20222B` / `#282B36`
3. **Alt Bar Canlı Kota ve Kompakt Telemetri ([`vendor/pulse-dashboard/inline-fallback.js`](./vendor/pulse-dashboard/inline-fallback.js)):**
   - Alt bara seçili model havuzuna göre canlı **5 saatlik (`5h`)** ve **haftalık (`7d`)** kalan kota yüzdeleri eklendi (reset süresi gösterilmez; kota `%35` altına indiğinde sarı, `%15` altına indiğinde kırmızı uyarı rengi alır, tıklandığında detay kartı açılır).
   - `tok/s` hız etiketi alt bardan kaldırıldı; cache oranı **`c <yüzde>`** biçiminde sadeleştirildi.
4. **Düzenlenmiş Composer Alt Çubuğu ([`style.css`](./style.css)):**
   - Model seçici (`[data-testid="model-selector-trigger"]`) genişlik sınırı `max-width: 100%` yapılarak `Orchestrator Gemini 4 Neon High` gibi uzun model adlarının kırpılması (`...`) giderildi.
   - İzin / **Turbo** butonu (`[data-testid="permissions-selector-trigger"]`) yazısı gizlenerek `28×28px` minimal simge hapına dönüştürüldü.
   - **Record Audio** ve **Voice Live** butonları `28×28px` tema uyumlu yuvarlak hap stiline getirildi, iç ikonlar tam merkeze ve `6px` eşit boşlukla hizalandı.
5. **Tüm Adımlarda Çalışan Sohbet İçi (Inline) Diff ([`vendor/inline-diff/inline-diff-client.js`](./vendor/inline-diff/inline-diff-client.js)):**
   - Yalnızca Git deposu içindeki dosyalarla sınırlı kalmak yerine, adım etiketlerindeki `diffContext` (`cascadeId`, `stepIndex`) üzerinden Antigravity'nin dahili `getCodeActionDiff` servisiyle Git dışı ve `.gemini` dahil tüm adımların satır içi diff önizlemesi açılır.
   - Eğer bir adımın diff verisi gerçekten yoksa hata kutusu göstermek yerine otomatik olarak Antigravity'nin kendi **Sidebar** diff/dosya görünümüne devreder.
6. **7 Seçilebilir Animasyonlu Effort Slider + Canlı Ayar Önizlemesi ([`vendor/effort-slider/upstream-client.js`](./vendor/effort-slider/upstream-client.js), [`settings-panel.js`](./settings-panel.js)):**
   - **Settings → Appearance → Obsidian Prism → Modules → Effort Slider Style** altında klasik kaydırıcıya ek olarak **7 animasyonlu HTML5 Canvas stili** canlı önizlemeyle seçilebilir: `Classic`, `Prism Beam`, `Ferrofluid`, `Gravity Well`, `Oscilloscope`, `Plasma Arc`, `Supernova` ve `Firefly Swarm`.
7. **Google 4 Renkli Gemini Spark & İkiz Sohbet Kartı ([`animated-icons.js`](./animated-icons.js), [`style.css`](./style.css), [`host-workbench-enhancer.js`](./host-workbench-enhancer.js)):**
   - Composer'daki 4 renkli Gemini ikonuna `view-box` kırpmalı ipeksi SMIL renk akışı ve cam yansıması parıltısı eklendi; menü sonrası takılan tooltip düzeltildi.
   - Studio ana ekran kartı dikey ortalanıp composer genişliğine hizalandı; sohbet akışı composer ile aynı Koyu Grafit cam çerçeveye alındı, çevresinde hover-only canlı ASCII arka plan dalgası ve sağ Overview paneli açıkken composer ile senkron kayma sağlandı.
   - Sohbet geçişlerinde otomatik en alta kaydırma ve açık `Worked for` / `Thinking` kutularında manuel müdahaleye saygılı sticky-bottom otomatik takip eklendi.

---

## Kurulum

### Tek Tık Windows Kurulum Uygulaması (Önerilen)

- [Releases](https://github.com/hypsunk/GravityPrism/releases) sayfasından **`gravity-prism-installer.exe`** dosyasını indirip çalıştırabilirsiniz (kendi `.exe` paketinizi derlemek için `npm run build:installer` komutunu kullanabilirsiniz).

### Kaynaktan Kurulum

> Ön koşul: Sistemde **Node.js `>= 22.0.0`** kurulu olmalıdır.

```bash
git clone https://github.com/hypsunk/GravityPrism.git
cd GravityPrism

# Eklentiyi ~/.gemini/config/plugins/obsidian-prism konumuna kur ve arka plan servisini başlat
npm run install:plugin

# Kurulum ve arka plan servisi durumunu doğrula
node tools/install-plugin.cjs --status
```

Kurulum sonrasında Antigravity içinde **Settings → Appearance → Obsidian Prism** bölümünden tema, animasyon, maskot ve modül ayarlarını özelleştirebilirsiniz.

### Kaldırma

```bash
npm run remove
```

### Upstream Güncellemelerini Takip Etme

```bash
git remote -v
# upstream  https://github.com/RMvdesi/obsidian-prism.git
git fetch upstream
```

---

## Temel Obsidian Prism (`v1.0.8-beta.3`) Özellikleri

- **4 Hazır Tema & Koyu Aura Presetleri:** Koyu (*Obsidian / Koyu Grafit*, *Warm*) ve açık (*Crystal*, *Alabaster*) temalar ile `darkAura` / `darkAuraStyle` ayarları.
- **8 Dil Desteği:** `zh-CN`, `zh-TW`, `en`, `ja`, `ko`, `es`, `fr`, `de` tam arayüz desteği.
- **512K Bağlam (Context) Tüpü:** WebGL2 sıvı efektli bağlam göstergesi, katman kırılımı ve kota tahmini.
- **Akıl Yürütme (Effort) Kaydırıcısı & 3D Periyodik Tablo Seçici:** Model menüsünde seviye kaydırıcısı, Orchestrator kristal barı ve uzun basımla açılan 3D WebGL2 periyodik tablo model seçici.
- **Omni Görüntüleyici, Split View & Çalışma Alanı:** Çoklu bölme (Split View) uyumu, büyük video/PDF/CSV/SVG akışlı önizleme, uzun kod bloklarını katlama, konuşma taslağı (outline) ve sağ tık `/btw` menüsü.
- **Antivirüs Dostu Kurulum & Bellek Koruması:** Kaspersky/WMI/PowerShell engellerinden arındırılmış hızlı Windows kurulumu, `language_server` bellek koruması ve yerel arşiv çalışma tezgâhı.

---

## Lisans ve Atıf

> Built upon [Obsidian Prism](https://github.com/RMvdesi/obsidian-prism) by [@RMvdesi](https://github.com/RMvdesi), licensed under [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Upstream component notices are preserved in `NOTICE` and `THIRD_PARTY_NOTICES.md`.

- Bu proje **[GNU General Public License v3.0 (`GPL-3.0-only`)](./LICENSE)** lisansı altındadır.
- Kaynak atıf ve üçüncü parti bildirimleri [`NOTICE`](./NOTICE) ve [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) dosyalarında korunmaktadır.
- Diğer dillerdeki özgün belgeler: [English](./README.en.md) · [简体中文](./README.zh-CN.md).

### Üçüncü Parti Açık Kaynak Atıfları (Upstream Credits)

1. [0DNANCY/agy-claude-style](https://github.com/0DNANCY/agy-claude-style) (`MIT`)
2. [ATtacK030130/antigrative-dashboard](https://github.com/ATtacK030130/antigrative-dashboard) (`MIT`)
3. [LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider](https://github.com/LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider) (`MIT`)
4. [yiheng8023/antigravity-chinese](https://github.com/yiheng8023/antigravity-chinese) (`MIT`)
5. [Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)
6. [Microqian2th/dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider)
7. [mobius/dsh-performance-slider](https://github.com/mobius/dsh-performance-slider)
8. [claudenoshujin/claude-web](https://github.com/claudenoshujin/claude-web)
9. [wp3171216237/dsh-TUI](https://github.com/wp3171216237/dsh-TUI) (`MIT`)
