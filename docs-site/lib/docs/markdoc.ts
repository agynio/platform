import Markdoc from "@markdoc/markdoc";

export function transformMarkdoc(content: string, sourcePath: string) {
  const ast = Markdoc.parse(content);
  const errors = Markdoc.validate(ast);

  if (errors.length > 0) {
    const renderedErrors = errors
      .map((error) => `${error.error.message} at ${sourcePath}`)
      .join("\n");
    throw new Error(renderedErrors);
  }

  return Markdoc.transform(ast);
}
