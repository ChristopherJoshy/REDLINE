interface MatrixTextProps {
  text: string;
  isStreaming?: boolean;
  animateOnMount?: boolean;
  className?: string;
  accentColor?: string;
}

/** Replies remain readable as each token arrives. */
export default function MatrixText({ text, className = "" }: MatrixTextProps): React.JSX.Element {
  return <span className={className}>{text}</span>;
}
