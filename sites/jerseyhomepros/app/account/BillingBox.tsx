"use client";
import { useState } from "react";

export type Billing = {
  on: boolean; plan: "none" | "ppl" | "partner";
  card: { brand: string | null; last4: string | null } | null;
  lead_price_cents: number | null; free_leads: number;
  charges: { id: string; created_at: string; kind: string; amount_cents: number; description: string; status: string; hosted_invoice_url: string | null; paid_at: string | null }[];
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const STATUS: Record<string, string> = {
  free: "Free", pending: "Next statement", invoiced: "Invoiced", paid: "Paid", failed: "Payment failed", credited: "Credited", void: "Cancelled",
};

/**
 * Contractor dashboard billing. Says only what the account is actually set to:
 * the plan, the price per lead for their trade (if pay-per-lead), the card on
 * file, and every charge. Saving a card charges nothing.
 */
export default function BillingBox({ token, billing }: { token: string; billing: Billing }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!billing.on) return null;

  async function go(action: "billing_setup" | "billing_portal") {
    if (busy) return;
    setBusy(true); setMsg("Opening secure Stripe page…");
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || "Couldn't open billing.");
      window.location.href = j.url;
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't open billing."); setBusy(false); }
  }

  const freeUsed = billing.charges.filter((c) => c.kind === "lead" && c.status === "free").length;
  const due = billing.charges.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount_cents, 0);

  return (
    <section className="acctcard">
      <h2>Billing</h2>
      {billing.plan === "ppl" && (
        <p>
          You&rsquo;re on <b>pay per lead</b>
          {billing.lead_price_cents != null ? <>: <b>{usd(billing.lead_price_cents)}</b> per request delivered</> : null}.
          {" "}First {billing.free_leads} free ({Math.min(freeUsed, billing.free_leads)} used). Charges go on one statement on the 1st of each month.
        </p>
      )}
      {billing.plan === "partner" && <p>You&rsquo;re a <b>partner</b>: no per-lead charges. Referral fees are invoiced per your partner agreement, once the homeowner has paid you.</p>}
      {billing.plan === "none" && <p>Nothing is billed to this account right now.</p>}

      <p className="adminmeta">
        Payment method: {billing.card ? `${billing.card.brand ?? "card"} ending ${billing.card.last4}` : "none saved"}
        {due > 0 ? ` · on your next statement: ${usd(due)}` : ""}
      </p>
      <div className="acctactions">
        {billing.card
          ? <button className="button" type="button" disabled={busy} onClick={() => go("billing_portal")}>Update card / see invoices</button>
          : <button className="button gold" type="button" disabled={busy} onClick={() => go("billing_setup")}>Save a card <span>&#8594;</span></button>}
      </div>
      {!billing.card && <p className="adminmeta">Saving a card doesn&rsquo;t charge it. Without one, invoices are emailed with a secure pay link.</p>}
      {msg && <p className="adminmeta">{msg}</p>}

      {billing.charges.length > 0 && (
        <table className="accttable">
          <thead><tr><th>Date</th><th>What</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {billing.charges.slice(0, 30).map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                <td>{c.description}</td>
                <td>{usd(c.amount_cents)}</td>
                <td>{c.hosted_invoice_url && (c.status === "invoiced" || c.status === "failed")
                  ? <a href={c.hosted_invoice_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>{STATUS[c.status]}: pay</a>
                  : STATUS[c.status] ?? c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
