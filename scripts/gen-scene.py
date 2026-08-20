# -*- coding: utf-8 -*-
"""One-off art generator, kept for provenance — CI never runs it.

The committed public/scene/hobart.svg is the asset; re-run this only to
regenerate it from scratch:  python scripts/gen-scene.py public/scene/hobart.svg

Assemble public/scene/hobart.svg from the user's artwork.

Structure (mountains / city / bridge / sailboat / sky gradient + clouds) is kept
verbatim. The three procedural texture groups from the source file — hillside
houses, water sparkles, reflections — are regenerated from a seeded RNG that
reproduces the same distributions, so they stay small and can later be animated.
"""
import io, random, sys

W, H = 1832, 859

HEAD = '''<svg xmlns="http://www.w3.org/2000/svg" width="1832" height="859" viewBox="0 0 1832 859" fill="none">
<defs>
  <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="859" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#D8E1E3"/>
    <stop offset="0.58" stop-color="#E9DFD1"/>
    <stop offset="1" stop-color="#D3D0C8"/>
  </linearGradient>
  <linearGradient id="waterGrad" x1="0" y1="520" x2="0" y2="859" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#728891"/>
    <stop offset="1" stop-color="#405764"/>
  </linearGradient>
  <clipPath id="waterClip"><rect x="0" y="515" width="1832" height="344"/></clipPath>

  <linearGradient id="mountainSoftLight" x1="510" y1="175" x2="930" y2="315" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#84919A" stop-opacity="0.12"/>
    <stop offset="0.48" stop-color="#84919A" stop-opacity="0.44"/>
    <stop offset="1" stop-color="#75828B" stop-opacity="0.08"/>
  </linearGradient>
  <linearGradient id="mountainSoftShade" x1="580" y1="190" x2="1170" y2="350" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#3D4B54" stop-opacity="0.04"/>
    <stop offset="0.48" stop-color="#35434C" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#344149" stop-opacity="0.05"/>
  </linearGradient>
  <linearGradient id="mountainSoftShade2" x1="850" y1="185" x2="1470" y2="420" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#41505A" stop-opacity="0.03"/>
    <stop offset="0.52" stop-color="#324049" stop-opacity="0.26"/>
    <stop offset="1" stop-color="#2E3C44" stop-opacity="0.04"/>
  </linearGradient>
  <filter id="mountainSoftBlur" x="-5%" y="-5%" width="110%" height="110%">
    <feGaussianBlur stdDeviation="1.15"/>
  </filter>
</defs>

<g id="sky">
<rect width="1832" height="859" fill="url(#skyGrad)"/>
</g>
<g id="sky-clouds">
<path d="M0 0H430C430 21 420 36 401 49C378 64 355 59 338 76C325 89 326 106 310 117C292 130 267 122 251 138C239 150 237 169 217 174C196 180 183 163 164 167C145 171 139 190 119 192C98 193 90 175 70 176C49 177 34 194 0 191Z" fill="#B6B8BB" opacity="0.63"/>
<path d="M196 101C219 91 242 99 254 117C270 101 295 101 311 114C326 126 326 145 344 149C358 152 373 143 386 152C397 160 400 174 414 179H185C196 166 213 160 221 146C228 132 218 114 196 101Z" fill="#C4C0BC" opacity="0.55"/>
<path d="M555 70C575 60 598 65 608 84C623 68 649 66 665 81C682 96 676 116 694 123C711 129 727 114 744 124C756 131 759 145 771 151H545C558 138 574 134 580 121C587 104 574 86 555 70Z" fill="#C1BDB8" opacity="0.5"/>
<path d="M848 201C863 186 889 186 903 203C920 188 947 189 960 206C975 225 968 240 988 246C1003 251 1018 244 1033 254H833C842 244 853 239 859 228C866 216 860 207 848 201Z" fill="#D2C8BD" opacity="0.58"/>
<path d="M1080 219C1099 205 1124 208 1137 225C1152 211 1173 211 1188 225C1205 240 1200 258 1217 266C1230 272 1245 266 1259 277H1061C1073 267 1084 262 1087 250C1090 239 1085 229 1080 219Z" fill="#D6C9BC" opacity="0.62"/>
<path d="M1325 266C1341 253 1364 255 1375 271C1390 256 1416 259 1427 277C1438 294 1431 307 1448 312C1463 317 1477 310 1490 320H1308C1318 312 1328 305 1330 294C1332 284 1328 273 1325 266Z" fill="#D7CBBB" opacity="0.72"/>
<path d="M1512 294C1531 276 1559 279 1570 298C1587 284 1611 286 1625 303C1640 320 1636 336 1653 342C1668 348 1680 342 1694 352H1489C1504 341 1514 334 1516 321C1518 309 1514 300 1512 294Z" fill="#D9CCBC" opacity="0.72"/>
</g>
<g id="mountains">
<path d="M0 270
C70 249 134 243 203 250
C273 256 332 241 390 223
C445 205 498 199 550 211
C617 227 670 215 724 198
C789 178 839 187 894 211
C952 237 1006 267 1062 288
C1110 306 1141 288 1180 281
C1235 271 1285 292 1330 317
C1382 347 1424 363 1476 369
C1540 377 1602 365 1667 381
C1734 397 1780 419 1832 430
V523H0Z" fill="#77848D" opacity="0.88"/>
<path d="M0 267
C61 250 105 248 149 259
C205 273 249 254 291 235
C334 215 372 224 406 218
C458 208 505 220 552 225
C609 231 656 218 699 198
C739 179 781 164 822 152
C859 141 897 147 931 158
C969 171 1004 194 1039 217
C1081 244 1119 263 1156 276
C1198 291 1238 298 1277 316
C1325 338 1372 360 1424 378
C1483 398 1530 407 1594 410
C1650 412 1698 422 1743 442
C1783 459 1808 471 1832 479
V521H0Z" fill="#55636E"/>
<path d="M0 304
C90 288 171 281 250 290
C354 301 444 307 531 295
C614 283 675 260 739 235
C820 204 900 199 974 224
C1058 253 1134 301 1217 326
C1314 354 1407 387 1490 406
C1592 430 1699 430 1832 479
V525H0Z" fill="#46545E" opacity="0.83"/>
<g id="mountain-contours" filter="url(#mountainSoftBlur)">
  <path d="M500 247 C550 229 598 217 647 208 C699 198 752 175 809 157 C850 144 889 143 924 153 C948 160 970 171 990 184 C944 176 902 177 858 187 C807 198 757 217 709 234 C650 255 591 270 529 274 C514 270 505 261 500 247Z" fill="url(#mountainSoftLight)" opacity="0.92"/>
  <path d="M424 271 C490 259 551 250 610 235 C666 221 718 198 770 178 C746 206 727 235 709 267 C689 302 667 327 635 342 C592 329 552 313 514 299 C480 287 451 278 424 271Z" fill="url(#mountainSoftShade)" opacity="0.78"/>
  <path d="M738 194 C781 174 824 157 864 151 C893 147 919 150 943 158 C919 183 897 210 878 241 C859 270 839 294 811 313 C784 301 760 286 739 269 C751 244 755 220 738 194Z" fill="#34434C" opacity="0.15"/>
  <path d="M894 170 C950 179 1000 202 1044 229 C1098 262 1143 285 1191 301 C1161 313 1134 329 1110 350 C1084 372 1061 391 1027 405 C1006 362 981 324 953 289 C929 259 907 221 894 170Z" fill="url(#mountainSoftShade2)" opacity="0.82"/>
  <path d="M336 298 C427 302 512 305 595 295 C687 284 769 252 842 224 C910 199 973 204 1031 230 C1104 262 1170 306 1243 331 C1324 359 1397 384 1476 402 C1394 399 1314 390 1238 374 C1161 358 1094 335 1025 320 C948 304 874 304 800 320 C718 338 638 358 554 354 C475 351 404 328 336 298Z" fill="#2F3D45" opacity="0.115"/>
</g>
<g id="mountain-contour-lines" fill="none" stroke-linecap="round">
  <path d="M486 263 C548 250 605 234 657 213 C700 196 738 179 776 166" stroke="#A0ABB0" stroke-width="2.2" opacity="0.15"/>
  <path d="M542 286 C605 274 657 257 705 233 C751 210 790 190 833 177" stroke="#27363E" stroke-width="2.4" opacity="0.13"/>
  <path d="M686 288 C724 269 755 247 781 221 C804 198 831 179 862 166" stroke="#293840" stroke-width="2.1" opacity="0.13"/>
  <path d="M842 288 C872 261 894 229 913 195 C947 208 978 229 1008 255" stroke="#28373F" stroke-width="2.3" opacity="0.13"/>
  <path d="M983 309 C1030 321 1072 339 1110 359 C1145 378 1178 389 1215 396" stroke="#26363E" stroke-width="2.2" opacity="0.12"/>
  <path d="M1140 333 C1207 355 1271 376 1334 389 C1382 399 1428 404 1472 405" stroke="#839098" stroke-width="1.8" opacity="0.09"/>
</g>
<line x1="618" y1="197" x2="618" y2="164" stroke="#394750" stroke-width="1.8" opacity="0.9" stroke-linecap="round"/>
<line x1="622" y1="197" x2="622" y2="181" stroke="#394750" stroke-width="1.2" opacity="0.75" stroke-linecap="round"/>
<path d="M0 321
C53 348 105 373 155 387
C210 402 254 394 302 382
C353 370 399 365 444 371
C504 380 548 405 604 413
C659 421 710 404 759 391
C805 379 844 391 885 410
C925 429 963 427 1004 417
C1053 406 1098 387 1149 376
C1207 365 1267 367 1328 380
C1394 394 1453 415 1510 429
C1570 444 1632 448 1691 458
C1746 467 1794 480 1832 491
V545H0Z" fill="#34434B"/>
<path d="M0 365
C81 393 153 416 228 417
C310 419 378 399 444 401
C528 403 603 431 681 434
C761 438 821 415 886 423
C973 433 1048 464 1123 461
C1211 457 1280 428 1360 432
C1459 438 1537 465 1618 473
C1703 481 1771 488 1832 501
V548H0Z" fill="#2E3B42" opacity="0.88"/>
</g>
'''

