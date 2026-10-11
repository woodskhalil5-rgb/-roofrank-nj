import { SITE } from "../lib/site";
import { TRADES, TRADE_SLUGS } from "../lib/trades";

/** Shared wordmark used in the nav and the footer. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <a className="brand" href={href}>
      <span className="brandmark">{SITE.mark}</span>
      <span>
        {SITE.wordmark} <b>{SITE.wordmarkBold}</b>
        <small>{SITE.subMark}</small>
      </span>
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap footinner">
        <Brand />
        {/* Driven off the trade list so a new trade is never orphaned here. */}
        <div className="footlinks">
          {TRADE_SLUGS.map((s) => (
            <a key={s} href={`/${s}`}>{TRADES[s].label}</a>
          ))}
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/join">For Pros</a>
        </div>
        <span className="copyright">
          &copy; {new Date().getFullYear()} {SITE.brand}
        </span>
      </div>
      <div className="wrap disclaimer">{SITE.disclaimer}</div>
    </footer>
  );
}
