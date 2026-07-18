# تفكيك واجهة الشات — 6 مكوّنات مستقلة

هذا فقط **فصل** (Extraction) لما هو موجود فعلاً في المشروع، منسوخ حرفياً من
`index.html` و `css/style.css`، بدون أي تغيير في التصميم أو الألوان أو
الأحجام أو المنطق أو Firebase/Firestore/listeners.

الملفات الأصلية لم تُعدَّل إطلاقاً. هذا مجرد نسخ منظّم في مجلد جانبي
لتسهيل استبدال كل جزء بتصميم جديد لاحقاً.

## الخريطة (Component → مصدره في المشروع)

| # | المكوّن | HTML الأصلي | CSS الأصلي |
|---|---------|-------------|-------------|
| 1 | البانر العلوي (Header) | `index.html` سطر 615-628 | `css/style.css` سطر 1932-2004 + 5336-5354 + 5568-5572 |
| 2 | منطقة الرسائل (الحاوية) | `index.html` سطر 662-664 | `css/style.css` سطر 2006-2020 + 2437-2438 + 5615-5618 |
| 3 | فقاعة الرسالة | تُبنى ديناميكياً بدالة `appendChatMsg` — `index.html` سطر 5164-5366 | `css/style.css` سطر 2037-2129 + 2390-2403 + 2648 + 2854-2890 |
| 4 | فاصل التاريخ | يُبنى داخل نفس دالة `appendChatMsg` — `index.html` سطر 5180-5186 | `css/style.css` سطر 2022-2035 + 5502-5507 |
| 5 | شريط الكتابة السفلي | `index.html` سطر 695-701 | `css/style.css` سطر 2978-3045 + 5360-5377 + 5573-5577 |
| 6 | خلفية الشات | `.chat-main` — `index.html` سطر 613 | `css/style.css` سطر 28 + 1908-1930 + 2407-2409 + 5611-5613 |

## محتوى كل مجلد

```
chat-ui-split/
├── 01-header/                 header.html, header.css
├── 02-messages-container/      messages-container.html, messages-container.css
├── 03-message-bubble/          message-bubble.html (مثال ثابت)
│                                message-bubble.css
│                                message-bubble-render.reference.js (مرجعي فقط)
├── 04-date-divider/            date-divider.html (مثال ثابت), date-divider.css
├── 05-input-bar/                input-bar.html, input-bar.css
└── 06-chat-background/          chat-background.css
```

## ملاحظات مهمة

- **فقاعة الرسالة وفاصل التاريخ** غير موجودين كـ HTML ثابت في المشروع أصلاً —
  هما يُبنيان ديناميكياً داخل JavaScript (دالة `appendChatMsg`). لذلك ملفاتهما
  HTML هنا هي "نتيجة" تنفيذ تلك الدالة (Snapshot ثابت) لتوضيح الشكل فقط،
  وملف `message-bubble-render.reference.js` هو **نسخة مرجعية للقراءة فقط**
  من الدالة الأصلية — الدالة الحقيقية باقية في `index.html` متصلة بكل شيء
  (Firestore listeners، الرد، التوجيه، التفاعلات، أزرار الأدمن...).
- بعض قواعد CSS مكرّرة عمداً (مرة كقاعدة أساسية ومرة كطبقة "Glass" إضافية
  لاحقة في نفس الملف بنفس القيم) لأن هذا هو الترتيب الفعلي في `style.css`
  الذي ينتج الشكل الظاهر في الصورة. تم نسخهما معاً في كل ملف حتى لا يضيع
  أي جزء من المظهر الحالي عند الاستبدال لاحقاً.
- لم تُلمس: Firebase، Firestore، أي `onSnapshot`/listeners، أو أي دالة منطق
  (poll.js، dm-extras.js، chat-search.js...الخ).
- المرحلة القادمة (عندما تكون جاهزًا): استبدال كل ملف من هذه بتصميم جديد،
  ثم ربطه بمكان استدعائه الأصلي في `index.html` بنفس الـ `id`/`class` حتى
  لا ينكسر أي JS متصل بها.
