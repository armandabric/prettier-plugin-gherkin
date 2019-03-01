const {
  concat,
  group,
  line,
  hardline,
  indent,
  markAsRoot,
  trim,
  fill,
} = require("prettier").doc.builders;

module.exports = function printGherkin(path, options, print) {
  const node = path.getValue();

  if (Array.isArray(node)) {
    return concat(path.map(onePath => print(onePath)));
  }

  switch (node.type) {
    case "feature":
      return markAsRoot(
        group(
          indent(
            fill([
              node.keyword,
              ": ",
              ...node.name
                .split(" ")
                .reduce((acc, node) => acc.concat(node, line), []),
              trim,
            ]),
          ),
          hardline,
        ),
      );

    case "scenario":
      return indent(
        group(
          concat([hardline, hardline, node.keyword, ": ", node.name, line]),
        ),
      );

    case "step":
    default:
      return indent(
        group(concat([node.keyword, trim, " ", node.text, hardline])),
      );
  }
};
