# Illustration Composer — Figma plugin

Bu loyiha "Тестовое | иллюстрации" topshirig'i uchun tayyorlangan Figma plagini.
Vazifa: 20 ta tayyor SVG-illyustratsiya elementidan turli formatlarda avtomatik
kompozitsiyalar yig'ib beruvchi servis — Figma plagini ko'rinishida (chunki
kutubxona va komponentlar aynan Figma'ning o'zida mavjud).

## Nega Figma plagini (alohida sayt emas)

Topshiriqda aytilgan: "Не обязательно разрабатывать отдельный сайт или
приложение. Это может быть плагин для Figma (ведь вся библиотека и компоненты
как раз существуют в Figma)". Plagin yondashuvi obyektlarni hech qanday
eksport/import qilmasdan, to'g'ridan-to'g'ri Figma hujjatidagi haqiqiy vektor
tugunlar (node) bilan ishlaydi — shu bois "obyektlar hech qanday o'zgarmasligi
va natija vektor formatda bo'lishi" talabi tabiiy bajariladi: biz obyektlarni
klonlaymiz (`node.clone()`), ularning path/fill tuzilishi saqlanib qoladi, va
yakunda `exportAsync({format:'SVG'})` orqali tahrirlanadigan SVG chiqariladi.

## Fayllar

- `manifest.json` — plagin manifesti (nom, kirish huquqlari).
- `code.js` — plagin asosiy kodi (Figma hujjati bilan ishlovchi "sandbox" qism).
  Build qadami shart emas — oddiy JavaScript, to'g'ridan-to'g'ri ishlaydi.
- `ui.html` — plagin oynasi (interfeys): ikkala stsenariy, kutubxona boshqaruvi,
  tahrirlash tugmalari, palitra va eksport — barchasi shu faylda (inline CSS/JS).

## Arxitektura — qisqacha

