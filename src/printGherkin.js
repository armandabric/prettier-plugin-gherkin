const { concat, join, line, ifBreak, group } = require("prettier").doc.builders;

module.exports = async function printGherkin(path, options, print) {
  const node = await path.getValue();
  console.log({ node });

  if (Array.isArray(node)) {
    return concat(path.map(print));
  }

  switch (node.type) {
    default:
      return "";
  }

  return "";
};
