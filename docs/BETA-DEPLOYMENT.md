# نشر النسخة التجريبية — 10 نوفمبر 2026

الحالة: ملفات تشغيل جاهزة للمراجعة؛ لم تُثبت الخدمات ولم يُنشر موقع عام بعد. إعدادات الإنتاج غير مكتملة. لا يعني نجاح البناء نجاح قبول الإنتاج.

## الاستضافة المطلوبة

خادم Linux مع Node 24 وCaddy وشهادة HTTPS وDocker rootless تحت مستخدم الخدمة mizan. يحتاج محلل الملفات إلى تشغيل حاويات Docker معزولة، ولذلك لا تكفي استضافة واجهة ثابتة أو وظيفة serverless عادية. يلزم clamd خاص غير مكشوف للإنترنت مع تحديث التواقيع عبر freshclam. لا تمنح تطبيق الويب مقبس Docker بصلاحيات root. ثبّت سياق Docker الافتراضي لمستخدم الخدمة على محرك rootless وتحقق من حدود الذاكرة وCPU فعلياً.

## خطوات قابلة للتنفيذ على الخادم

1. ضع المستودع كاملاً في /opt/mizan، وأنشئ مستخدم خدمة mizan. تحقق من أن /usr/bin/node هو Node 24، أو عدّل ExecStart في وحدتي systemd.
2. نفّذ npm --prefix backend ci وnpm --prefix front ci ثم npm --prefix backend test وnpm --prefix front run build. لا تفعّل VITE_ENABLE_DEMO في بناء النسخة الحقيقية.
3. اختر فرع Neon الإنتاجي وتحقق من بياناته؛ لا تستخدم فرع التطوير الحالي codex-backend-completion لبيانات العملاء. طبّق الترحيلات وإعداد أدوار التشغيل في جلسة إدارية آمنة. أداة backend:setup الحالية تتطلب backend/.env.local مؤقتاً؛ احفظه بصلاحيات مقيدة ثم انقل قيم التشغيل إلى مدير الأسرار وأزل نسخة الإعداد من خادم التشغيل. لا تضع اتصال المالك داخل بيئة الويب.
4. ابنِ صورة المحلل من backend: docker build -f server/parser/Dockerfile -t mizan-preview:beta . ثم استخرج المعرف عبر docker image inspect --format '{{.Id}}' mizan-preview:beta. ضع المعرف sha256 في IMPORT_PREVIEW_IMAGE؛ يجب أن تكون الصورة متاحة لمستخدم خدمة الويب نفسه.
5. جهّز حاوية التخزين الخاصة financial-sources، ومفتاح التشفير ومفاتيح S3 الخاصة بفرع الإنتاج. احتفظ بنسخة آمنة من SOURCE_ENCRYPTION_KEY؛ تغييره دون إعادة تشفير يجعل الملفات القديمة غير قابلة للقراءة.
6. أنشئ /etc/mizan/web.env و/etc/mizan/scanner.env بصلاحيات 0600. ملفات النظام في deploy نماذج تُنسخ بعد ملء الإعدادات. يقرأ systemd الملفات؛ لا تضع القيم في المستودع. APP_PROFILE=production، وAPP_ORIGIN=https://النطاق-الفعلي، وPORT=5174. استخدم RESEND_API_KEY للإرسال فقط وMAIL_FROM من نطاق موثق.
7. بيئة scanner.env تتضمن SCANNER_DATABASE_URL وSOURCE_ENCRYPTION_KEY وإعدادات S3 وClamAV فقط؛ لا تتضمن اتصال المالك أو الهوية أو مفتاح المصادقة.
8. ثبّت وحدتي systemd واضبط MIZAN_DOMAIN لخدمة Caddy. استخدم ملف deploy/Caddyfile. حافظ على Host الأصلي. أغلق الوصول الخارجي للمنفذ 5174 وclamd وDocker، وافتح HTTPS وHTTP اللازم لإصدار الشهادة فقط.
9. شغّل beta:preflight في جلسة إدارية آمنة تحمل إعدادات الإنتاج. لا تزوّد عملية الويب باتصال المالك لتشغيل هذا الفحص. شغّل beta:smoke مع APP_ORIGIN العام بعد بدء الخدمات.
10. جهّز تنبيهاً لفشل /api/v1/health، ومراقبة عامل الفحص وتأخر المهام وتجديد الشهادة وفشل البريد. اختبر استعادة قاعدة البيانات والتخزين ومفتاح التشفير معاً قبل استقبال ملفات العملاء.

