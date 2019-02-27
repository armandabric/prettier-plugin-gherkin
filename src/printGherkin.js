const {
  concat,
  join,
  line,
  indent,
  group,
  softline,
  hardline,
  trim,
} = require("prettier").doc.builders;

module.exports = function printGherkin(path, options, print) {
  const node = path.getValue();
  // console.log({ node });

  if (Array.isArray(node)) {
    return concat(path.map(onePath => print(onePath)));
  }

  if (node.feature) {
    const featureNode = node.feature;

    return indent(
      concat([featureNode.keyword, ": ", featureNode.name, hardline]),
    );
  } else if (node.scenario) {
    const scenarioNode = node.scenario;

    return indent(
      concat([line, scenarioNode.keyword, ": ", scenarioNode.name, hardline]),
    );
  }

  return indent(concat([node.keyword, trim, " ", node.text, hardline]));
};
