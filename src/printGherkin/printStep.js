const { concat, hardline, indent, trim } = require("prettier").doc.builders;

// eslint-disable-next-line no-unused-vars
module.exports = (node, options) => {
  return indent(
    indent(concat([hardline, concat([node.keyword, trim, " ", node.text])])),
  );
};
