const { format } = require("./helper");
const fs = require("fs");
const path = require("path");

describe("prettier-plugin-gherkin", () => {
  it("will thrown a error on feature file with syntax error", () => {
    const fixtureFeatureFile = fs.readFileSync(
      path.join(__dirname, "__fixtures__/errored-missing-scenario.feature"),
      { encoding: "utf-8" },
    );

    expect(() => format(fixtureFeatureFile)).toThrow(
      "GherkinSyntaxError: (1:9): expected: #EOF, #Language, #TagLine, #FeatureLine, #Comment, #Empty, got '        Scenario: the scenario of this feature is missing",
    );
  });
});
