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

const flattenAst = (nodes, oneNode) => {
  if (oneNode.feature) {
    const flattenedChildren = oneNode.feature.children.reduce(flattenAst, []);

    return [...nodes, oneNode, ...flattenedChildren];
  }

  if (oneNode.scenario) {
    const flattenedSteps = oneNode.scenario.steps.reduce(flattenAst, []);

    return [...nodes, oneNode, ...flattenedSteps];
  }

  return [...nodes, oneNode];
};

module.exports = (text, parsers, options) => {
  const originalAst = buildAst(text);

  const simplifiedAst = { ...originalAst };
  delete simplifiedAst.uri;

  const flatAst = [simplifiedAst].reduce(flattenAst, []);

  return flatAst;
};
