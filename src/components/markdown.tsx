import { Fragment, type ReactNode } from "react";

/**
 * Tiny Markdown subset (paragraphs, ### headings, lists, **bold**, *italic*, `code`,
 * ``` blocks, [links](https://…)) rendered as React elements. No dangerouslySetInnerHTML:
 * user- or AI-written text can never inject HTML. Links are limited to http(s).
 */
export function Markdown({ text, className = "prose-chat" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length}><code>{code.join("\n")}</code></pre>);
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={blocks.length}>{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</List>);
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</h3>);
      i++;
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
      i++;
    } else i++;
  }
  return <div className={className}>{blocks}</div>;
}

function inline(s: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((part, k) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={k}>{part.slice(1, -1)}</code>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={k}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={k} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <Fragment key={k}>{part}</Fragment>;
  });
}
