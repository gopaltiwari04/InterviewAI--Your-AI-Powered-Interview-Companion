import { Fragment } from "react";

/**
 * Renders the small subset of markdown used in problem statements: paragraphs,
 * `inline code` and **bold**. Output is built from React elements, never from
 * HTML strings, so AI-generated or user-provided text cannot inject markup.
 */
function inline(text: string, keyPrefix: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) return <strong key={key}>{part.slice(2, -2)}</strong>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-3 last:mb-0 whitespace-pre-wrap leading-relaxed">
          {inline(p, String(i))}
        </p>
      ))}
    </div>
  );
}

export function InlineText({ text }: { text: string }) {
  return <>{inline(text, "i")}</>;
}
