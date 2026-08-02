# Dots — Kuşatmaca

Kareli defterde oynanan nokta kuşatma oyununun (Точки / Dots) web sürümü. Build adımı yok: statik HTML + ES modülleri.

Oyna: https://ysyilmaz.github.io/dots-game/

## Kurallar

İki oyuncu sırayla ızgara kesişimlerine nokta koyar. Kırmızı başlar.

Bir hamleden sonra, oyuncunun noktalarından oluşan kapalı bir zincir rakibin en az bir noktasını içine alıyorsa o alan ele geçirilir:

- Zincir bağlantısı **8 yönlü** — kendi noktaların çapraz da olsa birbirine bağlıdır.
- Kaçış **4 yönlü** — içerideki noktalar yalnızca yatay/dikey yönlerden dışarı sızabilir.
- Tahtanın kenarı duvar sayılmaz; kuşatmayı tamamen kendi noktalarınla kapatman gerekir.
- İçeride rakip noktası yoksa (yalnızca boşluk çevrildiyse) kuşatma sayılmaz.
- Kuşatılan alandaki rakip noktaları esir düşer ve puan olur; boş hücreler oyun dışı kalır.
- Kuşatılmış bir alanın içindeki noktalar yeni kuşatma zinciri kuramaz.

Skor = ele geçirilen rakip nokta sayısı. Oyun; tahta dolduğunda, iki oyuncu arka arkaya pas geçtiğinde veya biri pes ettiğinde biter.

## Oyun türleri

- **Aynı cihazda** — iki kişi sırayla aynı ekranda.
- **Bota karşı** — açgözlü bir rakip: en çok esir alan hamleyi, yoksa rakibin en çok kazanacağı hamleyi kapatır.
- **Online** — "Oda kur" ile bir kod üretilir, çıkan link karşı tarafa gönderilir. Link açıldığında oyun başlar.

## Online nasıl çalışıyor

Sunucu yok. Oyun durumu, `dots-oyunu/v1/<ODA_KODU>` konusu üzerinden herkese açık bir MQTT broker'ı (sırayla EMQX, HiveMQ, Mosquitto denenir) aktarılır. Oda kuran taraf otoritedir: hamleleri doğrular ve tam oyun durumunu yayınlar; katılan taraf hamle isteği gönderir. Her 7 saniyede bir yapılan durum yayını, kaybolan mesajlardan sonra iki tarafı tekrar aynı noktaya getirir.

Oda kodu kısa ömürlü ve rastgeledir; broker herkese açık olduğu için hassas bir şey taşınmamalıdır — taşınan tek şey tahtadaki noktalardır.

## Tahta boyutu

Hazır seçenekler 15×15, 25×25, 39×32, 55×45. Genişlik ve yükseklik 5–120 arasında serbestçe girilebilir. Büyük tahtalarda üstteki `−` / `+` / `Sığdır` düğmeleriyle yakınlaştırılır, tahta kaydırılabilir.

## Dosyalar

```
index.html
styles.css
js/rules.js     kural motoru: hamle doğrulama, flood fill ile kuşatma tespiti, skor
js/render.js    canvas çizimi
js/net.js       MQTT taşıma katmanı ve oda kodu
js/bot.js       tek hamlelik açgözlü rakip
js/app.js       arayüz, oyun akışı, online protokolü
```

## Yerelde çalıştırma

ES modülleri `file://` üzerinden çalışmaz, statik bir sunucu gerekir:

```
npx serve .
```
