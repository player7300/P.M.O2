نسخه یکپارچه Personal Project Archive + Chat + Private Admin AI
===============================================================

قابلیت‌های اضافه‌شده:
- CHAT عمومی برای تمام حساب‌های واردشده
- Nickname و Profile image برای هر حساب
- بخش MY ACCOUNT برای ویرایش پروفایل
- گزینه ADMIN فقط برای administrator
- پنل PRIVATE AI فقط برای administrator
- محل ذخیره API Key در سمت سرور
- API Key هرگز در پاسخ API یا رابط کاربری برگردانده نمی‌شود
- رمزهای عبور با password_hash ذخیره می‌شوند
- چت و کاربران در data.json نگهداری می‌شوند
- پروژه‌های سایت اصلی حفظ شده‌اند

نصب:
1. index.html، api.php و .htaccess را روی هاست PHP آپلود کنید.
2. PHP و cURL روی هاست فعال باشد.
3. سایت را باز کنید.
4. حساب اولیه:
   username: admin
   password: admin123
5. بعد از ورود، از MY ACCOUNT پروفایل را تنظیم کنید.
6. فقط admin گزینه ADMIN را می‌بیند و می‌تواند API Key را ذخیره و AI را اجرا کند.

امنیت:
- مرورگر password hash کاربران را دریافت نمی‌کند.
- ورود و مجوزهای admin در PHP بررسی می‌شوند، نه با یک متغیر JavaScript.
- کاربران عادی نمی‌توانند save_key یا ai_chat را اجرا کنند.
- API Key در config_secret.json ذخیره می‌شود و .htaccess دسترسی مستقیم HTTP به آن را مسدود می‌کند.
- اگر هاست شما Nginx است و .htaccess را پشتیبانی نمی‌کند، config_secret.json را خارج از public web root قرار دهید و مسیر $configFile در api.php را به آن تغییر دهید.
- برای HTTPS از SSL استفاده کنید؛ session cookie در HTTPS با Secure فعال می‌شود.
- رمز پیش‌فرض admin را بعد از نصب تغییر دهید.

توجه:
API Key هنگام ذخیره از مرورگر به api.php ارسال می‌شود، چون خود صاحب کلید آن را وارد می‌کند. بعد از ذخیره، کلید در هیچ پاسخ یا صفحه‌ای نمایش داده نمی‌شود.


Multi-provider AI:
- OpenAI
- Google Gemini
- Anthropic Claude
- DeepSeek
- Groq
- Mistral AI
- xAI / Grok
- Cohere

The provider and model are stored server-side. The API key is never returned by the API.
The backend uses provider-specific request formats where required.
