import { SITE } from "../../lib/site";
import { TRADES } from "../../lib/trades";
import { GUIDES } from "../../lib/guides";
import { Brand, SiteFooter } from "../Brand";

export const metadata = {
  title: `Homeowner Guides | ${SITE.brand}`,
  description:
    "Straight answers for New Jersey homeowners on heating, pest, roofing and moving problems — what to check yourself, and when it needs a professional.",
  alternates: { canonical: "/guides" },
};

export default function Guides() {
  return (
    <main className="simplepage">
      <Brand />
      <div className="simplecard legalpage">
        <div className="eyebrow dark">HOMEOWNER GUIDES</div>
        <h1>Straight answers, before anyone asks you for anything.</h1>
        <p>
          Written for the moment something breaks. Each one tells you what to check
          yourself first, and says plainly where the line is between a job you can do
          and one that needs a licensed contractor.
        </p>

        <ul>
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <a href={`/guides/${g.slug}`}>{g.h1}</a>
              <br />
              <small className="fieldhint">
                {TRADES[g.trade].label} &middot; {g.lede}
              </small>
            </li>
          ))}
        </ul>
      </div>
      <SiteFooter />
    </main>
  );
}
