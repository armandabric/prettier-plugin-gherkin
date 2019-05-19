const GherkinSyntaxError = require("./GherkinSyntaxError");
const fs = require("fs");
const join = require("path").join;

const fakeFileContent = `
    Scenario: the scenario of this feature is missing
        Given foo
        When bar
        Then baz
`;

const oneNativeErrorMessage = `
Error: (2:4): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got '        Scenario: the scenario of this feature is missing'
at buildGherkinDocument (/Users/armand/workspace/prettier-plugin-gherkin/src/parseGherkin.js:43:11)
at Object.buildGherkinDocument [as parse] (/Users/armand/workspace/prettier-plugin-gherkin/src/parseGherkin.js:124:27)
at Object.parse$2 [as parse] (/Users/armand/workspace/prettier-plugin-gherkin/node_modules/prettier/index.js:10639:19)
[...]
`;

describe("GherkinSyntaxError", () => {
  it("is an instance of SyntaxError", () => {
    const sut = new GherkinSyntaxError("fake error");

    expect(sut).toBeInstanceOf(SyntaxError);
  });

  it("have a message like other error", () => {
    expect(() => {
      throw new GherkinSyntaxError("fake error");
    }).toThrow("fake error");
  });

  it("show a detailled origin of the error", () => {
    const sut = new GherkinSyntaxError(
      "This scenario could be more funcky 🤘",
      2,
      4,
      fs.readFileSync(join(__dirname, "__fixtures__/basic.feature"), {
        encoding: "utf-8",
      }),
    );

    expect(sut.toString()).toMatchInlineSnapshot(`
"
    Scenario: minimalistic
    ^
GherkinSyntaxError: This scenario could be more funcky 🤘"
`);
  });

  it("show a detailled origin of the error from a native error", () => {
    const sut = GherkinSyntaxError.fromNativeErrorMessage(
      oneNativeErrorMessage,
      fakeFileContent,
    );

    expect(sut.toString()).toMatchInlineSnapshot(`
"
    Scenario: the scenario of this feature is missing
    ^
GherkinSyntaxError: expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got '        Scenario: the scenario of this feature is missing'"
`);
  });
});
