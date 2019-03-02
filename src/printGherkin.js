const {
  concat,
  group,
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
        group(
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
        ),
      );

    case "scenario":
      return indent(
        group(
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
            node.keyword,
            ": ",
            node.name,
            line,
          ]),
        ),
      );

    case "step":
    default:
      return indent(
        group(concat([node.keyword, trim, " ", node.text, hardline])),
      );
  }
};
