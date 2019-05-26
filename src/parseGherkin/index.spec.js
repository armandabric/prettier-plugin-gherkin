const fs = require("fs");
const path = require("path");
const parseGherkin = require(".");

describe("parseGherkin", () => {
  it("parse basic feature file into an AST", () => {
    const basicFeature = fs.readFileSync(
      path.join(__dirname, "__fixtures__/basic.feature"),
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

  it("should parse tags on Feature", () => {
    const fixture = `@foo @bar
Feature: baz`;

    const ast = parseGherkin(fixture);

    expect(ast).toMatchSnapshot();
  });

  it("should parse tags on Scenario", () => {
    const fixture = `Feature: some feature
  @foo @bar
  Scenario: some scenario`;

    const ast = parseGherkin(fixture);

    expect(ast).toMatchSnapshot();
  });

  it("should parse comments", () => {
    const fixture = `# Some comment
Feature: Lorem ipsum dolor sit amet

  # Another one
  Scenario: foo
`;

    const ast = parseGherkin(fixture);

    expect(ast).toMatchSnapshot();
  });
});
