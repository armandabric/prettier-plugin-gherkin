const Gherkin = require("gherkin");
const printGherkin = require("./printGherkin");
//const parser = require("toml/lib/parser");

const languages = [
  {
    extensions: [".feature"],
    name: "Gherkin",
    parsers: ["gherkin-parse"],
  },
];

const parsers = {
  "gherkin-parse": {
    parse: text => new Gherkin.Parser().parse(text),
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
