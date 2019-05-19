const { line } = require("prettier").doc.builders;

module.exports = text =>
  text
    .trim()
    .replace(/\r?\n|\r/g, " ")
    .replace(/ {1,}/g, " ")
    .split(" ")
    .reduce((acc, node) => acc.concat(node, line), []);
