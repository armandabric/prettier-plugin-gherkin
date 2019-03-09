const { concat, hardline, trim } = require("prettier").doc.builders;
const isNodeOnTopOfFile = require("./helper/isNodeOnTopOfFile");

// eslint-disable-next-line no-unused-vars
module.exports = (node, options) => {
  return concat([
    isNodeOnTopOfFile(node) ? "" : hardline,
    trim,
    node.text,
    trim,
  ]);
};
