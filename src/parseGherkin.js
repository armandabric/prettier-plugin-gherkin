const Gherkin = require("gherkin");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const buildAst = text => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gherkin-parser"));
  const tmpFilePath = path.join(tmpDir, "tmp.feature");

  fs.writeFileSync(tmpFilePath, text, {
    encoding: "utf-8",
  });

  const commandResult = spawnSync(
    "gherkin-javascript",
    ["--no-source", "--no-pickles", tmpFilePath],
    { encoding: "utf-8" },
  );

  fs.unlinkSync(tmpFilePath);

  const wrapperDocument = JSON.parse(commandResult.output.find(line => !!line));
  const ast = wrapperDocument.gherkinDocument;

  return ast;
};

module.exports = (text, parsers, options) => {
  const originalAst = buildAst(text);

  const simplifiedAst = { ...originalAst };
  delete simplifiedAst.uri;

  return simplifiedAst;
};
