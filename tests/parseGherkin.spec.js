const fs = require("fs");
const path = require("path");
const parseGherkin = require("./../src/parseGherkin");

describe("parseGherkin", () => {
  it("parse basic feature file into an AST", () => {
    const basicFeature = fs.readFileSync(
      path.join(__dirname, "fixtures/basic.feature"),
      { encoding: "utf-8" },
    );

    const ast = parseGherkin(basicFeature);

    expect(ast).toMatchSnapshot();
  });

  it("should throw an exception when the is a syntax error", () => {
    const fixture = `Scenario: foo`; // No "Feature:" header

    expect(() => parseGherkin(fixture)).toThrow(
      "(1:1): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got 'Scenario: foo'",
    );
  });
});
