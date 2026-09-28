# Nation Colors

Per-nation highlight colors. Removed from `eurth-map/src/data/nations.js` on 2026-09-21 when the map
briefly used a single red highlight, then restored the same day. The live values are the `color`
fields in `nations.js`; this is a reference copy.

The first table is the original hand-picked set. The second was picked from each nation's flag on the base
map (2026-09-21), weighing how much of the flag the color covers against how different it is from nearby nations.
Ionio, Aldace and Kirvina were changed by hand in the review page on 2026-09-22; the tables show those values.
Nations that got their color in the review page later are not listed here: see `nations.js`.

| id (nations.js key) | Name | Hex color |
|---|---|---|
| Tavok | Republic of Tavok | `#0a3d2a` |
| Sunseong | Kingdom of Sunseong | `#008c45` |
| Orioni | Beautiful Empire of Orioni | `#010066` |
| Aurora | Republic of Aurora | `#ff8b00` |
| Tagmatium | Greater Holy Empire of the Aromans | `#a547a5` |
| Ionio | Federal Republic of Ionio | `#ffffff` |
| Baltica | United Federation of Baltica | `#fdba0b` |
| Eemsmerschen | Dolch Free State | `#822436` |
| Centennia-Cardina | Democratic Republic of Centennia Cardina | `#ee5c6d` |
| Flaca-Vul | Most Serene Republic of Flaca Vul | `#0d406d` |
| Kiziauke | Kīzināpe Sintezan Socialist Republics | `#b71137` |
| Mikochi | Democratic People's Republic of Mikochi | `#003f89` |
| Piekinigaje | United Federal Republics of Piekinigaje | `#c0b446` |
| Welkija | Socialist Commonwealth of Welkija | `#417745` |
| Charkov | Second Federal Democratic Republic of Charkov | `#0064ac` |

## Picked from flags

| id (nations.js key) | Name | Hex color | Why |
|---|---|---|---|
| Cruciastada | Cruciastada | `#480d27` | maroon field (largest share) |
| Esonice | Esonice | `#9f2bf2` | purple stripe; blue and red are taken by Mikochi next door |
| Aldace | Aldace | `#001b4b` | navy field; picked by hand in the review page (was the gold star, `#f4ca14`) |
| Rhodellia | Rhodellia | `#f5be51` | gold stripe |
| Nova-Occidentalis | Nova Occidentalis | `#1b1b1b` | black field (81%); its yellow sun would clash with Rhodellia |
| Kolhar | Kolhar | `#0a8700` | green stripe; the sky blue is too close to Mikochi |
| Mito | Mito | `#890101` | dark red field |
| Goankok | Goankok | `#00788c` | teal field |
| Kirvina | Kirvina | `#ffffff` | white; picked by hand in the review page (was the silver starburst, `#bfc5c3`). The flag's dark green field is almost exactly Tavok's, next door |
| Ymutz-Mizlan | Ymutz Mizlan | `#23672c` | green stripe; purple went to Esonice, yellow is near Verraine |
| Denawar | Denawar | `#05772a` | green (the rest is white) |
| Bamraland | Bamraland | `#1f41b4` | blue field |
| Arneland | Arneland | `#bd0b31` | red stripe; yellow/orange are Iverica and Aurora next door |
| Verraine | Verraine | `#a98702` | old-gold band |
| Ralzawr | Ralzawr | `#01356a` | navy half; the orange half would merge with Sahra |
| Helsium | Helsium | `#b52a18` | red (the rest is cream) |
| Sahra | Sahra | `#d5750e` | orange field |
| Lenelia | Lenelia | `#fbc61f` | yellow; red/navy/green/purple are all used around it |
| Ahrana | Ahrana | `#fecb07` | yellow cross; surrounded by blues (Charkov, Poja) |
| Marchyydion | Marchyydion | `#cb6625` | orange; navy and red are taken by its neighbours |
| Pentium | Pentium | `#27556f` | slate-blue field |
| Poja | Poja | `#303097` | indigo field |
| Stedoria | Stedoria | `#102b5d` | navy stripe; its red is too close to Eemsmerschen's burgundy next door |
| Garindina | Garindina | `#7d0c0d` | dark red stripe (the rest is white/black) |
| Volhynia | Volhynia | `#ce182a` | red; blue is Poja/Charkov nearby |
| Erisoria | Erisoria | `#f48314` | orange stripe (red/white/orange are equal thirds) |
| Iverica | Iverica | `#f8c91a` | yellow chevron, as suggested; blue is everywhere |
