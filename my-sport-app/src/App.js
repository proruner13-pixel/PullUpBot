import React, { useEffect, useState } from "react";
import "./index.css";
import { LINKS } from "./config/links";

const NAV_ITEMS = [
  ["Главная", "home"],
  ["Как работает", "how"],
  ["Челленджи", "challenges"],
  ["Достижения", "achievements"],
  ["Рейтинг", "rating"],
];

const STEPS = [
  { icon: "telegram", number: "01", title: "Открой PULLUP", text: "Запусти Mini App прямо из Telegram — без отдельной регистрации." },
  { icon: "target", number: "02", title: "Выбери цель", text: "Найди челлендж под свой уровень и любимую тренировку." },
  { icon: "video", number: "03", title: "Подтверди результат", text: "Загрузи короткое видео, чтобы результат прошёл модерацию." },
  { icon: "trophy", number: "04", title: "Забери награду", text: "Получай токены, достижения и поднимайся в рейтинге." },
];

const CHALLENGES = [
  { icon: "pullup", title: "Сила турника", text: "Выполни 50 подтягиваний за неделю.", reward: "250" },
  { icon: "pushup", title: "Сотня отжиманий", text: "Собери 100 качественных повторений.", reward: "180" },
  { icon: "plank", title: "Стальная планка", text: "Удерживай планку суммарно 10 минут.", reward: "150" },
  { icon: "runner", title: "Быстрый старт", text: "Пробеги первые 5 километров.", reward: "200" },
  { icon: "calendar", title: "Каждый день", text: "Тренируйся семь дней без пропусков.", reward: "300" },
  { icon: "combo", title: "Комбо атлета", text: "Закрой три разных дисциплины.", reward: "400" },
];

const ACHIEVEMENTS = [
  { icon: "flag", title: "Первый шаг", text: "Первая тренировка", tone: "bronze", unlocked: true },
  { icon: "strength", title: "Неделя силы", text: "7 активных дней", tone: "silver", unlocked: true },
  { icon: "pullup", title: "Мастер турника", text: "500 подтягиваний", tone: "blue", unlocked: true },
  { icon: "flame", title: "Огненная серия", text: "30 дней подряд", tone: "violet" },
  { icon: "trophy", title: "Чемпион месяца", text: "Топ-1 сезона", tone: "gold" },
  { icon: "shield", title: "Легенда PULLUP", text: "5 000 повторений", tone: "legend" },
];

const LEADERS = [
  { place: 1, name: "Алексей М.", score: "12 840", trend: "+2", avatar: "AM" },
  { place: 2, name: "Мария К.", score: "11 970", trend: "—", avatar: "МК" },
  { place: 3, name: "Дмитрий С.", score: "10 650", trend: "+4", avatar: "ДС" },
  { place: 4, name: "Илья Р.", score: "9 480", trend: "-1", avatar: "ИР" },
];

const ACTIVITY_RATINGS = [
  {
    key: "pullups",
    icon: "pullup",
    title: "Подтягивания",
    subtitle: "Сила и техника на турнике",
    entries: [
      { image: "/images/winner1.jpg", place: 1, result: "48 повторений", current: true },
      { image: "/images/winner2.jpg", place: 2, result: "20 повторений" },
      { image: "/images/winner3.jpg", place: 3, result: "19 повторений" },
    ],
  },
  {
    key: "pushups",
    icon: "pushup",
    title: "Отжимания",
    subtitle: "Выносливость и контроль",
    entries: [
      { image: "/images/pushup1.jpg", place: 1, result: "120 повторений", current: true },
      { image: "/images/pushup2.jpg", place: 2, result: "105 повторений" },
      { image: "/images/pushup3.jpg", place: 3, result: "95 повторений" },
    ],
  },
  {
    key: "running",
    icon: "runner",
    title: "Бег · 10 км",
    subtitle: "Скорость и характер",
    entries: [
      { image: "/images/run1.jpg", place: 1, result: "34:20", current: true },
      { image: "/images/run2.jpg", place: 2, result: "35:05" },
      { image: "/images/run3.jpg", place: 3, result: "36:00" },
    ],
  },
];