CITY = '''<g id="city">
<rect x="0" y="390" width="46" height="126" rx="1" fill="#34444C"/>
<rect x="48" y="403" width="54" height="113" rx="1" fill="#1F2D34"/>
<rect x="104" y="416" width="43" height="101" rx="1" fill="#1F2D34"/>
<rect x="151" y="429" width="42" height="90" rx="1" fill="#34444C"/>
<rect x="199" y="438" width="41" height="82" rx="1" fill="#1F2D34"/>
<rect x="245" y="368" width="91" height="153" rx="1" fill="#1F2D34"/>
<rect x="341" y="423" width="44" height="99" rx="1" fill="#34444C"/>
<rect x="389" y="409" width="34" height="111" rx="1" fill="#1F2D34"/>
<rect x="427" y="403" width="69" height="118" rx="1" fill="#1F2D34"/>
<rect x="502" y="430" width="45" height="92" rx="1" fill="#34444C"/>
<rect x="552" y="420" width="57" height="103" rx="1" fill="#1F2D34"/>
<rect x="614" y="437" width="58" height="87" rx="1" fill="#1F2D34"/>
<rect x="679" y="446" width="58" height="81" rx="1" fill="#34444C"/>
<rect x="743" y="452" width="48" height="75" rx="1" fill="#1F2D34"/>
<rect x="797" y="448" width="59" height="80" rx="1" fill="#1F2D34"/>
<rect x="865" y="446" width="53" height="83" rx="1" fill="#34444C"/>
<path d="M5 392L25 374L46 392Z" fill="#34444C"/>
<path d="M104 417L126 399L147 417Z" fill="#34444C"/>
<path d="M340 423L363 402L385 423Z" fill="#1F2D34"/>
<path d="M552 420L579 398L609 420Z" fill="#1F2D34"/>
{SILO}
{WINDOWS}
{TREES}
<rect x="0" y="516" width="1030" height="12" fill="#17262D"/>
{PILINGS}
{SHEDS}
{ROOFS}
{MASTS}
</g>
'''

