const parseGherkin = require("./parseGherkin");
const printGherkin = require("./printGherkin");

const languages = [
  {
    extensions: [".feature"],
    name: "Gherkin",
    parsers: ["gherkin-parse"],
    vscodeLanguageIds: ["feature"],
    linguistLanguageId: 76,
  },
];

const parsers = {
  "gherkin-parse": {
    parse: parseGherkin,
    astFormat: "gherkin-ast",
  },
};

const printers = {
  "gherkin-ast": {
    print: printGherkin,
  },
};

module.exports = {
  languages,
  parsers,
  printers,
};
