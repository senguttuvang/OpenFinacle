import { ArrowLeft, ArrowRight, Landmark } from "lucide-react";
import type { ReactNode } from "react";
import "./product-story.css";
export function ProductArticle({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="magazine">
      <header className="magazine-header">
        <a className="magazine-brand" href="/discover">
          <Landmark size={25} aria-hidden="true" />
          OpenFinacle<span>.</span>
        </a>
        <nav aria-label="Product stories">
          <a href="/capabilities">Capabilities</a>
          <a href="/roadmap">The road ahead</a>
          <a href="/build-story">Build your version</a>
        </nav>
      </header>
      <article className="magazine-article">
        <header>
          <a className="magazine-link" href="/discover">
            <ArrowLeft size={17} aria-hidden="true" />
            Back to the story
          </a>
          <h1>{title}</h1>
          <p>{intro}</p>
        </header>
        {children}
        <section>
          <a className="magazine-link" href="/discover#imagine">
            Make your own build recipe{" "}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>
      </article>
    </main>
  );
}
