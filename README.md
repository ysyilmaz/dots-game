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

## Arayüz

Tahtanın yanındaki panel iki oyuncu kartını (sıradaki oyuncuda renkli kenar aksanı), durum satırını ve hamle geçmişini taşır. Hamleler en yeni üstte listelenir; koordinatlar `M14` biçimindedir (harf alfabesi `ABCDEFGHJKLMNPRSTUVYZ` — I/O/Q/X karışmasın diye yok), kuşatma getiren hamlenin yanında `+N` çipi çıkar.

Tahtanın üstünde sıranın kimde olduğunu gösteren yüzen bir etiket, sağ altında yakınlaştırma kümesi durur. Izgarada 5'in katı çizgiler koyu tonda çizilir, böylece büyük tahtalarda yön bulmak kolaylaşır.

Kullanılamayan aksiyonlar soluk gösterilmez, gizlenir: "Pas" yalnız sıra sendeyken, "Geri al" yalnız geri alınacak hamle varken, "Pes et" yalnız oyun sürerken görünür; oyun bitince yerlerini "Rövanş" alır.

Online oyunda üst barda oda kodu ve bağlantı durumu (yeşil = bağlı, sarı yanıp sönen = bekleniyor), panelde ölçülmüş gecikme ve karşı tarafa gönderilen üç hazır mesaj bulunur.

780 px altında yan panel tahtanın altına iner ve sayfa dikey kayar.

## Online nasıl çalışıyor

Sunucu yok. Oyun durumu, `dots-oyunu/v1/<ODA_KODU>` konusu üzerinden herkese açık bir MQTT broker'ı (sırayla EMQX, HiveMQ, Mosquitto denenir) aktarılır. Oda kuran taraf otoritedir: hamleleri doğrular ve tam oyun durumunu yayınlar; katılan taraf hamle isteği gönderir.

İki taraf 7 saniyede bir hamle sayacını içeren bir ping atar; karşı taraf `pong` ile döner (paneldeki gecikme değeri bu turdan ölçülür). Sayaçlar tutuyorsa hiçbir şey yapılmaz; tutmuyorsa tam durum yeniden yayınlanır — yani kaybolan bir mesaj kendiliğinden telafi edilir, ama boşa trafik üretilmez.

Sayaç uyuşmazlığı üst üste üç ping boyunca (≈21 sn) sürerse bağlantı kapatılıp yeniden kurulur. Bu, testte bir kez gözlenen duruma karşı konuldu: broker sıkışıkken küçük mesajlar (ping/pong) geçmeye devam ederken büyük durum mesajları düşüyor ve iki taraf sessizce ayrışıyordu.

Oda kodu kısa ömürlü ve rastgeledir; broker herkese açık olduğu için hassas bir şey taşınmamalıdır — taşınan tek şey tahtadaki noktalardır.

## Tahta boyutu

Hazır seçenekler 15×15, 25×25, 39×32, 55×45. Genişlik ve yükseklik 5–120 arasında serbestçe girilebilir. Büyük tahtalarda üstteki `−` / `+` / `Sığdır` düğmeleriyle yakınlaştırılır, tahta kaydırılabilir.

## Dosyalar

```
index.html
styles.css
js/rules.js     kural motoru: hamle doğrulama, flood fill ile kuşatma tespiti, skor
js/render.js    canvas çizimi, ızgara vurgusu, koordinat etiketleri
js/net.js       MQTT taşıma katmanı ve oda kodu
js/bot.js       tek hamlelik açgözlü rakip
js/app.js       arayüz, oyun akışı, online protokolü
```

## Yerelde çalıştırma

ES modülleri `file://` üzerinden çalışmaz, statik bir sunucu gerekir:

```
npx serve .
```
