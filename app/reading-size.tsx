import { Effect } from "effect";
import { Type } from "lucide-react";
import { useEffect, useState } from "react";

const preferenceKey = "openfinacle-reading-size";

export function ReadingSize() {
  const [large, setLarge] = useState(false);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    const preference = Effect.runSync(
      Effect.try(() => localStorage.getItem(preferenceKey)).pipe(
        Effect.orElseSucceed(() => null),
      ),
    );
    const enabled = preference === "large";
    document.documentElement.dataset.reading = enabled
      ? "large"
      : "comfortable";
    setLarge(enabled);
  }, []);
  return (
    <button
      type="button"
      className="reading-toggle"
      aria-pressed={large}
      title={
        saved
          ? "Remember text size on this device"
          : "Text size applies for this visit; browser storage is unavailable"
      }
      onClick={() => {
        const enabled = !large;
        const value = enabled ? "large" : "comfortable";
        document.documentElement.dataset.reading = value;
        setLarge(enabled);
        setSaved(
          Effect.runSync(
            Effect.try(() => {
              localStorage.setItem(preferenceKey, value);
              return true;
            }).pipe(Effect.orElseSucceed(() => false)),
          ),
        );
      }}
    >
      <Type size={20} aria-hidden="true" />
      <span>Extra-large text</span>
      <span className="sr-only">
        {saved ? "" : "Browser storage unavailable; applies for this visit."}
      </span>
    </button>
  );
}
