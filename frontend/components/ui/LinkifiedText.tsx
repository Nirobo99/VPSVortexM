"use client";

import { Fragment, type ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/g;

type Props = {
  text: string;
  className?: string;
};

export function LinkifiedText({ text, className }: Props) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    const url = match[0];
    nodes.push(
      <a
        key={`u-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline break-all"
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`t-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return (
    <span className={className ? `${className} whitespace-pre-wrap` : "whitespace-pre-wrap"}>{nodes}</span>
  );
}
