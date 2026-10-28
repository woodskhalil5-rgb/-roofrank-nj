import { SITE } from "../../lib/site";
import { Brand } from "../Brand";

export const metadata = {
  title: `Privacy Notice | ${SITE.brand}`,
  description: `How ${SITE.brand} collects, uses and shares homeowner information.`,
};

export default function Privacy() {
  return (
    <main className="simplepage">
      <Brand />
      <article className="simplecard legalpage">
        <h1>Privacy Notice</h1>
        <p className="legaldate">Last updated: 24 October 2026</p>

        <h2>Who we are</h2>
        <p>
          {SITE.brand} is a service operated by <b>{SITE.operator}</b>, which connects New Jersey
          homeowners with independent contractors in roofing, heating and cooling, pest
          control, moving and cleaning. We are <b>not</b> a contractor. We do not perform, sell, supervise or guarantee
          any work. This notice explains what we collect and, most importantly, who we give it to.
        </p>

        <h2>How we share your information &mdash; please read this part</h2>
        <p>
          When you submit a request, we share the details you give us &mdash; your name, phone
          number, email address, ZIP code, property type, service requested, timing and project
          description &mdash; with participating contractors in the trade you selected who serve
          your area. <b>Those companies pay us a fee for each request we share with them.</b> Under
          some state privacy laws, including the New Jersey Data Privacy Act, that is treated as a
          &ldquo;sale&rdquo; of personal data.
        </p>
        <p>
          We share your request only with companies in the trade you chose. A roofing request is
          never sent to a pest control company, and the reverse.
        </p>
        <p>
          More than one company may receive your request, and they will contact you directly and
          compete for your business. Once a company receives your details it handles them under its
          own privacy practices, which we do not control.
        </p>
        <p>
          We also share information with service providers who operate the site on our behalf
          (hosting, database, email delivery), and with authorities where the law requires it.{" "}
          <b>We do not sell or license your information to data brokers or lead aggregators.</b>
        </p>

        <h2>What we collect</h2>
        <p>
          <b>From you:</b> name, phone number, email address, ZIP code, property type, trade and
          service needed, project timing and any details you write.
        </p>
        <p>
          <b>Automatically:</b> IP address and browser information recorded at the moment you
          submit, together with the exact consent wording shown to you. We keep this to evidence
          what you agreed to.
        </p>
        <p>
          <b>On contractor profiles:</b> when you open a company&rsquo;s profile in our directory, or
          click its estimate or website button, we count it so that company can see how many people
          looked. We store a one-way code made from your IP address and that day&rsquo;s date, which
          lets us count a visitor once per day without keeping the address itself. If you send a
          request after starting from a profile, we note which profile on your request. That company
          receives your request only if it serves your ZIP code.
        </p>
        <p>
          <b>If you use a Home Board:</b> your email address, an optional home ZIP code, the to-dos
          you add and their status, and whether you turned on reminder emails. Requests you send
          with the same email address appear on your board. Signing in works by a one-time link we
          email you; we keep only a scrambled copy of that link and of your sign-in session. When you
          send a request while signed in with the same address, we tell the receiving companies that
          your email was verified by sign-in. Reminder emails are sent only if you turn them on, and
          every one has an unsubscribe link. To delete your board, email us from that address.
        </p>
        <p>
          <b>If you book a free site visit:</b> your name, phone, email, address, the times that suit you
          and what you tell us about the job, plus the photos and measurements a JHP Road Pro takes at your
          home. We use your number to call or text you about the visit. Photos are stored privately and are
          shared, by expiring links, only with the one contractor we introduce for that job. We keep the exact
          wording you agreed to.
        </p>
        <p>
          <b>We do not ask for sensitive information.</b> Please do not send health details,
          financial account numbers, government identifiers or precise location through our forms.
        </p>

        <h2>Your choices about calls and texts</h2>
        <p>
          Agreeing to calls and texts is optional and is never required to use {SITE.brand}. If you
          leave that box unchecked, we record that contractors should reply by email only, and we
          tell them so. You can withdraw permission at any time by replying STOP to a text, telling
          any caller to stop, or emailing us. We will act on it within 10 business days and pass it
          to the companies that received your request.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Request details are kept for up to 24 months. Records evidencing your consent are kept for
          5 years, because telephone consumer protection claims can be brought up to four years
          after a call.
        </p>

        <h2>Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access, correct, delete or obtain a
          copy of your personal data, and to opt out of its sale or of targeted advertising. Contact
          us at the address below and we will respond within 45 days. If we refuse, you may appeal
          by replying to our decision. We will not treat you differently for exercising these
          rights, and we honour recognised browser opt-out signals such as Global Privacy Control.
        </p>
        <p>
          Opting out stops future sharing by us. It cannot retrieve information already sent to a
          contractor &mdash; contact that company directly as well.
        </p>

        <h2>Children</h2>
        <p>Our service is for adults. We do not knowingly collect information from anyone under 18.</p>

        <h2>Security and changes</h2>
        <p>
          We use reasonable measures to protect your information, though no method of transmission
          is completely secure. If we change this notice we will update the date above.
        </p>

        <h2>Contact</h2>
        <p>
          {SITE.operator}<br />
          {SITE.operatorAddress}<br />
          Email: <a href={`mailto:${SITE.operatorEmail}`}>{SITE.operatorEmail}</a>
        </p>
      </article>
    </main>
  );
}