const AUDIENCES = [
  { icon: "spark", title: "Начинающим", text: "Понятные цели и бережный старт без сравнения с профессионалами." },
  { icon: "strength", title: "Опытным атлетам", text: "Новые уровни нагрузки, серии и конкуренция за места в рейтинге." },
  { icon: "users", title: "Командам", text: "Общие челленджи, дружеское соревнование и видимый вклад каждого." },
  { icon: "coach", title: "Тренерам", text: "Механика для вовлечения учеников и прозрачного контроля активности." },
];

const ROADMAP = [
  { label: "Сейчас", title: "Челленджи и рейтинг", text: "Профиль, токены, видеоподтверждение и достижения.", active: true },
  { label: "Следом", title: "Сезоны и команды", text: "Командные лиги, сезонные награды и новые дисциплины." },
  { label: "Дальше", title: "Персональный прогресс", text: "Умные рекомендации, расширенная статистика и цели." },
];

function Icon({ name, size = 24 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    telegram: <><path d="m3 11 17-7-4 16-5-6-4 3 1-5 8-5-9 7" /><path d="m11 14 5-7" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M15 9l5-5M16 4h4v4" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="3" /><path d="m17 10 4-2v8l-4-2zM10 9l4 3-4 3z" /></>,
    trophy: <><path d="M8 4h8v4c0 3-1.8 5-4 5s-4-2-4-5zM10 13v3M14 13v3M8 20h8M10 16h4" /><path d="M8 6H4v2c0 2 1.4 3 3.5 3M16 6h4v2c0 2-1.4 3-3.5 3" /></>,
    pullup: <><path d="M3 4h18M6 4v3M18 4v3" /><circle cx="12" cy="8" r="2" /><path d="M8 7l2 3h4l2-3M10 10l-1 5M14 10l1 5M9 15l-2 5M15 15l2 5" /></>,
    pushup: <><circle cx="18" cy="12" r="1.7" /><path d="m16.3 12-5-1.5-4 3.5M11.3 10.5l-1.2 4M7.3 14H3M10.1 14.5l5.4 2.5M3 18h18" /></>,
    plank: <><circle cx="18" cy="9" r="1.7" /><path d="m16.3 9-6 1-4 4M10.3 10l3 5M6.3 14H3M13.3 15H19M3 18h18" /></>,
    runner: <><circle cx="14" cy="5" r="2" /><path d="m12.5 8-3 4 4 2 2-4 3 2M9.5 12l-3 1M13.5 14l-3 5M15.5 10l-4-2M15 15l4 4" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" /></>,
    combo: <><path d="M5 4v5M19 4v5M3 6h4M17 6h4M7 6h10M12 6v12" /><path d="m8 14 4 4 4-4" /></>,
    flag: <><path d="M5 21V4M5 5h11l-2 4 2 4H5" /></>,
    strength: <><path d="M7 12V8M4 10v4M17 12V8M20 10v4M7 10h10M9 10v4M15 10v4M9 14h6" /></>,
    flame: <path d="M13 3s1 4-2 6c-2-2-1-4-1-4-3 2-5 5-5 9a7 7 0 0 0 14 0c0-3-2-6-4-8 0 3-1 4-2 5 1-4 0-8 0-8z" />,
    shield: <><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z" /><path d="m9 12 2 2 4-5" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M9 8h4a2 2 0 0 1 0 4H9zm0 4h5a2 2 0 0 1 0 4H9M11 6v12" /></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /><path d="m3 7 5-4 5 4 7-5" /></>,
    spark: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" /></>,
    users: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c4 0 6 1.5 6 5" /></>,
    coach: <><circle cx="8" cy="7" r="3" /><path d="M3 20c0-4 1-7 5-7s5 3 5 7M15 5h6v9h-6zM13 9h2" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" /></>,
  };

  return <svg {...common}>{paths[name] || paths.spark}</svg>;
}

