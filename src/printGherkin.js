const {
  concat,
  line,
  hardline,
  indent,
  markAsRoot,
  trim,
  fill,
  join,
} = require("prettier").doc.builders;

const KEYWORD_SEPARATOR = ": ";

const allowTextToBeSplited = text =>
  text
    .trim()
    .replace(/\r?\n|\r/g, " ")
    .replace(/ {1,}/g, " ")
    .split(" ")
    .reduce((acc, node) => acc.concat(node, line), []);

module.exports = function printGherkin(path, options, print) {
  const node = path.getValue();

  if (Array.isArray(node)) {
    return concat(path.map(onePath => print(onePath)));
  }

  switch (node.type) {
    case "feature":
      return markAsRoot(
        concat([
          // Feature tags
          join(
            " ",
            node.tags.length > 0
              ? [...node.tags.map(oneTag => oneTag.name.trim()), hardline]
              : [],
          ),

          // Feature body
          indent(
            concat([
              // Feature title
              concat([node.keyword, KEYWORD_SEPARATOR, node.name]),

              // Feature description
              node.description
                ? concat([
                    hardline,
                    hardline,
                    fill([...allowTextToBeSplited(node.description), trim]),
                  ])
                : "",
            ]),
          ),
        ]),
      );

    case "scenario":
      return indent(
        concat([
          hardline,
          hardline,

          // Scenario tags
          join(
            " ",
            node.tags.length > 0
              ? [...node.tags.map(oneTag => oneTag.name.trim()), hardline]
              : [],
          ),

          // Scenario body
          indent(
            concat([
              // Feature title
              concat([node.keyword, KEYWORD_SEPARATOR, node.name]),

              // Feature description
              node.description
                ? concat([
                    hardline,
                    fill([...allowTextToBeSplited(node.description), trim]),
                  ])
                : "",
            ]),
          ),
        ]),
      );

    case "step":
    default:
      return indent(
        indent(
          concat([hardline, concat([node.keyword, trim, " ", node.text])]),
        ),
      );
  }
};