1. **Kutubxona (registry).** Foydalanuvchi Figma'da kerakli obyekt(lar)ni
   tanlaydi va "Kutubxona" bo'limida "Tanlangan obyektni kutubxonaga qo'shish"
   tugmasini bosadi. Har bir element `{id, name, tags}` ko'rinishida
   `figma.clientStorage`'da saqlanadi (faqat havola — asl node hujjatda qoladi).
   Shuningdek "Hujjatni avtomatik skanerlash" tugmasi butun fayl bo'ylab
   nomzodlarni topib, foydalanuvchiga belgilab qo'shish imkonini beradi
   (aniqlik uchun — avtomatik topilganlarni foydalanuvchi ko'zdan kechiradi).
2. **Teglar.** Har bir element nomi (masalan "Кошелек", "Лампа", "Пазлы")dan
   avtomatik kalit so'zlar ajratiladi va kichik RU sinonim lug'ati
   (`SYNONYMS` — code.js ichida) orqali kengaytiriladi (masalan "деньги" →
   кошелек/монета/бюджет). Bu — tashqi AI chaqiruvisiz, oddiy va tezkor
   moslashtirish usuli (foydalanuvchi so'rovi bilan tuzilishi bo'yicha
   taqqoslanadi).
3. **Stsenariy 1 (mavzu bo'yicha).** Foydalanuvchi matn kiritadi → so'zlar
   kutubxona teglariga solishtiriladi (`matchScore`) → eng mos N ta element
   tanlanadi. Agar hech narsa mos kelmasa, tasodifiy elementlar tanlanadi va
   foydalanuvchiga ko'rsatiladi (bo'sh natija chiqmasligi uchun).
4. **Stsenariy 2 (qo'lda).** Kutubxona to'r (grid) ko'rinishida ko'rsatiladi,
   foydalanuvchi kerakli elementlarga bosib tanlaydi.
5. **Kompozitsiya yig'ish.** Tanlangan ID'lar asosida yangi Frame yaratiladi
   (tanlangan o'lchamda: 1200×630, 1080×1080, 1600×900 yoki erkin), har bir
   element klonlanadi, grid+tasodifiy siljish/burchak bilan joylashtiriladi
   (kutubxona namunalaridagi "со смещением" uslubiga o'xshash). Keyinchalik
   foydalanuvchi Figma'ning o'z vositalari bilan (sudrab ko'chirish, o'lchamini
   o'zgartirish) yoki plagindagi qo'shimcha tugmalar bilan (dublikat, o'chirish,
   qatlam tartibi, burish) tahrirlay oladi.
6. **Rang palitrasi.** Kompozitsiyadagi barcha solid fill ranglar yig'iladi,
   yorqinlik (luminance) bo'yicha saralanadi va kiritilgan palitra ranglari
   bilan mos ravishda almashtiriladi — bu Figma'dagi "recolor" plaginlarida
   keng qo'llaniladigan oddiy usul.
7. **Eksport.** `frame.exportAsync({format:'SVG'})` — natija vektor SVG
   sifatida, brauzer orqali yuklab olinadi (rastrga aylanmaydi).

## O'rnatish va sinab ko'rish (Figma desktop yoki brauzer)

1. Figma ilovasini oching (desktop versiyasi tavsiya etiladi).
2. **Plugins → Development → Import plugin from manifest...**
3. Ushbu papkadagi `manifest.json` faylini tanlang.
4. Plagin **Plugins → Development → Illustration Composer** sifatida paydo
   bo'ladi. Uni istalgan Figma faylida ishga tushiring (eng yaxshisi — mijoz
   yuborgan shu test faylining o'zida, chunki unda tayyor kutubxona bor).
5. Avval **"Kutubxona"** bo'limida: faylning "Библиотека компонентов"
   sahifasiga o'ting, kerakli ikonkalarni (Кошелек, Лампа, Наушники, Монета,
   Пазлы, Телефон va boshqalar) birma-bir yoki guruh qilib tanlang va
   "Tanlangan obyektni kutubxonaga qo'shish" tugmasini bosing (yoki
   "Hujjatni avtomatik skanerlash" orqali tezroq qo'shing).
6. **"1. Mavzu bo'yicha"** bo'limida biror so'z yozib ko'ring (masalan
   "идея" yoki "деньги"), "Mos elementlarni tanlash", so'ng
   "Kompozitsiyani yig'ish".
7. **"2. Qo'lda tanlash"** bo'limida kerakli elementlarga bosib tanlang va
   xuddi shunday yig'ing.
8. Palitra va eksportni sinab ko'ring.

## Muhim cheklovlar / nima yetishmaydi (keyingi qadamlar)

- Avtomatik skanerlash hali "qaysi obyekt haqiqiy illyustratsiya, qaysi fon
  yoki palitra namunasi" degan farqni mukammal bilmaydi — shuning uchun
  foydalanuvchi tasdiqlashi kerak (belgilash orqali). Haqiqiy loyihada buni
  nom konventsiyasi yoki Figma komponent (Component/Variant) sifatida
  belgilab, aniqroq qilish mumkin.
- Teglarni qo'lda tahrirlash UI'si hozircha yo'q (kod tomonida tayyor —
  `update-tags` xabari); hozircha teglar faqat obyekt nomidan avtomatik
  olinadi. Obyektni Figma'da qayta nomlab, qayta ro'yxatga olish orqali
  teglarni yangilash mumkin.
- Joylashtirish algoritmi oddiy grid + tasodifiy siljish; murakkabroq
  "aqlli" joylashtirish (collision-aware) keyingi iteratsiyada qo'shilishi
  mumkin.
- Hozircha tashqi AI API (masalan OpenAI) ishlatilmagan — bu ongli tanlov:
  tezroq, bepul va ishonchli ishlaydi, hamda `networkAccess` ruxsatlarisiz
  ishlaydi. Agar kelajakda haqiqiy til modeli orqali "aqlliroq" moslashtirish
  kerak bo'lsa, `manifest.json`'ga `networkAccess.allowedDomains` qo'shib,
  `code.js`'dagi `match` ishlovchisini API chaqiruviga almashtirish kifoya.

## Topshiriqda so'ralgan ma'lumotlar (mijozga javob uchun)

- **Ishlatilgan AI vositalari:** Claude (Anthropic) — butun servis
  arxitekturasi, kod (manifest.json, code.js, ui.html) va hujjatlar shu
  yordamchi bilan ishlab chiqildi/yozildi.
- **Arxitektura:** yuqoridagi "Arxitektura — qisqacha" bo'limiga qarang.
- **Saqlash:** kutubxona ro'yxati `figma.clientStorage`'da (`{id, name,
  tags}`), asl vektor ma'lumotlar hech qayerga nusxalanmaydi — har doim
  jonli Figma node'dan o'qiladi.