BRIDGE_HEAD = '''<g id="tasman-bridge">
<path d="M1045 504 C1225 478 1395 458 1554 443 C1658 433 1757 426 1832 426" stroke="#26353D" stroke-width="14" fill="none" stroke-linecap="round"/>
<path d="M1047 498 C1230 473 1398 454 1556 440 C1658 430 1758 424 1832 424" stroke="#88918F" stroke-width="3" opacity="0.55" fill="none"/>
<path d="M1049 510 C1230 487 1394 468 1555 452 C1663 442 1763 436 1832 436" stroke="#18282F" stroke-width="4" opacity="0.9" fill="none"/>
'''

SAILBOAT = '''<g id="sailboat">
<line x1="1575" y1="479" x2="1575" y2="637" stroke="#25353D" stroke-width="2.1" opacity="0.95" stroke-linecap="round"/>
<line x1="1575" y1="501" x2="1532" y2="619" stroke="#32444C" stroke-width="1.2" opacity="0.75" stroke-linecap="round"/>
<line x1="1575" y1="501" x2="1608" y2="619" stroke="#32444C" stroke-width="1.2" opacity="0.75" stroke-linecap="round"/>
<path d="M1518 626 C1542 631 1589 631 1614 626 L1603 643 C1571 649 1540 646 1527 641Z" fill="#1F2D34"/>
<path d="M1530 621H1597L1588 628H1534Z" fill="#E8DFCF" opacity="0.82"/>
<rect x="1558" y="612" width="31" height="9" rx="1" fill="#34464F"/>
<path d="M1572 505L1538 615H1572Z" fill="#D8D8CF" opacity="0.25"/>
<path d="M1561 650 C1570 666 1569 679 1578 690 C1566 702 1569 715 1576 728" stroke="#253944" stroke-width="4" opacity="0.65" fill="none"/>
</g>
'''

