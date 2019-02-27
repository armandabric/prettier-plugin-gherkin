const parseGherkin = require("./parseGherkin");
const printGherkin = require("./printGherkin");
const { locStart, locEnd } = require("./loc");

const languages = [
  {
    extensions: [".feature"],
    name: "Gherkin",
    parsers: ["gherkin-parser"],
    vscodeLanguageIds: ["feature"],
    linguistLanguageId: 76,
  },
];

const parsers = {
  "gherkin-parser": {
    parse: parseGherkin,
    astFormat: "gherkin-ast",
    locStart,
    locEnd,
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
