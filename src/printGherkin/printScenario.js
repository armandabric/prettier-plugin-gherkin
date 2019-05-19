const {
  concat,
  fill,
  indent,
  join,
  hardline,
  trim,
} = require("prettier").doc.builders;
const KEYWORD_SEPARATOR = require("./gherkin").KEYWORD_SEPARATOR;
const allowTextToBeSplited = require("./helper/allowTextToBeSplited");

// eslint-disable-next-line no-unused-vars
module.exports = (node, options) => {
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
};
