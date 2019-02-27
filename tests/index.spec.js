const prettier = require("prettier");
const fs = require("fs");
const path = require("path");

describe("prettier-plugin-gherkin", () => {
  it("format `basic.feature` file", () => {
    const basicFeature = fs.readFileSync(
      path.join(__dirname, "fixtures/basic.feature"),
      { encoding: "utf-8" },
    );

    const sut = prettier.format(basicFeature, {
      parser: "gherkin-parser",
      plugins: ["."],
    });

    expect(sut).toMatchSnapshot();
  });
});
