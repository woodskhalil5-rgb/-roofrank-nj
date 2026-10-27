"use client";
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker once per page load. Renders nothing. */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* not fatal: the site works without it */ });
    }
  }, []);
  return null;
}

/**
 * "Get the app" link. Android/desktop Chrome get the real install prompt;
 * iPhone has no prompt API, so it shows the two taps Safari needs. Hidden when
 * already running as the installed app.
 */
export function GetTheApp({ className }: { className?: string }) {
  const [evt, setEvt] = useState<BIP | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState<"" | "ios" | "other">("");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function go(e: React.MouseEvent) {
    e.preventDefault();
    if (evt) { await evt.prompt(); setEvt(null); return; }
    setHelp(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "other");
  }

  return (
    <>
      <a href="#get-the-app" className={className} onClick={go}>Get the app</a>
      {help && (
        <div className="scanpanelwrap" role="dialog" aria-modal="true" aria-label="Get the Jersey Home Pros app"
             onClick={(e) => { if (e.target === e.currentTarget) setHelp(""); }}>
          <div className="scanpanel">
            <button type="button" className="scanclose" onClick={() => setHelp("")} aria-label="Close">×</button>
            <div className="scanhead">GET THE APP</div>
            {help === "ios" ? (
              <>
                <h3>Add Jersey Home Pros to your iPhone</h3>
                <ol className="installsteps">
                  <li>In Safari, tap the <b>Share</b> button (the square with the arrow).</li>
                  <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>Tap <b>Add</b>. The JHP icon appears on your home screen.</li>
                </ol>
              </>
            ) : (
              <>
                <h3>Add Jersey Home Pros to your phone</h3>
                <ol className="installsteps">
                  <li>Open your browser&rsquo;s menu (the <b>⋮</b> or <b>…</b> button).</li>
                  <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                </ol>
              </>
            )}
            <p className="adminnote">It&rsquo;s free and opens straight to the Home Scan and your Home Board.</p>
          </div>
        </div>
      )}
    </>
  );
}