RIPPLES = '''<g id="foreground-ripples">
<path d="M0 675 C190 667 350 685 520 676 C730 665 900 683 1090 675 C1330 666 1570 687 1832 675" stroke="#405764" stroke-width="3" opacity="0.42" fill="none"/>
<path d="M0 706 C190 698 350 716 520 707 C730 696 900 714 1090 706 C1330 697 1570 718 1832 706" stroke="#405764" stroke-width="3" opacity="0.42" fill="none"/>
<path d="M0 735 C190 727 350 745 520 736 C730 725 900 743 1090 735 C1330 726 1570 747 1832 735" stroke="#405764" stroke-width="3" opacity="0.42" fill="none"/>
<path d="M0 766 C190 758 350 776 520 767 C730 756 900 774 1090 766 C1330 757 1570 778 1832 766" stroke="#405764" stroke-width="3" opacity="0.42" fill="none"/>
<path d="M0 801 C190 793 350 811 520 802 C730 791 900 809 1090 801 C1330 792 1570 813 1832 801" stroke="#405764" stroke-width="3" opacity="0.42" fill="none"/>
<path d="M0 832 C190 824 350 842 520 833 C730 822 900 840 1090 832 C1330 823 1570 844 1832 832" stroke="#405764" stroke-width="3" opacity="0.42" fill="none"/>
<path d="M30 701C175 694 314 708 455 702" stroke="#E8DFCF" stroke-width="2.4" opacity="0.42" fill="none" stroke-linecap="round"/>
<path d="M510 724C665 718 815 731 976 724" stroke="#E8DFCF" stroke-width="2.4" opacity="0.38" fill="none" stroke-linecap="round"/>
<path d="M1005 681C1178 674 1364 686 1532 680" stroke="#E8DFCF" stroke-width="2.4" opacity="0.38" fill="none" stroke-linecap="round"/>
<path d="M1390 739C1510 731 1663 746 1806 736" stroke="#E8DFCF" stroke-width="2.4" opacity="0.42" fill="none" stroke-linecap="round"/>
<path d="M111 790C290 781 470 798 657 788" stroke="#E8DFCF" stroke-width="2.4" opacity="0.3" fill="none" stroke-linecap="round"/>
<path d="M706 816C921 804 1110 822 1316 812" stroke="#E8DFCF" stroke-width="2.4" opacity="0.32" fill="none" stroke-linecap="round"/>
</g>
'''


def r(v, n=1):
    s = ('%.*f' % (n, v)).rstrip('0').rstrip('.')
    return s if s not in ('', '-0') else '0'


