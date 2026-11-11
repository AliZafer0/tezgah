# Girih — Sonsuz Geometri

![Girih — Sonsuz Geometri](cover.jpg)

**[Canlı aç](https://py.execore.cloud/projects/girih-geometry/)** · [Galeride önizle](https://py.execore.cloud/#/onizleme/girih-geometry) · [← Tezgâh](../../README.md)

> Selçuklu ve Osmanlı yıldız desenlerini gerçek çizim yöntemiyle üreten, açısıyla oynanabilen bir geometri atölyesi.

## Ne yapar?

Bir döşeme seç; desenin üstünde sürükledikçe yıldızlar daralır, genişler, birbirine dönüşür. Beş döşeme, beş renk teması, döşeme iskeletini gösterme, açının kendi kendine salındığı "nefes" kipi ve her ölçekte keskin kalan SVG çıktısı var.

## Nasıl çalışır?

- **Hankin yöntemi (temas eden çokgenler):** Her çokgen kenarının ortasından içeri doğru, kenarla θ açısı yapan iki ışın çıkar. Komşu kenarların ışınları köşe yakınında kesişir; bu çizgiler yıldızları ve geçmeleri oluşturur.
- Döşemeler periyodiktir: 4.8.8 (sekizgen + kare), 3.12.12 (onikigen + üçgen), 6.6.6, 4.4.4.4 ve 3.3.3. Görünür alanı kaplayan çokgenler kafes vektörlerinden üretilir.
- **Kör açı:** θ dış açının yarısına eşitlenince ışınlar paraleldir ve hiç kesişmez. Bu durumda her ışın çokgenin çevrel çemberinde kesilir; desen boşalmak yerine temiz bir çizgi ağına dönüşür.
- Şerit (strapwork) iki kat çizilir: koyu dış çizgi + açık iç çizgi.

## Kontroller

- **Sürükle**: yatay temas açısını, dikey kol aralığını değiştirir
- **Klavye**: desene odaklan, oklar aynı işi yapar (Shift ile büyük adım)
- **SVG indir**: 1600 × 1600, panelsiz, bağımsız dosya

## Arka plan

Girih, Farsçada "düğüm" demektir. Bu tür yıldız desenleri Selçuklu kervansaraylarından Osmanlı ahşap işçiliğine kadar geniş bir alanda görülür.

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `girih.js` | döşemeler, Hankin ışınları, temalar |
| `app.js` | SVG çizimi, etkileşim, adres, dışa aktarma |

## Kaynaklar

- E. H. Hankin, *The Drawing of Geometric Patterns in Saracenic Art* (1925)
- C. S. Kaplan, *Islamic star patterns from polygons in contact* (Graphics Interface 2005)

---

<sub>Bağımlılık yok: dosyaları bir statik sunucuda aç ya da depo kökünde `npm run dev` çalıştır. Tezgâh'ın bir ilmeği.</sub>
