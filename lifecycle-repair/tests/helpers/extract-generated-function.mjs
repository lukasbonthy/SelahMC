export function extractGeneratedFunction(source, name) {
  const signature = `function ${name}(`;
  const starts = [];
  let cursor = 0;

  while (true) {
    const index = source.indexOf(signature, cursor);
    if (index === -1) break;
    starts.push(index);
    cursor = index + signature.length;
  }

  if (starts.length !== 1) {
    throw new Error(
      `generated function ${name}: expected 1, found ${starts.length}`,
    );
  }

  const start = starts[0];
  const openBrace = source.indexOf("{", start + signature.length);
  if (openBrace === -1) {
    throw new Error(`generated function ${name}: opening brace not found`);
  }

  let blockComment = false;
  let depth = 0;
  let escaped = false;
  let lineComment = false;
  let quote = "";

  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`generated function ${name}: closing brace not found`);
}
