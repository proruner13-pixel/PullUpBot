export const LINKS = Object.freeze({
  app:
    process.env.REACT_APP_WEBAPP_URL ||
    "https://pullupbot.vercel.app",
  bot:
    process.env.REACT_APP_TELEGRAM_BOT_URL ||
    "https://t.me/ActiveRunBot",
  site: "https://pullup-sport.vercel.app",
});
