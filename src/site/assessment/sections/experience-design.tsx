"use client";

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import "../assessment-report.css";
import { screens } from "../evidence-presentation";
export function ExperienceDesign() {
  return (
    <section
      id="experience"
      className="evidence-section"
      aria-labelledby="experience-title"
    >
      <div className="evidence-section-heading">
        <h2 id="experience-title">Now inspect the experience.</h2>
        <p>
          Actual application screenshots from synthetic local acceptance
          fixtures. These are screen previews, not live balances or new evidence
          of production readiness. Open any image at full size.
        </p>
      </div>
      <div className="story-gallery">
        {screens.map(([id, title, description]) => (
          <figure key={id}>
            <a
              href={`/product/${id}.webp`}
              target="_blank"
              rel="noreferrer"
              aria-label={`View full screenshot: ${title} (opens in a new tab)`}
            >
              <Image
                src={`/product/${id}.webp`}
                alt={`${title} — synthetic OpenFinacle application fixture`}
                width={1440}
                height={1000}
                unoptimized
                loading="lazy"
              />
              <span>
                <ArrowUpRight size={16} aria-hidden="true" /> Full screenshot
              </span>
            </a>
            <figcaption>
              <h3>{title}</h3>
              <p>{description}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
