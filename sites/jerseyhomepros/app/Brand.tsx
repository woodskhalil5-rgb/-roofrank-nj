import { SITE } from "../lib/site";

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
        <div className="footlinks">
          <a href="/roofing">Roofing</a>
          <a href="/hvac">Heating &amp; Cooling</a>
          <a href="/pest">Pest Control</a>
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
