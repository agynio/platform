import { codeToHtml } from "shiki";

type CodeBlockProps = {
  content: string;
  language?: string;
};

const KNOWN_LANGUAGES = new Set([
  "bash",
  "sh",
  "shell",
  "zsh",
  "json",
  "yaml",
  "yml",
  "toml",
  "ts",
  "tsx",
  "typescript",
  "js",
  "jsx",
  "javascript",
  "hcl",
  "terraform",
  "tf",
  "go",
  "rust",
  "python",
  "py",
  "sql",
  "dockerfile",
  "diff",
  "html",
  "css",
  "scss",
  "ini",
  "proto",
  "protobuf",
  "graphql",
  "make",
  "makefile",
  "xml",
  "markdown",
  "md",
  "text",
  "plaintext",
]);

function resolveLanguage(language: string | undefined): string {
  const lang = (language ?? "").trim().toLowerCase();
  if (!lang) return "text";
  return KNOWN_LANGUAGES.has(lang) ? lang : "text";
}

export async function CodeBlock({ content, language }: CodeBlockProps) {
  const resolved = resolveLanguage(language);
  const displayLanguage = (language ?? "").trim() || "text";

  const html = await codeToHtml(content, {
    lang: resolved,
    theme: "github-dark",
  });

  return (
    <div className="code-block" data-language={displayLanguage}>
      {displayLanguage !== "text" ? (
        <span className="code-block__language">{displayLanguage}</span>
      ) : null}
      <div className="code-block__inner" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
