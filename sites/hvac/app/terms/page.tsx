import { SITE } from "../../lib/site";

export const metadata = {
  title: `Terms of Use | ${SITE.brand}`,
  description: `The terms that apply when you use ${SITE.brand}.`,
};

export default function Terms() {
  return (
    <main className="simplepage">
      <a className="back" href="/">← {SITE.brand}</a>
      <article className="simplecard legalpage">
        <h1>Terms of Use</h1>
        <p className="legaldate">Last updated: 10 October 2026</p>

        <h2>We are a referral service, not a contractor</h2>
        <p>{SITE.brand}, operated by <b>{SITE.operator}</b>, connects homeowners with independent {SITE.companies}. <b>We do not perform, sell, supervise or guarantee any work. We do not provide estimates or quote prices, and we are not a party to any agreement between you and a company.</b> Those companies are independent businesses — not our employees, agents or partners. They pay us to receive homeowner requests. Homeowners pay us nothing.</p>

        <h2>No endorsement</h2>
        <p>Appearing in our network is not an endorsement, recommendation or warranty. We do not conduct background checks, monitor licensing or insurance on an ongoing basis, or assess workmanship, pricing or reliability. We do not claim that companies in our network are vetted, screened, approved or top-rated.</p>

        <h2>Check before you hire</h2>
        <p>Before hiring anyone, verify their New Jersey registration or licensing at <a href="https://www.njconsumeraffairs.gov" target="_blank" rel="noopener noreferrer">njconsumeraffairs.gov</a>, confirm their insurance, ask for references and permits, and get a written contract. New Jersey law requires a written contract for home improvement work over $500.</p>

        <h2>No guarantee of results</h2>
        <p>We do not guarantee that any company will contact you, respond within any period, offer any particular price, be available, or complete any work. We do not guarantee that information a company gives you is accurate.</p>

        <h2>What you are telling us when you submit</h2>
        <p>You confirm that your details are accurate, that you own the property or are authorised to arrange work on it, and that the phone number and email address you give are your own. Submitting someone else&rsquo;s contact details without their permission can expose both of us to liability, and you agree to cover claims arising from doing so.</p>

        <h2>Disclaimer and limitation of liability</h2>
        <p>To the fullest extent permitted by New Jersey law, this site is provided &ldquo;as is&rdquo; without warranties of any kind, and {SITE.brand} is not liable for work performed or not performed by any company, or for indirect or consequential damages. <b>Nothing in these terms limits any right you have under the New Jersey Consumer Fraud Act or any other right that cannot be waived under New Jersey law.</b></p>

        <h2>Contact</h2>
        <p>{SITE.operator}<br />{SITE.operatorAddress}<br />Email: <a href={`mailto:${SITE.operatorEmail}`}>{SITE.operatorEmail}</a></p>
      </article>
    </main>
  );
}
