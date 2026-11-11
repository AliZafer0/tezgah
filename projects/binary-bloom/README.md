# Binary Bloom

![Binary Bloom](cover.jpg)

**[Canlı aç](https://py.execore.cloud/projects/binary-bloom/)** · [Galeride önizle](https://py.execore.cloud/#/onizleme/binary-bloom) · [← Tezgâh](../../README.md)

> 0 ve 1'lerden filizlenen, etkileşimli üç boyutlu bir gül.

## Ne yapar?

Siyah bir boşlukta, yalnızca 0 ve 1 karakterlerinden oluşan bir gül yavaşça açar. Sürükleyerek çevresinde dönebilir, açılmayı elle ayarlayabilir, karakterleri dağıtıp yeniden toplayabilirsin. Binary serisinin ilki.

## Nasıl çalışır?

- Bütün karakterler tek bir nokta çiziminde çizilir. Taç yaprakların biçimi shader'da açılma oranına göre hesaplanır.
- Yaprakların görünmez yüzeyi yalnızca derinliğe yazılır; arkadaki karakterler öndeki yaprakların içinden görünmez ve gül gerçek bir hacim gibi okunur.
- Karakterler HDR bir hedefte toplanır, yumuşak bir bloom eklenir ve rengi koruyan tonlamayla ekrana yazılır.

## Kontroller

- **Sürükle**: çevresinde dön
- **Açılma**: kaydırıcı
- **Duraklat / Dağıt / Baştan başlat**

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `rose.js` | karakter noktaları |
| `renderer.js` | WebGL2 çizici, derinlik, bloom |
| `script.js` | durum ve kontroller |

---

<sub>Bağımlılık yok: dosyaları bir statik sunucuda aç ya da depo kökünde `npm run dev` çalıştır. Tezgâh'ın bir ilmeği.</sub>