def stars():
    """140 stars scattered above the ridgeline (y < 340, so mountains occlude any that
    would otherwise sit behind a peak). Each carries its own twinkle phase via a negative
    animation-delay so they don't blink in lockstep (Task 7: SVG 场景设计 §5 补记).
    Fill stays a literal placeholder — build-scene.ts rewrites it to a constant CSS var
    (--star-color, defaulted in the fallback) rather than a numbered slot: colour never
    needs to vary with time of day here, only opacity does (group --star + per-star twinkle)."""
    rng = random.Random(1442)  # own seed — must not perturb the hillside/sparkle/reflection streams
    out = []
    for _ in range(140):
        cx = rng.uniform(0, W)
        cy = rng.uniform(20, 340)
        rad = rng.uniform(0.6, 1.8)
        delay = rng.uniform(0, 4)
        out.append('<circle class="scene-star" cx="%s" cy="%s" r="%s" fill="#F5F3EC" '
                   'style="animation-delay:-%ss"/>' % (r(cx), r(cy), r(rad, 2), r(delay, 2)))
    return '\n'.join(out)


# Sun/moon disc + halo. Coordinates stay 0 — the assembler positions the group at runtime
# via a CSS transform (SVG geometry attributes don't accept var(), so cx/cy can't be driven
# directly). Colour is a literal placeholder like the stars, rewritten by build-scene.ts to
# a constant CSS var rather than a slot — see that script for why.
CELESTIAL = '''<g id="celestial">
<circle class="scene-celestial-glow" cx="0" cy="0" r="70" fill="#8FA8C2" opacity="0.45"/>
<circle class="scene-celestial-body" cx="0" cy="0" r="40" fill="#FFF6E0"/>
</g>
'''


def silo():
    return '\n'.join(
        '<rect x="%d" y="374" width="5" height="142" fill="#8C918E" opacity="0.48"/>' % x
        for x in range(257, 324, 11))


def windows():
    """Facade window grids on the six tallest blocks (same pitch as the source)."""
    blocks = [(437, 416, 4, 6), (511, 442, 2, 5), (621, 449, 3, 4),
              (689, 458, 3, 4), (808, 460, 3, 4), (873, 459, 3, 4)]
    out = []
    for x0, y0, cols, rows in blocks:
        for c in range(cols):
            for rw in range(rows):
                out.append('<rect x="%d" y="%d" width="4" height="6" rx="0.5" '
                           'fill="#6B7476" opacity="0.34"/>' % (x0 + c * 13, y0 + rw * 16))
    return '\n'.join(out)


def trees():
    pts = [(22, 489, 18), (59, 475, 20), (92, 492, 17), (162, 480, 21), (207, 493, 17),
           (363, 486, 23), (397, 491, 17), (526, 500, 19), (570, 492, 22), (734, 500, 17),
           (829, 502, 18), (930, 500, 20), (997, 495, 19)]
    return '\n'.join('<circle cx="%d" cy="%d" r="%d" fill="#1A2830"/>' % p for p in pts)


def pilings():
    return '\n'.join(
        '<rect x="%d" y="526" width="5" height="28" fill="#1A292F" opacity="0.9"/>' % x
        for x in range(16, 1010, 38))


def sheds():
    specs = [(0, 478, 54, 38), (58, 471, 47, 45), (109, 468, 62, 48), (176, 472, 50, 44),
             (398, 466, 66, 50), (469, 472, 78, 44), (554, 474, 73, 42)]
    out = []
    for x, y, w, h in specs:
        out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="1" fill="#27373F"/>' % (x, y, w, h))
        out.append('<path d="M%d %d L%s %d L%d %dZ" fill="#223139"/>'
                   % (x, y, r(x + w / 2), y - 12, x + w, y))
    return '\n'.join(out)


# 码头帆船整体下沉量。原稿里船舱(y 514-528)与码头甲板横条(y 516-528)几乎完全重叠,
# 渲染出来像停在甲板上而不是浮在水里(需求方 2026-08-20 目验指出)。甲板底线在 528,
# 下沉 16 让船舱落到 530 以下、船体进入水面,同时仍压在栈桥柱前面(ROOFS 画在 PILINGS 之后)。
BOAT_SINK = 16


