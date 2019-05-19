const parseNativeGherkinError = require("./parseNativeGherkinError");

const oneNativeErrorMessage = `
Error: (1:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got '        Scenario: the scenario of this feature is missing'
at buildGherkinDocument (/Users/armand/workspace/prettier-plugin-gherkin/src/parseGherkin.js:43:11)
at Object.buildGherkinDocument [as parse] (/Users/armand/workspace/prettier-plugin-gherkin/src/parseGherkin.js:124:27)
at Object.parse$2 [as parse] (/Users/armand/workspace/prettier-plugin-gherkin/node_modules/prettier/index.js:10639:19)
at coreFormat (/Users/armand/workspace/prettier-plugin-gherkin/node_modules/prettier/index.js:13856:23)
at format (/Users/armand/workspace/prettier-plugin-gherkin/node_modules/prettier/index.js:14115:73)
at formatWithCursor (/Users/armand/workspace/prettier-plugin-gherkin/node_modules/prettier/index.js:14131:12)
at /Users/armand/workspace/prettier-plugin-gherkin/node_modules/prettier/index.js:42399:15
at Object.format (/Users/armand/workspace/prettier-plugin-gherkin/node_modules/prettier/index.js:42418:12)
at format (/Users/armand/workspace/prettier-plugin-gherkin/tests/integrations/helper.js:10:19)
at format (/Users/armand/workspace/prettier-plugin-gherkin/tests/integrations/syntaxError.spec.js:12:18)
`;

describe("parseNativeGherkinError", () => {
  it("should parse the native error message", () => {
    const sut = parseNativeGherkinError(oneNativeErrorMessage);

    expect(sut.message).toBe(
      "expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got '        Scenario: the scenario of this feature is missing'",
    );
    expect(sut.location).toEqual({ line: 1, column: 9 });
    expect(sut.originalError).toBe(oneNativeErrorMessage);
  });
});