function SmartLink({ href, className, children, ariaLabel }) {
  const openTarget = (event) => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    event.preventDefault();
    try {
      if (href.startsWith("https://t.me/") && webApp.openTelegramLink) {
        webApp.openTelegramLink(href);
      } else if (webApp.openLink) {
        webApp.openLink(href);
      } else {
        window.location.assign(href);
      }
    } catch {
      window.location.assign(href);
    }
  };

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={openTarget} aria-label={ariaLabel}>
      {children}
    </a>
  );
}

function Brand() {
  return (
    <a className="brand" href="#home" aria-label="PULLUP — на главную">
      <span className="brand-mark"><Icon name="pullup" size={22} /></span>
      <span>PULLUP</span>
    </a>
  );
}

function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className={`site-nav ${open ? "is-open" : ""}`} aria-label="Основная навигация">
          {NAV_ITEMS.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{label}</a>)}
          <SmartLink href={LINKS.bot} className="nav-cta">Запустить бота <Icon name="arrow" size={17} /></SmartLink>
        </nav>
        <button className="menu-toggle" type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Закрыть меню" : "Открыть меню"}>
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
    </header>
  );
}

function PhoneMockup() {
  return (
    <div className="phone-wrap" aria-label="Макет приложения PULLUP">
      <div className="phone-glow" />
      <div className="phone">
        <div className="phone-speaker" />
        <div className="phone-screen">
          <div className="mock-top"><span className="mock-logo">PULLUP</span><span className="status-dot" /></div>
          <div className="profile-row">
            <div className="avatar"><Icon name="runner" size={28} /></div>
            <div><small>Добро пожаловать</small><strong>Athlete</strong></div>
            <div className="level-pill">LVL 12</div>
          </div>
          <div className="mock-balance">
            <div><small>Баланс</small><strong>1 250</strong></div>
            <span className="coin"><Icon name="coin" size={20} /></span>
          </div>
          <div className="mock-title"><span>Прогресс дня</span><b>75%</b></div>
          <div className="progress"><span style={{ width: "75%" }} /></div>
          <div className="mock-challenge">
            <div className="challenge-icon"><Icon name="pullup" /></div>
            <div><small>Ближайший челлендж</small><strong>Ежедневный воркаут</strong><span>75 / 100 повторений</span></div>
            <b>+200</b>
          </div>
          <div className="mini-grid">
            <div><Icon name="trophy" /><strong>8</strong><span>достижений</span></div>
            <div><Icon name="flame" /><strong>12</strong><span>дней подряд</span></div>
          </div>
          <div className="mock-rating">
            <span><b>1</b><i>AM</i>Алексей</span><strong>12 840</strong>
          </div>
          <div className="mock-tabs">
            <Icon name="target" /><Icon name="trophy" /><Icon name="chart" /><Icon name="users" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ kicker, title, text }) {
  return (
    <div className="section-head" data-reveal>
      <span className="eyebrow">{kicker}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

function AchievementBadge({ item }) {
  return (
    <div className={`achievement-badge ${item.tone} ${item.unlocked ? "unlocked" : "locked"}`}>
      <span className="badge-rays" />
      <span className="badge-shield"><Icon name={item.unlocked ? item.icon : "lock"} size={34} /></span>
    </div>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.toggle("telegram-webview", Boolean(window.Telegram?.WebApp));
    window.Telegram?.WebApp?.ready?.();

    const elements = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <Header />
      <main>
        <section className="hero section" id="home">
          <div className="hero-grid container">
            <div className="hero-copy" data-reveal>
              <span className="eyebrow"><span className="live-dot" /> Спортивная платформа в Telegram</span>
              <h1>Становись сильнее.<br /><em>Каждый день.</em></h1>
              <p className="hero-lead">Тренируйся, выполняй челленджи, зарабатывай токены и поднимайся в рейтинге.</p>
              <div className="hero-actions">
                <SmartLink href={LINKS.app} className="button button-primary">Открыть приложение <Icon name="arrow" size={19} /></SmartLink>
                <SmartLink href={LINKS.bot} className="button button-secondary"><Icon name="telegram" size={20} /> Перейти в Telegram</SmartLink>
              </div>
              <div className="hero-proof">
                <div className="avatar-stack"><span>AM</span><span>МК</span><span>ДС</span><span>+2K</span></div>
                <p><strong>Тренируйся не в одиночку</strong><br />Челленджи для любого уровня</p>
              </div>
            </div>
            <PhoneMockup />
          </div>
        </section>

        <section className="section founder-section" aria-labelledby="founder-title">
          <div className="container founder-layout">
            <div className="founder-gallery" data-reveal>
              <span className="founder-glow" />
              <figure className="founder-photo founder-photo-main">
                <img src="/images/korol-turnika.jpg" alt="Основатель PULLUP с кубком победителя соревнований «Король турника»" loading="lazy" />
                <figcaption><Icon name="trophy" size={18} /> Трёхкратный победитель «Король турника»</figcaption>
              </figure>
              <figure className="founder-photo founder-photo-secondary">
                <img src="/images/dima-running.jpg" alt="Основатель PULLUP на беговой тренировке" loading="lazy" />
                <figcaption><Icon name="runner" size={18} /> Бег · сила · выносливость</figcaption>
              </figure>
            </div>

            <div className="founder-copy" data-reveal>
              <span className="eyebrow">Основатель PULLUP</span>
              <h2 id="founder-title">Проект, созданный спортсменом</h2>
              <p>Меня зовут Дима. Я учитель физической культуры, люблю бег и подтягивания. Создал PULLUP, чтобы спорт становился понятнее, интереснее и помогал каждому видеть свой реальный прогресс.</p>
              <div className="founder-achievements">
                <div><Icon name="trophy" /><span><strong>3-кратный победитель</strong>соревнований «Король турника»</span></div>
                <div><Icon name="strength" /><span><strong>КМС по полиатлону</strong>сила, скорость и выносливость</span></div>
              </div>
              <div className="founder-records">
                <div><strong>48</strong><span>подтягиваний</span></div>
                <div><strong>34:20</strong><span>10 километров</span></div>
                <div><strong>1:15</strong><span>полумарафон</span></div>
                <div><strong>2:38</strong><span>1 километр</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="container">
            <SectionHead kicker="Простой старт" title="Как работает PULLUP" text="От первой тренировки до места в рейтинге — четыре понятных шага." />
            <div className="steps-grid">
              {STEPS.map((step) => (
                <article className="step-card" key={step.number} data-reveal>
                  <span className="step-number">{step.number}</span>
                  <div className="icon-box"><Icon name={step.icon} /></div>
                  <h3>{step.title}</h3><p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-tinted" id="challenges">
          <div className="container">
            <SectionHead kicker="Двигайся к цели" title="Челленджи, которые мотивируют" text="Выбирай дисциплину, следи за прогрессом и получай награду за подтверждённый результат." />
            <div className="challenge-grid">
              {CHALLENGES.map((challenge) => (
                <article className="challenge-card" key={challenge.title} data-reveal>
                  <div className="challenge-card-top"><div className="icon-box"><Icon name={challenge.icon} /></div><span>Активный</span></div>
                  <h3>{challenge.title}</h3><p>{challenge.text}</p>
                  <div className="challenge-reward"><span><Icon name="coin" size={18} /> Награда</span><strong>+{challenge.reward}</strong></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="achievements">
          <div className="container">
            <SectionHead kicker="Коллекция прогресса" title="Достижения, которыми хочется гордиться" text="Каждая награда фиксирует реальный этап твоего спортивного пути." />
            <div className="achievement-grid">
              {ACHIEVEMENTS.map((item) => (
                <article className={`achievement-card ${item.unlocked ? "" : "is-locked"}`} key={item.title} data-reveal>
                  <AchievementBadge item={item} />
                  <h3>{item.title}</h3><p>{item.text}</p>
                  <span className="achievement-status"><Icon name={item.unlocked ? "check" : "lock"} size={14} />{item.unlocked ? "Открыто" : "Заблокировано"}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-tinted" id="rating">
          <div className="container rating-grid">
            <div className="rating-copy" data-reveal>
              <span className="eyebrow">Честное соревнование</span>
              <h2>Поднимайся в рейтинге</h2>
              <p>Зарабатывай очки за подтверждённую активность, следи за динамикой и соревнуйся с участниками PULLUP.</p>
              <ul className="check-list">
                <li><Icon name="check" /> Общий и сезонный рейтинг</li>
                <li><Icon name="check" /> Прозрачные очки за активность</li>
                <li><Icon name="check" /> Новые цели для следующего места</li>
              </ul>
              <SmartLink href={LINKS.app} className="text-link">Посмотреть свой рейтинг <Icon name="arrow" size={18} /></SmartLink>
            </div>
            <div className="leaderboard" data-reveal>
              <div className="leaderboard-head"><div><small>Таблица лидеров</small><strong>Сезон 01</strong></div><span>Обновлено сегодня</span></div>
              {LEADERS.map((leader) => (
                <div className={`leader-row place-${leader.place}`} key={leader.place}>
                  <b className="place">{leader.place}</b><i>{leader.avatar}</i><span><strong>{leader.name}</strong><small>{leader.trend} позиции</small></span><em>{leader.score}</em>
                </div>
              ))}
              <div className="your-place"><span>Ваше место</span><strong>#128 · 2 450 очков</strong></div>
            </div>
          </div>
        </section>

        <section className="section activity-ratings-section" aria-labelledby="activity-ratings-title">
          <div className="container">
            <div className="activity-ratings-head" data-reveal>
              <div>
                <span className="live-top-badge"><i /> LIVE TOP</span>
                <span className="eyebrow">Реальные результаты</span>
                <h2 id="activity-ratings-title">Рейтинги по видам активности</h2>
                <p>Реальные фотографии, призовые места и результаты в трёх спортивных дисциплинах.</p>
              </div>
              <SmartLink href={LINKS.app} className="button button-primary">Открыть рейтинг <Icon name="arrow" size={19} /></SmartLink>
            </div>

            <div className="activity-ratings">
              {ACTIVITY_RATINGS.map((rating) => (
                <article className="activity-rating" key={rating.key} data-reveal>
                  <header>
                    <div className="icon-box"><Icon name={rating.icon} /></div>
                    <div><h3>{rating.title}</h3><p>{rating.subtitle}</p></div>
                  </header>
                  <div className="activity-podium">
                    {rating.entries.map((entry) => (
                      <figure className={`podium-card place-${entry.place} ${entry.current ? "is-current" : ""}`} key={entry.place}>
                        <div className="podium-photo">
                          <img src={entry.image} alt={`${entry.place} место в рейтинге «${rating.title}»: ${entry.result}`} loading="lazy" />
                          <span className="podium-place">{entry.place}</span>
                          {entry.current && <span className="current-athlete"><i /> Основатель PULLUP</span>}
                        </div>
                        <figcaption><strong>{entry.place} место</strong><span>{entry.result}</span></figcaption>
                      </figure>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container token-grid">
            <div className="token-visual" data-reveal>
              <div className="token-orbit orbit-one" /><div className="token-orbit orbit-two" />
              <div className="token-main"><Icon name="coin" size={68} /><span>P</span></div>
              <span className="token-mini token-a"><Icon name="coin" /></span><span className="token-mini token-b"><Icon name="spark" /></span>
            </div>
            <div className="token-copy" data-reveal>
              <span className="eyebrow">Награды за движение</span>
              <h2>Токены PULLUP</h2>
              <p>Внутриигровые токены отмечают твою активность. Их можно получать за челленджи, серии тренировок и достижения.</p>
              <div className="token-notice"><Icon name="shield" /><span><strong>Без финансовых обещаний.</strong> Токены используются внутри продукта как игровая система мотивации.</span></div>
            </div>
          </div>
        </section>

        <section className="section section-tinted">
          <div className="container video-grid">
            <div className="video-card" data-reveal>
              <div className="video-frame">
                <video
                  className="workout-video"
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="Видео с выполнением подтягиваний"
                >
                  <source src="/images/453901280_456240447.mp4" type="video/mp4" />
                  Ваш браузер не поддерживает воспроизведение видео.
                </video>
                <span className="record-pill workout-video-label"><i /> PULLUP · ПОДТЯГИВАНИЯ</span>
              </div>
              <div className="video-meta"><span><Icon name="check" /> Видео принято</span><strong>+150 токенов</strong></div>
            </div>
            <div className="video-copy" data-reveal>
              <span className="eyebrow">Честный результат</span>
              <h2>Подтверди тренировку видео</h2>
              <p>Короткое видео помогает сохранить честную конкуренцию и засчитать именно выполненный результат.</p>
              <ol className="number-list"><li><b>1</b>Сними выполнение упражнения</li><li><b>2</b>Отправь видео на модерацию</li><li><b>3</b>Получи прогресс и награду</li></ol>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <SectionHead kicker="Твой темп — твои правила" title="PULLUP подходит каждому" text="Платформа помогает сделать движение регулярным — независимо от текущей формы." />
            <div className="audience-grid">
              {AUDIENCES.map((item) => <article className="audience-card" key={item.title} data-reveal><div className="icon-box"><Icon name={item.icon} /></div><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section section-tinted">
          <div className="container">
            <SectionHead kicker="Развитие продукта" title="Дорожная карта" text="Мы начинаем с главного — понятной мотивации тренироваться — и постепенно расширяем возможности." />
            <div className="roadmap">
              {ROADMAP.map((item, index) => <article className={item.active ? "active" : ""} key={item.title} data-reveal><span>{String(index + 1).padStart(2, "0")}</span><div><small>{item.label}</small><h3>{item.title}</h3><p>{item.text}</p></div></article>)}
            </div>
          </div>
        </section>

        <section className="final-cta section">
          <div className="container final-cta-inner" data-reveal>
            <span className="cta-grid" />
            <div><span className="eyebrow">Твоя следующая тренировка</span><h2>Начни становиться сильнее сегодня</h2><p>Открой PULLUP в Telegram, выбери первый челлендж и зафиксируй свой прогресс.</p></div>
            <div className="hero-actions">
              <SmartLink href={LINKS.app} className="button button-primary">Открыть приложение <Icon name="arrow" size={19} /></SmartLink>
              <SmartLink href={LINKS.bot} className="button button-ghost"><Icon name="telegram" size={20} /> Запустить бота</SmartLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div><Brand /><p>Спортивная платформа, которая превращает регулярные тренировки в понятный путь прогресса.</p></div>
          <div><strong>Навигация</strong>{NAV_ITEMS.slice(1).map(([label, id]) => <a href={`#${id}`} key={id}>{label}</a>)}</div>
          <div><strong>PULLUP</strong><SmartLink href={LINKS.app}>Mini App</SmartLink><SmartLink href={LINKS.bot}>Telegram-бот</SmartLink></div>
        </div>
        <div className="container footer-bottom"><span>© {new Date().getFullYear()} PULLUP</span><span>Тренируйся. Прогрессируй. Побеждай.</span></div>
      </footer>
    </div>
  );
}

export default App;