def roofs():
    specs = [(30, 530, 120, 15, 44, 518, 92), (122, 538, 90, 12, 136, 526, 62),
             (250, 530, 104, 14, 264, 518, 76), (393, 526, 90, 15, 407, 514, 62),
             (590, 529, 70, 11, 604, 517, 42), (706, 528, 72, 12, 720, 516, 44),
             (811, 527, 64, 10, 825, 515, 36), (913, 528, 62, 9, 927, 516, 34)]
    out = []
    for x, y0, w, h, bx, by0, bw in specs:
        y, by = y0 + BOAT_SINK, by0 + BOAT_SINK
        out.append('<path d="M%d %d H%d L%d %d H%dZ" fill="#E8DFCF" opacity="0.94"/>'
                   % (x, y, x + w, x + w - 14, y + h, x + 12))
        out.append('<rect x="%d" y="%d" width="%d" height="10" rx="1" fill="#40515A" opacity="0.9"/>'
                   % (bx, by, bw))
    return '\n'.join(out)


def masts():
    specs = [(50, 422, 532), (91, 415, 536), (156, 432, 540), (230, 403, 533), (335, 422, 532),
             (398, 408, 529), (482, 430, 533), (690, 441, 531), (752, 437, 528),
             (836, 428, 528), (912, 443, 530)]
    out = []
    for x, top0, bot0 in specs:
        # 桅杆跟着船一起下沉,否则会脱离船体悬在半空。
        top, bot = top0 + BOAT_SINK, bot0 + BOAT_SINK
        out.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#AEB4B0" stroke-width="1.5" '
                   'opacity="0.8" stroke-linecap="round"/>' % (x, top, x, bot))
        out.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#AEB4B0" stroke-width="1" '
                   'opacity="0.42" stroke-linecap="round"/>' % (x, top, x + 20, bot - 12))
    return '\n'.join(out)


def bridge_pylons():
    """12 pylons marching right, each taller as the deck rises and the water deepens."""
    out = []
    xs = [1106, 1158, 1214, 1271, 1330, 1392, 1456, 1521.5, 1587.5, 1655.5, 1725.5, 1797.5]
    tops = [498.0, 493.2, 487.9, 482.4, 476.8, 470.7, 464.4, 457.8, 451.1, 444.1, 436.8, 429.2]
    hs = [34.8, 40.3, 46.3, 52.5, 58.9, 65.8, 72.9, 80.4, 87.9, 95.7, 103.9, 112.4]
    for x, top, h in zip(xs, tops, hs):
        w = 8 if x < 1500 else 9
        out.append('<rect x="%s" y="%s" width="%d" height="%s" rx="1" fill="#26353D"/>'
                   % (r(x), r(top, 2), w, r(h, 2)))
        out.append('<rect x="%s" y="%s" width="26" height="5" rx="1" fill="#26353D"/>'
                   % (r(x - 9 if w == 8 else x - 8.5), r(top + h - 2, 2)))
        out.append('<rect x="%s" y="%s" width="1.5" height="%s" fill="#87918E" opacity="0.36"/>'
                   % (r(x + 2), r(top + 4, 2), r(h - 8, 2)))
    return '\n'.join(out)


def hillside_houses(rng):
    """~170 roof specks climbing the ridge from the CBD out to the eastern shore."""
    out = []
    for i in range(172):
        f = i / 171.0
        x = 712 + f * 1090 + rng.uniform(-14, 14)
        # the ridge line the houses sit on, descending left→right
        y = 402 + f * 88 + rng.uniform(-6, 10)
        w = rng.uniform(4.0, 8.0)
        h = rng.uniform(2.5, 4.8)
        op = rng.uniform(0.32, 0.62)
        out.append('<rect x="%s" y="%s" width="%s" height="%s" rx="0.8" fill="#AAB0AC" '
                   'opacity="%s"/>' % (r(x), r(y), r(w), r(h), r(op, 2)))
    return '\n'.join(out)


SPARKLE_FILLS = ['#E8DFCF', '#D7BE94', '#82939A', '#516B77', '#A4ADB0', '#B7A27F']


