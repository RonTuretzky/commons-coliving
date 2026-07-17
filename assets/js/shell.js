/* ============================================================
   Commons — shared page shell (navbar, footer, toasts, helpers)
   Usage: after store.js, call Shell.render('browse') with the
   active nav id. Pages provide <main> content themselves.
   ============================================================ */
(function () {
  /* ==================== i18n (English base + 10 languages; RTL for he/ar) ====================
     The engine lives here so every page (all load shell.js) gets the language
     switcher, translated chrome, and RTL with no per-page script tags. Pages
     translate static markup with data-i18n / data-i18n-html / data-i18n-attr;
     JS-rendered pages call Shell.t(key). Missing keys fall back to English. */
  const MESSAGES = {
    en: {
      "nav.myhouse": "My House", "nav.ledger": "Ledger", "nav.chores": "Chores",
      "nav.meals": "Meals", "nav.systems": "Systems", "nav.browse": "Browse",
      "nav.gatherings": "Gatherings", "nav.calculators": "Calculators", "nav.quiz": "Quiz",
      "btn.signin": "Sign in", "btn.createAccount": "Create account",
      "btn.startHouse": "Start a house", "btn.checkin": "Check-in", "lang.label": "Language",
      "footer.tagline": "Imagining a post-capitalist world in the heart of NYC. Find your people. Share a home.",
      "footer.solidarityApps": "Solidarity apps", "footer.mutualAid": "Mutual Aid — give without giving",
      "footer.meetups": "Meetups — gather in the park", "footer.coliveFind": "colive.fun — find your people",
      "footer.decentralpark": "Decentral Park", "footer.about": "About", "footer.newsletter": "Newsletter",
      "footer.github": "GitHub",
      "footer.legalLocal": "Hosted accounts — sign in from any device. Money rails run on Gnosis Chain.",
      "footer.legalLicense": "P2P license · Decentral Park",
      "home.hero.kicker": "A Decentral Park solidarity app",
      "home.hero.title": "Find your people.<br>Share a home.",
      "home.hero.lede": "Co-living with the hard parts handled. Match on values (and the dealbreakers you'd never say out loud), meet in real life, and run the house on systems that actually work — money, meals, chores — with calculators that do the math so nobody has to argue it.",
      "home.cta.getStarted": "Get started — it's free", "home.cta.browseFirst": "Browse homes first",
      "home.how.kicker": "How it works", "home.how.title": "From group chat to front door",
      "home.match.kicker": "Matching", "home.match.title": "Bands with reasons — and dealbreakers stay private",
      "home.match.cta": "Map yourself →", "home.money.kicker": "House money",
      "home.money.title": "A money system that works", "home.calc.kicker": "Calculators",
      "home.calc.title": "Do the math once. Argue never.",
      "home.calc.lede": "Every recurring house argument is secretly an arithmetic problem. These four solve them with sliders instead of sighs.",
      "home.calc.rent": "Rent splitter", "home.calc.sliding": "Sliding scale",
      "home.calc.chore": "Chore calculator", "home.calc.meal": "Meal calculator",
      "home.steward.kicker": "The steward", "home.steward.title": "A house manager that never sleeps on the couch",
      "home.longgame.kicker": "The long game", "home.longgame.title": "Built for year five, not week one",
      "home.family.kicker": "The family", "home.family.title": "Solidarity apps",
      "home.finalcta.title": "The group chat is already asking.<br>Give it a home.",
      "home.finalcta.lede": "Somebody you know is drafting the 'hey, starting a house…' message right now.",
      "home.finalcta.start": "Start a house", "home.finalcta.find": "Find a gathering",
      "home.step.match": "Match", "home.step.meet": "Meet", "home.step.gather": "Gather",
      "home.step.form": "Form", "home.step.run": "Run",
      "auth.kicker.register": "Create your account", "auth.kicker.signin": "Welcome back",
      "auth.title.register": "Pick a username, and you're in", "auth.title.signin": "Sign in",
      "auth.lede.register": "Your account lives on colive.fun's servers — sign in from any device or browser and your world is there.",
      "auth.lede.signin": "One username and password. Works anywhere you open colive.fun.",
      "auth.username": "Username", "auth.password": "Password",
      "auth.username.ph": "lowercase, letters/numbers/._-", "auth.password.ph.register": "at least 8 characters",
      "auth.password.ph.signin": "your password", "auth.submit.register": "Create account",
      "auth.submit.signin": "Sign in", "auth.toggle.toSignin": "I already have an account",
      "auth.toggle.toRegister": "Create a new account", "auth.err.missing": "Username and password, please.",
      "auth.toast.created": "Account created — welcome", "auth.toast.welcome": "Welcome back",
      "profile.displayName": "Display name", "profile.displayName.ph": "The name housemates will see",
      "profile.homeBase": "Home base", "profile.budget": "Monthly budget",
      "profile.oneliner": "One-liner (optional)", "profile.email": "Contact email (optional)",
      "profile.socials": "Socials (optional)", "profile.lookingFor": "Looking for",
      "profile.seeking.room": "A room in a house", "profile.seeking.founding": "Founding a new house",
      "profile.seeking.hasHouse": "Settled — I have a house", "profile.discovery": "Discovery",
      "profile.listMe": "List me in the public directory", "profile.addPhoto": "Add a photo",
      "profile.changePhoto": "Change photo", "profile.save": "Save changes",
    },
    es: {"nav.myhouse":"Mi casa","nav.ledger":"Cuentas","nav.chores":"Tareas","nav.meals":"Comidas","nav.systems":"Sistemas","nav.browse":"Explorar","nav.gatherings":"Encuentros","nav.calculators":"Calculadoras","nav.quiz":"Test","btn.signin":"Iniciar sesión","btn.createAccount":"Crear cuenta","btn.startHouse":"Crear una casa","btn.checkin":"Check-in","lang.label":"Idioma","footer.tagline":"Imaginando un mundo poscapitalista en el corazón de NYC. Encuentra a tu gente. Comparte un hogar.","footer.solidarityApps":"Apps solidarias","footer.mutualAid":"Mutual Aid — dar sin dar","footer.meetups":"Meetups — reunirse en el parque","footer.coliveFind":"colive.fun — encuentra a tu gente","footer.decentralpark":"Decentral Park","footer.about":"Acerca de","footer.newsletter":"Boletín","footer.github":"GitHub","footer.legalLocal":"Cuentas alojadas — inicia sesión desde cualquier dispositivo. Los rieles de dinero funcionan en Gnosis Chain.","footer.legalLicense":"Licencia P2P · Decentral Park","home.hero.kicker":"Una app solidaria de Decentral Park","home.hero.title":"Encuentra a tu gente.<br>Comparte un hogar.","home.hero.lede":"Vivir en comunidad con lo difícil ya resuelto. Conecta por valores (y por esas cosas que nunca dirías en voz alta), conócete en persona y lleva la casa con sistemas que de verdad funcionan — dinero, comidas, tareas — con calculadoras que hacen las cuentas para que nadie tenga que discutirlas.","home.cta.getStarted":"Comienza — es gratis","home.cta.browseFirst":"Primero explora hogares","home.how.kicker":"Cómo funciona","home.how.title":"Del chat grupal a la puerta de casa","home.match.kicker":"Conexiones","home.match.title":"Afinidades con motivos — y los límites quedan en privado","home.match.cta":"Ubícate en el mapa →","home.money.kicker":"Dinero de la casa","home.money.title":"Un sistema de dinero que funciona","home.calc.kicker":"Calculadoras","home.calc.title":"Haz las cuentas una vez. No discutas nunca.","home.calc.lede":"Toda discusión recurrente de la casa esconde un problema de aritmética. Estas cuatro los resuelven con controles deslizantes en vez de suspiros.","home.calc.rent":"Divisor de renta","home.calc.sliding":"Escala móvil","home.calc.chore":"Calculadora de tareas","home.calc.meal":"Calculadora de comidas","home.steward.kicker":"El administrador","home.steward.title":"Un encargado de la casa que nunca se queda dormido en el sofá","home.longgame.kicker":"El largo plazo","home.longgame.title":"Hecho para el quinto año, no para la primera semana","home.family.kicker":"La familia","home.family.title":"Apps solidarias","home.finalcta.title":"El chat grupal ya lo está pidiendo.<br>Dale un hogar.","home.finalcta.lede":"Alguien que conoces está escribiendo justo ahora el mensaje de 'oye, estoy armando una casa…'.","home.finalcta.start":"Crear una casa","home.finalcta.find":"Busca un encuentro","home.step.match":"Conectar","home.step.meet":"Conocerse","home.step.gather":"Reunirse","home.step.form":"Formar","home.step.run":"Gestionar","auth.kicker.register":"Crea tu cuenta","auth.kicker.signin":"Qué bueno verte de nuevo","auth.title.register":"Elige un nombre de usuario y ya estás dentro","auth.title.signin":"Iniciar sesión","auth.lede.register":"Tu cuenta vive en los servidores de colive.fun — inicia sesión desde cualquier dispositivo o navegador y tu mundo estará ahí.","auth.lede.signin":"Un nombre de usuario y una contraseña. Funciona en cualquier lugar donde abras colive.fun.","auth.username":"Nombre de usuario","auth.password":"Contraseña","auth.username.ph":"minúsculas, letras/números/._-","auth.password.ph.register":"al menos 8 caracteres","auth.password.ph.signin":"tu contraseña","auth.submit.register":"Crear cuenta","auth.submit.signin":"Iniciar sesión","auth.toggle.toSignin":"Ya tengo una cuenta","auth.toggle.toRegister":"Crear una cuenta nueva","auth.err.missing":"Nombre de usuario y contraseña, por favor.","auth.toast.created":"Cuenta creada — te damos la bienvenida","auth.toast.welcome":"Qué bueno verte de nuevo","profile.displayName":"Nombre visible","profile.displayName.ph":"El nombre que verán tus compañeros de casa","profile.homeBase":"Zona base","profile.budget":"Presupuesto mensual","profile.oneliner":"Una frase (opcional)","profile.email":"Correo de contacto (opcional)","profile.socials":"Redes sociales (opcional)","profile.lookingFor":"Qué buscas","profile.seeking.room":"Una habitación en una casa","profile.seeking.founding":"Fundar una casa nueva","profile.seeking.hasHouse":"Con casa — ya tengo un hogar","profile.discovery":"Visibilidad","profile.listMe":"Inclúyeme en el directorio público","profile.addPhoto":"Agregar una foto","profile.changePhoto":"Cambiar foto","profile.save":"Guardar cambios"},
    zh: {"nav.myhouse":"我的家","nav.ledger":"账本","nav.chores":"家务","nav.meals":"吃饭","nav.systems":"系统","nav.browse":"浏览","nav.gatherings":"聚会","nav.calculators":"计算器","nav.quiz":"测一测","btn.signin":"登录","btn.createAccount":"注册","btn.startHouse":"发起一个家","btn.checkin":"签到","lang.label":"语言","footer.tagline":"在 NYC 的中心，想象一个后资本主义的世界。找到你的人，共享一个家。","footer.solidarityApps":"互助小工具","footer.mutualAid":"Mutual Aid — 付出，不求回报","footer.meetups":"Meetups — 在公园里相聚","footer.coliveFind":"colive.fun — 找到你的人","footer.decentralpark":"Decentral Park","footer.about":"关于我们","footer.newsletter":"订阅通讯","footer.github":"GitHub","footer.legalLocal":"账号托管在云端 — 任何设备都能登录。资金通道跑在 Gnosis Chain 上。","footer.legalLicense":"P2P 许可 · Decentral Park","home.hero.kicker":"一款 Decentral Park 互助应用","home.hero.title":"找到你的人。<br>共享一个家。","home.hero.lede":"共居生活，难搞的部分都替你搞定了。按价值观匹配（还有那些你从没说出口的底线），在现实中见面，再用真正好用的系统把这个家运转起来 — 钱、饭、家务 — 计算器帮你把账算清楚，谁都不用再争。","home.cta.getStarted":"开始吧 — 免费","home.cta.browseFirst":"先看看有哪些家","home.how.kicker":"运作方式","home.how.title":"从群聊到家门口","home.match.kicker":"匹配","home.match.title":"分档有依据 — 底线始终保密","home.match.cta":"给自己定位 →","home.money.kicker":"家里的钱","home.money.title":"一套真正好用的记账系统","home.calc.kicker":"计算器","home.calc.title":"账算一次，从此不吵。","home.calc.lede":"家里每一场反复上演的争吵，其实都是一道算术题。这四个计算器用滑块代替叹气，把它们一一解决。","home.calc.rent":"房租分摊","home.calc.sliding":"浮动分摊","home.calc.chore":"家务计算器","home.calc.meal":"吃饭计算器","home.steward.kicker":"管家","home.steward.title":"一个从不赖在沙发上的管家","home.longgame.kicker":"长久打算","home.longgame.title":"为第五年而建，而非第一周","home.family.kicker":"这一家子","home.family.title":"互助小工具","home.finalcta.title":"群聊里已经有人在问了。<br>给它一个家。","home.finalcta.lede":"你认识的某个人，此刻正在憋那条「嘿，想组个家……」的消息。","home.finalcta.start":"发起一个家","home.finalcta.find":"找一场聚会","home.step.match":"匹配","home.step.meet":"见面","home.step.gather":"相聚","home.step.form":"组建","home.step.run":"运转","auth.kicker.register":"创建你的账号","auth.kicker.signin":"欢迎回来","auth.title.register":"取个用户名，就进来了","auth.title.signin":"登录","auth.lede.register":"你的账号存在 colive.fun 的服务器上 — 换任何设备或浏览器登录，你的世界都在。","auth.lede.signin":"一个用户名加一个密码。在哪儿打开 colive.fun 都好用。","auth.username":"用户名","auth.password":"密码","auth.username.ph":"小写，字母/数字/._-","auth.password.ph.register":"至少 8 个字符","auth.password.ph.signin":"你的密码","auth.submit.register":"注册","auth.submit.signin":"登录","auth.toggle.toSignin":"我已经有账号了","auth.toggle.toRegister":"注册一个新账号","auth.err.missing":"请填写用户名和密码。","auth.toast.created":"账号创建成功 — 欢迎","auth.toast.welcome":"欢迎回来","profile.displayName":"昵称","profile.displayName.ph":"室友们会看到的名字","profile.homeBase":"常住地","profile.budget":"每月预算","profile.oneliner":"一句话介绍（选填）","profile.email":"联系邮箱（选填）","profile.socials":"社交账号（选填）","profile.lookingFor":"我在找","profile.seeking.room":"一个家里的房间","profile.seeking.founding":"发起一个新的家","profile.seeking.hasHouse":"已安顿 — 我有家了","profile.discovery":"公开展示","profile.listMe":"把我列进公开名录","profile.addPhoto":"添加照片","profile.changePhoto":"更换照片","profile.save":"保存修改"},
    he: {"nav.myhouse":"הבית שלי","nav.ledger":"חשבונות","nav.chores":"מטלות","nav.meals":"ארוחות","nav.systems":"מערכות","nav.browse":"עיון","nav.gatherings":"מפגשים","nav.calculators":"מחשבונים","nav.quiz":"שאלון","btn.signin":"התחברות","btn.createAccount":"פתיחת חשבון","btn.startHouse":"פתיחת בית","btn.checkin":"צ'ק-אין","lang.label":"שפה","footer.tagline":"מדמיינים עולם פוסט-קפיטליסטי בלב NYC. מצאו את האנשים שלכם. חלקו בית.","footer.solidarityApps":"אפליקציות סולידריות","footer.mutualAid":"Mutual Aid — לתת בלי לתת","footer.meetups":"Meetups — נפגשים בפארק","footer.coliveFind":"colive.fun — מצאו את האנשים שלכם","footer.decentralpark":"Decentral Park","footer.about":"אודות","footer.newsletter":"ניוזלטר","footer.github":"GitHub","footer.legalLocal":"חשבונות מאוחסנים — התחברו מכל מכשיר. מסלולי הכסף רצים על Gnosis Chain.","footer.legalLicense":"רישיון P2P · Decentral Park","home.hero.kicker":"אפליקציית סולידריות של Decentral Park","home.hero.title":"מצאו את האנשים שלכם.<br>חלקו בית.","home.hero.lede":"מגורים משותפים עם החלקים הקשים מסודרים. התאמה לפי ערכים (וגם קווים אדומים שלא הייתם אומרים בקול), נפגשים במציאות, ומנהלים את הבית עם מערכות שבאמת עובדות — כסף, ארוחות, מטלות — עם מחשבונים שעושים את החשבון כדי שאף אחד לא יצטרך להתווכח עליו.","home.cta.getStarted":"מתחילים — בחינם","home.cta.browseFirst":"קודם מעיינים בבתים","home.how.kicker":"איך זה עובד","home.how.title":"מהצ'אט הקבוצתי ועד דלת הבית","home.match.kicker":"התאמה","home.match.title":"טווחים עם סיבות — והקווים האדומים נשארים פרטיים","home.match.cta":"מַפּוּ את עצמכם →","home.money.kicker":"כסף של הבית","home.money.title":"מערכת כספית שעובדת","home.calc.kicker":"מחשבונים","home.calc.title":"עשו את החשבון פעם אחת. אל תתווכחו לעולם.","home.calc.lede":"כל ויכוח חוזר בבית הוא בעצם בעיה חשבונית מוסווית. ארבעת אלה פותרים אותה עם סליידרים במקום אנחות.","home.calc.rent":"מחלק שכר דירה","home.calc.sliding":"תשלום מדורג","home.calc.chore":"מחשבון מטלות","home.calc.meal":"מחשבון ארוחות","home.steward.kicker":"האחראי","home.steward.title":"מנהל בית שאף פעם לא נרדם על הספה","home.longgame.kicker":"למרחק ארוך","home.longgame.title":"בנוי לשנה החמישית, לא לשבוע הראשון","home.family.kicker":"המשפחה","home.family.title":"אפליקציות סולידריות","home.finalcta.title":"הצ'אט הקבוצתי כבר שואל.<br>תנו לו בית.","home.finalcta.lede":"מישהו שאתם מכירים מנסח ממש עכשיו את ההודעה 'היי, פותחים בית…'.","home.finalcta.start":"פתיחת בית","home.finalcta.find":"מציאת מפגש","home.step.match":"התאמה","home.step.meet":"פגישה","home.step.gather":"התכנסות","home.step.form":"הקמה","home.step.run":"ניהול","auth.kicker.register":"פתיחת חשבון","auth.kicker.signin":"טוב לראותכם שוב","auth.title.register":"בחרו שם משתמש, ואתם בפנים","auth.title.signin":"התחברות","auth.lede.register":"החשבון שלכם חי על השרתים של colive.fun — התחברו מכל מכשיר או דפדפן והעולם שלכם שם.","auth.lede.signin":"שם משתמש וסיסמה אחת. עובד בכל מקום שבו תפתחו את colive.fun.","auth.username":"שם משתמש","auth.password":"סיסמה","auth.username.ph":"אותיות קטנות, מספרים/._-","auth.password.ph.register":"לפחות 8 תווים","auth.password.ph.signin":"הסיסמה שלכם","auth.submit.register":"פתיחת חשבון","auth.submit.signin":"התחברות","auth.toggle.toSignin":"כבר יש לי חשבון","auth.toggle.toRegister":"פתיחת חשבון חדש","auth.err.missing":"שם משתמש וסיסמה, בבקשה.","auth.toast.created":"החשבון נוצר — ברוכים הבאים","auth.toast.welcome":"טוב לראותכם שוב","profile.displayName":"שם תצוגה","profile.displayName.ph":"השם שהשותפים לבית יראו","profile.homeBase":"אזור מגורים","profile.budget":"תקציב חודשי","profile.oneliner":"משפט על עצמכם (רשות)","profile.email":"אימייל ליצירת קשר (רשות)","profile.socials":"רשתות חברתיות (רשות)","profile.lookingFor":"מחפשים","profile.seeking.room":"חדר בבית","profile.seeking.founding":"הקמת בית חדש","profile.seeking.hasHouse":"מסודרים — יש לי בית","profile.discovery":"נראות","profile.listMe":"הציגו אותי במדריך הציבורי","profile.addPhoto":"הוספת תמונה","profile.changePhoto":"החלפת תמונה","profile.save":"שמירת שינויים"},
    ar: {"nav.myhouse":"بيتي","nav.ledger":"الدفتر","nav.chores":"المهام","nav.meals":"الوجبات","nav.systems":"الأنظمة","nav.browse":"تصفّح","nav.gatherings":"اللقاءات","nav.calculators":"الحاسبات","nav.quiz":"الاختبار","btn.signin":"تسجيل الدخول","btn.createAccount":"إنشاء حساب","btn.startHouse":"ابدأ بيتاً","btn.checkin":"تسجيل الحضور","lang.label":"اللغة","footer.tagline":"نتخيّل عالماً ما بعد الرأسمالية في قلب NYC. اعثر على رفاقك. وشاركوهم بيتاً واحداً.","footer.solidarityApps":"تطبيقات التضامن","footer.mutualAid":"Mutual Aid — العطاء دون مقابل","footer.meetups":"Meetups — نجتمع في الحديقة","footer.coliveFind":"colive.fun — اعثر على رفاقك","footer.decentralpark":"Decentral Park","footer.about":"من نحن","footer.newsletter":"النشرة البريدية","footer.github":"GitHub","footer.legalLocal":"حسابات مستضافة — سجّل الدخول من أي جهاز. مسارات الأموال تعمل على Gnosis Chain.","footer.legalLicense":"رخصة P2P · Decentral Park","home.hero.kicker":"تطبيق تضامني من Decentral Park","home.hero.title":"اعثر على رفاقك.<br>وشاركوهم بيتاً واحداً.","home.hero.lede":"سكن مشترك مع تولّي الأجزاء الصعبة عنكم. توافقوا على القيم (وعلى الحدود التي لا يُقال عنها بصوت عالٍ)، والتقوا على أرض الواقع، وأديروا البيت بأنظمة تعمل فعلاً — المال، الوجبات، المهام — بحاسبات تتولّى الأرقام كي لا يضطرّ أحد للجدال حولها.","home.cta.getStarted":"ابدأ الآن — مجاناً","home.cta.browseFirst":"تصفّح البيوت أولاً","home.how.kicker":"كيف يعمل","home.how.title":"من محادثة المجموعة إلى باب البيت","home.match.kicker":"التوافق","home.match.title":"توافقات لها أسبابها — والحدود تبقى خاصة","home.match.cta":"حدّد ملامحك →","home.money.kicker":"مال البيت","home.money.title":"نظام مالي يعمل فعلاً","home.calc.kicker":"الحاسبات","home.calc.title":"احسبوا مرّة واحدة. ولا جدال بعدها أبداً.","home.calc.lede":"كل جدال متكرّر في البيت هو في حقيقته مسألة حسابية مخفية. هذه الأربع تحلّها بمنزلقات بدل التنهّدات.","home.calc.rent":"مقسّم الإيجار","home.calc.sliding":"المقياس المتدرّج","home.calc.chore":"حاسبة المهام","home.calc.meal":"حاسبة الوجبات","home.steward.kicker":"القيّم","home.steward.title":"مدير بيت لا ينام على الأريكة أبداً","home.longgame.kicker":"المدى البعيد","home.longgame.title":"مبنيّ للعام الخامس، لا للأسبوع الأول","home.family.kicker":"العائلة","home.family.title":"تطبيقات التضامن","home.finalcta.title":"محادثة المجموعة تسأل عنه أصلاً.<br>امنحه بيتاً.","home.finalcta.lede":"أحد معارفك يكتب الآن رسالة 'مرحباً، نبدأ بيتاً…' في هذه اللحظة.","home.finalcta.start":"ابدأ بيتاً","home.finalcta.find":"اعثر على لقاء","home.step.match":"توافق","home.step.meet":"لقاء","home.step.gather":"تجمّع","home.step.form":"تكوين","home.step.run":"إدارة","auth.kicker.register":"أنشئ حسابك","auth.kicker.signin":"أهلاً بعودتك","auth.title.register":"اختر اسم مستخدم، وتكون قد دخلت","auth.title.signin":"تسجيل الدخول","auth.lede.register":"حسابك يعيش على خوادم colive.fun — سجّل الدخول من أي جهاز أو متصفح ويكون عالمك حاضراً معك.","auth.lede.signin":"اسم مستخدم وكلمة مرور واحدة. تعمل أينما فتحت colive.fun.","auth.username":"اسم المستخدم","auth.password":"كلمة المرور","auth.username.ph":"حروف صغيرة، أحرف/أرقام/._-","auth.password.ph.register":"٨ أحرف على الأقل","auth.password.ph.signin":"كلمة مرورك","auth.submit.register":"إنشاء حساب","auth.submit.signin":"تسجيل الدخول","auth.toggle.toSignin":"لديّ حساب بالفعل","auth.toggle.toRegister":"إنشاء حساب جديد","auth.err.missing":"اسم المستخدم وكلمة المرور، من فضلك.","auth.toast.created":"تم إنشاء الحساب — أهلاً بك","auth.toast.welcome":"أهلاً بعودتك","profile.displayName":"الاسم المعروض","profile.displayName.ph":"الاسم الذي سيراه رفاق السكن","profile.homeBase":"مقر الإقامة","profile.budget":"الميزانية الشهرية","profile.oneliner":"وصف بسطر واحد (اختياري)","profile.email":"بريد التواصل (اختياري)","profile.socials":"حسابات التواصل (اختياري)","profile.lookingFor":"أبحث عن","profile.seeking.room":"غرفة في بيت","profile.seeking.founding":"تأسيس بيت جديد","profile.seeking.hasHouse":"مستقر — لديّ بيت","profile.discovery":"الاكتشاف","profile.listMe":"أدرجني في الدليل العام","profile.addPhoto":"أضف صورة","profile.changePhoto":"غيّر الصورة","profile.save":"حفظ التغييرات"},
    ru: {"nav.myhouse":"Мой дом","nav.ledger":"Расходы","nav.chores":"Дела","nav.meals":"Еда","nav.systems":"Системы","nav.browse":"Обзор","nav.gatherings":"Встречи","nav.calculators":"Калькуляторы","nav.quiz":"Тест","btn.signin":"Войти","btn.createAccount":"Создать аккаунт","btn.startHouse":"Открыть дом","btn.checkin":"Отметиться","lang.label":"Язык","footer.tagline":"Придумываем посткапиталистический мир в самом сердце NYC. Найди своих людей. Живи с ними под одной крышей.","footer.solidarityApps":"Приложения солидарности","footer.mutualAid":"Mutual Aid — отдавай, ничего не теряя","footer.meetups":"Meetups — собираемся в парке","footer.coliveFind":"colive.fun — найди своих людей","footer.decentralpark":"Decentral Park","footer.about":"О проекте","footer.newsletter":"Рассылка","footer.github":"GitHub","footer.legalLocal":"Аккаунты на сервере — заходи с любого устройства. Денежные рельсы работают на Gnosis Chain.","footer.legalLicense":"Лицензия P2P · Decentral Park","home.hero.kicker":"Приложение солидарности от Decentral Park","home.hero.title":"Найди своих людей.<br>Живите вместе.","home.hero.lede":"Совместная жизнь, где сложные моменты уже продуманы. Совпадайте по ценностям (и по тем табу, о которых вслух не говорят), знакомьтесь вживую и ведите дом на системах, которые реально работают — деньги, еда, дела — с калькуляторами, которые считают за вас, чтобы никому не приходилось спорить.","home.cta.getStarted":"Начать — это бесплатно","home.cta.browseFirst":"Сначала посмотреть дома","home.how.kicker":"Как это работает","home.how.title":"От общего чата до порога дома","home.match.kicker":"Подбор","home.match.title":"Совпадения с причинами — а личные табу остаются приватными","home.match.cta":"Отметить себя →","home.money.kicker":"Деньги дома","home.money.title":"Денежная система, которая работает","home.calc.kicker":"Калькуляторы","home.calc.title":"Посчитайте один раз. Не спорьте никогда.","home.calc.lede":"Каждый повторяющийся домашний спор — это на самом деле задачка по арифметике. Эти четыре решают их ползунками, а не вздохами.","home.calc.rent":"Калькулятор аренды","home.calc.sliding":"Скользящая шкала","home.calc.chore":"Калькулятор дел","home.calc.meal":"Калькулятор еды","home.steward.kicker":"Управляющий","home.steward.title":"Управляющий домом, который никогда не спит на диване","home.longgame.kicker":"На перспективу","home.longgame.title":"Сделано для пятого года, а не для первой недели","home.family.kicker":"Семья","home.family.title":"Приложения солидарности","home.finalcta.title":"Общий чат уже спрашивает.<br>Дайте ему дом.","home.finalcta.lede":"Кто-то из ваших знакомых прямо сейчас набирает то самое «эй, давайте заведём общий дом…».","home.finalcta.start":"Открыть дом","home.finalcta.find":"Найти встречу","home.step.match":"Совпасть","home.step.meet":"Встретиться","home.step.gather":"Собраться","home.step.form":"Создать","home.step.run":"Вести","auth.kicker.register":"Создайте свой аккаунт","auth.kicker.signin":"С возвращением","auth.title.register":"Выберите имя пользователя — и вы в деле","auth.title.signin":"Войти","auth.lede.register":"Ваш аккаунт живёт на серверах colive.fun — заходите с любого устройства или браузера, и весь ваш мир будет с вами.","auth.lede.signin":"Одно имя пользователя и пароль. Работает везде, где вы открываете colive.fun.","auth.username":"Имя пользователя","auth.password":"Пароль","auth.username.ph":"строчные буквы, цифры, ._-","auth.password.ph.register":"минимум 8 символов","auth.password.ph.signin":"ваш пароль","auth.submit.register":"Создать аккаунт","auth.submit.signin":"Войти","auth.toggle.toSignin":"У меня уже есть аккаунт","auth.toggle.toRegister":"Создать новый аккаунт","auth.err.missing":"Введите имя пользователя и пароль, пожалуйста.","auth.toast.created":"Аккаунт создан — добро пожаловать","auth.toast.welcome":"С возвращением","profile.displayName":"Отображаемое имя","profile.displayName.ph":"Имя, которое увидят соседи по дому","profile.homeBase":"Где живёте","profile.budget":"Бюджет в месяц","profile.oneliner":"Пара слов о себе (необязательно)","profile.email":"Контактный email (необязательно)","profile.socials":"Соцсети (необязательно)","profile.lookingFor":"Что ищете","profile.seeking.room":"Комнату в доме","profile.seeking.founding":"Основать новый дом","profile.seeking.hasHouse":"Всё сложилось — дом у меня уже есть","profile.discovery":"Видимость","profile.listMe":"Показывать меня в открытом каталоге","profile.addPhoto":"Добавить фото","profile.changePhoto":"Сменить фото","profile.save":"Сохранить изменения"},
    fr: {"nav.myhouse":"Ma maison","nav.ledger":"Comptes","nav.chores":"Tâches","nav.meals":"Repas","nav.systems":"Systèmes","nav.browse":"Explorer","nav.gatherings":"Rencontres","nav.calculators":"Calculateurs","nav.quiz":"Quiz","btn.signin":"Se connecter","btn.createAccount":"Créer un compte","btn.startHouse":"Créer une maison","btn.checkin":"Faire le point","lang.label":"Langue","footer.tagline":"Imaginer un monde post-capitaliste au cœur de NYC. Trouve tes gens. Partage un toit.","footer.solidarityApps":"Applis solidaires","footer.mutualAid":"Mutual Aid — donner sans compter","footer.meetups":"Meetups — se retrouver au parc","footer.coliveFind":"colive.fun — trouve tes gens","footer.decentralpark":"Decentral Park","footer.about":"À propos","footer.newsletter":"Newsletter","footer.github":"GitHub","footer.legalLocal":"Comptes hébergés — connecte-toi depuis n'importe quel appareil. Les flux d'argent passent par Gnosis Chain.","footer.legalLicense":"Licence P2P · Decentral Park","home.hero.kicker":"Une appli solidaire Decentral Park","home.hero.title":"Trouve tes gens.<br>Partage un toit.","home.hero.lede":"Vivre ensemble, sans les galères. On vous accorde sur vos valeurs (et sur les choses rédhibitoires qu'on n'ose jamais dire tout haut), vous vous rencontrez pour de vrai, puis vous faites tourner la maison avec des systèmes qui marchent vraiment — argent, repas, tâches — avec des calculateurs qui font les comptes pour que personne n'ait à se disputer.","home.cta.getStarted":"C'est parti — c'est gratuit","home.cta.browseFirst":"Voir d'abord les maisons","home.how.kicker":"Comment ça marche","home.how.title":"De la conversation de groupe à la porte d'entrée","home.match.kicker":"Mise en relation","home.match.title":"Des affinités qui ont du sens — et les points non négociables restent privés","home.match.cta":"Trouve ta place →","home.money.kicker":"L'argent de la maison","home.money.title":"Un système d'argent qui fonctionne","home.calc.kicker":"Calculateurs","home.calc.title":"Faites les comptes une fois. Ne vous disputez plus jamais.","home.calc.lede":"Chaque dispute récurrente de la maison cache en réalité un problème d'arithmétique. Ces quatre outils les règlent avec des curseurs plutôt que des soupirs.","home.calc.rent":"Partage du loyer","home.calc.sliding":"Barème progressif","home.calc.chore":"Calculateur de tâches","home.calc.meal":"Calculateur de repas","home.steward.kicker":"L'intendant","home.steward.title":"Un gestionnaire de maison qui ne dort jamais sur le canapé","home.longgame.kicker":"Sur la durée","home.longgame.title":"Pensé pour la cinquième année, pas la première semaine","home.family.kicker":"La famille","home.family.title":"Applis solidaires","home.finalcta.title":"La conversation de groupe le demande déjà.<br>Offre-lui un toit.","home.finalcta.lede":"Quelqu'un que tu connais est en train d'écrire le message « salut, on monte une maison… » en ce moment même.","home.finalcta.start":"Créer une maison","home.finalcta.find":"Trouver une rencontre","home.step.match":"Affinités","home.step.meet":"Rencontre","home.step.gather":"Rassemblement","home.step.form":"Constitution","home.step.run":"Gestion","auth.kicker.register":"Crée ton compte","auth.kicker.signin":"Content de te revoir","auth.title.register":"Choisis un nom d'utilisateur, et c'est parti","auth.title.signin":"Se connecter","auth.lede.register":"Ton compte vit sur les serveurs de colive.fun — connecte-toi depuis n'importe quel appareil ou navigateur et tout ton univers est là.","auth.lede.signin":"Un nom d'utilisateur et un mot de passe. Ça marche partout où tu ouvres colive.fun.","auth.username":"Nom d'utilisateur","auth.password":"Mot de passe","auth.username.ph":"minuscules, lettres/chiffres/._-","auth.password.ph.register":"au moins 8 caractères","auth.password.ph.signin":"ton mot de passe","auth.submit.register":"Créer un compte","auth.submit.signin":"Se connecter","auth.toggle.toSignin":"J'ai déjà un compte","auth.toggle.toRegister":"Créer un nouveau compte","auth.err.missing":"Un nom d'utilisateur et un mot de passe, s'il te plaît.","auth.toast.created":"Compte créé — bienvenue","auth.toast.welcome":"Content de te revoir","profile.displayName":"Nom affiché","profile.displayName.ph":"Le nom que verront tes colocs","profile.homeBase":"Point d'attache","profile.budget":"Budget mensuel","profile.oneliner":"Une phrase (facultatif)","profile.email":"E-mail de contact (facultatif)","profile.socials":"Réseaux sociaux (facultatif)","profile.lookingFor":"Je cherche","profile.seeking.room":"Une chambre dans une maison","profile.seeking.founding":"Fonder une nouvelle maison","profile.seeking.hasHouse":"Installé·e — j'ai une maison","profile.discovery":"Visibilité","profile.listMe":"M'inscrire dans l'annuaire public","profile.addPhoto":"Ajouter une photo","profile.changePhoto":"Changer la photo","profile.save":"Enregistrer les modifications"},
    ht: {"nav.myhouse":"Kay mwen","nav.ledger":"Kontablite","nav.chores":"Travay","nav.meals":"Manje","nav.systems":"Sistèm","nav.browse":"Gade","nav.gatherings":"Rasanbleman","nav.calculators":"Kalkilatè","nav.quiz":"Kiz","btn.signin":"Konekte","btn.createAccount":"Kreye yon kont","btn.startHouse":"Kòmanse yon kay","btn.checkin":"Anrejistre prezans","lang.label":"Lang","footer.tagline":"N ap imajine yon mond apre kapitalis nan kè NYC. Jwenn moun pa ou yo. Pataje yon kay.","footer.solidarityApps":"Aplikasyon solidarite","footer.mutualAid":"Mutual Aid — bay san w pa pèdi","footer.meetups":"Meetups — rasanble nan pak la","footer.coliveFind":"colive.fun — jwenn moun pa ou yo","footer.decentralpark":"Decentral Park","footer.about":"Konsènan","footer.newsletter":"Bilten","footer.github":"GitHub","footer.legalLocal":"Kont ki lojman sou sèvè — konekte depi nenpòt aparèy. Ray lajan an mache sou Gnosis Chain.","footer.legalLicense":"Lisans P2P · Decentral Park","home.hero.kicker":"Yon aplikasyon solidarite Decentral Park","home.hero.title":"Jwenn moun pa ou yo.<br>Pataje yon kay.","home.hero.lede":"Viv ansanm ak pati difisil yo deja regle. Matche sou valè (ak bagay ou pa ta janm di aloral men ou pa ka aksepte), rankontre nan lavi reyèl, epi jere kay la ak sistèm ki mache tout bon — lajan, manje, travay — ak kalkilatè ki fè kalkil la pou pèsonn pa bezwen diskite sou li.","home.cta.getStarted":"Kòmanse — li gratis","home.cta.browseFirst":"Gade kay yo dabò","home.how.kicker":"Kijan li mache","home.how.title":"Soti nan gwoup chat la rive nan pòt devan an","home.match.kicker":"Matche","home.match.title":"Gwoup ki gen rezon — epi bagay ou pa ka aksepte yo rete prive","home.match.cta":"Dekri tèt ou →","home.money.kicker":"Lajan kay la","home.money.title":"Yon sistèm lajan ki mache","home.calc.kicker":"Kalkilatè","home.calc.title":"Fè kalkil la yon sèl fwa. Pa janm diskite ankò.","home.calc.lede":"Chak diskisyon kay ki toujou repete an sekrè se yon pwoblèm aritmetik. Kat sa yo rezoud yo ak glisè olye soupi.","home.calc.rent":"Divizè lwaye","home.calc.sliding":"Echèl glisan","home.calc.chore":"Kalkilatè travay","home.calc.meal":"Kalkilatè manje","home.steward.kicker":"Gadyen an","home.steward.title":"Yon jeran kay ki pa janm dòmi sou kanape a","home.longgame.kicker":"Sou dire a","home.longgame.title":"Bati pou senkyèm ane a, pa premye semèn nan","home.family.kicker":"Fanmi an","home.family.title":"Aplikasyon solidarite","home.finalcta.title":"Gwoup chat la deja ap mande.<br>Ba li yon kay.","home.finalcta.lede":"Gen yon moun ou konnen k ap ekri mesaj 'ey, m ap kòmanse yon kay…' la kounye a menm.","home.finalcta.start":"Kòmanse yon kay","home.finalcta.find":"Jwenn yon rasanbleman","home.step.match":"Matche","home.step.meet":"Rankontre","home.step.gather":"Rasanble","home.step.form":"Fòme","home.step.run":"Jere","auth.kicker.register":"Kreye kont ou","auth.kicker.signin":"Byenveni ankò","auth.title.register":"Chwazi yon non itilizatè, epi ou anndan","auth.title.signin":"Konekte","auth.lede.register":"Kont ou an ap viv sou sèvè colive.fun — konekte depi nenpòt aparèy oswa navigatè epi mond ou an la.","auth.lede.signin":"Yon sèl non itilizatè ak yon modpas. Li mache tout kote ou louvri colive.fun.","auth.username":"Non itilizatè","auth.password":"Modpas","auth.username.ph":"lèt minuskil, lèt/chif/._-","auth.password.ph.register":"omwen 8 karaktè","auth.password.ph.signin":"modpas ou","auth.submit.register":"Kreye yon kont","auth.submit.signin":"Konekte","auth.toggle.toSignin":"Mwen deja gen yon kont","auth.toggle.toRegister":"Kreye yon nouvo kont","auth.err.missing":"Non itilizatè ak modpas, souple.","auth.toast.created":"Kont kreye — byenveni","auth.toast.welcome":"Byenveni ankò","profile.displayName":"Non pou montre","profile.displayName.ph":"Non moun k ap viv avè w yo pral wè","profile.homeBase":"Kote w baze","profile.budget":"Bidjè mansyèl","profile.oneliner":"Yon ti fraz (opsyonèl)","profile.email":"Imèl kontak (opsyonèl)","profile.socials":"Rezo sosyal (opsyonèl)","profile.lookingFor":"Sa w ap chèche","profile.seeking.room":"Yon chanm nan yon kay","profile.seeking.founding":"Fonde yon nouvo kay","profile.seeking.hasHouse":"Enstale — mwen gen yon kay","profile.discovery":"Dekouvèt","profile.listMe":"Mete m nan anyè piblik la","profile.addPhoto":"Ajoute yon foto","profile.changePhoto":"Chanje foto","profile.save":"Anrejistre chanjman yo"},
    bn: {"nav.myhouse":"আমার বাড়ি","nav.ledger":"হিসাব","nav.chores":"কাজকর্ম","nav.meals":"খাবার","nav.systems":"সিস্টেম","nav.browse":"ঘুরে দেখুন","nav.gatherings":"আড্ডা","nav.calculators":"ক্যালকুলেটর","nav.quiz":"কুইজ","btn.signin":"সাইন ইন","btn.createAccount":"অ্যাকাউন্ট খুলুন","btn.startHouse":"বাড়ি শুরু করুন","btn.checkin":"চেক-ইন","lang.label":"ভাষা","footer.tagline":"NYC-র হৃদয়ে একটি পুঁজিবাদ-পরবর্তী দুনিয়ার স্বপ্ন দেখা। আপনার মানুষদের খুঁজে নিন। একসাথে ঘর বাঁধুন।","footer.solidarityApps":"সংহতির অ্যাপ","footer.mutualAid":"Mutual Aid — বিনিময় ছাড়াই দেওয়া","footer.meetups":"Meetups — পার্কে একসাথে হোন","footer.coliveFind":"colive.fun — আপনার মানুষদের খুঁজে নিন","footer.decentralpark":"Decentral Park","footer.about":"আমাদের সম্পর্কে","footer.newsletter":"নিউজলেটার","footer.github":"GitHub","footer.legalLocal":"হোস্টেড অ্যাকাউন্ট — যেকোনো ডিভাইস থেকে সাইন ইন করুন। টাকার লেনদেন চলে Gnosis Chain-এ।","footer.legalLicense":"P2P লাইসেন্স · Decentral Park","home.hero.kicker":"একটি Decentral Park সংহতির অ্যাপ","home.hero.title":"আপনার মানুষদের খুঁজে নিন।<br>একসাথে ঘর বাঁধুন।","home.hero.lede":"কঠিন দিকগুলো সামলে একসাথে থাকা। মূল্যবোধ (আর যেসব শর্ত মুখে বলতে পারবেন না) মিলিয়ে নিন, বাস্তবে দেখা করুন, আর বাড়ি চালান এমন সিস্টেমে যা সত্যিই কাজ করে — টাকা, খাবার, কাজকর্ম — এমন ক্যালকুলেটর দিয়ে যা হিসাবটা করে দেয়, যাতে কাউকে তর্ক করতে না হয়।","home.cta.getStarted":"শুরু করুন — এটা বিনামূল্যে","home.cta.browseFirst":"আগে বাড়িগুলো ঘুরে দেখুন","home.how.kicker":"কীভাবে কাজ করে","home.how.title":"গ্রুপ চ্যাট থেকে সদর দরজা পর্যন্ত","home.match.kicker":"ম্যাচিং","home.match.title":"কারণসহ মিলের স্তর — আর গোপন শর্তগুলো গোপনই থাকে","home.match.cta":"নিজেকে ম্যাপ করুন →","home.money.kicker":"বাড়ির টাকা","home.money.title":"একটি টাকার সিস্টেম যা সত্যিই কাজ করে","home.calc.kicker":"ক্যালকুলেটর","home.calc.title":"হিসাবটা একবার করুন। আর কখনও তর্ক নয়।","home.calc.lede":"বাড়ির প্রতিটা বারবার হওয়া তর্ক আসলে গোপনে একটা অঙ্কের সমস্যা। এই চারটি সেগুলো দীর্ঘশ্বাসের বদলে স্লাইডার দিয়ে মেটায়।","home.calc.rent":"ভাড়া ভাগাভাগি","home.calc.sliding":"স্লাইডিং স্কেল","home.calc.chore":"কাজের ক্যালকুলেটর","home.calc.meal":"খাবারের ক্যালকুলেটর","home.steward.kicker":"স্টুয়ার্ড","home.steward.title":"এমন এক বাড়ি-ব্যবস্থাপক যে কখনও সোফায় ঘুমিয়ে পড়ে না","home.longgame.kicker":"দীর্ঘ পথ","home.longgame.title":"প্রথম সপ্তাহের জন্য নয়, পঞ্চম বছরের জন্য তৈরি","home.family.kicker":"পরিবার","home.family.title":"সংহতির অ্যাপ","home.finalcta.title":"গ্রুপ চ্যাট এখনই জিজ্ঞেস করছে।<br>ওকে একটা ঘর দিন।","home.finalcta.lede":"আপনার চেনা কেউ ঠিক এখনই 'এই যে, একটা বাড়ি শুরু করছি…' মেসেজটা লিখছে।","home.finalcta.start":"বাড়ি শুরু করুন","home.finalcta.find":"একটা আড্ডা খুঁজুন","home.step.match":"মিল","home.step.meet":"দেখা","home.step.gather":"জড়ো","home.step.form":"গড়া","home.step.run":"চালানো","auth.kicker.register":"আপনার অ্যাকাউন্ট খুলুন","auth.kicker.signin":"আবার স্বাগতম","auth.title.register":"একটা ইউজারনেম বেছে নিন, ব্যস হয়ে গেল","auth.title.signin":"সাইন ইন","auth.lede.register":"আপনার অ্যাকাউন্ট থাকে colive.fun-এর সার্ভারে — যেকোনো ডিভাইস বা ব্রাউজার থেকে সাইন ইন করুন, আপনার দুনিয়া সেখানেই থাকবে।","auth.lede.signin":"একটাই ইউজারনেম আর পাসওয়ার্ড। যেখানেই colive.fun খুলুন, কাজ করবে।","auth.username":"ইউজারনেম","auth.password":"পাসওয়ার্ড","auth.username.ph":"ছোট হাতের অক্ষর, সংখ্যা/._-","auth.password.ph.register":"অন্তত ৮টি অক্ষর","auth.password.ph.signin":"আপনার পাসওয়ার্ড","auth.submit.register":"অ্যাকাউন্ট খুলুন","auth.submit.signin":"সাইন ইন","auth.toggle.toSignin":"আমার আগে থেকেই অ্যাকাউন্ট আছে","auth.toggle.toRegister":"নতুন একটি অ্যাকাউন্ট খুলুন","auth.err.missing":"ইউজারনেম আর পাসওয়ার্ড দিন, দয়া করে।","auth.toast.created":"অ্যাকাউন্ট তৈরি হয়েছে — স্বাগতম","auth.toast.welcome":"আবার স্বাগতম","profile.displayName":"প্রদর্শিত নাম","profile.displayName.ph":"যে নাম বাড়ির সঙ্গীরা দেখবে","profile.homeBase":"বসবাসের এলাকা","profile.budget":"মাসিক বাজেট","profile.oneliner":"এক লাইনের পরিচয় (ঐচ্ছিক)","profile.email":"যোগাযোগের ইমেল (ঐচ্ছিক)","profile.socials":"সোশ্যাল মিডিয়া (ঐচ্ছিক)","profile.lookingFor":"যা খুঁজছেন","profile.seeking.room":"বাড়িতে একটা ঘর","profile.seeking.founding":"নতুন একটা বাড়ি গড়া","profile.seeking.hasHouse":"থিতু — আমার বাড়ি আছে","profile.discovery":"খুঁজে পাওয়া","profile.listMe":"পাবলিক ডিরেক্টরিতে আমাকে রাখুন","profile.addPhoto":"ছবি যোগ করুন","profile.changePhoto":"ছবি বদলান","profile.save":"পরিবর্তন সংরক্ষণ করুন"},
    ko: {"nav.myhouse":"우리 집","nav.ledger":"장부","nav.chores":"집안일","nav.meals":"식사","nav.systems":"시스템","nav.browse":"둘러보기","nav.gatherings":"모임","nav.calculators":"계산기","nav.quiz":"퀴즈","btn.signin":"로그인","btn.createAccount":"계정 만들기","btn.startHouse":"집 시작하기","btn.checkin":"체크인","lang.label":"언어","footer.tagline":"NYC 한복판에서 탈자본주의 세상을 그려봅니다. 당신의 사람들을 찾고, 함께 살아가요.","footer.solidarityApps":"연대 앱","footer.mutualAid":"Mutual Aid — 대가 없이 나누기","footer.meetups":"Meetups — 공원에서 모이기","footer.coliveFind":"colive.fun — 당신의 사람들을 찾기","footer.decentralpark":"Decentral Park","footer.about":"소개","footer.newsletter":"뉴스레터","footer.github":"GitHub","footer.legalLocal":"호스팅 계정 — 어떤 기기에서든 로그인하세요. 결제 레일은 Gnosis Chain에서 운영됩니다.","footer.legalLicense":"P2P 라이선스 · Decentral Park","home.hero.kicker":"Decentral Park 연대 앱","home.hero.title":"당신의 사람들을 찾으세요.<br>함께 살아가요.","home.hero.lede":"어려운 부분은 저희가 챙기는 공동생활. 가치관(그리고 차마 입 밖에 못 내는 절대 안 되는 조건)으로 매칭하고, 실제로 만나고, 진짜로 굴러가는 시스템으로 집을 운영하세요 — 돈, 식사, 집안일 — 계산기가 대신 계산해주니 아무도 다툴 필요가 없어요.","home.cta.getStarted":"시작하기 — 무료예요","home.cta.browseFirst":"먼저 집 둘러보기","home.how.kicker":"이용 방법","home.how.title":"단체 채팅방에서 현관문까지","home.match.kicker":"매칭","home.match.title":"이유가 있는 매칭 — 절대 안 되는 조건은 비공개로","home.match.cta":"나를 그려보기 →","home.money.kicker":"집 살림","home.money.title":"제대로 굴러가는 돈 시스템","home.calc.kicker":"계산기","home.calc.title":"계산은 한 번만. 다툼은 없이.","home.calc.lede":"집안에서 반복되는 모든 다툼은 사실 산수 문제예요. 이 네 가지가 한숨 대신 슬라이더로 해결해줍니다.","home.calc.rent":"월세 나누기","home.calc.sliding":"슬라이딩 스케일","home.calc.chore":"집안일 계산기","home.calc.meal":"식사 계산기","home.steward.kicker":"집 관리자","home.steward.title":"소파에서 잠들지 않는 집 관리자","home.longgame.kicker":"긴 안목","home.longgame.title":"첫 주가 아니라 5년 차를 위해 만들었어요","home.family.kicker":"우리 가족","home.family.title":"연대 앱","home.finalcta.title":"단체 채팅방이 이미 묻고 있어요.<br>거기에 보금자리를 주세요.","home.finalcta.lede":"당신이 아는 누군가는 지금 '야, 우리 집 하나 차리는데…' 메시지를 쓰고 있을 거예요.","home.finalcta.start":"집 시작하기","home.finalcta.find":"모임 찾기","home.step.match":"매칭","home.step.meet":"만남","home.step.gather":"모임","home.step.form":"결성","home.step.run":"운영","auth.kicker.register":"계정 만들기","auth.kicker.signin":"다시 만나서 반가워요","auth.title.register":"사용자 이름만 정하면 끝","auth.title.signin":"로그인","auth.lede.register":"당신의 계정은 colive.fun 서버에 저장돼요 — 어떤 기기나 브라우저에서 로그인해도 당신의 세계가 그대로 있어요.","auth.lede.signin":"사용자 이름과 비밀번호 하나면 돼요. colive.fun을 여는 곳이면 어디서든 작동해요.","auth.username":"사용자 이름","auth.password":"비밀번호","auth.username.ph":"소문자, 영문/숫자/._-","auth.password.ph.register":"최소 8자 이상","auth.password.ph.signin":"비밀번호","auth.submit.register":"계정 만들기","auth.submit.signin":"로그인","auth.toggle.toSignin":"이미 계정이 있어요","auth.toggle.toRegister":"새 계정 만들기","auth.err.missing":"사용자 이름과 비밀번호를 입력해 주세요.","auth.toast.created":"계정이 만들어졌어요 — 환영해요","auth.toast.welcome":"다시 만나서 반가워요","profile.displayName":"표시 이름","profile.displayName.ph":"하우스메이트들에게 보일 이름","profile.homeBase":"거주 지역","profile.budget":"월 예산","profile.oneliner":"한 줄 소개 (선택)","profile.email":"연락 이메일 (선택)","profile.socials":"소셜 계정 (선택)","profile.lookingFor":"찾는 것","profile.seeking.room":"함께 살 집의 방 하나","profile.seeking.founding":"새 집 만들기","profile.seeking.hasHouse":"정착 완료 — 이미 집이 있어요","profile.discovery":"공개 설정","profile.listMe":"공개 디렉터리에 나를 표시하기","profile.addPhoto":"사진 추가","profile.changePhoto":"사진 변경","profile.save":"변경사항 저장"},
    pl: {"nav.myhouse":"Mój dom","nav.ledger":"Rozliczenia","nav.chores":"Obowiązki","nav.meals":"Posiłki","nav.systems":"Systemy","nav.browse":"Przeglądaj","nav.gatherings":"Spotkania","nav.calculators":"Kalkulatory","nav.quiz":"Quiz","btn.signin":"Zaloguj się","btn.createAccount":"Załóż konto","btn.startHouse":"Załóż dom","btn.checkin":"Melduję się","lang.label":"Język","footer.tagline":"Wyobrażamy sobie postkapitalistyczny świat w sercu NYC. Znajdź swoich ludzi. Dzielcie wspólny dom.","footer.solidarityApps":"Aplikacje solidarnościowe","footer.mutualAid":"Mutual Aid — dawaj, nie oddając","footer.meetups":"Meetups — spotkajmy się w parku","footer.coliveFind":"colive.fun — znajdź swoich ludzi","footer.decentralpark":"Decentral Park","footer.about":"O nas","footer.newsletter":"Newsletter","footer.github":"GitHub","footer.legalLocal":"Konta hostowane — zaloguj się z dowolnego urządzenia. Przepływy pieniędzy działają na Gnosis Chain.","footer.legalLicense":"Licencja P2P · Decentral Park","home.hero.kicker":"Aplikacja solidarnościowa Decentral Park","home.hero.title":"Znajdź swoich ludzi.<br>Dzielcie wspólny dom.","home.hero.lede":"Wspólne mieszkanie z ogarniętymi trudnymi sprawami. Dobierajcie się według wartości (i tych granic, których nigdy nie powiedzielibyście na głos), spotkajcie się na żywo i prowadźcie dom w oparciu o systemy, które naprawdę działają — pieniądze, posiłki, obowiązki — z kalkulatorami, które liczą za was, żeby nikt nie musiał się o to spierać.","home.cta.getStarted":"Zacznij — za darmo","home.cta.browseFirst":"Najpierw przejrzyj domy","home.how.kicker":"Jak to działa","home.how.title":"Od czatu grupowego do własnych drzwi","home.match.kicker":"Dobieranie","home.match.title":"Dopasowania z uzasadnieniem — a granice zostają prywatne","home.match.cta":"Zaznacz się na mapie →","home.money.kicker":"Kasa domu","home.money.title":"System finansów, który działa","home.calc.kicker":"Kalkulatory","home.calc.title":"Policz raz. Nie kłóć się nigdy.","home.calc.lede":"Każda powracająca domowa kłótnia to w gruncie rzeczy zadanie z arytmetyki. Te cztery rozwiązują je suwakami zamiast westchnień.","home.calc.rent":"Podział czynszu","home.calc.sliding":"Skala ruchoma","home.calc.chore":"Kalkulator obowiązków","home.calc.meal":"Kalkulator posiłków","home.steward.kicker":"Opiekun","home.steward.title":"Zarządca domu, który nigdy nie zasypia na kanapie","home.longgame.kicker":"Długa gra","home.longgame.title":"Zbudowane na piąty rok, nie na pierwszy tydzień","home.family.kicker":"Rodzina","home.family.title":"Aplikacje solidarnościowe","home.finalcta.title":"Czat grupowy już o to pyta.<br>Daj mu dom.","home.finalcta.lede":"Ktoś, kogo znasz, właśnie pisze wiadomość „hej, zakładam dom…”.","home.finalcta.start":"Załóż dom","home.finalcta.find":"Znajdź spotkanie","home.step.match":"Dobierz","home.step.meet":"Poznaj","home.step.gather":"Spotkaj się","home.step.form":"Utwórz","home.step.run":"Prowadź","auth.kicker.register":"Załóż konto","auth.kicker.signin":"Witaj z powrotem","auth.title.register":"Wybierz nazwę użytkownika i już jesteś w środku","auth.title.signin":"Zaloguj się","auth.lede.register":"Twoje konto mieszka na serwerach colive.fun — zaloguj się z dowolnego urządzenia lub przeglądarki, a cały Twój świat tam będzie.","auth.lede.signin":"Jedna nazwa użytkownika i hasło. Działa wszędzie, gdzie otworzysz colive.fun.","auth.username":"Nazwa użytkownika","auth.password":"Hasło","auth.username.ph":"małe litery, litery/cyfry/._-","auth.password.ph.register":"co najmniej 8 znaków","auth.password.ph.signin":"Twoje hasło","auth.submit.register":"Załóż konto","auth.submit.signin":"Zaloguj się","auth.toggle.toSignin":"Mam już konto","auth.toggle.toRegister":"Załóż nowe konto","auth.err.missing":"Poproszę nazwę użytkownika i hasło.","auth.toast.created":"Konto założone — witaj","auth.toast.welcome":"Witaj z powrotem","profile.displayName":"Nazwa wyświetlana","profile.displayName.ph":"Imię, które zobaczą współlokatorzy","profile.homeBase":"Skąd jesteś","profile.budget":"Miesięczny budżet","profile.oneliner":"Krótki opis (opcjonalnie)","profile.email":"E-mail kontaktowy (opcjonalnie)","profile.socials":"Media społecznościowe (opcjonalnie)","profile.lookingFor":"Czego szukasz","profile.seeking.room":"Pokoju w domu","profile.seeking.founding":"Zakładam nowy dom","profile.seeking.hasHouse":"Ustawiony/a — mam dom","profile.discovery":"Widoczność","profile.listMe":"Umieść mnie w publicznym katalogu","profile.addPhoto":"Dodaj zdjęcie","profile.changePhoto":"Zmień zdjęcie","profile.save":"Zapisz zmiany"},
  };
  // switcher order = key order here; Hebrew sits 7th by request
  const LANG_NAMES = { en: "English", es: "Español", zh: "中文", ar: "العربية", ru: "Русский", fr: "Français", he: "עברית", ht: "Kreyòl", bn: "বাংলা", ko: "한국어", pl: "Polski" };
  const RTL_LANGS = { he: 1, ar: 1 };
  const LANG_KEY = "dp-lang";
  function pickLang() {
    let l = null;
    try { l = localStorage.getItem(LANG_KEY); } catch (e) {}
    if (l && MESSAGES[l]) return l;
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return MESSAGES[nav] ? nav : "en";
  }
  let LANG = pickLang();
  function t(key, fallback) {
    const table = MESSAGES[LANG];
    if (table && typeof table[key] === "string") return table[key];
    if (typeof MESSAGES.en[key] === "string") return MESSAGES.en[key];
    return fallback != null ? fallback : key;
  }
  function i18nDir() { return RTL_LANGS[LANG] ? "rtl" : "ltr"; }
  function setLang(l) {
    if (!MESSAGES[l]) return;
    try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
    location.reload();
  }
  function applyI18nDom(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => { const v = t(el.getAttribute("data-i18n"), null); if (v != null) el.textContent = v; });
    // values are authored (never user input), so innerHTML is safe here
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => { const v = t(el.getAttribute("data-i18n-html"), null); if (v != null) el.innerHTML = v; });
    scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
        const idx = pair.indexOf(":"); if (idx < 0) return;
        const attr = pair.slice(0, idx).trim(); const key = pair.slice(idx + 1).trim();
        const v = t(key, null); if (v != null && attr) el.setAttribute(attr, v);
      });
    });
  }
  function applyHtmlDir() {
    const h = document.documentElement;
    h.setAttribute("lang", LANG);
    h.setAttribute("dir", i18nDir());
  }
  function langSwitcher() {
    const opts = Object.keys(LANG_NAMES).filter((l) => MESSAGES[l]).map((l) =>
      `<option value="${l}"${l === LANG ? " selected" : ""}>${LANG_NAMES[l]}</option>`).join("");
    return `<select class="lang-select" id="lang-select" aria-label="${t("lang.label", "Language")}">${opts}</select>`;
  }
  window.I18n = { t, dir: i18nDir, set: setLang, applyDom: applyI18nDom, applyHtmlDir, switcher: langSwitcher, names: LANG_NAMES, get lang() { return LANG; } };
  applyHtmlDir(); // set <html lang/dir> as early as possible

  const LINKS = {
    website: "https://decentralpark.nyc",
    mutualAid: "https://mutualaid.fun",
    about: "https://decentralpark.nyc/about",
    meetings: "https://decentralpark.nyc/",
    newsletter: "https://paragraph.com/@decentralpark",
    github: "https://github.com/RonTuretzky/decentralparknyc",
    instagram: "https://instagram.com/decentralparknyc",
    twitter: "https://x.com/decentralparkny",
    telegram: "https://t.me/decentralparknyc",
    farcaster: "https://farcaster.xyz/decentralpark",
    linkedin: "https://www.linkedin.com/company/decentral-park",
  };

  // Nav adapts to where you are: visitors get discovery + tools, house
  // members get the app. No dead links, no gated teases.
  function navFor() {
    const C = window.Commons;
    const hasHouse = C.account.active() && !!C.houses.mine();
    if (hasHouse) return [
      { id: "dashboard", href: "dashboard.html", key: "nav.myhouse", label: "My House" },
      { id: "ledger", href: "ledger.html", key: "nav.ledger", label: "Ledger" },
      { id: "chores", href: "chores.html", key: "nav.chores", label: "Chores" },
      { id: "meals", href: "meals.html", key: "nav.meals", label: "Meals" },
      { id: "templates", href: "templates.html", key: "nav.systems", label: "Systems" },
      { id: "browse", href: "browse.html", key: "nav.browse", label: "Browse" },
      { id: "gatherings", href: "gatherings.html", key: "nav.gatherings", label: "Gatherings" },
    ];
    return [
      { id: "browse", href: "browse.html", key: "nav.browse", label: "Browse" },
      { id: "gatherings", href: "gatherings.html", key: "nav.gatherings", label: "Gatherings" },
      { id: "templates", href: "templates.html", key: "nav.calculators", label: "Calculators" },
    ];
  }

  function navbar(active) {
    const C = window.Commons;
    const U = C.util;
    const account = C.account.get();
    const activeAcct = C.account.active();
    const hasHouse = activeAcct && !!C.houses.mine();
    const links = navFor().map((n) =>
      `<a href="${n.href}" class="${n.id === active ? "on" : ""}">${t(n.key, n.label)}</a>`
    ).join("") + (!hasHouse
      ? `<a href="quiz.html" class="${active === "quiz" ? "on" : ""}">${t("nav.quiz", "Quiz")}</a>` : "");
    const accountEl = activeAcct
      ? `<a href="account.html" class="row" style="gap:8px;text-decoration:none;color:var(--ink);margin-left:6px" title="${t("account.you", "Your account")}">
           ${avatarHtml(C.me(), "sm")}<span class="display" style="font-size:.9rem">${U.esc(account.name.split(/\s+/)[0])}</span></a>`
      : account
        ? `<a class="park-btn sm light" href="account.html" style="margin-left:6px">${t("btn.signin", "Sign in")}</a>`
        : `<a class="park-btn sm light" href="account.html" style="margin-left:6px">${t("btn.createAccount", "Create account")}</a>`;
    return `
    <header class="navbar">
      <div class="container nav-inner">
        <a class="brand" href="index.html">
          <img src="assets/img/logomark.png" alt="Decentral Park" />
          <span>
            <span class="word">colive<em>.fun</em></span>
            <span class="byline">by Decentral Park</span>
          </span>
        </a>
        <div class="spacer"></div>
        <nav class="nav-links" id="nav-links">${links}</nav>
        ${accountEl}
        ${hasHouse
          ? `<a class="lifted xs" href="checkin.html" style="margin-left:6px"><span class="shadow"></span><span class="face">${t("btn.checkin", "Check-in")}</span></a>`
          : `<a class="lifted xs ${active === "create" ? "green" : ""}" href="create.html" style="margin-left:6px"><span class="shadow"></span><span class="face">${t("btn.startHouse", "Start a house")}</span></a>`}
        ${langSwitcher()}
        <button class="nav-burger" id="nav-burger" aria-label="Menu">☰</button>
      </div>
    </header>`;
  }

  function footer() {
    return `
    <footer class="footer">
      <div class="container">
        <div class="foot-inner">
          <div>
            <a class="brand" href="index.html" style="color:var(--paper-main)">
              <img src="assets/img/logomark.png" alt="" />
              <span><span class="word" style="color:var(--paper-main)">colive<em>.fun</em></span>
              <span class="byline" style="color:#9db3a6">by Decentral Park</span></span>
            </a>
            <p class="tagline">${t("footer.tagline")}</p>
          </div>
          <div>
            <h4>${t("footer.solidarityApps")}</h4>
            <ul>
              <li><a href="${LINKS.mutualAid}" target="_blank" rel="noopener">${t("footer.mutualAid")}</a></li>
              <li><a href="${LINKS.meetings}" target="_blank" rel="noopener">${t("footer.meetups")}</a></li>
              <li><a href="index.html">${t("footer.coliveFind")}</a></li>
            </ul>
          </div>
          <div>
            <h4>${t("footer.decentralpark")}</h4>
            <ul>
              <li><a href="${LINKS.about}" target="_blank" rel="noopener">${t("footer.about")}</a></li>
              <li><a href="${LINKS.newsletter}" target="_blank" rel="noopener">${t("footer.newsletter")}</a></li>
              <li><a href="${LINKS.github}" target="_blank" rel="noopener">${t("footer.github")}</a></li>
              <li>
                <a href="${LINKS.twitter}" target="_blank" rel="noopener">X</a> ·
                <a href="${LINKS.instagram}" target="_blank" rel="noopener">Instagram</a> ·
                <a href="${LINKS.telegram}" target="_blank" rel="noopener">Telegram</a> ·
                <a href="${LINKS.farcaster}" target="_blank" rel="noopener">Farcaster</a> ·
                <a href="${LINKS.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
              </li>
            </ul>
          </div>
        </div>
        <div class="legal">
          <span>${t("footer.legalLocal")}</span>
          <span>${t("footer.legalLicense")}</span>
        </div>
      </div>
    </footer>
    <div class="toast-wrap" id="toast-wrap"></div>`;
  }

  function toast(msg, kind) {
    const wrap = document.getElementById("toast-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; }, 2600);
    setTimeout(() => el.remove(), 3100);
  }

  // small shared renderers
  function avatarHtml(profile, size) {
    const U = window.Commons.util;
    if (!profile) return "";
    // photo/hue can arrive from another member's synced profile — never trust
    // them raw in an inline style. A photo must be a data:image URL; a hue a CSS color.
    const okPhoto = typeof profile.photo === "string" && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(profile.photo);
    if (okPhoto) {
      return `<span class="avatar ${size || ""}" title="${U.esc(profile.name)}" style="background-image:url('${profile.photo}');background-size:cover;background-position:center;color:transparent">${U.esc(U.initials(profile.name))}</span>`;
    }
    const okHue = typeof profile.hue === "string" && /^#[0-9a-fA-F]{3,8}$|^(rgb|hsl)a?\([0-9.,%\s/]+\)$/.test(profile.hue);
    const bg = okHue ? profile.hue : U.hue(profile.id);
    return `<span class="avatar ${size || ""}" title="${U.esc(profile.name)}" style="background:${U.esc(bg)}">${U.esc(U.initials(profile.name))}</span>`;
  }
  function matchPill(m) {
    const conf = m.conflicts > 0
      ? `<span class="pill conflict">⚠ ${m.conflicts} dealbreaker${m.conflicts > 1 ? "s" : ""}</span>`
      : `<span class="pill zero">0 dealbreakers</span>`;
    // Bands, not percentages — the % implied a prediction nobody can make
    const cls = m.band === "strong" ? "match" : m.band === "workable" ? "paper" : "warn";
    const label = m.bandLabel || (m.band ? m.band : m.score + "%");
    return `<span class="pill ${cls}">${label}</span> ${conf}`;
  }

  function render(active) {
    applyHtmlDir(); // <html lang/dir> (also set at load; re-assert after any late lang change)
    document.body.insertAdjacentHTML("afterbegin", navbar(active));
    document.body.insertAdjacentHTML("beforeend", footer());
    applyI18nDom(document); // translate any static [data-i18n] markup the page ships
    const burger = document.getElementById("nav-burger");
    if (burger) burger.addEventListener("click", () => document.getElementById("nav-links").classList.toggle("open"));
    const lang = document.getElementById("lang-select");
    if (lang) lang.addEventListener("change", (e) => setLang(e.target.value));
    installPwa();
    installSync();
  }

  // PWA: manifest + service worker, injected here so every page gets both
  // without repeating <head> boilerplate. Chrome processes dynamic manifests.
  function installSync() {
    // if the server says the session is gone (expired/signed-out elsewhere),
    // drop to the front door — the app is hosted, no session means no app
    window.addEventListener("cloud:signedout", () => {
      if (!/account\.html$/.test(location.pathname)) location.replace("account.html");
    });
    if (window.CloudSync || document.querySelector('script[data-cloud-sync]')) return;
    const sc = document.createElement("script");
    sc.src = "assets/js/sync.js";
    sc.dataset.cloudSync = "1";
    document.body.appendChild(sc);
  }

  function installPwa() {
    if (!document.querySelector('link[rel="manifest"]')) {
      document.head.insertAdjacentHTML("beforeend",
        '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#0d9488">');
    }
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  // Auth gate for app pages: no active account → straight to the auth page,
  // like any app with a front door. Call right after Shell.render().
  function gate() {
    const C = window.Commons;
    if (C.account.active()) return false;
    location.replace("account.html");
    return true;
  }

  // true while the user is typing in a field — pages skip sync:update re-renders
  // then, so a housemate's incoming change can't wipe an in-progress form
  function editing() {
    const el = document.activeElement;
    return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  window.Shell = { render, gate, toast, avatarHtml, matchPill, editing, LINKS, t, i18n: window.I18n };
})();
