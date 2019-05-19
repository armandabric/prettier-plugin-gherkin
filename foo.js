const fs = require("fs");
const path = require("path");
const parseGherkin = require("./src/parseGherkin");

const basicFeature = fs.readFileSync(
  path.join(__dirname, "tests/units/fixtures/basic.feature"),
  { encoding: "utf-8" },
);

const ast = parseGherkin(basicFeature);

const foo = ast;
console.log(foo);
