# نشر ميزان على Vercel وRender مع Resend

الحالة: تجهيز الكود، وليس نشرًا مكتملًا. اختار المالك هذه الخدمات في 12 نوفمبر 2026.

## مسار الطلب

المتصفح يفتح واجهة Vercel ويطلب /api على النطاق نفسه. يحول Vercel الطلب إلى Render. APP_ORIGIN يبقى عنوان الواجهة النهائي، وBACKEND_ORIGIN عنوان Render. لا تضع مفاتيح الخدمات أو روابط قاعدة البيانات في Vercel أو متغيرات VITE_. لا يُستخدم CORS مفتوح أو الثقة العمياء برؤوس forwarded.

## Render

القالب deploy/render.yaml.example يحدد rootDir=backend وNode 24 وAPI_ONLY=1 وhealthCheckPath=/readyz. النشر التلقائي متوقف في القالب. لا ينفذ القالب ترحيلات قاعدة البيانات أو يغير كلمات مرورها. اضبط الأسرار في لوحة Render فقط. حافظ على SOURCE_ENCRYPTION_KEY الأصلي لفك تشفير المصادر السابقة.

APP_ORIGIN هو عنوان Vercel الفعلي دون شرطة نهائية، وBACKEND_ORIGIN عنوان Render الفعلي. يسـمح الخادم بهذين المضيفين فقط، وتظل الكتابة بحاجة إلى Origin مطابق للواجهة. فحوص /readyz تقيس اتصال قواعد البيانات ولا تثبت سلامة البريد أو محلل الملفات.

القالب غير صالح لإطلاق الاستخدام الحقيقي وحده: runIsolatedPreview يحتاج Docker daemon وصورة محلية مثبتة. تشغيل خدمة Docker على Render لا يثبت توفر Docker داخل الحاوية. لم نتحقق من هذا الدعم، ولم نستبدل العزل بتشغيل محلل داخل عملية API. يلزم حل بيئة المعالجة المعزولة وفاحص ClamAV وعامل scan-worker قبل قبول رفع الملفات. لا تملأ IMPORT_PREVIEW_IMAGE بقيمة وهمية لتجاوز التحقق.

## Vercel

اختر Root Directory = front، وإطار Vite، وأمر البناء npm run build، ومجلد dist، وNode 24. بعد الحصول على عنوان Render الحقيقي نفذ من جذر المشروع:

    node deploy/configure-vercel.mjs https://YOUR-SERVICE.onrender.com

استبدل العنوان بعنوان الخدمة الفعلي. يولد الأمر front/vercel.json مع تحويل /api قبل مسارات SPA ومنع تخزين ردود API مؤقتًا. ارفع الملف إلى main قبل نشر Vercel. لم يولد ملف يحمل وجهة مفترضة في هذه الدفعة.

بعد النشر يجب اختبار POST وOrigin وSet-Cookie ورابط تأكيد البريد واستعادة كلمة المرور وMFA عبر عنوان Vercel، وفحص عدم تخزين الردود المؤقت وعدم فقد Cookie. اختبارات الحدود المحلية ليست إثباتًا لسلوك الوكيل المستضاف. استخدم نطاق الواجهة الثابت، لا عناوين Preview المتغيرة.

## Resend

تكامل إرسال التأكيد وإعادة كلمة المرور موجود في backend/server/mail.mjs. أضف نطاقًا تملكه في Resend وانسخ سجلات DNS التي يولدها، ثم انتظر ظهور verified. ضع RESEND_API_KEY وMAIL_FROM في Render. عنوان MAIL_FROM يجب أن ينتمي إلى النطاق المتحقق منه. Resend يرسل البريد ولا يوفر تلقائيًا ملكية اسم نطاق للموقع. لا تستخدم نطاق vercel.app العام كأنه نطاق إرسال تملكه.

## عوائق ما زالت مفتوحة

- قرار استعادة بيانات فرع Neon السابق أو إنشاء فرع عمل جديد من production؛ لم يغير هذا الإعداد وجهة البيانات.
- الوصول لحسابي Vercel وRender وعناوين مشروعيهما الفعلية.
- اسم نطاق الإرسال ومفتاح Resend والتحقق من DNS.
- تشغيل محلل معزول وClamAV وعامل الفحص، ثم التخزين والاستعادة واختبارات القبول بحساب حقيقي.

المراجع: https://vercel.com/docs/routing/rewrites ، https://render.com/docs/blueprint-spec ، https://render.com/docs/docker ، https://resend.com/docs/dashboard/domains/introduction
