"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { sendEvent, type TrackPayload } from "./Track";

interface Props {
  href: string;
  track: TrackPayload;
  className?: string;
  children: ReactNode;
  external?: boolean;
  rel?: string;
  target?: string;
}

/**
 * A link that counts its own click.
 *
 * The beacon is sent before navigation and survives the page unloading, so the
 * count is not lost when the visitor leaves — including on a tel: or mailto:
 * link, which hands the page straight to another app.
 */
export default function TrackedLink({
  href,
  track,
  className,
  children,
  external,
  rel,
  target,
}: Props) {
  const handle = () => sendEvent(track);

  if (external) {
    return (
      <a
        className={className}
        href={href}
        rel={rel}
        target={target}
        onClick={handle}
      >
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href} onClick={handle}>
      {children}
    </Link>
  );
}