def water_sparkles(rng):
    """Horizontal glints, one band every 13px; bands widen with distance from the horizon."""
    out = []
    y = 548
    while y <= 847:
        depth = (y - 548) / 299.0
        count = 12 + int(rng.random() * 5)
        for _ in range(count):
            w = rng.uniform(28, 96) + depth * rng.uniform(0, 70)
            # 整块落在画幅内。当初这么改是为了无缝循环(整组左移 + 右侧等宽副本),而横移
            # 已于 2026-08-21 取消;约束留着只是因为跨出 [0, W] 的碎光会被画幅边缘切断。
            x = rng.uniform(0, W - w)
            h = rng.choice([2, 2, 3, 4])
            op = rng.uniform(0.16, 0.54)
            out.append('<rect x="%s" y="%d" width="%s" height="%d" rx="2" fill="%s" '
                       'opacity="%s"/>' % (r(x), y, r(w), h, rng.choice(SPARKLE_FILLS), r(op, 2)))
        y += 13
    return '\n'.join(out)


def reflections(rng):
    """Broken columns of colour hanging under the bright objects on the shoreline."""
    cols = [(26.6, '#B7A27F'), (94.4, '#E8DFCF'), (267.8, '#263D49'), (443.6, '#D7BE94'),
            (504.4, '#B7A27F'), (605.2, '#D7BE94'), (688.3, '#B7A27F'), (822.6, '#E8DFCF'),
            (869.6, '#D7BE94'), (1122.6, '#E8DFCF'), (1272.1, '#D7BE94'), (1398.8, '#D7BE94'),
            (1529.2, '#D7BE94'), (1663.8, '#D7BE94')]
    out = []
    for x0, fill in cols:
        w0 = rng.uniform(12, 58)
        for row in range(12):
            depth = row / 11.0
            y = 535 + row * 16 + rng.uniform(0, 5)
            w = w0 * (1 - depth * 0.45) * rng.uniform(0.72, 1.05)
            x = x0 + rng.uniform(-6, 8)
            h = rng.choice([2, 2, 3, 4])
            op = rng.uniform(0.18, 0.48)
            out.append('<rect x="%s" y="%s" width="%s" height="%d" rx="2" fill="%s" '
                       'opacity="%s"/>' % (r(x), r(y), r(max(w, 5)), h, fill, r(op, 2)))
    return '\n'.join(out)


def main(dest):
    rng = random.Random(20260820)
    # #stars / #celestial go after #sky and before #sky-clouds, so clouds (and the
    # mountains drawn later still) occlude them (Task 7 §5 补记).
    head = HEAD.replace(
        '<g id="sky-clouds">',
        '<g id="stars">\n%s\n</g>\n%s<g id="sky-clouds">' % (stars(), CELESTIAL),
    )
    parts = [head]

    parts.append('<g id="hillside-houses">\n%s\n</g>\n' % hillside_houses(rng))

    parts.append('<g id="water">\n'
                 '<rect x="0" y="520" width="1832" height="339" fill="url(#waterGrad)"/>\n'
                 '<path d="M840 519C1125 515 1432 518 1832 521V530C1455 527 1120 526 840 529Z" '
                 'fill="#E8DFCF" opacity="0.65"/>\n</g>\n')
    parts.append('<g id="water-sparkles">\n%s\n</g>\n' % water_sparkles(rng))

    parts.append(CITY
                 .replace('{SILO}', silo())
                 .replace('{WINDOWS}', windows())
                 .replace('{TREES}', trees())
                 .replace('{PILINGS}', pilings())
                 .replace('{SHEDS}', sheds())
                 .replace('{ROOFS}', roofs())
                 .replace('{MASTS}', masts()))

    parts.append(BRIDGE_HEAD + bridge_pylons() + '\n</g>\n')
    parts.append('<g id="reflections" clip-path="url(#waterClip)">\n%s\n</g>\n' % reflections(rng))
    parts.append(SAILBOAT)
    parts.append(RIPPLES)
    parts.append('</svg>\n')

    svg = ''.join(parts)
    with io.open(dest, 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg)
    print('wrote %s (%d bytes)' % (dest, len(svg.encode('utf-8'))))


if __name__ == '__main__':
    main(sys.argv[1])
