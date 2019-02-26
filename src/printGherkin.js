const {
  doc: {
    builders: { concat },
  },
} = require("prettier");

module.export = function printGherkin(path, options, print) {
  const node = path.getValue();

  if (Array.isArray(node)) {
    return concat(path.map(print));
  }

  switch (node.type) {
    default:
      return "";
  }
};