## متغيرات التشغيل

| الإعداد | مصدره | الاستخدام |
| --- | --- | --- |
| APP_DATABASE_URL | دور mizan_api_v1 على فرع الإنتاج | API مع RLS |
| AUTH_DATABASE_URL | دور mizan_identity_v1 | الهوية والجلسات |
| SCANNER_DATABASE_URL | دور mizan_scanner_v1 | عامل الفحص |
| BETTER_AUTH_SECRET | قيمة عشوائية آمنة 32 حرفاً على الأقل | أسرار المصادقة؛ لا تغيّرها عشوائياً بعد التشغيل |
| SOURCE_ENCRYPTION_KEY | 32 بايت عشوائية بصيغة hex | تشفير الملفات والحقول؛ نسخة احتياطية مشفرة لازمة |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY | Neon Object Storage | وصول خاص للتخزين |
| AWS_ENDPOINT_URL_S3 / AWS_REGION | مشروع وفرع التخزين | نقطة الوصول والمنطقة |
| RESEND_API_KEY / MAIL_FROM | حساب Resend ونطاق موثق | التحقق بالبريد والاستعادة |
| APP_ORIGIN / APP_DATA_REGION | النطاق HTTPS ومنطقة البيانات الفعلية | حماية المصدر وتحديد الإقامة |
| CLAMAV_HOST أو CLAMAV_SOCKET | خدمة clamd الخاصة | فحص الملفات مع تواقيع حديثة |
| CLAMAV_PORT | افتراضياً 3310 | منفذ داخلي فقط |
| IMPORT_PREVIEW_IMAGE | معرف صورة مبنية على نفس المضيف | تحليل CSV/XLSX المعزول |
| DATABASE_URL_UNPOOLED | حساب إداري فقط | الترحيلات وفحص بصماتها؛ ليس لعملية الويب |

## قبول بحسابات حقيقية

لا تنشئ الاختبارات التالية حسابات وهمية. ينفذ مالك المشروع ومراجع فعلي التسجيل ببريديهما:

- التسجيل ثم استلام رسالة التحقق، رفض الدخول قبل التحقق، ثم الدخول وMFA وحفظ رموز الاسترداد.
- استعادة كلمة المرور برسالة فعلية، رفض الرابط المستهلك/المنتهي، والتحقق من إلغاء الجلسات السابقة.
- إعداد مساحة ومنشأة وفترة ودعوة المراجع؛ لا يجوز للمعد اعتماد عمله.
- رفع ملف مالي حقيقي مصرح به، فحصه وتحليله واعتماده، ثم تصدير PDF/XLSX ومراجعة الأرقام.
- التحقق من منع الوصول بين حسابين ومساحتين باستخدام معرفات موارد حقيقية مخولة للاختبار.
- اختبار حجر ملف اختبار مكافحة الفيروسات في بيئة قبول معزولة، وفشل الفاحص وإعادة محاولة المهمة.

تبقى الفوترة والخصوصية التنفيذية والدعم وبقية شروط SRS غير المكتملة ظاهرة في plan.md وسجل المتطلبات؛ لا يحوّل هذا الدليل حالتها إلى مكتملة.

## Service probes and shutdown

Use GET /healthz for process liveness and GET /readyz for database connectivity readiness. The latter returns 200 only when both application and identity database roles answer SELECT 1; otherwise 503, including during shutdown. Responses contain no connection details and are not proxy-cacheable. Concurrent probes share one in-flight check, with a one-second result cache and four-second response deadline. This is not a migration, storage, scanner, mail, or end-to-end acceptance check. Keep those checks in the release preflight and real-account acceptance procedure.

SIGTERM/SIGINT withdraw readiness and close the listener, then wait for active HTTP responses before closing Vite and database pools. A 25-second deadline terminates a stalled stop with exit status 1, below the systemd 30-second stop timeout. Cleanup failure also exits 1. Deployment routing must stop sending new requests to the instance before termination; this code alone does not provide zero-downtime deployment.

Validation: backend/server/service-lifecycle.test.mjs covers missing/failed dependencies, concurrent probe coalescing, timeout, shutdown readiness, draining order, repeated signals and forced stop. A production stop/restore exercise remains pending.
