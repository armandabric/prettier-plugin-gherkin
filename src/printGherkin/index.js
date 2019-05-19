const { concat } = require("prettier").doc.builders;
const printFeature = require("./printFeature");
const printScenario = require("./printScenario");
const printStep = require("./printStep");

module.exports = function printGherkin(path, options, print) {
  const node = path.getValue();

  if (Array.isArray(node)) {
    return concat(path.map(onePath => print(onePath)));
  }

  switch (node.type) {
    case "feature":
      return printFeature(node, options);

    case "scenario":
      return printScenario(node, options);

    case "step":
      return printStep(node, options);

    default:
      // FIXME: Waiting to implements the other type of node
      return printStep(node, options);
  }
};
