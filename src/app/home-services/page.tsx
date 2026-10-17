import type { Metadata } from "next";
import ServiceRequestForm from "./ServiceRequestForm";

export const metadata: Metadata = {
  title: "Request a home service",
  description:
    "Ask Destiny Marketing Group to pass your home-service request to Jersey Home Pros. Nothing is shared without your explicit consent.",
  alternates: { canonical: "/home-services" },
};

export default function HomeServicesPage() {
  return (
    <main className="page">
      <div className="wrap-narrow">
        <h1>Request a home service</h1>
        <p className="muted">
          Moving, cleaning, roofing, HVAC, pest control, painting or plumbing.
          This is optional and completely separate from the agent directory.
        </p>

        <div className="notice notice-info">
          <strong>Who handles your request.</strong>
          <p style={{ margin: "6px 0 0" }}>
            Destiny Marketing Group does not carry out home services. If you ask
            us to, we pass your request to{" "}
            <a href="https://jerseyhomepros.com/" rel="noopener noreferrer" target="_blank">
              Jersey Home Pros
            </a>
            , a separate company that arranges the contractor and contacts you
            directly. We only send your name, contact details, service address
            and the service you asked for — nothing else, and only if you tick
            the consent box below.
          </p>
        </div>

        <div className="card">
          <ServiceRequestForm />
        </div>

        <p className="hint" style={{ marginTop: 14 }}>
          We do not sell your information. Visiting an agent profile never
          generates a home-service request on your behalf.
        </p>
      </div>
    </main>
  );
}
