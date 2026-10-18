import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home services",
  description:
    "Home-service requests are passed to Jersey Home Pros, a separate company, only when you ask us to.",
};

export default function HomeServicesPage() {
  return (
    <main className="wrap-narrow page">
      <h1 style={{ maxWidth: "none" }}>Moving, roofing, cleaning?</h1>
      <p className="lede">
        We don&apos;t do home services ourselves. If you want help, we can pass
        your request to a company that does.
      </p>

      <div className="notice notice-info">
        <p style={{ margin: 0 }}>This isn&apos;t open for requests yet.</p>
      </div>

      <h2 style={{ marginTop: 32 }}>How it will work</h2>
      <p className="muted">
        You tell us what you need. With your say-so, we send your name, contact
        details, address and the job to{" "}
        <a href="https://jerseyhomepros.com/" rel="noopener noreferrer" target="_blank">
          Jersey Home Pros
        </a>
        , a separate company that arranges the contractor and contacts you
        directly. Nothing else is shared, and nothing is shared unless you ask.
      </p>
      <p className="muted">
        Looking at an agent&apos;s listing never creates a request on your behalf,
        and we don&apos;t sell your details to anyone.
      </p>
    </main>
  );
}
