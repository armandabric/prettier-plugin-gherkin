const {
  concat,
  fill,
  indent,
  join,
  hardline,
  markAsRoot,
  trim,
} = require("prettier").doc.builders;
const KEYWORD_SEPARATOR = require("./gherkin").KEYWORD_SEPARATOR;
const allowTextToBeSplited = require("./helper/allowTextToBeSplited");
const isNodeOnTopOfFile = require("./helper/isNodeOnTopOfFile");

// eslint-disable-next-line no-unused-vars
module.exports = (node, options) => {
  return markAsRoot(
    concat([
      isNodeOnTopOfFile(node) ? "" : hardline,

      // Feature tags
      join(
        " ",
        node.tags.length > 0
          ? [...node.tags.map((oneTag) => oneTag.name.trim()), hardline]
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
};
